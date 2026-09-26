// ===================================================================
// CPU / ゴースト AI
//
// 方針（スコア評価式）:
//   1. クイックスキルは「得」と判断したものを先に全部撃つ
//   2. メイン行動は、全候補（通常攻撃・各スキル・移動）をスコア化して最良を選ぶ
//   3. 射程内に誰もいなければ前進する
// ===================================================================

const AI = {
  /**
   * 1手ぶんの行動を返す。クイックスキルを返した場合は行動権を消費しないので、
   * 呼び出し側は「行動権を消費する手が返るまで」繰り返し呼ぶ。
   */
  decide(battle, unit) {
    const quick = this.pickQuick(battle, unit);
    if (quick) return quick;
    return this.pickMain(battle, unit);
  },

  // -----------------------------------------------------------------
  pickQuick(battle, unit) {
    unit._usedQuick = unit._usedQuick || {};
    const candidates = [];
    unit.skills.forEach(id => {
      const lg = getLogic(id);
      if (!lg || !lg.quick) return;
      if (unit._usedQuick[id]) return;                      // 同ターン中の撃ち直しを防ぐ
      if (unit.buffs.some(b => b.name === id)) return;      // 既にかかっている
      if (!battle.skillUsability(unit, id).ok) return;
      const score = this.scoreSkill(battle, unit, id);
      if (score > 0) candidates.push({ id: id, score: score });
    });
    if (!candidates.length) return null;
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];
    unit._usedQuick[best.id] = true;
    return this.buildAction(battle, unit, best.id);
  },

  // -----------------------------------------------------------------
  pickMain(battle, unit) {
    unit._usedQuick = {};
    const options = [];

    // 通常攻撃
    if (battle.canNormalAttack(unit)) {
      const t = this.bestEnemyTarget(battle, unit);
      if (t) {
        const s = stats(unit, battle.field);
        options.push({
          action: { type: 'attack', targetUid: t.uid },
          score: Math.max(s.atkPhys, s.atkMag) * 0.9,
          isAttack: true,
        });
      }
    }

    // スキル
    unit.skills.forEach(id => {
      const lg = getLogic(id);
      if (!lg || lg.quick) return;
      if (!battle.skillUsability(unit, id).ok) return;
      const score = this.scoreSkill(battle, unit, id);
      if (score > 0) {
        const action = this.buildAction(battle, unit, id);
        const target = action.targetUid ? battle.findUnit(action.targetUid) : null;
        options.push({
          action: action,
          score: score,
          isAttack: lg.act === 'attack' || !!(target && target.side !== unit.side),
        });
      }
    });

    // 攻撃手段が1つも成立しないなら距離を詰める。
    // ただし回復など価値の高い行動があるときはそちらを優先する。
    if (!options.some(o => o.isAttack) && CONFIG.ALLOW_MOVE_ACTION) {
      const move = this.pickMove(battle, unit);
      const best = options.length ? Math.max.apply(null, options.map(o => o.score)) : 0;
      if (move && best < 15) return move;
    }

    if (options.length) {
      options.sort((a, b) => b.score - a.score);
      // 上位2つからランダムに選び、単調さを避ける
      const top = options.slice(0, Math.min(2, options.length));
      return battle.rng.pick(top).action;
    }
    return { type: 'wait' };
  },

  // -----------------------------------------------------------------
  /** 攻撃できる相手がいないなら前進、敵に詰められているなら後退 */
  pickMove(battle, unit) {
    const enemies = battle.enemiesOf(unit);
    if (!enemies.length) return null;
    // 隠密の敵は単体攻撃の対象にできないため「届いている」とは数えない
    const canHit = enemies.some(e => battle.canReach(unit, e) && battle.isSelectable(unit, e));
    if (!canHit && unit.area > 1) return { type: 'move', area: unit.area - 1 };
    // 打たれ弱い後衛が前に出すぎている場合は下がる
    const s = stats(unit, battle.field);
    const frail = (s.defPhys + s.defMag) < 12 && hpRatio(unit) < 0.4;
    if (frail && unit.area < CONFIG.AREA_COUNT && battle.canMoveTo(unit, unit.area + 1)) {
      const stillReach = enemies.some(e => inRange(unit.range, areaDistance(unit.area + 1, e.area)));
      if (stillReach) return { type: 'move', area: unit.area + 1 };
    }
    return null;
  },

  // -----------------------------------------------------------------
  /** スキルの有用度をスコア化 */
  scoreSkill(battle, unit, id) {
    const lg = getLogic(id);
    const sk = getSkill(id);
    if (!lg || !sk) return 0;
    const s = stats(unit, battle.field);
    const cost = skillCost(unit, id);

    switch (lg.act) {
      case 'attack': {
        const hits = lg.atk.hits || 1;
        const power = (s[lg.atk.base] + (lg.atk.mod || 0)) * hits;
        let score = power;
        if (lg.tgt === 'ENEMY_AREA') {
          const area = this.bestEnemyArea(battle, unit);
          score = power * (area ? area.count : 1);
        }
        if (lg.atk.pierce) score *= 1.5;
        if (lg.atk.sure) score *= 1.2;
        // 倒しきれる相手がいるなら最優先
        const t = this.bestEnemyTarget(battle, unit);
        if (t && power >= t.hp + (lg.atk.pierce ? 0 : stats(t, battle.field).defPhys)) score *= 1.8;
        return score - cost.mp * 1.2 - cost.hp * 1.5;
      }
      case 'heal':
        return this.healPlan(battle, unit, id).score;
      case 'buff': {
        if (unit.buffs.some(b => b.name === id)) return 0;
        let score = 6;
        const b = lg.buff || {};
        if (b.stats) for (const k in b.stats) score += Math.abs(b.stats[k]) * 1.6;
        if (b.eva) score += Math.abs(b.eva) * 0.35;
        if (b.acc) score += Math.abs(b.acc) * 0.3;
        if (b.shield) score += Math.floor(s[b.shield.base] / (b.shield.div || 1)) * 1.2;
        if (b.flags) {
          if (b.flags.extraActions) score += 22;
          if (b.flags.stealth) score += 10;
          if (b.flags.endure) score += hpRatio(unit) < 0.5 ? 20 : 6;
          if (b.flags.allPierce) score += 14;
          if (b.flags.retreatOnce) score += 8;
          if (b.flags.poisonKingdom) score += 18;
          if (b.flags.nextAtkBonus) score += 12;
          if (b.flags.nextDefReduce) score += 8;
          if (b.flags.noHeal) score += 6;
        }
        if (b.regen) score += ((b.regen.hp || 0) + (b.regen.mp || 0)) * (b.dur || 1) * 0.8;
        // デバフは対象がいるときだけ
        if (lg.tgt === 'ENEMY_AREA' || lg.tgt === 'ENEMY_ONE') {
          const area = this.bestEnemyArea(battle, unit);
          if (!area) return 0;
          score *= (lg.tgt === 'ENEMY_AREA' ? area.count : 1);
        }
        return score - cost.mp * 1.2 - cost.hp * 1.5;
      }
      case 'special': {
        switch (lg.custom) {
          case 'restoreMp':
            return unit.mp <= unit.maxMp * 0.35 ? 30 : 0;
          case 'charm': return 24 - cost.mp;
          case 'lethalCount': {
            const area = this.bestEnemyArea(battle, unit);
            return area ? 18 * area.count - cost.mp : 0;
          }
          case 'fableOfAbyss': {
            const dead = battle.teamOf(unit.side).filter(u => !u.alive).length;
            return dead >= 2 ? 90 : 0;
          }
          case 'swordAndRose': {
            const flare = battle.teamOf(unit.side).find(u => u.name === 'フレア');
            if (!flare) return 0;
            return (!flare.alive || hpRatio(flare) < 0.4) ? 70 : 0;
          }
          case 'hangon': {
            const amount = Math.max(0, s.atkMag - 4);
            return amount - cost.mp;
          }
          case 'shuen':
            // 1ラウンド目は威力が1しかないので使わない
            if (battle.round < 2) return 0;
            return battle.round * battle.enemiesOf(unit).length - cost.mp;
          case 'summon':
            return battle.alliesOf(unit).length < CONFIG.PARTY_SIZE ? 20 - cost.mp : 4;
          default:
            return 5;
        }
      }
      default:
        return 0;
    }
  },

  // -----------------------------------------------------------------
  /**
   * 回復スキルの使い道を決める。リバース持ちは「味方を回復」と
   * 「敵に回復量2倍のダメージ」を比べて高い方を選ぶ。
   * @returns {{score:number, target:object|null}}
   */
  healPlan(battle, unit, id) {
    const lg = getLogic(id);
    const s = stats(unit, battle.field);
    const cost = skillCost(unit, id);
    const amount = Math.max(0, s[lg.heal.base] + (lg.heal.mod || 0));
    let best = { score: 0, target: null };

    // 自分だけを回復するスキル（貌の付け替え等）は自分だけを候補にする
    const wounded = (lg.tgt === 'SELF' ? [unit] : battle.alliesOf(unit)).filter(a => a.hp < a.maxHp);
    if (wounded.length) {
      const worst = wounded.sort((a, b) => hpRatio(a) - hpRatio(b))[0];
      const missing = worst.maxHp - worst.hp;
      best = { score: Math.min(amount, missing) * (1 + (1 - hpRatio(worst)) * 2) - cost.mp, target: worst };
    }

    const p = passiveOf(unit);
    if (p && p.healAsDamage && amount > 0 && lg.tgt !== 'SELF') {
      const t = this.bestEnemyTarget(battle, unit);
      const dmg = t ? Math.max(CONFIG.DAMAGE_MIN, amount * p.healAsDamage - stats(t, battle.field).defMag) : 0;
      if (t) {
        // 必中の魔法ダメージなので、倒しきれるなら大きく加点
        let score = dmg * 1.3 - cost.mp;
        if (dmg >= t.hp) score *= 1.8;
        if (score > best.score) best = { score: score, target: t };
      }
    }
    return best;
  },

  /** 攻撃対象として最も美味しい敵 */
  bestEnemyTarget(battle, unit) {
    const list = battle.enemiesOf(unit)
      .filter(t => battle.isSelectable(unit, t) && battle.canReach(unit, t));
    if (!list.length) return null;
    const s = stats(unit, battle.field);
    return list.slice().sort((a, b) => this.threat(battle, b, s) - this.threat(battle, a, s))[0];
  },

  threat(battle, target, myStats) {
    const t = stats(target, battle.field);
    let v = Math.max(t.atkPhys, t.atkMag) * 1.4 + t.speed * 0.5;
    v += (1 - hpRatio(target)) * 30;                       // 瀕死を狙う
    const power = Math.max(myStats.atkPhys, myStats.atkMag);
    if (power - Math.min(t.defPhys, t.defMag) >= target.hp) v += 60; // 倒せる
    if (target.isBoss) v += 10;
    return v;
  },

  /** 範囲攻撃に最適な敵エリア */
  bestEnemyArea(battle, unit) {
    let best = null;
    for (let a = 1; a <= CONFIG.AREA_COUNT; a++) {
      if (!inRange(unit.range, areaDistance(unit.area, a))) continue;
      const count = battle.enemiesOf(unit).filter(t => t.area === a).length;
      if (count && (!best || count > best.count)) best = { area: a, count: count };
    }
    return best;
  },

  /** スキル使用アクションを組み立てる（対象決定込み） */
  buildAction(battle, unit, id) {
    const lg = getLogic(id);
    const action = { type: 'skill', skillId: id };
    switch (lg.tgt) {
      case 'ENEMY_ONE': {
        const t = this.bestEnemyTarget(battle, unit);
        if (t) { action.targetUid = t.uid; action.area = t.area; }
        break;
      }
      case 'ENEMY_AREA': {
        const a = this.bestEnemyArea(battle, unit);
        if (a) action.area = a.area;
        break;
      }
      case 'ALLY_ONE': {
        if (lg.act === 'heal') {
          const plan = this.healPlan(battle, unit, id);
          action.targetUid = (plan.target || unit).uid;
          break;
        }
        const wounded = battle.alliesOf(unit).slice().sort((a, b) => hpRatio(a) - hpRatio(b))[0];
        action.targetUid = (wounded || unit).uid;
        break;
      }
      case 'ALLY_AREA': {
        // 味方が最も多いエリア
        let best = { area: unit.area, count: 0 };
        for (let a = 1; a <= CONFIG.AREA_COUNT; a++) {
          const c = battle.alliesOf(unit).filter(t => t.area === a).length;
          if (c > best.count) best = { area: a, count: c };
        }
        action.area = best.area;
        break;
      }
      default:
        action.targetUid = unit.uid;
        action.area = unit.area;
    }
    return action;
  },

  /**
   * 敵パーティの初期配置を決める。
   * 射程だけで決めると全員が同じマスに固まり、双方どこにも攻撃が届かない
   * 硬直状態になりうるので、「前に出るべき度」で並べて3エリアに分散させる。
   */
  autoPlace(units) {
    const scored = units.map(u => {
      const s = u.base;
      const tough = s.defPhys + s.defMag + s.hp;
      // 射程が短いほど / 打たれ強いほど前へ。魔法型は後ろへ。
      const front = (6 - u.range) * 10 + tough - (s.atkMag > s.atkPhys ? 12 : 0);
      return { u: u, front: front };
    }).sort((a, b) => b.front - a.front);

    const n = scored.length;
    const perArea = Math.ceil(n / CONFIG.AREA_COUNT);
    scored.forEach((e, i) => {
      let area = Math.min(CONFIG.AREA_COUNT, Math.floor(i / perArea) + 1);
      // 射程1は前衛でないと何もできない
      if (e.u.range <= 1) area = 1;
      e.u.area = area;
    });

    // 前衛が空だと近接キャラが永遠に攻撃できないので、必ず1体は前に置く
    if (!units.some(u => u.area === 1) && scored.length) scored[0].u.area = 1;
    return units;
  },
};
