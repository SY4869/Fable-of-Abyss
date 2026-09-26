// ===================================================================
// 戦闘エンジン
//
// ラウンド制: 生存ユニットを「速度の高い順」に並べ、各ユニット1回ずつ行動する。
// 複数回行動（二刀流・火薬の魔女・トリプレットマジック）を持つユニットは
// その回数ぶん行動順に登録される。
// クイックスキルは行動権を消費せず、自分のターン中に何度でも使用できる。
// ===================================================================

class Battle {
  /**
   * @param {object} setup
   *   allies:   [unit]         プレイヤー側（配置済み）
   *   enemies:  [unit]         敵側（配置済み）
   *   field:    {time,location}
   *   mode:     'STORY' | 'PVP'
   *   winCondition: {type:'ANNIHILATE'|'DEFEAT_TARGET', targetUid}
   *   roundLimit: number
   *   seed:     number
   */
  constructor(setup) {
    this.field = setup.field || { time: 'DAY', location: 'PLAINS' };
    this.mode = setup.mode || 'STORY';
    this.rng = makeRng(setup.seed || Date.now());
    this.allies = setup.allies;
    this.enemies = setup.enemies;
    this.winCondition = setup.winCondition || { type: 'ANNIHILATE' };
    this.roundLimit = setup.roundLimit ||
      (this.mode === 'PVP' ? CONFIG.PVP_ROUND_LIMIT : CONFIG.STORY_ROUND_LIMIT);
    this.round = 0;
    this.order = [];
    this.orderIndex = 0;
    this.log = [];
    this.result = null;       // 'WIN' | 'LOSE' | 'DRAW'
    this.finished = false;
    this.onLog = setup.onLog || null;
    this.onEvent = setup.onEvent || null;   // 演出用（効果音・ダメージ表示）
  }

  /** 演出イベントを UI に通知する（戦闘ロジックには影響しない） */
  emit(type, data) {
    if (this.onEvent) this.onEvent(Object.assign({ type: type }, data || {}));
  }

  // ---------------------------------------------------------------
  // ログ
  // ---------------------------------------------------------------
  say(text, kind) {
    const entry = { text: text, kind: kind || 'info', round: this.round };
    this.log.push(entry);
    if (this.onLog) this.onLog(entry);
  }

  allUnits() { return this.allies.concat(this.enemies); }
  aliveOf(side) { return (side === 'ALLY' ? this.allies : this.enemies).filter(u => u.alive); }
  alliesOf(unit) { return this.aliveOf(unit.side); }
  enemiesOf(unit) { return this.aliveOf(unit.side === 'ALLY' ? 'ENEMY' : 'ALLY'); }
  teamOf(side) { return side === 'ALLY' ? this.allies : this.enemies; }
  findUnit(uid) { return this.allUnits().find(u => u.uid === uid) || null; }

  // ---------------------------------------------------------------
  // 開始
  // ---------------------------------------------------------------
  start() {
    this.say('『' + fieldName(this.field) + '』での戦闘が始まった！', 'system');
    this.say(FIELD_TIME[this.field.time].desc + ' / ' + FIELD_LOCATION[this.field.location].desc, 'system');

    // 戦闘開始時パッシブ
    this.allUnits().slice().forEach(u => {
      if (!u.alive) return;
      const p = passiveOf(u);
      if (p && p.summonMobAtStart) {
        const mob = unitMob('召喚された魔人', u.side, 1, this.rng);
        this.teamOf(u.side).push(mob);
        this.say(u.displayName + 'の【' + u.passiveId + '】— 前衛に魔人を召喚した！', 'skill');
      }
    });
    this.enforceFront('ALLY');
    this.enforceFront('ENEMY');

    this.beginRound();
  }

  // ---------------------------------------------------------------
  // ラウンド進行
  // ---------------------------------------------------------------
  beginRound() {
    this.round++;
    if (this.round > this.roundLimit) { this.judgeTimeout(); return; }
    this.say('―― ラウンド ' + this.round + ' ――', 'round');

    this.allUnits().forEach(u => {
      if (!u.alive) return;
      u.tookDamageLastRound = u.tookDamageThisRound;
      u.tookDamageThisRound = false;
      this.refreshOniState(u);

      // 継続回復（パッシブ＋バフ）
      const p = passiveOf(u);
      const applyRegen = (r, label) => {
        if (!r) return;
        if (r.hp) this.heal(u, r.hp, label, true);
        if (r.mp) this.restoreMp(u, r.mp, label);
      };
      if (p) {
        if (p.cond === 'NIGHT') { if (this.field.time === 'NIGHT') applyRegen(p.regen, u.passiveId); }
        else applyRegen(p.regen, u.passiveId);
        if (p.roundStartPerm) {
          this.gainPerm(u, p.roundStartPerm, u.passiveId);
        }
      }
      u.buffs.forEach(b => applyRegen(b.regen, b.name));

      // ポイズンキングダム
      u.buffs.forEach(b => {
        if (b.flags && b.flags.poisonKingdom) {
          this.enemiesOf(u).forEach(t => {
            this.dealRawDamage(t, b.flags.poisonKingdom, 'ポイズンキングダム', u);
            t.mp = Math.max(0, t.mp - b.flags.poisonKingdom);
          });
        }
      });
    });

    if (this.checkEnd()) return;

    // 行動順を構築
    const queue = [];
    this.allUnits().filter(u => u.alive).forEach(u => {
      const n = actionCount(u);
      for (let i = 0; i < n; i++) queue.push({ uid: u.uid, seq: i });
    });
    queue.sort((a, b) => {
      const ua = this.findUnit(a.uid), ub = this.findUnit(b.uid);
      const d = stats(ub, this.field).speed - stats(ua, this.field).speed;
      if (d !== 0) return d;
      if (a.seq !== b.seq) return a.seq - b.seq;
      return ua.side === ub.side ? 0 : (ua.side === 'ALLY' ? -1 : 1);
    });
    this.order = queue;
    this.orderIndex = 0;
    this.advanceToActor();
  }

