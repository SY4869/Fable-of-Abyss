// ChaosSwordGarden - スキル効果の実行ハンドラ
// data.js の SKILL_ROWS に埋め込まれた effect 定義を実際の状態変化
// （ActiveEffect付与・ダメージ計算・CT/発生速度の補正）に変換する。
//
// 設計方針:
//   ・自分向け効果(target: 'self' 相当)は「使用開始時 (onUse)」に適用
//   ・相手向け効果・ダメージ(target: 'enemy' 相当)は「発生完了＝判定時 (onJudgment)」に適用
//   これは要件定義.md に明記された仕様ではなく、
//   「発生後隙のタイムラインと合わせる」ためのプロトタイプ設計判断である。

'use strict';

import { BUFF_MAGNITUDE, RECOVERY_TIME } from './data.js';
import { ActiveEffect, reduceRecoveryTierByOne } from './models.js';

/* =========================================================
 * 常時パッシブの適用（ラウンド開始時に1回だけ呼ばれる）
 * =======================================================*/

export function applyPassives(fighter) {
  for (const skillInstance of fighter.skills) {
    const def = skillInstance.definition;
    if (!def.isPassive) continue;
    applyPassiveEffect(fighter, def);
  }
}

function applyPassiveEffect(fighter, def) {
  const effect = def.effect;

  if (effect.id === 'nitoryu') {
    // 攻撃力大幅ダウン（双海流スキルのCT半減・後隙-1段階は engine 側が都度参照する）
    fighter.addEffect(new ActiveEffect({
      sourceSkill: def.name,
      stat: effect.selfPenalty.stat,
      value: effect.selfPenalty.sign * BUFF_MAGNITUDE[effect.selfPenalty.magnitude],
      remaining: null,
    }));
    return;
  }

  if (effect.id === 'shingan') {
    for (const stat of effect.stats) {
      fighter.addEffect(new ActiveEffect({ sourceSkill: def.name, stat, value: BUFF_MAGNITUDE[effect.magnitude], remaining: null }));
    }
    if (fighter.isCpu) {
      // 視界妨害演出の代替: 自身被ダメージ倍率(+20%)の内部デバフ（要件定義.md 5.1）
      fighter.addEffect(new ActiveEffect({
        sourceSkill: def.name,
        stat: 'damageTakenMultiplier',
        value: effect.cpuEffect.selfDamageTakenMultiplier - 1,
        remaining: null,
      }));
    } else {
      fighter.addEffect(new ActiveEffect({ sourceSkill: def.name, flag: 'visualObstruction', remaining: null }));
    }
    return;
  }

  // 条件付きパッシブ（底力）は updateConditionalPassives() で毎フレーム評価するため、
  // ここでは何もしない。
  if (effect.condition) return;

  // HP自然回復（不死再生）は battle-engine のtickループで直接処理するため、ここでは何もしない。
  if (effect.hpRegenPerSec != null) return;

  // CT短縮／自スキル発生・後隙短縮系は「行動宣言時に都度参照」する設計のため、
  // 静的なActiveEffectとしては積まない（getCtMultiplier 等を参照）。
  if (effect.ctReduction || effect.selfSkillStartupReduction || effect.selfSkillRecoveryReduction) return;

  // 単純な自己ステータス上昇パッシブ（鉄壁・俊足・神速など）
  const stats = effect.stats || (effect.stat ? [effect.stat] : []);
  for (const stat of stats) {
    fighter.addEffect(new ActiveEffect({ sourceSkill: def.name, stat, value: BUFF_MAGNITUDE[effect.magnitude], remaining: null }));
  }
}

/** 条件付きパッシブ（底力: HP50%以下で発動）を毎フレーム評価する */
export function updateConditionalPassives(fighter) {
  for (const skillInstance of fighter.skills) {
    const def = skillInstance.definition;
    if (!def.isPassive || def.effect.condition !== 'hpBelow50') continue;
    const shouldBeActive = fighter.currentHp <= fighter.baseStats.maxHp * 0.5;
    const isActive = fighter.hasSelfBuffFromSkill(def.name);
    if (shouldBeActive && !isActive) {
      for (const stat of def.effect.stats) {
        fighter.addEffect(new ActiveEffect({ sourceSkill: def.name, stat, value: BUFF_MAGNITUDE[def.effect.magnitude], remaining: null }));
      }
    } else if (!shouldBeActive && isActive) {
      fighter.clearEffectsBySource(def.name);
    }
  }
}

