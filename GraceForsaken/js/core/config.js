// ===================================================================
// GraceForsaken - 調整用パラメータ
// 要件定義書で数値が未定義だった箇所は、すべてここに集約しています。
// ここを書き換えるだけでバランス調整ができます。
// ===================================================================

const CONFIG = {
  // --- ダメージ計算 -------------------------------------------------
  // ダメージ = 威力 - 対象の防御力（最低 DAMAGE_MIN）
  DAMAGE_MIN: 1,
  ELEMENT_MULT: 1.5,          // 属性有利時の倍率

  // --- 命中・回避 ---------------------------------------------------
  SKILL_BASE_ACCURACY: 100,   // スキルの基本命中率（個別指定がない場合）
  NORMAL_ATTACK_ACCURACY: 90, // 通常攻撃の命中率
  EVASION_DIVISOR: 2,         // 基礎回避率 = floor(速度 / EVASION_DIVISOR) %
  ACCURACY_FLOOR: 5,          // 最終命中率の下限 %
  ACCURACY_CEIL: 100,         // 最終命中率の上限 %

  // --- 射程・距離 ---------------------------------------------------
  // 距離 = 自陣インデックス + 敵陣インデックス - 1  （1〜5）
  //   自1→敵1 = 1 / 自3→敵1 = 3 / 自3→敵3 = 5   ※要件定義書の例と一致
  // 到達判定: 距離 <= 射程
  //   ※要件定義書の「射程以上の距離には届かない」を文字どおり「距離 < 射程」と
  //     解釈すると射程1のキャラが誰も攻撃できなくなるため、「距離 <= 射程」を採用。
  //     文字どおりの挙動に戻す場合は RANGE_INCLUSIVE を false にしてください。
  RANGE_INCLUSIVE: true,
  RANGED_ATTACK_MIN_DISTANCE: 2, // これ以上の距離からの攻撃を「遠距離攻撃」とみなす（弾道予測）

  // --- 行動 ---------------------------------------------------------
  // 行動順は「速度の高い順に各キャラ1回ずつ」＝1ラウンド。
  // 複数回行動はスキル（二刀流・火薬の魔女・トリプレットマジック）でのみ得られる。
  PARTY_SIZE: 4,
  AREA_COUNT: 3,
  ALLOW_MOVE_ACTION: true,    // 行動として「移動（隣接エリアへ1マス）」を許可

  // --- 持続ターン数が明記されていない効果の既定値 ---------------------
  RIDER_DEBUFF_DURATION: 3,   // マジックチェーンの速度-3 など
  AURA_DURATION: 99,          // 戦場の演奏者 など（実質、戦闘中ずっと）

  // --- 勝敗 ---------------------------------------------------------
  PVP_ROUND_LIMIT: 30,        // 対戦モードの打ち切りラウンド数
  STORY_ROUND_LIMIT: 60,      // ストーリーの保険（無限ループ防止）

  // --- 状態異常 -----------------------------------------------------
  BRAINWASH_RANDOM_RATE: 0.7,     // 洗脳中に対象がランダムになる確率
  BRAINWASH_CURE_PER_DEFMAG: 3,   // 解除確率 = 魔法防御力 × この値 (%)

  // --- 敵ユニット ---------------------------------------------------
  MOB: {                      // 「魔人ベース」共通ステータス
    hp: 10, mp: 10, speed: 10,
    atkPhys: 10, atkMag: 10, defPhys: 10, defMag: 10,
    element: 'DARK', range: 2, skillCount: 2,
  },
  // 「ボス仕様」補正。ダメージが減算式のため statBonus（＝防御力）の影響が非常に大きい。
  // ランダム編成での3話ボス勝率の実測（tools/simulate.js）:
  //   hpMult 6 / statBonus 4 → 15〜19%（厳しすぎる）
  //   hpMult 3 / statBonus 2 → 30〜53%  ←採用
  //   hpMult 2 / statBonus 1 → 45〜70%（易しめ）
  BOSS: {
    hpMult: 3,                // 最大HP ×3
    statBonus: 2,             // HP以外のステータス +2
    rangeBonus: 1,
    skillCount: 4,
  },

  // --- 育成・通貨 ---------------------------------------------------
  CURRENCY_NAME: 'ソウル',
  REWARD: {
    storyEpisode: 60,         // ストーリー1話クリア
    storyFirstClearBonus: 40, // 初回クリアボーナス
    pvpWin: 80,
    pvpLose: 20,
  },
  SKILL_REROLL_COST: 50,      // スキル振り直し
  GACHA_COST: 300,            // ガチャ1回
  GACHA_MULTI: 10,            // 10連の回数
  GACHA_MULTI_DISCOUNT: 0.9,  // 10連は10%引き
  START_CURRENCY: 900,

  // --- 演出 ---------------------------------------------------------
  LOG_SPEED_MS: 260,          // 戦闘ログの流れる速さ
  AI_STEP_MS: 520,            // CPU・ゲストが1手ごとに待つ時間（演出が見えるように）
  CUTIN_MS: 800,              // 行動時のカットインの表示時間（オプションでOFFにできる）

  // --- リアルタイム対戦（PVP対戦_設計書 11章） ----------------------
  // サーバー（server/）もこの値を読み込んで使う。
  PVP: {
    SERVER_URL: 'https://pvp.sygames.net',   // 本番の対戦サーバー（wss で接続される）
    DEV_SERVER_URL: 'http://localhost:3000', // localhost・ファイルで開いたときの接続先
    MATCH_TIMEOUT_SEC: 15,        // この秒数で相手が見つからなければ BOT と対戦
    PLACEMENT_TIMEOUT_SEC: 60,    // 配置フェーズの制限時間
    TURN_TIMEOUT_SEC: 30,         // 手番（キャラ1体の行動）ごとの制限時間
    AFK_LIMIT: 3,                 // 連続でこの回数時間切れになると放置で敗北
    ANIMATION_MAX_WAIT_SEC: 8,    // 演出の完了を待つ上限
    RECONNECT_GRACE_SEC: 30,      // 切断からの復帰猶予
    BOT_THINK_MS: [1000, 2000],   // BOT が行動するまでの待ち時間（最小・最大）
    FINISHED_ROOM_TTL_SEC: 60,    // 終了した試合を保持する時間（再接続した人へ結果を渡すため）
    ROOM_MAX_LIFETIME_MIN: 60,    // 試合の最大存続時間（想定外の停滞への保険）
    SESSION_RESUME_MAX_MIN: 10,   // 起動時に試合への復帰を試みる期限
    RATE_LIMIT_PER_SEC: 10,       // 1接続あたりの送信上限（毎秒）
    REWARD: { win: 150, lose: 50, draw: 100 },   // 対人戦の報酬（BOT戦は REWARD.pvpWin 等を使う）
    BOT_DRAW_REWARD: 20,          // BOT戦の引き分け報酬（ゴースト対戦と同じ）
  },
};