  endRound() {
    // ラウンド終了時パッシブ
    this.allUnits().forEach(u => {
      if (!u.alive) return;
      const p = passiveOf(u);
      if (p && p.roundEndPierceAll) {
        this.enemiesOf(u).forEach(t =>
          this.dealRawDamage(t, p.roundEndPierceAll, u.passiveId, u));
      }
      if (p && p.roundEndMpDrainAll) {
        this.enemiesOf(u).forEach(t => {
          const lost = Math.min(t.mp, p.roundEndMpDrainAll);
          t.mp -= lost;
          if (lost > 0) this.say('→ ' + t.displayName + 'のMPが【' + u.passiveId + '】で ' + lost + ' 減った', 'bad');
        });
      }
    });
    if (this.checkEnd()) return;

    // リーサルカウント
    this.allUnits().forEach(u => {
      if (!u.alive || !u.doom) return;
      u.doom--;
      if (u.doom <= 0) {
        this.say(u.displayName + 'は【リーサルカウント】の刻限を迎えた！', 'skill');
        this.kill(u, null);
      }
    });
    if (this.checkEnd()) return;

    // バフの持続ターンを減らす
    this.allUnits().forEach(u => {
      u.buffs = u.buffs.filter(b => {
        if (b.dur === Infinity) return true;
        b.dur--;
        if (b.dur <= 0) {
          this.say(u.displayName + 'の【' + b.name + '】の効果が切れた。', 'minor');
          return false;
        }
        return true;
      });
    });

    this.beginRound();
  }

  /** 前衛が空になった陣営を前進させる（射程1のキャラが一方的に倒されないように） */
  enforceFront(side) {
    if (normalizeFront(this.teamOf(side))) {
      this.say('前衛が不在のため、' + (side === 'ALLY' ? '自軍' : '敵軍') + 'の隊列が前進した。', 'system');
    }
  }

  /** 移動可能なエリアか（最後の前衛は後ろへ下がれない） */
  canMoveTo(actor, area) {
    if (area < 1 || area > CONFIG.AREA_COUNT || Math.abs(area - actor.area) !== 1) return false;
    if (actor.area === 1 && area > 1) {
      return this.alliesOf(actor).some(u => u !== actor && u.area === 1);
    }
    return true;
  }

  /** 次に行動できるユニットまで進める。全員終わったらラウンド終了。 */
  advanceToActor() {
    while (this.orderIndex < this.order.length) {
      const u = this.findUnit(this.order[this.orderIndex].uid);
      if (u && u.alive) return;
      this.orderIndex++;
    }
    this.endRound();
  }

  currentActor() {
    if (this.finished) return null;
    const entry = this.order[this.orderIndex];
    return entry ? this.findUnit(entry.uid) : null;
  }

  /** 行動を1つ消費して次へ */
  finishAction() {
    this.orderIndex++;
    if (this.checkEnd()) return;
    this.advanceToActor();
  }

  /** ターン開始処理（洗脳解除判定）。UI から currentActor のたびに呼ぶ。 */
  onTurnStart(unit) {
    if (unit._turnStarted === this.round + ':' + this.orderIndex) return;
    unit._turnStarted = this.round + ':' + this.orderIndex;
    // クイックスキルは「1ターンに複数種」使えるが、同じものの撃ち直しは不可
    unit._quickUsed = {};
    if (unit.brainwashed) {
      const rate = stats(unit, this.field).defMag * CONFIG.BRAINWASH_CURE_PER_DEFMAG;
      if (this.rng.chance(rate)) {
        unit.brainwashed = false;
        this.say(unit.displayName + 'は洗脳から解放された！', 'good');
      }
    }
  }

  // ---------------------------------------------------------------
  // 対象選択
  // ---------------------------------------------------------------
  /** attacker から target まで攻撃が届くか */
  canReach(attacker, target) {
    const d = areaDistance(attacker.area, target.area);
    return inRange(attacker.range, d);
  }

  distance(attacker, target) {
    return areaDistance(attacker.area, target.area);
  }

  /** 単体対象として選べるか（隠密考慮） */
  isSelectable(attacker, target) {
    if (!target.alive) return false;
    if (isStealthed(target) && !unitFlags(attacker).ignoreStealth) return false;
    return true;
  }

