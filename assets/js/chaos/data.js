// ChaosSwordGarden - マスターデータ定義
// 要件定義.md / データ一覧.xlsx（スキル一覧・キャラクター一覧）に準拠。
// このファイルは「静的データ」と「ステータス計算」のみを扱う。
// 実行時の状態（HP・CT・バフ）は models.js 側のクラスが持つ。

'use strict';

/* =========================================================
 * 1. ステータス算出（要件定義.md 3.1）
 *    プレイヤーは合計30ptを HP / 攻撃力 / スピード の3項目に
 *    自由配分する（配分の合計は常に30）。
 * =======================================================*/

export const STAT_POINT_POOL = 30;

/**
 * HPの基礎値。
 * 要件定義.md 3.1 では 30 だが、バランス調整で 10 下げている。
 * （要件定義側の式を変える場合はこの定数も合わせること）
 */
export const BASE_MAX_HP = 20;

/**
 * @param {{hp:number, atk:number, spd:number}} points 各ステータスへの配分ポイント
 * @returns {{maxHp:number, attack:number, speed:number}}
 */
export function calculateBaseStats(points) {
  const { hp = 0, atk = 0, spd = 0 } = points;
  const total = hp + atk + spd;
  if (total !== STAT_POINT_POOL) {
    throw new Error(`ステータスポイントの合計は${STAT_POINT_POOL}である必要があります（現在の合計: ${total}）`);
  }
  for (const [key, v] of Object.entries({ hp, atk, spd })) {
    if (v < 0 || v > STAT_POINT_POOL) {
      throw new Error(`ステータスポイント(${key})は0〜${STAT_POINT_POOL}の範囲で指定してください（現在値: ${v}）`);
    }
  }
  return {
    maxHp: BASE_MAX_HP + hp * 3, // 範囲 20〜110（基礎値を10下げたぶん要件定義より低い）
    attack: 10 + atk,     // 範囲 10〜40
    speed: 5 + spd / 2,   // 範囲 5.0〜20.0
  };
}

/* =========================================================
 * 2. フレーム時間定義（要件定義.md 4章）
 *    スキルの「発生速度」「後隙」は個別の秒数ではなく、
 *    この5段階のティア値にマッピングされる。
 * =======================================================*/

export const STARTUP_TIME = Object.freeze({
  最速: 0.15, 速: 0.40, 並: 0.75, 遅: 1.10, 無: 0.00,
});

export const RECOVERY_TIME = Object.freeze({
  小: 0.20, 中: 0.60, 大: 1.20, 無: 0.00,
});

// 後隙を1段階軽減する際のマッピング（二刀流など）：大→中、中→小
export const RECOVERY_TIER_DOWN = Object.freeze({
  大: '中', 中: '小', 小: '小', 無: '無',
});

/* =========================================================
 * 3. 通常攻撃（要件定義.md 3.2）
 * =======================================================*/

export const NORMAL_ATTACKS = Object.freeze({
  突き:   { id: '突き',   startup: 0.40, recovery: 0.20, damageMultiplier: 0.5 },
  横振り: { id: '横振り', startup: 0.75, recovery: 0.60, damageMultiplier: 0.8 },
  縦振り: { id: '縦振り', startup: 1.10, recovery: 1.20, damageMultiplier: 1.1 },
});

/* =========================================================
 * 4. 防御・回避（要件定義.md 3.3）
 * =======================================================*/

// ガード：軽減率60% = 被ダメージは40%になる。スタミナ消費なし。
export const GUARD_DAMAGE_RATE = 0.40;

// 回避：相手の攻撃判定タイミングに「合わせる」必要がある。
// 判定の許容誤差は要件定義.md に明記が無いプロトタイプ暫定値。要バランス調整。
export const DODGE_TIMING_TOLERANCE_SEC = 0.10;

/* =========================================================
 * 4.3 レーン（左右移動 / 要件定義.md には未定義のプロトタイプ仕様）
 *
 * 戦場を左・中央・右の3レーンに分け、左右キーで移動できる。
 * 攻撃は「攻撃側と同じレーンにいる相手」にのみ当たるため、
 * ガード・回避に続く3つ目の防御手段として「横にずれて避ける」が加わる。
 *
 * 移動そのものにも発生と後隙を持たせている。瞬時に動けてしまうと
 * 「動き続けるだけで当たらない」状態になり、読み合いが成立しないため。
 * =======================================================*/

