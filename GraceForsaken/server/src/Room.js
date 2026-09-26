// ===================================================================
// ルーム（1試合）… 状態遷移とタイマー（PVP対戦_設計書 4.2）
//
//   PLACEMENT ─(双方確定 / 60秒)→ AWAIT_INPUT ⇄ ANIMATING → FINISHED
//        └───────── 切断 ─────────→ PAUSED（残り時間を保持して停止）
// ===================================================================
'use strict';

const crypto = require('crypto');
const Timer = require('./Timer');
const BattleSession = require('./BattleSession');
const { decideAutoAction } = require('./AutoAction');
const { botThinkMs } = require('./BotController');
const log = require('./logger');

function randomId(prefix, bytes) {
  return prefix + crypto.randomBytes(bytes || 6).toString('base64url');
}

class Room {
  /**
   * opt: { core, settings, players:[{userId,name,party,isBot}] x2, send(socketId, ev, data),
   *        onFinished(room), onDestroy(room), clock?, rng? }
   */
  constructor(opt) {
    this.core = opt.core;
    this.S = opt.settings;
    this.P = opt.core.PVP_PROTOCOL;
    this.send = opt.send;
    this.hooks = { onFinished: opt.onFinished || (() => {}), onDestroy: opt.onDestroy || (() => {}) };
    this.clock = opt.clock;
    this.rng = opt.rng || Math.random;

    this.id = randomId('r_');
    this.matchId = randomId('m_', 8);
    this.createdAt = Date.now();
    this.isBot = opt.players.some(p => p.isBot);
    const times = Object.keys(this.core.FIELD_TIME);
    const locs = Object.keys(this.core.FIELD_LOCATION);
    this.field = {
      time: times[Math.floor(this.rng() * times.length)],
      location: locs[Math.floor(this.rng() * locs.length)],
    };
    this.players = opt.players.map(p => ({
      userId: p.userId, name: p.name, isBot: !!p.isBot, party: p.party,
      socketId: p.socketId || null, connected: !p.isBot && !!p.socketId,
      token: p.isBot ? null : randomId('t_', 18),
      placement: null, placementDone: !!p.isBot,
      afk: 0, animDone: false, expired: false,
      graceTimer: new Timer(this.clock), result: null,
    }));
    this.session = new BattleSession(this.core, {
      parties: this.players.map(p => p.party), field: this.field,
      seed: crypto.randomBytes(4).readUInt32LE(0),
    });

    this.state = 'PLACEMENT';
    this.pausedFrom = null;
    this.seq = 0;
    this.actorId = null;
    this.turnOwner = null;
    this.turnContinued = false;
    this.turnRemainingMs = this.S.TURN_MS;
    this.preEvents = [];
    this.legalCache = null;
    this.lastTurnEnds = true;
    this.lastActorId = null;
    this.logLines = [];
    this.startEvents = [];

    this.placementTimer = new Timer(this.clock);
    this.turnTimer = new Timer(this.clock);
    this.animTimer = new Timer(this.clock);
    this.botTimer = new Timer(this.clock);
    this.lifeTimer = new Timer(this.clock);
    this.destroyTimer = new Timer(this.clock);
  }

  // -----------------------------------------------------------------
  // 送信
  // -----------------------------------------------------------------
  emit(i, ev, data) {
    const p = this.players[i];
    if (p.isBot || !p.connected || !p.socketId) return;
    this.send(p.socketId, ev, data);
  }

  playerIndex(userId) { return this.players.findIndex(p => p.userId === userId && !p.isBot); }
  humans() { return [0, 1].filter(i => !this.players[i].isBot); }

  matchInfo(i) {
    const me = this.players[i], op = this.players[1 - i];
    const units = side => this.session.units[side].map(u => ({
      id: u.uid, charId: u.charId, name: u.name, element: u.element, portrait: u.portrait, range: u.range, area: u.area,
    }));
    return {
      roomId: this.id,
      matchId: this.matchId,
      mySide: i,
      isBot: this.isBot,
      field: this.field,
      opponent: { name: op.name, isBot: op.isBot, units: units(1 - i).map(u => { const c = Object.assign({}, u); delete c.area; return c; }) },
      myName: me.name,
      myUnits: units(i),
      placementTimeoutSec: this.S.PLACEMENT_MS / 1000,
    };
  }