  /**
   * 指定スキル（null なら通常攻撃）で選択可能な対象一覧を返す。
   * 戻り値: { kind:'UNIT'|'AREA'|'NONE', units:[], areas:[] }
   */
  validTargets(actor, skillId) {
    const lg = skillId ? getLogic(skillId) : null;
    const tgt = lg ? lg.tgt : 'ENEMY_ONE';

    if (!lg || tgt === 'ENEMY_ONE') {
      const list = this.enemiesOf(actor)
        .filter(t => this.isSelectable(actor, t) && this.canReach(actor, t));
      return { kind: 'UNIT', units: list, areas: [] };
    }
    switch (tgt) {
      case 'SELF':
      case 'NONE':
        return { kind: 'NONE', units: [actor], areas: [] };
      case 'ENEMY_AREA': {
        const areas = [];
        for (let a = 1; a <= CONFIG.AREA_COUNT; a++) {
          const occupied = this.enemiesOf(actor).filter(t => t.area === a);
          if (occupied.length && inRange(actor.range, areaDistance(actor.area, a))) areas.push(a);
        }
        return { kind: 'AREA', units: [], areas: areas };
      }
      case 'ENEMY_ALL':
        return { kind: 'NONE', units: this.enemiesOf(actor), areas: [] };
      case 'ALLY_ONE': {
        const units = this.alliesOf(actor);
        // リバース: 回復スキルを敵にも使える（射程・隠密は攻撃と同じ扱い）
        const p = passiveOf(actor);
        if (lg.act === 'heal' && p && p.healAsDamage) {
          this.enemiesOf(actor)
            .filter(t => this.isSelectable(actor, t) && this.canReach(actor, t))
            .forEach(t => units.push(t));
        }
        return { kind: 'UNIT', units: units, areas: [] };
      }
      case 'ALLY_AREA': {
        const areas = [];
        for (let a = 1; a <= CONFIG.AREA_COUNT; a++) {
          if (this.alliesOf(actor).some(t => t.area === a)) areas.push(a);
        }
        return { kind: 'AREA', units: [], areas: areas };
      }
      case 'ALLY_ALL':
        return { kind: 'NONE', units: this.alliesOf(actor), areas: [] };
      default:
        return { kind: 'NONE', units: [], areas: [] };
    }
  }

  /** スキルが今使えるか。理由つきで返す。 */
  skillUsability(actor, skillId) {
    const sk = getSkill(skillId);
    if (!sk) return { ok: false, reason: '未定義' };
    if (sk.category === 'PASSIVE') return { ok: false, reason: 'パッシブ' };
    const lgq = getLogic(skillId);
    if (lgq && lgq.quick && actor._quickUsed && actor._quickUsed[skillId]) {
      return { ok: false, reason: '使用済み' };
    }
    if (lgq && lgq.oncePerBattle && actor._usedOnce && actor._usedOnce[skillId]) {
      return { ok: false, reason: '使用済み' };
    }
    const c = skillCost(actor, skillId);
    if (actor.mp < c.mp) return { ok: false, reason: 'MP不足' };
    if (c.hp > 0 && actor.hp <= c.hp) return { ok: false, reason: 'HP不足' };
    const t = this.validTargets(actor, skillId);
    if (t.kind === 'UNIT' && t.units.length === 0) return { ok: false, reason: '射程外' };
    if (t.kind === 'AREA' && t.areas.length === 0) return { ok: false, reason: '射程外' };
    if (t.kind === 'NONE' && t.units.length === 0 && (getLogic(skillId) || {}).tgt === 'ENEMY_ALL') {
      return { ok: false, reason: '対象なし' };
    }
    return { ok: true, reason: '' };
  }

  /** 通常攻撃が可能か */
  canNormalAttack(actor) {
    return this.enemiesOf(actor)
      .some(t => this.isSelectable(actor, t) && this.canReach(actor, t));
  }

  // ---------------------------------------------------------------
  // 行動実行
  // ---------------------------------------------------------------
  /**
   * @param {object} action
   *   { type:'attack', targetUid }
   *   { type:'skill', skillId, targetUid?, area? }
   *   { type:'move', area }
   *   { type:'wait' }
   * @returns {boolean} 行動権を消費したか
   */
  execute(actor, action) {
    if (this.finished || !actor.alive) return false;
    this.onTurnStart(actor);

    // 洗脳：70%で対象がランダムになる
    if (actor.brainwashed && (action.type === 'attack' || action.type === 'skill')) {
      if (this.rng.chance(CONFIG.BRAINWASH_RANDOM_RATE * 100)) {
        const pool = this.allUnits().filter(u => u.alive && u !== actor && this.canReach(actor, u));
        const alt = this.rng.pick(pool);
        if (alt) {
          this.say(actor.displayName + 'は洗脳されている！ 対象が定まらない…', 'bad');
          action = Object.assign({}, action, { targetUid: alt.uid, area: alt.area });
        }
      }
    }

    let consumed = true;
    switch (action.type) {
      case 'attack':
        this.doNormalAttack(actor, this.findUnit(action.targetUid));
        break;
      case 'skill': {
        const lg = getLogic(action.skillId);
        consumed = !(lg && lg.quick);
        if (lg && lg.oncePerBattle) {
          actor._usedOnce = actor._usedOnce || {};
          actor._usedOnce[action.skillId] = true;
        }
        if (!consumed) {
          actor._quickUsed = actor._quickUsed || {};
          actor._quickUsed[action.skillId] = true;
        }
        this.useSkill(actor, action.skillId, action);
        break;
      }
      case 'move':
        if (!this.canMoveTo(actor, action.area)) {
          this.say(actor.displayName + 'はその場に踏みとどまった。', 'minor');
          break;
        }
        actor.area = action.area;
        this.say(actor.displayName + 'は' + AREA_LABEL[action.area] + 'へ移動した。', 'minor');
        this.enforceFront(actor.side);
        break;
      case 'wait':
        this.say(actor.displayName + 'は様子をうかがっている。', 'minor');
        break;
    }
    if (consumed) this.finishAction();
    else if (this.checkEnd()) return consumed;
    return consumed;
  }