/** レーン数（0 = 左, 1 = 中央, 2 = 右） */
export const LANE_COUNT = 3;

/** 戦闘開始時の立ち位置（中央） */
export const INITIAL_LANE = 1;

/** 移動の発生時間（秒）。この間に攻撃判定が来ると移動前のレーンで食らう */
export const MOVE_STARTUP_SEC = 0.18;

/** 移動の後隙（秒）。連続でステップし続けられないようにする */
export const MOVE_RECOVERY_SEC = 0.12;

/* =========================================================
 * 4.7 スコア（要件定義.md には未定義のプロトタイプ仕様）
 *
 * 「速く倒す」「被弾を減らす」の2軸で評価する。
 * 被弾は最大HPに対する割合で数えるため、HPに振っていない構成でも不利にならない。
 * =======================================================*/

export const SCORE = Object.freeze({
  /** 1戦ごとの基礎点 */
  BASE: 1000,
  /** この秒数以内に倒せば時間ボーナス。要件定義.md の想定戦闘時間の上限に合わせる */
  TIME_LIMIT_SEC: 90,
  /** 1秒早く倒すごとの加点 */
  TIME_BONUS_PER_SEC: 20,
  /** 最大HPを丸ごと失った場合に引かれる点（実際は被弾割合を掛ける） */
  DAMAGE_PENALTY_MAX: 1000,
  /** 無傷で倒した場合の加点 */
  NO_DAMAGE_BONUS: 500,
});

/**
 * 1戦分のスコアを求める。
 * @param {{clearTimeSec:number, damageTaken:number, maxHp:number}} result
 */
export function calculateBattleScore({ clearTimeSec, damageTaken, maxHp }) {
  const timeBonus = Math.max(0, Math.round((SCORE.TIME_LIMIT_SEC - clearTimeSec) * SCORE.TIME_BONUS_PER_SEC));
  const damageRatio = maxHp > 0 ? Math.min(1, damageTaken / maxHp) : 0;
  const damagePenalty = Math.round(damageRatio * SCORE.DAMAGE_PENALTY_MAX);
  const noDamageBonus = damageTaken <= 0 ? SCORE.NO_DAMAGE_BONUS : 0;

  const total = SCORE.BASE + timeBonus - damagePenalty + noDamageBonus;
  return {
    total: Math.max(0, total),
    base: SCORE.BASE,
    timeBonus,
    damagePenalty,
    noDamageBonus,
  };
}

/* =========================================================
 * 4.5 ひるみ（要件定義.md には未定義のプロトタイプ仕様）
 *
 * 「攻撃を受けながら大技を出し切れてしまう」のを防ぐための仕様。
 * 攻撃の“発生（溜め）”中に大きなダメージを受けると行動がキャンセルされる。
 *   ・後隙中は対象外（すでに無防備で反撃を受ける時間のため）
 *   ・キャンセルされてもCTは戻らない（大技を強引に振ることのリスク）
 * 数値はバランス調整対象。
 * =======================================================*/

/** 最大HPのこの割合以上のダメージでひるむ（軽い突きでは潰れない値） */
export const FLINCH_DAMAGE_RATIO = 0.20;

/** ひるみで動けない時間（秒）。後隙「中」(0.6s)より短くして硬直しすぎないようにする */
export const FLINCH_DURATION_SEC = 0.45;

/* =========================================================
 * 5. バフ/デバフの倍率（プロトタイプ暫定値・要調整）
 *    要件定義.md / データ一覧.xlsx には「少し上昇する」等の定性的な
 *    表現のみが定義されており、具体的な%は未定義。
 *    テキストの強さの表現（小/並/大）にあわせて3段階の暫定値を置く。
 *    バランス調整フェーズで数値を差し替えること。
 * =======================================================*/

export const BUFF_MAGNITUDE = Object.freeze({
  small: 0.10,  // 「少し上昇する」
  normal: 0.20, // 「上昇する」（無指定）
  large: 0.35,  // 「大幅に上昇する」
});

// バフ/デバフの重複は加算処理（加法算）とする（要件定義.md 3.4）。
// 例: 攻撃力+20% と 攻撃力+15% が重複 → 攻撃力+35%
// → models.js の Fighter#getEffectiveStat() で全ActiveEffectのvalueを合算する。

/* =========================================================
 * 6. スキルマスタデータ（データ一覧.xlsx「スキル一覧」シート準拠）
 * =======================================================*/