  // -----------------------------------------------------------------
  // 配置フェーズ
  // -----------------------------------------------------------------
  start() {
    this.humans().forEach(i => this.emit(i, this.P.EV.MATCH_FOUND,
      Object.assign(this.matchInfo(i), { reconnectToken: this.players[i].token })));
    this.placementTimer.start(this.S.PLACEMENT_MS, () => this.startBattle());
    this.lifeTimer.start(this.S.ROOM_MAX_LIFETIME_MS, () => {
      log.warn('room lifetime exceeded', this.id);
      this.finish({ void: true, reason: 'void' });
    });
    log.info('room created', this.id, this.isBot ? 'bot' : 'pvp');   // プレイヤー名はログに残さない
    // BOT は即座に配置確定
    this.humans().forEach(i => {
      if (this.players[1 - i].isBot) this.emit(i, this.P.EV.PLACEMENT_STATUS, { opponentReady: true });
    });
  }

  submitPlacement(i, placement) {
    if (this.state !== 'PLACEMENT') return this.P.ERR.INVALID_PAYLOAD;
    const p = this.players[i];
    if (p.placementDone) return this.P.ERR.INVALID_PAYLOAD;
    p.placement = placement;
    p.placementDone = true;
    this.emit(1 - i, this.P.EV.PLACEMENT_STATUS, { opponentReady: true });
    if (this.players.every(x => x.placementDone)) this.startBattle();
    return null;
  }

  startBattle() {
    if (this.state !== 'PLACEMENT') return;
    this.placementTimer.clear();
    // 未確定のプレイヤーは、キュー参加時に送った初期配置（パーティ編成の配置）をそのまま使う
    this.players.forEach((p, side) => this.session.applyPlacement(side, p.placement));
    this.startEvents = this.session.start();
    this.pushLog(this.startEvents);
    this.state = 'AWAIT_INPUT';
    this.humans().forEach(i => this.emit(i, this.P.EV.BATTLE_START,
      Object.assign(this.session.snapshot(i), { mySide: i, events: this.startEvents })));
    this.nextTurn(false);
  }

  // -----------------------------------------------------------------
  // 手番
  // -----------------------------------------------------------------
  nextTurn(continued) {
    if (this.state === 'FINISHED') return;
    if (this.session.finished) { this.finishFromBattle(); return; }
    const actor = this.session.currentActor();
    if (!actor) { this.finishFromBattle(); return; }
    const owner = this.session.sideOf(actor);
    this.preEvents = [];
    if (!continued) {
      this.preEvents = this.session.turnStart(actor);
      this.pushLog(this.preEvents);
      this.turnRemainingMs = this.S.TURN_MS;
    }
    this.seq++;
    this.actorId = actor.uid;
    this.turnOwner = owner;
    this.turnContinued = continued;
    this.legalCache = this.session.legal(actor);
    this.state = 'AWAIT_INPUT';
    this.turnTimer.start(this.turnRemainingMs, () => this.onTurnTimeout());
    this.humans().forEach(i => this.emit(i, this.P.EV.TURN_START, this.turnPayload(i)));
    if (this.players[owner].isBot) this.botTimer.start(botThinkMs(this.core, this.rng), () => this.botAct());
  }

  turnPayload(i) {
    const mine = i === this.turnOwner;
    const payload = {
      seq: this.seq,
      round: this.session.battle.round,
      actorId: this.actorId,
      ownerSide: this.turnOwner,
      isMine: mine,
      continued: this.turnContinued,
      remainingMs: Math.round(this.turnTimer.running || this.turnTimer.paused ? this.turnTimer.remaining() : this.turnRemainingMs),
      order: this.session.order(),
      preEvents: this.preEvents,
    };
    if (mine) payload.legalActions = this.legalCache;
    return payload;
  }

  /** 人間の送信した行動 */
  handleAction(i, v) {
    const E = this.P.ERR;
    if (this.state !== 'AWAIT_INPUT') return E.NOT_YOUR_TURN;
    if (v.seq !== this.seq) return E.STALE_SEQ;
    if (this.turnOwner !== i) return E.NOT_YOUR_TURN;
    if (v.actorId !== this.actorId) return E.INVALID_ACTION;
    const actor = this.session.findUnit(this.actorId);
    if (!actor || !this.session.check(actor, v.action)) return E.INVALID_ACTION;
    this.players[i].afk = 0;
    this.apply(v.action, false);
    return null;
  }