  // ---------------------------------------------------------------
  // 通常攻撃
  // ---------------------------------------------------------------
  doNormalAttack(actor, target) {
    if (!target || !target.alive) return;
    const s = stats(actor, this.field);
    const usePhys = s.atkPhys >= s.atkMag;
    const spec = {
      base: usePhys ? 'atkPhys' : 'atkMag',
      mod: 0,
      dmg: usePhys ? 'PHYS' : 'MAG',
      baseAccuracy: CONFIG.NORMAL_ATTACK_ACCURACY,
    };
    this.say(actor.displayName + 'の通常攻撃！', 'action');
    this.emit('action', { actor: actor, name: '通常攻撃', element: actor.element });
    this.resolveAttack(actor, target, spec, { name: '通常攻撃', element: actor.element });
  }

  // ---------------------------------------------------------------
  // スキル使用
  // ---------------------------------------------------------------
  useSkill(actor, skillId, action) {
    const sk = getSkill(skillId);
    const lg = getLogic(skillId);
    if (!sk || !lg) return;

    const cost = skillCost(actor, skillId);
    actor.mp -= cost.mp;
    if (cost.hp) {
      actor.hp = Math.max(1, actor.hp - cost.hp);
      this.say(actor.displayName + 'はHPを' + cost.hp + '点支払った。', 'minor');
    }
    this.say(actor.displayName + 'の【' + sk.name + '】！' + (lg.quick ? '（クイック）' : ''), 'skill');
    this.emit('action', { actor: actor, name: sk.name, element: sk.element || actor.element, quick: !!lg.quick });

    this.applyEffect(actor, lg, action, sk);
    this.checkEnd();
  }

  /** 効果の適用（then による連鎖も処理） */
  applyEffect(actor, lg, action, sk) {
    const targets = this.resolveEffectTargets(actor, lg, action);
    let lastDamage = 0;

    switch (lg.act) {
      case 'attack': {
        const hits = lg.atk.hits || 1;
        targets.forEach(t => {
          for (let i = 0; i < hits && t.alive; i++) {
            lastDamage += this.resolveAttack(actor, t, lg.atk, {
              name: sk ? sk.name : '', element: sk ? sk.element : actor.element,
              onKill: lg.onKill, rose: lg.rose,
            });
          }
        });
        break;
      }
      case 'heal': {
        const s = stats(actor, this.field);
        const amount = Math.max(0, s[lg.heal.base] + (lg.heal.mod || 0));
        const p = passiveOf(actor);
        this.emit('healCast', {});
        targets.forEach(t => {
          if (t.side !== actor.side && p && p.healAsDamage) {
            // リバース: 敵に使うと回復量の2倍の魔法ダメージ（必中・魔法防御で軽減）
            this.resolveAttack(actor, t, { power: amount * p.healAsDamage, dmg: 'MAG', sure: true },
              { name: sk ? sk.name : '回復', element: 'NONE' });
          } else {
            this.heal(t, amount, sk ? sk.name : '回復');
          }
        });
        break;
      }
      case 'buff':
        targets.forEach(t => this.applyBuff(t, lg.buff, sk ? sk.name : 'バフ', actor));
        break;
      case 'special':
        this.runCustom(actor, lg, action, sk, targets);
        break;
    }

    // 追加効果
    (lg.then || []).forEach(sub => {
      const subAction = Object.assign({}, action);
      if (sub.tgt === 'TARGET') {
        const t = this.findUnit(action.targetUid);
        if (t && t.alive) this.applyBuff(t, sub.buff, sk ? sk.name : '効果', actor);
        return;
      }
      if (sub.act === 'special') { this.runCustom(actor, sub, action, sk, [actor], lastDamage); return; }
      this.applyEffect(actor, sub, subAction, sk);
    });
  }

  resolveEffectTargets(actor, lg, action) {
    const tgt = lg.tgt || 'ENEMY_ONE';
    switch (tgt) {
      case 'SELF': return [actor];
      case 'NONE': return [];
      case 'ENEMY_ONE': {
        const t = this.findUnit(action && action.targetUid);
        return t && t.alive ? [t] : [];
      }
      case 'ALLY_ONE': {
        const t = this.findUnit(action && action.targetUid);
        return t ? [t] : [actor];
      }
      case 'ENEMY_AREA': {
        const a = action && action.area;
        // areaSpan: 2 なら選んだエリアと、その後ろ（後衛を選んだ場合は中衛）も巻き込む
        const areas = lg.areaSpan === 2 ? [a, a < CONFIG.AREA_COUNT ? a + 1 : a - 1] : [a];
        return this.enemiesOf(actor).filter(u => areas.indexOf(u.area) >= 0);
      }
      case 'ALLY_AREA':
        return this.alliesOf(actor).filter(u => u.area === (action && action.area !== undefined ? action.area : actor.area));
      case 'ENEMY_ALL': return this.enemiesOf(actor);
      case 'ALLY_ALL': return this.alliesOf(actor);
      default: return [];
    }
  }