/** CT・効果時間の文字列("8s"等)を秒数へ変換。"無"/"-" は null（該当なし）。 */
function parseSeconds(raw) {
  if (raw === '無' || raw === '-' || raw == null) return null;
  return parseFloat(raw);
}

/**
 * 実行仕様(effect)の kind 一覧:
 *  - 'damage'   : 攻撃力に倍率をかけたダメージを与える
 *  - 'buff'     : 自身/相手にステータス補正を付与する
 *  - 'passive'  : 発生・後隙・CTが無く、戦闘開始時から常時適用される
 *  - 'evadeSkill' : 回避ボタンの代替スキル（即応反射・即応反撃）
 *  - 'special'  : 上記に当てはまらない固有処理（カウンターブラスト等）
 * 詳細な発動条件・特殊仕様は要件定義.md 5章を参照し、
 * skill-effects.js 側の実行ハンドラで解釈する。
 */

// [名前, 発生速度tier, 後隙tier, CT(生値), 流派, 効果時間(生値), 効果テキスト, effect]
const SKILL_ROWS = [
  ['ソードスラッシュ', '並', '小', '8s', 'なし', '-',
    '攻撃力の160%のダメージを与える',
    { kind: 'damage', multiplier: 1.60 }],

  ['ネオスラッシュ', '並', '中', '14s', 'なし', '-',
    'ソードスラッシュを使用後16秒間のみ使用可能。攻撃力の220%のダメージを与える',
    { kind: 'damage', multiplier: 2.20, gate: { afterSkill: 'ソードスラッシュ', windowSeconds: 16 } }],

  ['ペネトレイト', '速', '小', '22s', 'なし', '5s',
    '相手の防御を無効化する',
    { kind: 'buff', target: 'enemy', flags: { guardDisabled: true } }],

  ['必中', '速', '小', '22s', 'なし', '3s',
    '攻撃が必ず当たる',
    // レーンのずれも回避も無視して命中させる自己バフ
    { kind: 'buff', target: 'self', flags: { alwaysHit: true } }],

  ['フレイムエンチャント', '最速', '小', '24s', 'なし', '15s',
    '攻撃力が上昇する',
    { kind: 'buff', target: 'self', stat: 'attack', magnitude: 'normal' }],

  ['ウィンドエンチャント', '最速', '小', '24s', 'なし', '15s',
    '速度が上昇する',
    { kind: 'buff', target: 'self', stat: 'speed', magnitude: 'normal' }],

  ['サンダーエンチャント', '最速', '小', '24s', 'なし', '15s',
    '攻撃力と速度が少し上昇する',
    { kind: 'buff', target: 'self', stats: ['attack', 'speed'], magnitude: 'small' }],

  ['アイスエンチャント', '最速', '小', '24s', 'なし', '15s',
    '防御のダメージ軽減率が少し上昇する',
    { kind: 'buff', target: 'self', stat: 'guardRate', magnitude: 'small' }],

  ['鉄壁', '無', '無', '無', 'なし', '-',
    '防御のダメージ軽減率が上昇する',
    { kind: 'passive', target: 'self', stat: 'guardRate', magnitude: 'normal' }],

  ['不死再生', '無', '無', '無', 'なし', '-',
    'HPが徐々に回復する(割合ではなく、固定値)',
    // データ一覧.xlsx の指定どおり固定値回復。毎秒の量は未指定のためプロトタイプ暫定値。
    { kind: 'passive', target: 'self', hpRegenPerSec: 0.8 }],

  ['精神統一', '無', '無', '無', 'なし', '-',
    'CTが少し短くなる',
    { kind: 'passive', target: 'self', ctReduction: 'small' }],

  ['底力', '無', '無', '無', 'なし', '-',
    'HPが半分以下の時、速度と攻撃力が上昇する',
    { kind: 'passive', target: 'self', condition: 'hpBelow50', stats: ['attack', 'speed'], magnitude: 'normal' }],

  ['俊足', '無', '無', '無', 'なし', '-',
    '速度が上昇する',
    { kind: 'passive', target: 'self', stat: 'speed', magnitude: 'normal' }],

  ['即応反射', '速', '中', '6s', 'なし', '-',
    '回避の代わりとして発動可能。このスキルで回避に成功した場合、回避行動中に攻撃(スキル含む)が行える。',
    { kind: 'evadeSkill' }],

  ['カウンターブラスト', '最速', '大', '18s', 'なし', '-',
    '直前の防御で受けたダメージ+攻撃力の130%のダメージを与える',
    { kind: 'special', id: 'counterBlast', multiplier: 1.30 }],

  ['アルティメットスマッシュ', '並', '大', '28s', 'なし', '-',
    '攻撃力の280%のダメージを与える',
    { kind: 'damage', multiplier: 2.80 }],

  ['フリージングロック', '並', '中', '16s', 'なし', '8s',
    'アイスエンチャント発動中のみ使用可能。相手のスキルの発生速度を少し遅くする',
    {
      kind: 'buff', target: 'enemy', stat: 'startupSlow', magnitude: 'small',
      requires: { selfBuffActive: 'アイスエンチャント' },
    }],

  ['二刀流', '無', '無', '無', '双海流', '-',
    '攻撃力が大幅に下がる代わりに双海流のスキルのCTが半分になり、後隙が短くなる',
    {
      kind: 'passive', id: 'nitoryu', target: 'self',
      selfPenalty: { stat: 'attack', magnitude: 'large', sign: -1 },
      schoolBuff: { school: '双海流', ctMultiplier: 0.5, recoveryTierDown: 1 },
    }],

  ['神速', '無', '無', '無', '双海流', '-',
    '速度が大幅に上昇する',
    { kind: 'passive', target: 'self', stat: 'speed', magnitude: 'large' }],

  ['ツインスラッシュ', '並', '小', '17s', '双海流', '-',
    '二刀流の攻撃力低下を無効化して、攻撃力の170%で2回攻撃する',
    { kind: 'damage', multiplier: 1.70, hits: 2, ignoresNitoryuPenalty: true }],

  ['クロススラッシュ', '並', '大', '32s', '双海流', '-',
    '二刀流の攻撃力低下を無効化して、攻撃力の340%で防御無視攻撃をする',
    { kind: 'damage', multiplier: 3.40, ignoresGuard: true, ignoresNitoryuPenalty: true }],

  ['凪', '無', '無', '無', '双海流', '-',
    '自身のスキルの発生速度を少し早くする',
    { kind: 'passive', target: 'self', selfSkillStartupReduction: 'small' }],

  ['連武', '最速', '中', '10s', '連炎流', '5s',
    '通常攻撃とスキルの発生速度を早くし、後隙を短くする',
    { kind: 'buff', target: 'self', selfActionStartupReduction: 'normal', selfActionRecoveryReduction: 'normal' }],

  ['炎気', '速', '小', '18s', '連炎流', '10s',
    '攻撃力と速度が上昇する',
    { kind: 'buff', target: 'self', stats: ['attack', 'speed'], magnitude: 'normal' }],

  ['即応反撃', '最速', '小', '6s', '連炎流', '-',
    '回避の代わりとして発動可能。このスキルで回避に成功した場合、回避行動中に攻撃(スキル含む)が行える。',
    // 即応反射(流派なし)より発生が速く、後隙が短い（要件定義.md 5.3）
    { kind: 'evadeSkill' }],

  ['炎舞', '並', '中', '11s', '連炎流', '-',
    'フレイムエンチャント発動中のみ使用可能。攻撃力の210%のダメージを与える',
    { kind: 'damage', multiplier: 2.10, requires: { selfBuffActive: 'フレイムエンチャント' } }],

  ['心頭滅却', '無', '無', '無', '連炎流', '-',
    '自身のスキルの後隙とCTが短くなる',
    { kind: 'passive', target: 'self', selfSkillRecoveryReduction: 'normal', ctReduction: 'normal' }],

  ['桜花一閃', '並', '中', '12s', '瞬瞑流', '-',
    '攻撃力の230%のダメージを与える',
    { kind: 'damage', multiplier: 2.30 }],

  ['冥想', '並', '小', '20s', '瞬瞑流', '5s',
    '攻撃力が大幅に上昇する',
    { kind: 'buff', target: 'self', stat: 'attack', magnitude: 'large' }],

  ['瞬歩', '速', '小', '30s', '瞬瞑流', '3.5s',
    '自身の速度を上昇させ、攻撃が必ず当たる',
    { kind: 'buff', target: 'self', stat: 'speed', magnitude: 'normal', flags: { alwaysHit: true } }],

  ['雷刃', '遅', '大', '90s', '瞬瞑流', '-',
    'サンダーエンチャント発動中のみ使用可能。攻撃力の540%のダメージを与える',
    { kind: 'damage', multiplier: 5.40, requires: { selfBuffActive: 'サンダーエンチャント' } }],

  ['心眼', '無', '無', '無', '瞬瞑流', '-',
    '画面が見ずらい盲目状態になるが、攻撃力と速度が大幅に上昇する',
    {
      kind: 'passive', id: 'shingan', target: 'self',
      stats: ['attack', 'speed'], magnitude: 'large',
      // プレイヤー操作時: 視界を妨害する演出（UI側で実装）
      humanEffect: { visualObstruction: true },
      // CPU操作時: 視界演出の代替として「自身被ダメージ1.2倍」の内部デバフ（要件定義.md 5.1）
      cpuEffect: { selfDamageTakenMultiplier: 1.2 },
    }],
];