/**
 * HP自然回復パッシブ（不死再生）を毎フレーム適用する。
 * データ一覧.xlsx の指定により、最大HPの割合ではなく固定値で回復する。
 */
export function applyHpRegenPassives(fighter, dt) {
  for (const skillInstance of fighter.skills) {
    const def = skillInstance.definition;
    if (!def.isPassive || def.effect.hpRegenPerSec == null) continue;
    fighter.heal(def.effect.hpRegenPerSec * dt);
  }
}

/* =========================================================
 * CT・発生・後隙の補正値取得（行動宣言のたびに engine が参照する）
 * =======================================================*/

function equippedPassiveEffects(fighter) {
  return fighter.skills.filter((s) => s.isPassive).map((s) => s.definition.effect);
}

/** スキル使用時のCT倍率（精神統一/心頭滅却の短縮、二刀流の双海流CT半減） */
export function getCooldownMultiplier(fighter, skillDef) {
  let mult = 1;
  for (const effect of equippedPassiveEffects(fighter)) {
    if (effect.ctReduction) mult *= (1 - BUFF_MAGNITUDE[effect.ctReduction]);
    if (effect.id === 'nitoryu' && skillDef.school && skillDef.school === effect.schoolBuff.school) {
      mult *= effect.schoolBuff.ctMultiplier;
    }
  }
  return mult;
}

/** 後隙秒数の上書き値（二刀流による双海流スキルの後隙-1段階、心頭滅却の短縮）。無ければ null。 */
export function getRecoveryOverrideSeconds(fighter, skillDef) {
  let seconds = null;
  for (const effect of equippedPassiveEffects(fighter)) {
    if (effect.id === 'nitoryu' && skillDef.school && skillDef.school === effect.schoolBuff.school) {
      seconds = reduceRecoveryTierByOne(skillDef.recoveryTier).seconds;
    }
  }
  // 心頭滅却（自身のスキル後隙短縮）
  const chuuToumekkyaku = equippedPassiveEffects(fighter).find((e) => e.selfSkillRecoveryReduction);
  if (chuuToumekkyaku) {
    const base = seconds ?? skillDef.recoverySeconds;
    seconds = base * (1 - BUFF_MAGNITUDE[chuuToumekkyaku.selfSkillRecoveryReduction]);
  }
  return seconds;
}

/** 発生秒数の倍率（凪の自スキル発生短縮、連武の一時バフ） */
export function getStartupMultiplier(fighter) {
  let mult = 1;
  for (const effect of equippedPassiveEffects(fighter)) {
    if (effect.selfSkillStartupReduction) mult *= (1 - BUFF_MAGNITUDE[effect.selfSkillStartupReduction]);
  }
  const buffBonus = fighter.activeEffects
    .filter((e) => e.stat === 'actionStartupReduction')
    .reduce((sum, e) => sum + e.value, 0);
  mult *= (1 - buffBonus);
  return mult;
}

/** 後隙秒数の倍率（連武の一時バフ「通常攻撃とスキルの後隙を短くする」） */
export function getRecoveryMultiplier(fighter) {
  const buffBonus = fighter.activeEffects
    .filter((e) => e.stat === 'actionRecoveryReduction')
    .reduce((sum, e) => sum + e.value, 0);
  return 1 - buffBonus;
}

/** 相手が自身に掛けた「発生を遅くする」デバフ（フリージングロック）の倍率 */
export function getEnemyStartupSlowMultiplier(fighter) {
  const bonus = fighter.activeEffects
    .filter((e) => e.stat === 'startupSlow')
    .reduce((sum, e) => sum + e.value, 0);
  return 1 + bonus;
}

/* =========================================================
 * スキル使用時 (onUse) の処理
 *   - 自己バフの付与
 *   - ゲート開放（ソードスラッシュ使用 → ネオスラッシュ解禁）
 * =======================================================*/

export function onUseSkill(user, opponent, skillInstance) {
  const def = skillInstance.definition;
  const effect = def.effect;

  // ソードスラッシュ使用でネオスラッシュのゲートを開く
  if (def.name === 'ソードスラッシュ') {
    const neo = user.getSkill('ネオスラッシュ');
    if (neo && neo.definition.effect.gate) neo.openGate(neo.definition.effect.gate.windowSeconds);
  }

  // バフ・デバフはここでは付けない。
  //
  // ここは「発動を宣言した瞬間」であって、まだ発生（溜め）が終わっていない。
  // 以前は自己バフだけこの時点で付けていたため、発生中にひるんで技が中断されても
  // 効果だけが残っていた（例: 瞬歩を潰したのに、その後の縦振りが別レーンに当たる）。
  // ひるみは「出しかけた技を潰す」仕組みなので、効果は自分・相手どちらに向くものも
  // onJudgmentSkill() 側の「発生が完了した瞬間」に揃える。
}