  // ---------------------------------------------------------------
  // 命中・ダメージ
  // ---------------------------------------------------------------
  /** @returns {number} 与えたダメージ */
  resolveAttack(actor, target, spec, meta) {
    if (!target.alive) return 0;
    meta = meta || {};
    const flags = unitFlags(actor);
    const dist = this.distance(actor, target);
    const isRanged = dist >= CONFIG.RANGED_ATTACK_MIN_DISTANCE;

    // --- 命中判定 ---
    const sure = spec.sure || flags.alwaysHit;
    if (!sure) {
      const baseAcc = spec.baseAccuracy !== undefined ? spec.baseAccuracy : CONFIG.SKILL_BASE_ACCURACY;
      let acc = baseAcc + (spec.acc || 0) + accuracyBonus(actor, this.field)
        - evasionRate(target, this.field, isRanged);
      acc = Math.min(CONFIG.ACCURACY_CEIL, Math.max(CONFIG.ACCURACY_FLOOR, acc));
      if (!this.rng.chance(acc)) {
        this.say('→ ' + target.displayName + 'は攻撃をかわした！（命中率 ' + acc + '%）', 'miss');
        this.emit('miss', { target: target });
        this.onDodge(target);
        return 0;
      }
    }

    // --- ダメージ算出 ---
    const aS = stats(actor, this.field);
    const tS = stats(target, this.field);
    let power = spec.power !== undefined ? spec.power : aS[spec.base] + (spec.mod || 0);

    // 二刀流の物理攻撃力半減を無くすスキル
    if (spec.ignoreDualPenalty && flags.atkPhysHalf && spec.base === 'atkPhys') {
      power = (aS.atkPhys * 2) + (spec.mod || 0);
    }
    // 咲き誇る薔薇園（味方全員の白茨・紅茨 +3）
    if (meta.rose) {
      const bonus = this.alliesOf(actor).reduce((acc, a) => {
        const p = passiveOf(a);
        return acc + (p && p.roseBonus ? p.roseBonus : 0);
      }, 0);
      if (bonus) power += bonus;
    }
    // 抜刀《攻》（物理ダメージのみ）
    const battou = spec.dmg === 'PHYS' && actor.buffs.find(b => b.flags && b.flags.nextAtkBonus);
    if (battou) {
      power += battou.flags.nextAtkBonus;
      actor.buffs = actor.buffs.filter(b => b !== battou);
      this.say('→ 【' + battou.name + '】の効果が乗った！', 'minor');
    }

    // ダメージ種別（変幻自在）
    let dmgType = spec.dmg;
    if (unitFlags(target).allDamageAsPhys) dmgType = 'PHYS';

    // 絶対領域
    const tPassive = passiveOf(target);
    if (tPassive && tPassive.immune === dmgType) {
      this.say('→ ' + target.displayName + 'の【' + target.passiveId + '】がダメージを無効化した！', 'good');
      this.emit('hit', { target: target, element: meta.element || actor.element, dmgType: dmgType, amount: 0 });
      return 0;
    }

    // 防御
    let def = dmgType === 'PHYS' ? tS.defPhys : tS.defMag;
    if (spec.pierce || flags.allPierce) def = 0;
    else if (spec.defHalf) def = Math.floor(def / 2);

    let dmg = Math.max(CONFIG.DAMAGE_MIN, power - def);

    // 属性相性
    const el = meta.element || actor.element;
    const mult = elementMultiplier(el, target.element);
    if (mult !== 1) dmg = Math.floor(dmg * mult);

    // 抜刀《防》
    const guard = target.buffs.find(b => b.flags && b.flags.nextDefReduce);
    if (guard) {
      dmg -= guard.flags.nextDefReduce;
      target.buffs = target.buffs.filter(b => b !== guard);
      this.say('→ ' + target.displayName + 'の【' + guard.name + '】で軽減！', 'minor');
    }
    dmg = Math.max(CONFIG.DAMAGE_MIN, dmg);

    const label = (mult > 1 ? '効果は抜群だ！ ' : '') +
      target.displayName + 'に ' + dmg + ' ダメージ' +
      (spec.pierce || flags.allPierce ? '（貫通）' : '');
    this.say('→ ' + label, mult > 1 ? 'crit' : 'damage');
    this.emit('hit', { target: target, element: el, dmgType: dmgType, amount: dmg, crit: mult > 1 });

    const died = this.dealDamage(target, dmg, actor);
    if (died) this.onKillBonus(actor, meta.onKill);
    return dmg;
  }