  botAct() {
    if (this.state !== 'AWAIT_INPUT' || !this.players[this.turnOwner].isBot) return;
    const actor = this.session.findUnit(this.actorId);
    let action = this.session.aiAction(actor);
    if (!this.session.check(actor, action)) action = decideAutoAction(this.legalCache, actor, this.rng);
    this.apply(action, false);
  }

  onTurnTimeout() {
    if (this.state !== 'AWAIT_INPUT') return;
    const owner = this.turnOwner;
    const p = this.players[owner];
    if (p.isBot) { this.botAct(); return; }
    p.afk++;
    if (p.afk >= this.S.AFK_LIMIT) {
      // 3回連続の時間切れは自動行動を行わず放置で敗北
      this.finish({ loserSide: owner, reason: 'afk' });
      return;
    }
    const actor = this.session.findUnit(this.actorId);
    this.apply(decideAutoAction(this.legalCache, actor, this.rng), true);
  }

  /** 行動を実行し、結果を双方へ送る */
  apply(action, auto) {
    this.botTimer.clear();
    this.turnRemainingMs = this.turnTimer.remaining();
    this.turnTimer.clear();
    const actor = this.session.findUnit(this.actorId);
    const before = [0, 1].map(s => this.session.views(s));
    const res = this.session.run(actor, action);
    const events = auto ? [{ t: 'auto', unitId: actor.uid }].concat(res.events) : res.events;
    this.pushLog(events);
    const after = [0, 1].map(s => this.session.views(s));
    this.lastTurnEnds = res.turnEnds;
    this.lastActorId = actor.uid;
    this.state = 'ANIMATING';
    this.players.forEach(p => { p.animDone = p.isBot || !p.connected; });
    const b = this.session.battle;
    this.humans().forEach(i => this.emit(i, this.P.EV.RECEIVE_ACTION, {
      seq: this.seq, actorId: actor.uid, auto: !!auto, action: action, events: events,
      diff: this.session.diff(before[i], after[i]),
      turnEnds: res.turnEnds, round: b.round, field: b.field, order: this.session.order(),
    }));
    this.animTimer.start(this.S.ANIMATION_MAX_WAIT_MS, () => this.afterAnimation());
    if (this.players.every(p => p.animDone)) this.afterAnimation();
  }

  actionComplete(i, seq) {
    if (this.state !== 'ANIMATING' || seq !== this.seq) return;
    this.players[i].animDone = true;
    if (this.players.every(p => p.animDone)) this.afterAnimation();
  }

  afterAnimation() {
    if (this.state !== 'ANIMATING') return;
    this.animTimer.clear();
    if (this.session.finished) { this.finishFromBattle(); return; }
    const actor = this.session.currentActor();
    // クイックスキルは手番が続く（残り時間を引き継ぐ）
    const continued = !this.lastTurnEnds && !!actor && actor.uid === this.lastActorId;
    this.nextTurn(continued);
  }

  surrender(i) {
    if (this.state === 'FINISHED') return this.P.ERR.ROOM_NOT_FOUND;
    this.finish({ loserSide: i, reason: 'surrender' });
    return null;
  }

  // -----------------------------------------------------------------
  // 切断・復帰
  // -----------------------------------------------------------------
  pause() {
    if (this.state === 'PAUSED' || this.state === 'FINISHED') return;
    this.pausedFrom = this.state;
    this.state = 'PAUSED';
    [this.placementTimer, this.turnTimer, this.animTimer, this.botTimer].forEach(t => t.pause());
  }

  unpause() {
    if (this.state !== 'PAUSED') return;
    this.state = this.pausedFrom;
    this.pausedFrom = null;
    [this.placementTimer, this.turnTimer, this.animTimer, this.botTimer].forEach(t => t.resume());
    if (this.state === 'ANIMATING' && this.players.every(p => p.animDone)) this.afterAnimation();
  }

  disconnect(i) {
    const p = this.players[i];
    p.connected = false;
    p.socketId = null;
    if (this.state === 'FINISHED') return;
    p.animDone = true;
    this.emit(1 - i, this.P.EV.PLAYER_DISCONNECTED, { graceSec: this.S.RECONNECT_GRACE_MS / 1000 });
    this.pause();
    p.graceTimer.start(this.S.RECONNECT_GRACE_MS, () => this.onGraceExpired(i));
    log.info('player disconnected', this.id, 'side=' + i);
  }

