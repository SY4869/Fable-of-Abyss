// ===================================================================
// 行動の一覧・実行・表示用データ（ブラウザと対戦サーバーで共用）
//
// 画面（js/ui/battleUi.js）とリアルタイム対戦サーバー（server/）が、
// 同じ手順で「何ができるか」「実行すると何が起きたか」を扱うためのもの。
//
// 行動（アクション）の形式:
//   { type:'attack', targetId }
//   { type:'skill' | 'quick', skillId, targetId? , area? }
//   { type:'move', to }
//   { type:'wait' }            … 待機（ストーリー・ゴースト対戦と、PVPの時間切れのみ）
// ===================================================================

const BattleActions = {

  // -----------------------------------------------------------------
  // 表示用データ
  // -----------------------------------------------------------------
  /**
   * 画面表示に必要なユニットの情報。opt.hideSkills なら習得スキルを含めない（相手に送る場合）。
   * side は戦闘エンジン上の 'ALLY' | 'ENEMY'。
   */
  unitView(u, battle, opt) {
    opt = opt || {};
    const st = stats(u, battle.field);
    const v = {
      uid: u.uid,
      side: u.side,
      charId: u.charId,
      name: u.name,
      displayName: u.displayName,
      portrait: u.portrait || '',
      element: u.element,
      range: u.range,
      area: u.area,
      alive: u.alive,
      hp: Math.max(0, u.hp), maxHp: u.maxHp,
      mp: u.mp, maxMp: u.maxMp,
      shield: u.shield,
      isBoss: !!u.isBoss,
      isGuest: !!u.isGuest,
      stealth: isStealthed(u),
      brainwashed: !!u.brainwashed,
      doom: u.doom || 0,
      passiveId: u.passiveId || '',
      buffs: u.buffs.map(b => ({
        name: b.name,
        dur: b.dur < 90 ? b.dur : null,
        stealth: !!(b.flags && b.flags.stealth),
      })),
      stats: { speed: st.speed, atkPhys: st.atkPhys, atkMag: st.atkMag, defPhys: st.defPhys, defMag: st.defMag },
      eva: evasionRate(u, battle.field, false),
    };
    if (!opt.hideSkills) v.skills = u.skills.slice();
    return v;
  },

  /** このラウンドでこれから行動するユニットの uid（行動順） */
  remainingOrder(battle) {
    const out = [];
    for (let i = battle.orderIndex; i < battle.order.length; i++) {
      const u = battle.findUnit(battle.order[i].uid);
      if (u && u.alive) out.push(u.uid);
    }
    return out;
  },

  // -----------------------------------------------------------------
  // 合法アクション
  // -----------------------------------------------------------------
  /**
   * actor が今できる行動の一覧。使えない行動も disabled（理由）付きで含める（画面でグレー表示するため）。
   * 対象の陣営（areaSide）は actor から見た 'ALLY' | 'ENEMY'。
   */
  legal(battle, actor, opt) {
    opt = opt || {};
    const list = [];
    const ids = us => us.map(u => u.uid);

    // 通常攻撃
    const atkTargets = battle.enemiesOf(actor).filter(t => battle.isSelectable(actor, t) && battle.canReach(actor, t));
    list.push({
      type: 'attack', name: '通常攻撃', element: actor.element,
      targetKind: 'UNIT', targets: ids(atkTargets),
      disabled: atkTargets.length ? null : '射程外',
    });

    // スキル
    actor.skills.forEach(id => {
      const sk = getSkill(id);
      const lg = getLogic(id);
      if (!sk || !lg || sk.category === 'PASSIVE') return;
      const use = battle.skillUsability(actor, id);
      const cost = skillCost(actor, id);
      const t = battle.validTargets(actor, id);
      const e = {
        type: lg.quick ? 'quick' : 'skill',
        skillId: id, name: sk.name, element: sk.element || 'NONE', desc: sk.desc,
        mpCost: cost.mp, hpCost: cost.hp,
        targetKind: t.kind,
        targets: t.kind === 'UNIT' ? ids(t.units) : [],
        areas: t.kind === 'AREA' ? t.areas.slice() : [],
        areaSide: lg.tgt === 'ALLY_AREA' ? 'ALLY' : 'ENEMY',
        disabled: use.ok ? null : use.reason,
      };
      if (t.kind === 'NONE') {
        // 対象指定のいらないスキルは、効果が及ぶユニットを示す（決定前の確認表示用）
        e.affect = lg.custom === 'fableOfAbyss'
          ? ids(battle.teamOf(actor.side).filter(u => u.alive))
          : ids(t.units);
      }
      list.push(e);
    });

    // 移動
    if (CONFIG.ALLOW_MOVE_ACTION) {
      const to = [actor.area - 1, actor.area + 1].filter(a => battle.canMoveTo(actor, a));
      list.push({ type: 'move', name: '移動', to: to, disabled: to.length ? null : '移動不可' });
    }
    if (opt.allowWait) list.push({ type: 'wait', name: '待機' });
    return list;
  },

  /** 行動が合法か。合法なら一覧の該当項目を返す */
  check(battle, actor, action, opt) {
    if (!action || typeof action !== 'object') return null;
    const list = this.legal(battle, actor, opt);
    const e = list.find(x => x.type === action.type &&
      (x.type === 'skill' || x.type === 'quick' ? x.skillId === action.skillId : true));
    if (!e || e.disabled) return null;
    if (e.type === 'attack') return e.targets.indexOf(action.targetId) >= 0 ? e : null;
    if (e.type === 'move') return e.to.indexOf(action.to) >= 0 ? e : null;
    if (e.type === 'wait') return e;
    if (e.targetKind === 'UNIT') return e.targets.indexOf(action.targetId) >= 0 ? e : null;
    if (e.targetKind === 'AREA') return e.areas.indexOf(action.area) >= 0 ? e : null;
    return e;
  },

  /** 画面・通信用の行動 → 戦闘エンジンの行動 */
  toEngine(action) {
    switch (action.type) {
      case 'attack': return { type: 'attack', targetUid: action.targetId };
      case 'move': return { type: 'move', area: action.to };
      case 'wait': return { type: 'wait' };
      default: return { type: 'skill', skillId: action.skillId, targetUid: action.targetId, area: action.area };
    }
  },

  /** 戦闘エンジンの行動（AI の出力）→ 画面・通信用の行動 */
  fromEngine(ea) {
    switch (ea.type) {
      case 'attack': return { type: 'attack', targetId: ea.targetUid };
      case 'move': return { type: 'move', to: ea.area };
      case 'wait': return { type: 'wait' };
      default: {
        const lg = getLogic(ea.skillId);
        return { type: lg && lg.quick ? 'quick' : 'skill', skillId: ea.skillId, targetId: ea.targetUid, area: ea.area };
      }
    }
  },

  // -----------------------------------------------------------------
  // 実行（演出イベントの記録つき）
  // -----------------------------------------------------------------
  /**
   * fn() の実行中に戦闘エンジンが出した演出イベントとログを、通信できる形で集める。
   * イベント: {t:'cutin'|'hit'|'raw'|'miss'|'healCast'|'heal'|'ko'|'log', ...}
   */
  capture(battle, fn) {
    const events = [];
    const prevEvent = battle.onEvent, prevLog = battle.onLog;
    battle.onEvent = (ev) => {
      const e = this.normalizeEvent(ev);
      if (e) events.push(e);
    };
    battle.onLog = (entry) => events.push({ t: 'log', text: entry.text, kind: entry.kind });
    let ret;
    try { ret = fn(); } finally {
      battle.onEvent = prevEvent;
      battle.onLog = prevLog;
    }
    return { events: events, ret: ret };
  },

  normalizeEvent(ev) {
    const id = ev.target ? ev.target.uid : undefined;
    switch (ev.type) {
      case 'action': return { t: 'cutin', unitId: ev.actor.uid, name: ev.name, element: ev.element || 'NONE', quick: !!ev.quick };
      case 'hit': return { t: 'hit', unitId: id, value: ev.amount, dmgType: ev.dmgType, element: ev.element || 'NONE', crit: !!ev.crit };
      case 'rawDamage': return { t: 'raw', unitId: id, value: ev.amount };
      case 'miss': return { t: 'miss', unitId: id };
      case 'healCast': return { t: 'healCast' };
      case 'heal': return { t: 'heal', unitId: id, value: ev.amount };
      case 'death': return { t: 'ko', unitId: id };
      default: return null;
    }
  },

  /** 行動を実行する。戻り値: { events, turnEnds } */
  run(battle, actor, engineAction) {
    const r = this.capture(battle, () => battle.execute(actor, engineAction));
    return { events: r.events, turnEnds: !!r.ret || battle.finished };
  },
};