  /** 回避成功時（即応反撃） */
  onDodge(unit) {
    unit.buffs.forEach(b => {
      if (b.flags && b.flags.growOnDodge) {
        unit.perm.atkPhys += b.flags.growOnDodge;
        unit.perm.atkMag += b.flags.growOnDodge;
        this.say('→ ' + unit.displayName + 'の【' + b.name + '】で攻撃力が上がった！', 'good');
      }
    });
  }

  /** シールドを考慮したダメージ処理。戻り値は「戦闘不能になったか」 */
  dealDamage(target, dmg, source) {
    // 戦略的撤退: 1度だけダメージを無効化し中衛へ退避
    const retreat = target.buffs.find(b => b.flags && b.flags.retreatOnce);
    if (retreat) {
      target.buffs = target.buffs.filter(b => b !== retreat);
      target.area = 2;
      this.say('→ ' + target.displayName + 'の【' + retreat.name +
        '】！ ダメージを無効化して' + AREA_LABEL[2] + 'へ退避した。', 'good');
      this.enforceFront(target.side);
      return false;
    }
    if (this.ignoresDamage(target, dmg)) return false;
    if (target.shield > 0) {
      const absorbed = Math.min(target.shield, dmg);
      target.shield -= absorbed;
      dmg -= absorbed;
      this.say('→ シールドが ' + absorbed + ' 吸収した。' +
        (target.shield > 0 ? '（残り ' + target.shield + '）' : '（破壊）'), 'minor');
    }
    if (dmg <= 0) return false;

    target.hp -= dmg;
    target.tookDamageThisRound = true;

    // 復讐者など「ダメージを受けるたび」
    target.buffs.forEach(b => {
      if (b.flags && b.flags.onDamagedPerm) this.gainPerm(target, b.flags.onDamagedPerm, b.name);
    });
    if (target.hp <= 0) return this.tryEndure(target, source);
    return false;
  }

  /** 防御・シールドを無視した固定ダメージ（毒・貫通効果など） */
  dealRawDamage(target, dmg, label, source) {
    if (!target.alive) return;
    if (this.ignoresDamage(target, dmg)) return;
    target.hp -= dmg;
    target.tookDamageThisRound = true;
    this.say('→ ' + target.displayName + 'は【' + label + '】で ' + dmg + ' ダメージ', 'damage');
    this.emit('rawDamage', { target: target, amount: dmg });
    if (target.hp <= 0) this.tryEndure(target, source);
  }

  /** 不死なる魔王（復活後）: 一定以下のダメージを無効化する */
  ignoresDamage(target, dmg) {
    const p = passiveOf(target);
    const limit = p && p.undying && target.undyingUsed ? p.undying.ignoreDamageUpTo : 0;
    if (!limit || dmg > limit) return false;
    this.say('→ ' + target.displayName + 'の【' + target.passiveId + '】が ' + dmg + ' ダメージを無効化した！', 'good');
    return true;
  }

  /** HPが0になったときの耐え判定。戻り値: 本当に倒れたか */
  tryEndure(target, source) {
    // ブレイブハート / 生への執着
    const endureBuff = target.buffs.find(b => b.flags && b.flags.endure);
    if (endureBuff) {
      const f = endureBuff.flags;
      let success = false;
      if (f.endure >= 100) success = true;
      else if (f.endureStoryFirstGuaranteed && this.mode === 'STORY' && !target.usedEndureStoryFree) {
        success = true;
        target.usedEndureStoryFree = true;
        this.say('→ ストーリー補正により【' + endureBuff.name + '】が確定発動！', 'good');
      } else {
        success = this.rng.chance(f.endure);
      }
      if (success) {
        target.hp = 1;
        target.buffs = target.buffs.filter(b => b !== endureBuff);
        this.say('→ ' + target.displayName + 'は【' + endureBuff.name + '】でHP1で耐えた！', 'good');
        return false;
      }
    }
    // 不死なる魔王
    const p = passiveOf(target);
    if (p && p.undying && !target.undyingUsed) {
      target.undyingUsed = true;
      target.hp = 1;
      target.perm.defPhys += p.undying.defPhys;
      target.perm.defMag += p.undying.defMag;
      this.say('→ ' + target.displayName + 'の【' + target.passiveId + '】が発動！ HP1で蘇り、防御力が跳ね上がった！', 'good');
      return false;
    }
    this.kill(target, source);
    return true;
  }

  kill(target, source) {
    if (!target.alive) return;
    target.alive = false;
    target.hp = 0;
    target.buffs = [];
    target.shield = 0;
    this.say('※ ' + target.displayName + ' は戦闘不能になった！', 'death');
    this.emit('death', { target: target });
    this.enforceFront(target.side);

    // 優しき死神
    const p = passiveOf(target);
    if (p && p.onDeathHealAllies) {
      this.alliesOf(target).forEach(a => {
        this.heal(a, p.onDeathHealAllies.hp, target.passiveId, true);
        this.restoreMp(a, p.onDeathHealAllies.mp, target.passiveId);
      });
    }
    // 優鬼（味方が倒されるたびに強化）
    this.teamOf(target.side).forEach(a => { if (a.alive) a.alliesLost++; });

    if (source && source.alive) {
      source.kills++;
      const sp = passiveOf(source);
      if (sp && sp.onKill) this.gainPerm(source, sp.onKill.perm, source.passiveId);
      source.buffs.forEach(b => {
        if (!b.flags) return;
        if (b.flags.onKillRestore) {
          this.heal(source, b.flags.onKillRestore.hp, b.name, true);
          this.restoreMp(source, b.flags.onKillRestore.mp, b.name);
        }
        if (b.flags.onKillPerm) this.gainPerm(source, b.flags.onKillPerm, b.name);
      });
    }
  }