  onGraceExpired(i) {
    if (this.state === 'FINISHED') return;
    const p = this.players[i];
    p.expired = true;
    const other = this.players[1 - i];
    if (other.isBot || other.connected) this.finish({ loserSide: i, reason: 'disconnect' });
    else if (other.expired) this.finish({ void: true, reason: 'void' });
    // 相手も切断中（猶予内）なら、相手の復帰か猶予切れを待つ
  }

  resume(i, socketId) {
    const p = this.players[i];
    p.socketId = socketId;
    p.connected = true;
    p.graceTimer.clear();
    if (this.state === 'FINISHED') {
      if (p.result) this.emit(i, this.P.EV.BATTLE_END, p.result);
      return;
    }
    p.animDone = true;
    this.emit(i, this.P.EV.STATE_SYNC, this.statePayload(i));
    this.emit(1 - i, this.P.EV.PLAYER_RECONNECTED, {});
    const other = this.players[1 - i];
    if (other.expired) { this.finish({ loserSide: 1 - i, reason: 'disconnect' }); return; }
    if (this.humans().every(k => this.players[k].connected)) this.unpause();
    log.info('player resumed', this.id, 'side=' + i);
  }

  statePayload(i) {
    const phase = (this.state === 'PAUSED' ? this.pausedFrom : this.state) === 'PLACEMENT' ? 'PLACEMENT' : 'BATTLE';
    const payload = {
      phase: phase,
      matchInfo: this.matchInfo(i),
      placementDone: { self: this.players[i].placementDone, opponent: this.players[1 - i].placementDone },
      placementRemainingMs: Math.round(this.placementTimer.remaining()),
      opponentConnected: this.players[1 - i].isBot || this.players[1 - i].connected,
      log: this.logLines.slice(-20),
    };
    if (phase === 'BATTLE') {
      Object.assign(payload, this.session.snapshot(i));
      payload.currentTurn = this.actorId ? this.turnPayload(i) : null;
    }
    return payload;
  }

  // -----------------------------------------------------------------
  // 終了
  // -----------------------------------------------------------------
  finishFromBattle() {
    const o = this.session.outcome();
    this.finish({ winnerSide: o.winnerSide, reason: o.reason });
  }

  /** res: { winnerSide?, loserSide?, reason, void? } */
  finish(res) {
    if (this.state === 'FINISHED') return;
    this.state = 'FINISHED';
    [this.placementTimer, this.turnTimer, this.animTimer, this.botTimer, this.lifeTimer].forEach(t => t.clear());
    this.players.forEach(p => p.graceTimer.clear());
    let winner = res.winnerSide;
    if (res.loserSide !== undefined) winner = 1 - res.loserSide;
    const C = this.core.CONFIG;
    const rounds = this.session.battle ? this.session.battle.round : 0;
    this.players.forEach((p, i) => {
      if (p.isBot) return;
      let result;
      if (res.void) result = 'void';
      else if (winner === null || winner === undefined) result = 'draw';
      else result = winner === i ? 'win' : 'lose';
      let soul = 0;
      if (result !== 'void') {
        if (this.isBot) {
          soul = result === 'win' ? C.REWARD.pvpWin : (result === 'lose' ? C.REWARD.pvpLose : C.PVP.BOT_DRAW_REWARD);
        } else {
          soul = C.PVP.REWARD[result];
        }
      }
      p.result = {
        matchId: this.matchId,
        result: result,
        reason: res.reason,
        isBot: this.isBot,
        opponentName: this.players[1 - i].name,
        reward: { soul: soul },
        summary: {
          rounds: rounds,
          hpRatio: this.session.battle ? { self: this.session.hpRatio(i), opponent: this.session.hpRatio(1 - i) } : null,
        },
      };
      this.emit(i, this.P.EV.BATTLE_END, p.result);
    });
    log.info('room finished', this.id, res.reason, 'winner=' + winner);
    this.hooks.onFinished(this);
    this.destroyTimer.start(this.S.FINISHED_ROOM_TTL_MS, () => this.destroy());
  }

  destroy() {
    [this.placementTimer, this.turnTimer, this.animTimer, this.botTimer, this.lifeTimer, this.destroyTimer].forEach(t => t.clear());
    this.players.forEach(p => p.graceTimer.clear());
    this.hooks.onDestroy(this);
  }

  pushLog(events) {
    events.forEach(e => { if (e.t === 'log') this.logLines.push({ text: e.text, kind: e.kind }); });
    if (this.logLines.length > 60) this.logLines.splice(0, this.logLines.length - 60);
  }
}

module.exports = Room;