/** 画像アセットの置き場所（chaos.html はサイト直下にあるのでドキュメント相対で書く） */
export const IMAGE_BASE = 'assets/images/chaos/';

/**
 * 発動中にキャラクターへ重ねるオーラ画像。
 * ウィンドエンチャントに対応する素材は未支給のため、オーラ無しで扱う。
 */
const SKILL_AURAS = Object.freeze({
  フレイムエンチャント: 'Flame_Aura.webp',
  アイスエンチャント: 'Ice_Aura.webp',
  サンダーエンチャント: 'Thunder_Aura.webp',
});

export const SKILLS = Object.freeze(
  Object.fromEntries(SKILL_ROWS.map(([name, startupTier, recoveryTier, ctRaw, school, durationRaw, text, effect]) => {
    const trimmedName = name.trim();
    return [trimmedName, Object.freeze({
      name: trimmedName,
      aura: SKILL_AURAS[trimmedName] ? IMAGE_BASE + SKILL_AURAS[trimmedName] : null,
      startupTier,
      recoveryTier,
      startupSeconds: STARTUP_TIME[startupTier],
      recoverySeconds: RECOVERY_TIME[recoveryTier],
      cooldownSeconds: parseSeconds(ctRaw),   // null = パッシブ（CT無し = 発動不可の常時適用スキル）
      school: school === 'なし' ? null : school.trim(),
      durationSeconds: parseSeconds(durationRaw),
      description: text,
      effect,
      isPassive: startupTier === '無' && recoveryTier === '無' && ctRaw === '無',
    })];
  }))
);