  /** スキル固有の「この攻撃で敵を倒した場合」 */
  onKillBonus(actor, onKill) {
    if (!onKill || !actor.alive) return;
    if (onKill.perm) this.gainPerm(actor, onKill.perm, '撃破ボーナス');
    if (onKill.restore) {
      if (onKill.restore.hp) this.heal(actor, onKill.restore.hp, '撃破ボーナス', true);
      if (onKill.restore.mp) this.restoreMp(actor, onKill.restore.mp, '撃破ボーナス');
    }
  }

  // ---------------------------------------------------------------
  // 回復・強化
  // ---------------------------------------------------------------
  heal(unit, amount, label, silentIfZero) {
    if (!unit.alive || amount <= 0) return;
    if (hasFlag(unit, 'noHeal')) {
      if (!silentIfZero) this.say('→ ' + unit.displayName + 'は【アンチヒール】で回復できない！', 'bad');
      return;
    }
    const before = unit.hp;
    unit.hp = Math.min(unit.maxHp, unit.hp + amount);
    const done = unit.hp - before;
    if (done > 0) this.say('→ ' + unit.displayName + 'のHPが ' + done + ' 回復（' + label + '）', 'good');
    if (done > 0 && !silentIfZero) this.emit('heal', { target: unit, amount: done });
  }

  restoreMp(unit, amount, label) {
    if (!unit.alive || amount <= 0) return;
    const before = unit.mp;
    unit.mp = Math.min(unit.maxMp, unit.mp + amount);
    const done = unit.mp - before;
    if (done > 0) this.say('→ ' + unit.displayName + 'のMPが ' + done + ' 回復（' + label + '）', 'good');
  }

  /** 戦闘中の永続ステータス上昇 */
  gainPerm(unit, gain, label) {
    if (!gain) return;
    const parts = [];
    for (const k in gain) {
      unit.perm[k] = (unit.perm[k] || 0) + gain[k];
      if (k === 'hp') { unit.maxHp += gain[k]; unit.hp += gain[k]; }
      if (k === 'mp') { unit.maxMp += gain[k]; unit.mp = Math.min(unit.maxMp, unit.mp + gain[k]); }
      parts.push(STAT_LABEL[k] + '+' + gain[k]);
    }
    this.say('→ ' + unit.displayName + 'の' + parts.join('・') + '（' + label + '）', 'good');
  }

  /** バフ・デバフ付与。同名は上書き。 */
  applyBuff(unit, spec, name, source) {
    if (!unit.alive || !spec) return;
    const buff = {
      name: name,
      dur: spec.dur === undefined ? 1 : spec.dur,
      stats: spec.stats ? Object.assign({}, spec.stats) : null,
      nightStats: spec.nightStats ? Object.assign({}, spec.nightStats) : null,
      acc: spec.acc || 0,
      eva: spec.eva || 0,
      regen: spec.regen || null,
      flags: spec.flags ? Object.assign({}, spec.flags) : null,
    };
    // シールドはバフではなく即時付与
    if (spec.shield) {
      const s = stats(source || unit, this.field);
      const amount = Math.floor(s[spec.shield.base] / (spec.shield.div || 1));
      unit.shield += amount;
      this.say('→ ' + unit.displayName + 'に ' + amount + ' のシールドを展開（' + name + '）', 'good');
      if (!buff.stats && !buff.flags && !buff.regen && !buff.acc && !buff.eva) return;
    }
    unit.buffs = unit.buffs.filter(b => b.name !== name); // 同名は重ね掛け不可
    unit.buffs.push(buff);

    const desc = [];
    if (buff.stats) for (const k in buff.stats) desc.push(STAT_LABEL[k] + (buff.stats[k] > 0 ? '+' : '') + buff.stats[k]);
    if (buff.acc) desc.push('命中' + (buff.acc > 0 ? '+' : '') + buff.acc + '%');
    if (buff.eva) desc.push('回避' + (buff.eva > 0 ? '+' : '') + buff.eva + '%');
    if (buff.flags && buff.flags.stealth) desc.push('隠密');
    this.say('→ ' + unit.displayName + 'に【' + name + '】' +
      (desc.length ? '（' + desc.join('・') + '）' : '') +
      (buff.dur < 90 ? ' ' + buff.dur + 'ラウンド' : ''), 'good');
  }

  /** 優鬼判定用に「味方全員が無傷か」を更新 */
  refreshOniState(unit) {
    const p = passiveOf(unit);
    if (!p || !p.gentleOni) return;
    unit._allAlliesFullHp = this.alliesOf(unit).every(a => a.hp >= a.maxHp);
  }

