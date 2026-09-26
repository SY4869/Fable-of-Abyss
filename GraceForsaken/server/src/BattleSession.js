// ===================================================================
// 戦闘エンジンの薄いラッパー（PVP対戦_設計書 8.3）
//
// side 0 のプレイヤーを戦闘エンジン上の 'ALLY'、side 1 を 'ENEMY' として扱う。
// ユニットIDは "s{サイド}-{番号}"。相手に送るデータからは習得スキルを除く（3.3 情報の秘匿）。
// ===================================================================
'use strict';

const SIDE_KEYS = ['ALLY', 'ENEMY'];

class BattleSession {
  /**
   * @param core   loadCore() の戻り値
   * @param opt    { parties: [[{charId, skills, area}] x2], field, seed }
   */
  constructor(core, opt) {
    this.core = core;
    this.field = opt.field;
    this.seed = opt.seed;
    this.units = [[], []];
    opt.parties.forEach((party, side) => {
      party.forEach((m, i) => {
        const master = core.getCharacter(m.charId);
        const u = core.unitFromMaster(master, m.skills, SIDE_KEYS[side], m.area);
        u.uid = 's' + side + '-' + (i + 1);
        this.units[side].push(u);
      });
    });
    this.battle = null;
  }

  sideOf(unit) { return unit.side === 'ALLY' ? 0 : 1; }
  unitIds(side) { return this.units[side].map(u => u.uid); }

  /** 配置を反映する（戦闘開始前のみ）。placement: { uid: area } */
  applyPlacement(side, placement) {
    this.units[side].forEach(u => { if (placement && placement[u.uid]) u.area = placement[u.uid]; });
  }

  /** 戦闘開始。戻り値: 開始時の演出イベント（ログ） */
  start() {
    const c = this.core;
    this.battle = new c.Battle({
      allies: this.units[0], enemies: this.units[1],
      field: this.field, mode: 'PVP', seed: this.seed,
    });
    return c.BattleActions.capture(this.battle, () => this.battle.start()).events;
  }

  get finished() { return !this.battle || this.battle.finished; }
  currentActor() { return this.battle ? this.battle.currentActor() : null; }
  findUnit(id) { return this.battle ? this.battle.findUnit(id) : null; }

  /** 手番の開始処理（洗脳の解除判定など）。戻り値: 演出イベント */
  turnStart(actor) {
    return this.core.BattleActions.capture(this.battle, () => this.battle.onTurnStart(actor)).events;
  }

  legal(actor) { return this.core.BattleActions.legal(this.battle, actor); }

  check(actor, action) {
    return this.core.BattleActions.check(this.battle, actor, action, { allowWait: action && action.type === 'wait' });
  }

  /** 行動を実行する。戻り値: { events, turnEnds } */
  run(actor, action) {
    const B = this.core.BattleActions;
    return B.run(this.battle, actor, B.toEngine(action));
  }

  /** AI（BOT）の行動を決める。戻り値: 通信形式の行動 */
  aiAction(actor) {
    const B = this.core.BattleActions;
    return B.fromEngine(this.core.AI.decide(this.battle, actor));
  }

  // -----------------------------------------------------------------
  // 送信用データ
  // -----------------------------------------------------------------
  /** 受け取る側（viewerSide）から見た全ユニットの表示データ。side は 0/1 の絶対値 */
  views(viewerSide) {
    const B = this.core.BattleActions;
    return this.battle.allUnits().map(u => {
      const side = this.sideOf(u);
      const v = B.unitView(u, this.battle, { hideSkills: side !== viewerSide });
      v.side = side;
      return v;
    });
  }

  /** 行動前後の表示データの差分（変わったユニットの表示データ全体） */
  diff(before, after) {
    const prev = {};
    before.forEach(v => { prev[v.uid] = JSON.stringify(v); });
    return after.filter(v => prev[v.uid] !== JSON.stringify(v));
  }

  order() { return this.core.BattleActions.remainingOrder(this.battle); }

  /** 全体の状態（battle_start / state_sync 用） */
  snapshot(viewerSide) {
    return {
      field: Object.assign({}, this.battle.field),
      round: this.battle.round,
      order: this.order(),
      units: this.views(viewerSide),
    };
  }

  /**
   * 勝敗。戻り値: { winnerSide: 0|1|null, reason }
   * 戦闘エンジンの結果は side 0（ALLY）から見たもの。
   */
  outcome() {
    const b = this.battle;
    const reason = b.round > b.roundLimit ? 'round_limit' : 'annihilation';
    if (b.result === 'WIN') return { winnerSide: 0, reason: reason };
    if (b.result === 'LOSE') return { winnerSide: 1, reason: reason };
    return { winnerSide: null, reason: reason };
  }

  /** 残りHP割合（結果表示用） */
  hpRatio(side) {
    // 召喚された魔人なども含める
    const team = this.battle ? this.battle.teamOf(SIDE_KEYS[side]) : this.units[side];
    const max = team.reduce((a, u) => a + u.maxHp, 0);
    const cur = team.reduce((a, u) => a + Math.max(0, u.hp), 0);
    return max ? Math.round(cur / max * 100) / 100 : 0;
  }
}

module.exports = BattleSession;
