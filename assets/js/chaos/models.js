// ChaosSwordGarden - 実行時モデル定義
// Fighter（戦闘参加者）/ SkillInstance（装備スキルの実行時状態）/
// ActiveEffect（バフ・デバフの実行時状態）を提供する。
// マスターデータは data.js、実際の効果処理は skill-effects.js を参照。

'use strict';

import {
  SKILLS, GUARD_DAMAGE_RATE, RECOVERY_TIER_DOWN, RECOVERY_TIME,
  INITIAL_LANE, LANE_COUNT,
} from './data.js';

/* =========================================================
 * ActiveEffect: バフ/デバフ/フラグの実行時状態
 *
 *  - stat モード: 対象ステータス(attack/speed/guardRate等)への
 *                 加算率(value)を持つ。同一statの複数効果は加算される
 *                 （要件定義.md 3.4「加算処理」）。
 *  - flag モード : guardDisabled / dodgeDisabled のような真偽フラグ。
 *
 *  remaining が null の場合は「戦闘終了までの常時付与」（パッシブ由来）。
 * =======================================================*/
let effectSeq = 0;

export class ActiveEffect {
  constructor({ sourceSkill, stat = null, value = 0, flag = null, remaining = null }) {
    this.id = `effect-${++effectSeq}`;
    this.sourceSkill = sourceSkill; // どのスキルが付与したか（重複判定・解除に使用）
    this.stat = stat;
    this.value = value;
    this.flag = flag;
    this.remaining = remaining; // 秒数 or null(常時)
    this.duration = remaining;  // 付与時の総時間（UIの残量ゲージ比率算出用）
  }

  get expired() {
    return this.remaining !== null && this.remaining <= 0;
  }

  tick(dt) {
    if (this.remaining !== null) this.remaining -= dt;
  }
}

/* =========================================================
 * SkillInstance: Fighter が装備しているスキル1枠分の実行時状態
 * =======================================================*/

export class SkillInstance {
  /** @param {string} skillName SKILLS のキー */
  constructor(skillName) {
    const def = SKILLS[skillName];
    if (!def) throw new Error(`未定義のスキルです: ${skillName}`);
    this.definition = def;
    this.remainingCooldown = 0;
    this.cooldownTotal = def.cooldownSeconds; // 実際に開始したCTの総量（短縮補正込み。UIゲージ用）
    this.gateRemaining = null; // ネオスラッシュ等「発動条件の時限ゲート」の残り秒数
  }

  get name() { return this.definition.name; }
  get isPassive() { return this.definition.isPassive; }

  /** クールタイム消化中でなく、かつ発動可能なゲート条件を満たしているか */
  get isReady() {
    if (this.isPassive) return false; // パッシブは「発動」するものではない
    if (this.remainingCooldown > 0) return false;
    if (this.definition.effect.gate && this.gateRemaining === null) return false;
    return true;
  }

  tickCooldown(dt) {
    if (this.remainingCooldown > 0) {
      this.remainingCooldown = Math.max(0, this.remainingCooldown - dt);
    }
    if (this.gateRemaining !== null) {
      this.gateRemaining = Math.max(0, this.gateRemaining - dt);
      if (this.gateRemaining === 0) this.gateRemaining = null;
    }
  }

  /** @param {number} ctMultiplier 二刀流など、CTを倍率で短縮する効果 */
  startCooldown(ctMultiplier = 1) {
    if (this.definition.cooldownSeconds == null) return;
    this.cooldownTotal = this.definition.cooldownSeconds * ctMultiplier;
    this.remainingCooldown = this.cooldownTotal;
  }

  /** ゲート条件（例: ソードスラッシュ使用後16秒）を開放する */
  openGate(windowSeconds) {
    this.gateRemaining = windowSeconds;
  }

  /** 戦闘（1ラウンド）終了時のフルリセット */
  reset() {
    this.remainingCooldown = 0;
    this.gateRemaining = null;
  }
}

/* =========================================================
 * 行動状態（発生 → 後隙 のタイムライン管理）
 * =======================================================*/

export const ActionState = Object.freeze({
  IDLE: 'idle',           // 待機中（次の行動を選択可能）
  STARTUP: 'startup',     // 発生（判定待ち）
  RECOVERY: 'recovery',   // 後隙（無防備）
  DODGING: 'dodging',     // 回避行動中（即応反射/即応反撃含む）
  FLINCH: 'flinch',       // ひるみ（発生中に大ダメージを受けて行動をキャンセルされた）
  MOVING: 'moving',       // 左右のレーン移動中
});

/* =========================================================
 * Fighter: プレイヤー / 敵CPU 共通の戦闘参加者
 * =======================================================*/