  // ---------------------------------------------------------------
  // 特殊スキル
  // ---------------------------------------------------------------
  runCustom(actor, lg, action, sk, targets, lastDamage) {
    switch (lg.custom) {
      case 'restoreMp':
        this.restoreMp(actor, lg.amount, sk ? sk.name : '');
        break;

      case 'selfHealByAtkMag':
        this.heal(actor, stats(actor, this.field).atkMag, '白茨');
        break;

      case 'permGain':
        this.gainPerm(actor, lg.perm, sk ? sk.name : '');
        break;

      case 'charm': {
        const t = this.findUnit(action.targetUid);
        if (t && t.alive && lg.immunePassive && t.passiveId === lg.immunePassive) {
          this.say('→ ' + t.displayName + 'の【' + t.passiveId + '】が洗脳を見破った！', 'good');
          break;
        }
        if (t && t.alive) {
          t.brainwashed = true;
          this.say('→ ' + t.displayName + 'は洗脳状態になった！', 'bad');
        }
        break;
      }

      case 'lethalCount': {
        this.enemiesOf(actor).filter(u => u.area === action.area).forEach(t => {
          t.doom = lg.rounds;
          this.say('→ ' + t.displayName + 'に死の刻限が刻まれた（残り ' + lg.rounds + 'ラウンド）', 'bad');
        });
        break;
      }

      case 'fableOfAbyss': {
        this.field = Object.assign({}, this.field, { time: 'NIGHT' });
        this.say('→ フィールドが『' + fieldName(this.field) + '』に変わった！', 'system');
        this.teamOf(actor.side).filter(u => !u.alive).forEach(t => {
          if (hasFlag(t, 'noHeal')) { this.say('→ ' + t.displayName + 'は蘇生できない（アンチヒール）', 'bad'); return; }
          t.alive = true;
          t.hp = Math.max(1, Math.floor(t.maxHp / 2));
          t.buffs = [];
          this.say('→ ' + t.displayName + 'が復活した！（HP ' + t.hp + '）', 'good');
        });
        break;
      }

      case 'swordAndRose': {
        const flare = this.teamOf(actor.side).find(u => u.name === 'フレア');
        if (!flare) { this.say('→ しかしフレアは戦場にいない…', 'minor'); break; }
        if (hasFlag(flare, 'noHeal')) { this.say('→ フレアは回復を受けられない（アンチヒール）', 'bad'); break; }
        flare.alive = true;
        flare.hp = flare.maxHp;
        flare.mp = flare.maxMp;
        this.say('→ フレアのHPとMPが全回復した！', 'good');
        break;
      }

      case 'hangon': {
        const t = this.findUnit(action.targetUid);
        if (!t || !t.alive) break;
        const dealt = this.resolveAttack(actor, t, lg.atk, { name: sk ? sk.name : '反魂', element: 'NONE' });
        const wounded = this.alliesOf(actor)
          .slice().sort((a, b) => hpRatio(a) - hpRatio(b))[0];
        if (wounded && dealt > 0) this.heal(wounded, Math.floor(dealt / 2), '反魂');
        break;
      }

      case 'summon': {
        const mob = unitMob(lg.summonName || '魔人', actor.side, 1, this.rng);
        this.teamOf(actor.side).push(mob);
        this.say('→ ' + mob.displayName + 'が前衛に現れた！', 'skill');
        break;
      }

      case 'shuen': {
        const dmg = this.round;
        this.enemiesOf(actor).forEach(t => this.dealRawDamage(t, dmg, '終焉', actor));
        break;
      }
    }
  }

  // ---------------------------------------------------------------
  // 勝敗判定
  // ---------------------------------------------------------------
  checkEnd() {
    if (this.finished) return true;
    const allyAlive = this.aliveOf('ALLY').length;
    const enemyAlive = this.aliveOf('ENEMY').length;

    if (allyAlive === 0) return this.finish('LOSE', 'パーティは全滅した…');
    if (this.winCondition.type === 'DEFEAT_TARGET') {
      const boss = this.findUnit(this.winCondition.targetUid);
      if (boss && !boss.alive) return this.finish('WIN', boss.displayName + 'を撃破した！');
    }
    if (enemyAlive === 0) return this.finish('WIN', '敵を殲滅した！');
    return false;
  }

  judgeTimeout() {
    const ratio = side => {
      const team = this.teamOf(side);
      const max = team.reduce((a, u) => a + u.maxHp, 0);
      const cur = team.reduce((a, u) => a + Math.max(0, u.hp), 0);
      return max > 0 ? cur / max : 0;
    };
    const a = ratio('ALLY'), e = ratio('ENEMY');
    this.say('規定ラウンド（' + this.roundLimit + '）に達した。残りHP割合で判定。', 'system');
    this.say('自軍 ' + Math.round(a * 100) + '% / 敵軍 ' + Math.round(e * 100) + '%', 'system');
    if (a > e) this.finish('WIN', '残存HP判定で勝利！');
    else if (a < e) this.finish('LOSE', '残存HP判定で敗北…');
    else this.finish('DRAW', '引き分け。');
  }

  finish(result, message) {
    this.finished = true;
    this.result = result;
    this.say(message, result === 'WIN' ? 'win' : (result === 'LOSE' ? 'lose' : 'system'));
    return true;
  }
}

const STAT_LABEL = {
  hp: 'HP', mp: 'MP', speed: '速度',
  atkPhys: '物攻', atkMag: '魔攻', defPhys: '物防', defMag: '魔防',
};