/* =========================================================
 * 7. キャラクターマスタデータ（データ一覧.xlsx「キャラクター一覧」シート準拠）
 *    敵キャラクターは要件定義.md 6章の通り、戦ごとにステータス・
 *    所持4スキルが固定値として定義される（ポイント配分は行わない）。
 * =======================================================*/

// [名前, HP, 攻撃力, スピード, スキル1-4, 戦闘タイミング, 補足, 戦力]
const CHARACTER_ROWS = [
  ['ごろつき', 36, 12, 6, ['ソードスラッシュ', 'ネオスラッシュ', 'ペネトレイト', '底力'], '1戦目固定', 'チュートリアルようの敵', 6],
  ['双海流門下生', 63, 12, 9, ['アイスエンチャント', '二刀流', 'ツインスラッシュ', 'フリージングロック'], '双海流選択時2戦目', null, 21],
  ['連炎流門下生', 48, 15, 10, ['フレイムエンチャント', '連武', '炎舞', '精神統一'], '連炎流選択時2戦目', null, 21],
  ['瞬瞑流門下生', 30, 17, 12, ['サンダーエンチャント', '桜花一閃', '瞬歩', 'ペネトレイト'], '瞬瞑流選択時2戦目', null, 21],
  ['双海 浩二', 78, 16, 10, ['二刀流', 'ツインスラッシュ', 'クロススラッシュ', '凪'], '双海流選択時3戦目', '双海流師範', 32],
  ['連炎 華凛', 54, 20, 12, ['連武', '炎気', '即応反撃', '心頭滅却'], '連炎流選択時3戦目', '連炎流師範', 32],
  ['キョウ', 36, 22, 14, ['桜花一閃', '冥想', '瞬歩', '心眼'], '瞬瞑流選択時3戦目', '瞬瞑流師範', 32],
  ['緋天 飛鳥', 51, 20, 14, ['ウィンドエンチャント', '鉄壁', 'ソードスラッシュ', '心頭滅却'], '4戦目ランダム(30%)', null, 35],
  ['ローザ', 63, 24, 10, ['フレイムエンチャント', '連武', '炎舞', '底力'], '4戦目ランダム(30%)', null, 35],
  ['武田 白波', 81, 28, 5, ['炎気', '瞬歩', '鉄壁', 'カウンターブラスト'], '4戦目ランダム(30%)', null, 35],
  ['切裂 劣子', 51, 27, 13, ['即応反射', '必中', 'アルティメットスマッシュ', '精神統一'], '4戦目低確率(10%)', 'レアエネミー', 40],
  ['瞬瞑 龍斗', 42, 30, 16, ['サンダーエンチャント', '瞬歩', '雷刃', '心眼'], '5戦目', 'ボス', 46],
  ['沖田 雫', 78, 28, 18, ['瞬歩', '即応反撃', '底力', '不死再生'], '6戦目(特殊条件)', '裏ボス(ボスをノーダメで倒すと6戦目に突入)', 60],
];