// ===================================================================
// 属性
// ===================================================================
const ELEMENTS = {
  FIRE:    { name: '火', color: '#ff6b4a' },
  WATER:   { name: '水', color: '#4aa8ff' },
  WIND:    { name: '風', color: '#5fd38d' },
  THUNDER: { name: '雷', color: '#f5d24a' },
  LIGHT:   { name: '光', color: '#ffe9a8' },
  DARK:    { name: '闇', color: '#b07ce8' },
  NONE:    { name: '無', color: '#b9c0cc' },
};

// 「攻撃側 -> 1.5倍になる防御側」
const ELEMENT_ADVANTAGE = {
  FIRE: 'WIND',
  WIND: 'THUNDER',
  THUNDER: 'WATER',
  WATER: 'FIRE',
  LIGHT: 'DARK',
  DARK: 'LIGHT',
  NONE: null,
};

function elementMultiplier(attackerEl, defenderEl) {
  if (!attackerEl || !defenderEl) return 1;
  return ELEMENT_ADVANTAGE[attackerEl] === defenderEl ? CONFIG.ELEMENT_MULT : 1;
}

// ===================================================================
// フィールド（時間帯 A × ロケーション B）
// ===================================================================
const FIELD_TIME = {
  DAY:   { name: '昼', desc: '光属性の物理防御力・魔法防御力 +1' },
  NIGHT: { name: '夜', desc: '闇属性以外の命中率 -5%' },
};

const FIELD_LOCATION = {
  BLAZE:     { name: '火事場', desc: '火属性の物理攻撃力・魔法攻撃力 +1' },
  WATERSIDE: { name: '水辺',   desc: '水属性以外の速度 -2' },
  PLAINS:    { name: '草原',   desc: '風属性の速度・物理防御力 +1' },
  MOUNTAIN:  { name: '山脈',   desc: '雷属性の速度・魔法防御力 +1' },
};

function fieldName(field) {
  return FIELD_TIME[field.time].name + 'の' + FIELD_LOCATION[field.location].name;
}

/** フィールドによるステータス補正を返す。 */
function fieldStatBonus(field, element) {
  const b = { speed: 0, atkPhys: 0, atkMag: 0, defPhys: 0, defMag: 0 };
  if (field.time === 'DAY' && element === 'LIGHT') { b.defPhys += 1; b.defMag += 1; }
  switch (field.location) {
    case 'BLAZE':     if (element === 'FIRE')    { b.atkPhys += 1; b.atkMag += 1; } break;
    case 'WATERSIDE': if (element !== 'WATER')   { b.speed -= 2; } break;
    case 'PLAINS':    if (element === 'WIND')    { b.speed += 1; b.defPhys += 1; } break;
    case 'MOUNTAIN':  if (element === 'THUNDER') { b.speed += 1; b.defMag += 1; } break;
  }
  return b;
}

/** フィールドによる命中率補正 (%) を返す。 */
function fieldAccuracyBonus(field, element) {
  if (field.time === 'NIGHT' && element !== 'DARK') return -5;
  return 0;
}

// ===================================================================
// 距離
// ===================================================================
/** 自陣エリア(1〜3)から敵陣エリア(1〜3)までの距離。 */
function areaDistance(myArea, enemyArea) {
  return myArea + enemyArea - 1;
}

/** 射程が届くか。 */
function inRange(range, distance) {
  return CONFIG.RANGE_INCLUSIVE ? distance <= range : distance < range;
}

const AREA_LABEL = { 1: '前衛', 2: '中衛', 3: '後衛' };