function applySelfBuff(fighter, def, effect) {
  const stats = effect.stats || (effect.stat ? [effect.stat] : []);
  for (const stat of stats) {
    fighter.addEffect(new ActiveEffect({
      sourceSkill: def.name, stat, value: BUFF_MAGNITUDE[effect.magnitude], remaining: def.durationSeconds,
    }));
  }
  // 自分に付く真偽フラグ（必中・瞬歩の「攻撃が必ず当たる」など）
  for (const [flag, on] of Object.entries(effect.flags ?? {})) {
    if (on) fighter.addEffect(new ActiveEffect({ sourceSkill: def.name, flag, remaining: def.durationSeconds }));
  }
  if (effect.selfActionStartupReduction) {
    fighter.addEffect(new ActiveEffect({
      sourceSkill: def.name, stat: 'actionStartupReduction',
      value: BUFF_MAGNITUDE[effect.selfActionStartupReduction], remaining: def.durationSeconds,
    }));
  }
  if (effect.selfActionRecoveryReduction) {
    fighter.addEffect(new ActiveEffect({
      sourceSkill: def.name, stat: 'actionRecoveryReduction',
      value: BUFF_MAGNITUDE[effect.selfActionRecoveryReduction], remaining: def.durationSeconds,
    }));
  }
}

/* =========================================================
 * 発生完了時 (onJudgment) の処理
 *   - ダメージ計算
 *   - 相手対象のデバフ付与
 *   - カウンターブラスト等の特殊処理
 * 戻り値: { damage: number|null } ダメージを与える場合はダメージ量を返す
 * =======================================================*/

export function onJudgmentSkill(user, opponent, skillInstance) {
  const def = skillInstance.definition;
  const effect = def.effect;

  if (effect.kind === 'damage') {
    return { damageMultiplier: effect.multiplier, hits: effect.hits || 1, ignoresGuard: !!effect.ignoresGuard, ignoresNitoryuPenalty: !!effect.ignoresNitoryuPenalty };
  }

  if (effect.kind === 'special' && effect.id === 'counterBlast') {
    // 直前の防御で受けたダメージ + 攻撃力の130%
    return { flatDamage: opponent === user ? 0 : user.lastGuardDamageTaken, damageMultiplier: effect.multiplier, hits: 1, ignoresGuard: false, ignoresNitoryuPenalty: false };
  }

  if (effect.kind === 'buff' && effect.target === 'self') {
    applySelfBuff(user, def, effect);
  }
  if (effect.kind === 'buff' && effect.target === 'enemy') {
    applyEnemyDebuff(opponent, def, effect);
  }
  if (effect.kind === 'buff' && effect.extra) {
    // 自己バフに加えて相手にもデバフを乗せる技
    applyEnemyDebuff(opponent, def, { ...effect.extra, magnitude: effect.magnitude });
  }
  return { damageMultiplier: null };
}

function applyEnemyDebuff(opponent, def, effect) {
  if (effect.flags) {
    for (const [flag, on] of Object.entries(effect.flags)) {
      if (on) opponent.addEffect(new ActiveEffect({ sourceSkill: def.name, flag, remaining: def.durationSeconds }));
    }
  }
  if (effect.stat) {
    // フリージングロック発動条件チェック（アイスエンチャント発動中のみ）は
    // engine 側の isReady 判定 (canActivate) で行う。
    opponent.addEffect(new ActiveEffect({ sourceSkill: def.name, stat: effect.stat, value: BUFF_MAGNITUDE[effect.magnitude], remaining: def.durationSeconds }));
  }
}

/* =========================================================
 * 発動条件チェック（CT以外の追加ゲート）
 * =======================================================*/

export function canActivateSkill(fighter, skillInstance) {
  if (!skillInstance.isReady) return false;
  const effect = skillInstance.definition.effect;
  if (effect.requires?.selfBuffActive) {
    return fighter.hasSelfBuffFromSkill(effect.requires.selfBuffActive);
  }
  return true;
}