/* ---- 画像アセット（assets/images/chaos/ 配下） ----
 * データ一覧.xlsx「キャラクター一覧」シートの「立ち絵」「背景」列に対応する。
 * シート側は拡張子なしのファイル名（例: Goro / sougen_Background）なので、
 * ここで拡張子を補ってパス化する。行データを汚さないよう別マップで持つ。
 */

/**
 * 敵HPの倍率（バランス調整用）。
 * データ一覧.xlsx のHPをそのまま使うと決着が早すぎたため、ここで倍率を掛ける。
 * シート側の値は正のまま残したいので、data.js 側で調整する。
 */
export const ENEMY_HP_MULTIPLIER = 3;

/** 立ち絵。門下生は3流派で同じ絵を使い回す */
const PORTRAITS = Object.freeze({
  ごろつき: 'Goro.webp',
  双海流門下生: 'Monkasei.webp',
  連炎流門下生: 'Monkasei.webp',
  瞬瞑流門下生: 'Monkasei.webp',
  '双海 浩二': 'Soukai.webp',
  '連炎 華凛': 'Renen.webp',
  キョウ: 'Kyou.webp',
  '緋天 飛鳥': 'Asuka.webp',
  ローザ: 'Rosa.webp',
  '武田 白波': 'Takeda.webp',
  '切裂 劣子': 'Kirisakiretuko.webp',
  '瞬瞑 龍斗': 'Syunmei.webp',
  '沖田 雫': 'Okita.webp',
});

/** 背景 */
const BACKGROUNDS = Object.freeze({
  ごろつき: 'sougen_Background.webp',
  双海流門下生: 'dojo_Background.webp',
  連炎流門下生: 'dojo_Background.webp',
  瞬瞑流門下生: 'dojo_Background.webp',
  '双海 浩二': 'dojo_Background.webp',
  '連炎 華凛': 'dojo_Background.webp',
  キョウ: 'dojo_Background.webp',
  '緋天 飛鳥': 'sougen_Background.webp',
  ローザ: 'sougen_Background.webp',
  '武田 白波': 'sougen_Background.webp',
  '切裂 劣子': 'gesyoku_Background.webp',
  '瞬瞑 龍斗': 'yama_Background.webp',
  '沖田 雫': 'sekaiju_Background.webp',
});

export const CHARACTERS = Object.freeze(
  Object.fromEntries(CHARACTER_ROWS.map(([name, hp, atk, spd, skills, timing, note, power]) => {
    const trimmedName = name.trim();
    return [trimmedName, Object.freeze({
      name: trimmedName,
      baseStats: Object.freeze({ maxHp: hp * ENEMY_HP_MULTIPLIER, attack: atk, speed: spd }),
      sheetHp: hp, // データ一覧.xlsx 上の素の値（倍率適用前）
      skillNames: skills.map(s => s.trim()),
      timing,       // どの戦闘に登場するかの条件文字列
      note,
      power,        // 戦力値（マッチング/難易度の目安）
      portrait: IMAGE_BASE + (PORTRAITS[trimmedName] ?? 'Monkasei.webp'),
      background: IMAGE_BASE + (BACKGROUNDS[trimmedName] ?? 'sougen_Background.webp'),
    })];
  }))
);

/* =========================================================
 * 8. バトル全体仕様（要件定義.md 1〜2章）
 * =======================================================*/

export const MATCH_CONFIG = Object.freeze({
  totalRounds: 5,          // 全5戦闘の勝ち抜き形式
  skillSlots: 4,           // プレイヤー・敵ともに4枠固定
  battleDurationHintSec: { min: 60, max: 90 }, // 想定戦闘時間（表示等の参考値。強制終了はしない）
});