export class Fighter {
  /**
   * @param {string} id
   * @param {string} name
   * @param {{maxHp:number, attack:number, speed:number}} baseStats
   * @param {string[]} skillNames 装備スキル名（最大4）
   * @param {boolean} isCpu CPUが操作するか（心眼などCPU専用処理の分岐に使用）
   * @param {string|null} portrait 立ち絵の画像パス（一人称視点なので敵のみ使用）
   * @param {string|null} background 戦闘背景の画像パス
   */
  constructor({ id, name, baseStats, skillNames, isCpu, portrait = null, background = null }) {
    this.id = id;
    this.name = name;
    this.baseStats = baseStats;
    this.isCpu = isCpu;
    this.portrait = portrait;
    this.background = background;

    this.skills = skillNames.map((n) => new SkillInstance(n));
    this.currentHp = baseStats.maxHp;
    this.activeEffects = /** @type {ActiveEffect[]} */ ([]);

    // 立ち位置（0 = 左, 1 = 中央, 2 = 右）。攻撃はレーンが一致した相手にのみ当たる
    this.lane = INITIAL_LANE;

    this.actionState = ActionState.IDLE;
    this.currentAction = null; // 実行中アクションの詳細（battle-engine.js が生成）
    this.isGuarding = false;
    this.lastGuardDamageTaken = 0; // カウンターブラスト用

    // 回避入力を行った時刻（BattleRound#declareDodge が設定し、判定時に消費・null化する）
    this.dodgeRequestedAt = null;

    // その回避が成功したときに得られる無敵の長さ（秒）。
    // 通常回避は0。即応反射/即応反撃で回避した場合だけ値が入る。
    this.dodgeInvincibleSeconds = 0;

    // 無敵が切れる時刻（秒）。null なら無敵ではない。
    this.invulnerableUntil = null;
  }

  /* ---- スキル装備管理（インターバル成長: 勝利後1枠交換） ---- */

  replaceSkill(oldSkillName, newSkillName) {
    const idx = this.skills.findIndex((s) => s.name === oldSkillName);
    if (idx === -1) throw new Error(`装備していないスキルは交換できません: ${oldSkillName}`);
    this.skills[idx] = new SkillInstance(newSkillName);
  }

  getSkill(name) {
    return this.skills.find((s) => s.name === name) || null;
  }

  /* ---- ステータス計算（バフ加算後の実効値） ---- */

  /**
   * attack / speed など baseStats に存在するステータスの実効値（加算バフ込み）
   * @param {string} statKey
   * @param {{excludeSource?: string|null}} [options] 特定スキル由来の補正を除外する
   *   （例: ツインスラッシュ/クロススラッシュは二刀流の攻撃力低下を無視する）
   */
  getEffectiveStat(statKey, options = {}) {
    const { excludeSource = null } = options;
    const base = this.baseStats[statKey] ?? 0;
    const bonus = this.activeEffects
      .filter((e) => e.stat === statKey && e.sourceSkill !== excludeSource)
      .reduce((sum, e) => sum + e.value, 0);
    return base * (1 + bonus);
  }

  /** ガード時のダメージ倍率（アイスエンチャント/鉄壁等でさらに軽減される） */
  getGuardDamageMultiplier() {
    const bonus = this.activeEffects
      .filter((e) => e.stat === 'guardRate')
      .reduce((sum, e) => sum + e.value, 0);
    return Math.max(0, GUARD_DAMAGE_RATE - bonus);
  }

  hasFlag(flagName) {
    return this.activeEffects.some((e) => e.flag === flagName && !e.expired);
  }

  /** 自身が特定スキルによる自己バフを発動中か（フリージングロックの発動条件などに使用） */
  hasSelfBuffFromSkill(skillName) {
    return this.activeEffects.some((e) => e.sourceSkill === skillName && !e.expired);
  }

  addEffect(effect) {
    this.activeEffects.push(effect);
  }

  /** 同一スキル由来のエフェクトを取り除く（再発動時の上書き等に使用） */
  clearEffectsBySource(skillName) {
    this.activeEffects = this.activeEffects.filter((e) => e.sourceSkill !== skillName);
  }

  tickEffects(dt) {
    for (const e of this.activeEffects) e.tick(dt);
    this.activeEffects = this.activeEffects.filter((e) => !e.expired);
  }

  tickCooldowns(dt) {
    for (const s of this.skills) s.tickCooldown(dt);
  }

  /* ---- HP ---- */

  applyDamage(amount) {
    const dealt = Math.max(0, amount);
    this.currentHp = Math.max(0, this.currentHp - dealt);
    return dealt;
  }

  heal(amount) {
    this.currentHp = Math.min(this.baseStats.maxHp, this.currentHp + amount);
  }

  get isDown() {
    return this.currentHp <= 0;
  }

  get isIdle() {
    return this.actionState === ActionState.IDLE;
  }

  /* ---- ラウンド（1戦闘）単位のフルリセット（要件定義.md 2章） ---- */

  /** そのレーンへ移動できるか（盤面の外には出られない） */
  canMoveTo(lane) {
    return Number.isInteger(lane) && lane >= 0 && lane < LANE_COUNT && lane !== this.lane;
  }

  resetForNewRound() {
    this.currentHp = this.baseStats.maxHp;
    this.lane = INITIAL_LANE;
    this.activeEffects = [];
    this.actionState = ActionState.IDLE;
    this.currentAction = null;
    this.isGuarding = false;
    this.lastGuardDamageTaken = 0;
    this.dodgeRequestedAt = null;
    this.dodgeInvincibleSeconds = 0;
    this.invulnerableUntil = null;
    for (const s of this.skills) s.reset();
  }
}

/** 後隙ティアを1段階軽減する（二刀流専用ユーティリティ） */
export function reduceRecoveryTierByOne(tier) {
  const downTier = RECOVERY_TIER_DOWN[tier];
  return { tier: downTier, seconds: RECOVERY_TIME[downTier] };
}
