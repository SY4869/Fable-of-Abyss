// ===================================================================
// スキル効果ロジック定義（手書き / xlsx 再生成では上書きされません）
// データ一覧.xlsx の「効果」テキストを、戦闘エンジンが実行できる形に落としたもの。
//
// スキル名をキーに以下を定義する:
//   act    : 'attack' | 'buff' | 'heal' | 'passive' | 'special'
//   tgt    : 'SELF' | 'ENEMY_ONE' | 'ENEMY_AREA' | 'ENEMY_ALL'
//            | 'ALLY_ONE' | 'ALLY_AREA' | 'ALLY_ALL' | 'NONE'
//   quick  : true なら行動権を消費しない（クイックスキル）
//   oncePerBattle : true なら1戦闘に1度だけ使用可能
//   costHp : HP消費量
//   atk    : { base:'atkPhys'|'atkMag', mod, dmg:'PHYS'|'MAG',
//              hits, pierce, sure, acc, defHalf, ignoreDualPenalty }
//   heal   : { base:'atkMag', mod }  … 回復量 = base + mod
//   buff   : { dur, stats:{speed,atkPhys,atkMag,defPhys,defMag},
//              acc, eva, regen:{hp,mp}, shield:{base,div}, flags:{...} }
//   onKill : { perm:{...}, restore:{hp,mp} }  … この攻撃で敵を倒した時
//   then   : [ 追加効果 ... ]
//   passive: { ... }  … 常時効果
//   custom : 特殊処理の識別子（battle.js の runCustom で実装）
// ===================================================================

const SKILL_LOGIC = {

  // ---------------- No.1 レイア ----------------
  'ナイトクイーン': {
    act: 'passive',
    passive: {
      cond: 'NIGHT',
      stats: { speed: 3, atkPhys: 3, atkMag: 3, defPhys: 3, defMag: 3 },
      regen: { hp: 2, mp: 2 },
    },
  },
  'ムーンフィスト': {
    act: 'attack', tgt: 'ENEMY_ONE',
    atk: { base: 'atkPhys', mod: 3, dmg: 'PHYS', acc: 10 },
  },
  'メテオレイン': {
    act: 'attack', tgt: 'ENEMY_AREA',
    atk: { base: 'atkMag', mod: 3, dmg: 'MAG' },
  },
  '連武': {
    act: 'attack', tgt: 'ENEMY_ONE',
    atk: { base: 'atkPhys', mod: -1, dmg: 'PHYS', hits: 2 },
  },
  'マジックチェーン': {
    act: 'attack', tgt: 'ENEMY_ONE',
    atk: { base: 'atkMag', mod: -3, dmg: 'MAG' },
    then: [{ act: 'buff', tgt: 'TARGET', buff: { dur: CONFIG.RIDER_DEBUFF_DURATION, stats: { speed: -3 } } }],
  },
  '鬼人化': {
    act: 'buff', tgt: 'SELF', quick: true,
    buff: { dur: 3, stats: { speed: 3, atkPhys: 3, defPhys: 3, atkMag: -3, defMag: -3 } },
  },
  'フェイブル・オブ・アビス': {
    act: 'special', tgt: 'NONE', custom: 'fableOfAbyss',
  },

  // ---------------- No.2 アリシア ----------------
  'トリプレットマジック': {
    act: 'passive',
    passive: {
      extraActions: 2,
      condElse: 'NIGHT',                       // 夜以外のとき低下
      statsUnlessNight: { speed: -2, atkMag: -2 },
    },
  },
  'ファイヤーボール': {
    act: 'attack', tgt: 'ENEMY_AREA',
    atk: { base: 'atkMag', mod: -3, dmg: 'MAG' },
  },
  'ライトニングランス': {
    act: 'attack', tgt: 'ENEMY_ONE',
    atk: { base: 'atkMag', mod: 2, dmg: 'MAG' },
  },
  'ブリザード': {
    act: 'attack', tgt: 'ENEMY_AREA',
    atk: { base: 'atkMag', mod: -3, dmg: 'MAG' },
  },
  'ウィンドカッター': {
    act: 'attack', tgt: 'ENEMY_ONE',
    atk: { base: 'atkMag', mod: 2, dmg: 'MAG' },
  },
  '精神統一': {
    act: 'special', tgt: 'SELF', custom: 'restoreMp', amount: 6,
  },
  'アイギス': {
    act: 'buff', tgt: 'SELF',
    buff: { dur: 1, stats: { defPhys: 10, defMag: 10 } },
  },

  // ---------------- No.3 クレア ----------------
  '黒い森の乙女': {
    act: 'passive',
    passive: {
      stats: { defMag: 3 },
      nightStats: { atkPhys: -2, atkMag: 6 },
    },
  },
  'クリムゾンインパクト': {
    act: 'attack', tgt: 'ENEMY_ONE',
    atk: { base: 'atkPhys', mod: 1, dmg: 'PHYS', defHalf: true },
  },
  '炎舞': {
    act: 'attack', tgt: 'ENEMY_ONE',
    atk: { base: 'atkPhys', mod: 2, dmg: 'PHYS' },
  },
  '黒きヤギの祝福': {
    act: 'buff', tgt: 'SELF', quick: true,
    buff: { dur: 5, stats: { speed: 3, atkPhys: 3 }, regen: { hp: 1, mp: 1 } },
  },
  '紅眼閃舞': {
    act: 'buff', tgt: 'SELF', quick: true, costHp: 2,
    buff: { dur: 2, stats: { speed: 8 } },
  },

  // ---------------- No.4 ソフィア ----------------
  '鏡よ鏡': {
    act: 'passive',
    passive: { flags: { ignoreStealth: true }, nightStats: { atkMag: 2 } },
  },
  'アズールスピア': {
    act: 'attack', tgt: 'ENEMY_ONE',
    atk: { base: 'atkPhys', mod: 1, dmg: 'PHYS', sure: true },
  },
  'チャーム': {
    act: 'special', tgt: 'ENEMY_ONE', custom: 'charm',
  },
  'ブレイブソング': {
    act: 'buff', tgt: 'ALLY_AREA',
    buff: { dur: 2, stats: { defPhys: 1, defMag: 1 } },
  },

  // ---------------- No.5 沖田雫 ----------------
  '世界樹の英雄': {
    act: 'passive',
    passive: { stats: { atkPhys: 2 }, regen: { hp: 2, mp: 2 } },
  },
  '瞬歩': {
    act: 'buff', tgt: 'SELF',
    buff: { dur: 3, eva: 10, flags: { stealth: true } },
  },
  '抜刀《攻》': {
    act: 'buff', tgt: 'SELF',
    buff: { dur: 99, flags: { nextAtkBonus: 6 } },
  },
  '抜刀《防》': {
    act: 'buff', tgt: 'SELF',
    buff: { dur: 99, flags: { nextDefReduce: 6 } },
  },
  '三段突き': {
    act: 'attack', tgt: 'ENEMY_ONE',
    atk: { base: 'atkPhys', mod: -3, dmg: 'PHYS', hits: 3 },
  },
  'ブレイブハート': {
    act: 'buff', tgt: 'SELF', quick: true, oncePerBattle: true,
    buff: { dur: 5, flags: { endure: 100 } },
  },
  'ブルーリコレクション': {
    act: 'buff', tgt: 'SELF',
    buff: { dur: 3, flags: { allPierce: true } },
  },

  // ---------------- No.6 瞬瞑龍斗 / No.9 キョウ ----------------
  '心眼': {
    act: 'passive',
    passive: { acc: 15, eva: 15 },
  },
  '辻斬り': {
    act: 'attack', tgt: 'ENEMY_ONE',
    atk: { base: 'atkPhys', mod: 2, dmg: 'PHYS', sure: true },
  },
  '桜花一閃': {
    act: 'attack', tgt: 'ENEMY_ONE',
    atk: { base: 'atkPhys', mod: 5, dmg: 'PHYS' },
  },
  '瞑想': {
    act: 'buff', tgt: 'SELF', quick: true,
    buff: { dur: 1, stats: { atkPhys: 3 } },
  },
  '雷刃': {
    act: 'attack', tgt: 'ENEMY_ONE',
    atk: { base: 'atkPhys', mod: 12, dmg: 'PHYS' },
  },
  '雷切': {
    act: 'attack', tgt: 'ENEMY_ONE',
    atk: { base: 'atkPhys', mod: 10, dmg: 'PHYS' },
  },

  // ---------------- 双海隆二 ----------------
  '朧': {
    act: 'passive',
    passive: { eva: 25 },
  },
  '二刀流': {
    act: 'buff', tgt: 'SELF', quick: true,
    buff: { dur: 2, flags: { extraActions: 1, atkPhysHalf: true } },
  },
  '神速': {
    act: 'buff', tgt: 'SELF', quick: true,
    buff: { dur: 5, stats: { speed: 3 } },
  },
  'ツインスラッシュ': {
    act: 'attack', tgt: 'ENEMY_ONE',
    atk: { base: 'atkPhys', mod: 2, dmg: 'PHYS', ignoreDualPenalty: true },
  },
  'クロススラッシュ': {
    act: 'attack', tgt: 'ENEMY_ONE',
    atk: { base: 'atkPhys', mod: -2, dmg: 'PHYS', pierce: true, ignoreDualPenalty: true },
  },
  'エリアスラッシュ': {
    act: 'attack', tgt: 'ENEMY_AREA',
    atk: { base: 'atkPhys', mod: -3, dmg: 'PHYS' },
  },

  // ---------------- 連炎華凛 ----------------
  '心頭滅却': {
    act: 'passive',
    passive: { costReduce: 1 },
  },
  '炎気': {
    act: 'buff', tgt: 'SELF', quick: true,
    buff: { dur: 1, stats: { speed: 3, atkPhys: 3 } },
  },
  '即応反撃': {
    act: 'buff', tgt: 'SELF', quick: true,
    buff: { dur: 1, eva: 70, flags: { growOnDodge: 1 } },
  },
  'ソウルマキシマイザー': {
    act: 'attack', tgt: 'ENEMY_ONE',
    atk: { base: 'atkMag', mod: 1, dmg: 'MAG' },
    onKill: { perm: { hp: 3, mp: 3, atkPhys: 3, atkMag: 3 } },
  },

  // ---------------- No.10 切裂狂子 ----------------
  'シリアルキラー': {
    act: 'passive',
    passive: { onKill: { perm: { hp: 3, mp: 3, speed: 3, atkPhys: 3, atkMag: 3 } } },
  },
  'シャドーリープ': {
    act: 'attack', tgt: 'ENEMY_ONE',
    atk: { base: 'atkPhys', mod: 2, dmg: 'PHYS' },
    then: [{ act: 'buff', tgt: 'SELF', buff: { dur: 2, flags: { stealth: true } } }],
  },
  '神出鬼没': {
    act: 'buff', tgt: 'SELF',
    buff: { dur: 3, acc: 5, flags: { stealth: true }, nightStats: { atkPhys: 2 } },
  },
  '戦場の演奏者': {
    act: 'buff', tgt: 'ALLY_AREA',
    buff: { dur: CONFIG.AURA_DURATION, stats: { atkPhys: 2, atkMag: 2 } },
  },
  '戦略的撤退': {
    act: 'buff', tgt: 'SELF', quick: true,
    buff: { dur: 5, flags: { retreatOnce: true } },
  },
  'ブラッドランス': {
    act: 'attack', tgt: 'ENEMY_ONE', costHp: 2, blood: true,
    atk: { base: 'atkMag', mod: 2, dmg: 'PHYS' },
  },
  'ブレインイーター': {
    act: 'buff', tgt: 'SELF', quick: true,
    buff: { dur: 5, flags: { onKillRestore: { hp: 4, mp: 4 } } },
  },

  // ---------------- No.11 切裂劣子 ----------------
  '刈り取り': {
    act: 'attack', tgt: 'ENEMY_ONE',
    atk: { base: 'atkPhys', mod: 1, dmg: 'PHYS', pierce: true, sure: true },
  },
  'カリトルモノ': {
    act: 'buff', tgt: 'SELF',
    buff: { dur: 3, stats: { speed: 3, atkPhys: 3, atkMag: 3 } },
  },
  'ソウルハーベスト': {
    act: 'attack', tgt: 'ENEMY_ONE',
    atk: { base: 'atkPhys', mod: 3, dmg: 'PHYS', pierce: true },
    onKill: { restore: { mp: 6 } },
  },

  // ---------------- No.12 ネストル ----------------
  '生への執着': {
    act: 'buff', tgt: 'SELF', quick: true,
    buff: { dur: 3, flags: { endure: 50, endureStoryFirstGuaranteed: true } },
  },
  'カースミュージック': {
    act: 'buff', tgt: 'ENEMY_AREA',
    buff: { dur: 1, stats: { speed: -2, atkPhys: -2, atkMag: -2, defPhys: -2, defMag: -2 } },
  },

  // ---------------- No.13 ロナ ----------------
  '優しき死神': {
    act: 'passive',
    passive: { onDeathHealAllies: { hp: 5, mp: 5 } },
  },
  'リーサルカウント': {
    act: 'special', tgt: 'ENEMY_AREA', custom: 'lethalCount', rounds: 5,
  },
  // リバース（アネシア）所持時は敵も対象に選べる（battle.js validTargets）
  'ヒール': {
    act: 'heal', tgt: 'ALLY_ONE',
    heal: { base: 'atkMag', mod: -2 },
  },
  'ブラッドシールド': {
    act: 'buff', tgt: 'SELF', quick: true, costHp: 3, blood: true,
    buff: { dur: 99, shield: { base: 'atkMag', div: 2 } },
  },
  'アンチヒール': {
    act: 'buff', tgt: 'ENEMY_ONE',
    buff: { dur: 999, flags: { noHeal: true } },
  },

  // ---------------- アレクトロス ----------------
  '歌う筋肉': {
    act: 'passive',
    passive: { singingMuscle: true },
  },
  '愉快な合唱団': {
    act: 'buff', tgt: 'SELF',
    buff: { dur: 6, regen: { hp: 1, mp: 1 } },
  },
  '踊り狂う酔っ払い': {
    act: 'buff', tgt: 'SELF',
    buff: { dur: 3, acc: -15, eva: 15 },
  },

  // ---------------- No.15 ミリア / No.27 フレア ----------------
  '剣と薔薇の物語': {
    act: 'special', tgt: 'NONE', custom: 'swordAndRose',
  },
  '白茨': {
    act: 'attack', tgt: 'ENEMY_ONE', rose: true,
    atk: { base: 'atkPhys', mod: 1, dmg: 'PHYS' },
    then: [{ act: 'special', custom: 'selfHealByAtkMag' }],
  },
  '紅茨': {
    act: 'attack', tgt: 'ENEMY_ONE', rose: true,
    atk: { base: 'atkPhys', mod: 4, dmg: 'PHYS' },
  },

  // ---------------- No.16 セレス ----------------
  '花鳥風月': {
    act: 'passive',
    passive: { costReduce: 1, regen: { mp: 1 } },
  },
  '風切': {
    act: 'attack', tgt: 'ENEMY_ONE',
    atk: { base: 'atkPhys', mod: 3, dmg: 'PHYS' },
  },
  '疾風迅雷': {
    act: 'attack', tgt: 'ENEMY_ONE',
    atk: { base: 'atkPhys', mod: 2, dmg: 'PHYS', hits: 2 },
  },
  'マキシマムストリーム': {
    act: 'attack', tgt: 'ENEMY_ONE',
    atk: { base: 'atkPhys', mod: 8, dmg: 'PHYS', pierce: true },
  },

  // ---------------- No.17 アネシア ----------------
  'リバース': {
    act: 'passive',
    passive: { healAsDamage: 2 },
  },
  '反魂': {
    act: 'special', tgt: 'ENEMY_ONE', custom: 'hangon',
    atk: { base: 'atkMag', mod: -4, dmg: 'MAG' },
  },

  // ---------------- No.18 ディアナ ----------------
  '不死なる魔王': {
    act: 'passive',
    // 復活後は1以下のダメージを無効化する（battle.js dealDamage / dealRawDamage）
    passive: { undying: { defPhys: 15, defMag: 15, ignoreDamageUpTo: 1 } },
  },
  'ポイズンキングダム': {
    act: 'buff', tgt: 'SELF',
    buff: { dur: 6, flags: { poisonKingdom: 1 } },
  },

  // ---------------- No.19 リリアーネ ----------------
  '絶対領域': {
    act: 'passive',
    passive: { immune: 'PHYS' },
  },
  '変幻自在': {
    act: 'buff', tgt: 'SELF', quick: true,
    buff: { dur: 1, flags: { allDamageAsPhys: true } },
  },

  // ---------------- No.20 緋天飛鳥 / No.23 アン ----------------
  '弾道予測': {
    act: 'passive',
    passive: { evaVsRanged: 40 },
  },
  'インビジブルテンタクル': {
    act: 'buff', tgt: 'SELF', quick: true,
    buff: { dur: 99, shield: { base: 'defPhys', div: 1 } },
  },

  // ---------------- No.21 アステル ----------------
  '魔神を操りし者': {
    act: 'passive',
    passive: { summonMobAtStart: true },
  },

  // ---------------- No.22 イレイナ ----------------
  '魂転': {
    act: 'passive',
    passive: { flags: { ignoreStealth: true, alwaysHit: true } },
  },
  '食魂': {
    act: 'attack', tgt: 'ENEMY_ONE',
    atk: { base: 'atkMag', mod: -5, dmg: 'MAG' },
    then: [{ act: 'special', custom: 'permGain', perm: { hp: 2, defPhys: 2 } }],
  },

  // ---------------- No.23 アン ----------------
  'クリティカルインパクト': {
    act: 'attack', tgt: 'ENEMY_ONE',
    atk: { base: 'atkPhys', mod: 8, dmg: 'PHYS', acc: -20 },
  },

  // ---------------- No.24 シェリーニ ----------------
  '火薬の魔女': {
    act: 'passive',
    passive: { stats: { atkPhys: 4 }, extraActions: 1 },
  },
  '百万人を殺した英雄': {
    act: 'buff', tgt: 'SELF', quick: true,
    buff: { dur: 8, flags: { onKillPerm: { mp: 2, atkMag: 2 } } },
  },

  // ---------------- No.25 リサ ----------------
  '滅尽': {
    act: 'passive',
    passive: { roundStartPerm: { atkPhys: 1, atkMag: 1 } },
  },
  '復讐者': {
    act: 'buff', tgt: 'SELF',
    buff: { dur: 8, flags: { onDamagedPerm: { mp: 2, atkPhys: 2, atkMag: 2 } } },
  },

  // ---------------- No.26 ブラド ----------------
  'ブラッドマジック': {
    act: 'passive',
    passive: { bloodNoHpCost: true },
  },
  '血壊': {
    act: 'buff', tgt: 'SELF', quick: true, costHp: 3, blood: true,
    buff: { dur: 3, stats: { atkMag: 4 } },
  },
  'ブラッドレイン': {
    act: 'attack', tgt: 'ENEMY_AREA', costHp: 3, blood: true,
    atk: { base: 'atkMag', mod: -3, dmg: 'PHYS' },
  },

  // ---------------- No.27 フレア ----------------
  '咲き誇る薔薇園': {
    act: 'passive',
    passive: { roseBonus: 3 },
  },

  // ---------------- No.28 鬼羅瑠 ----------------
  '優鬼': {
    act: 'passive',
    passive: { gentleOni: { perKill: { speed: 2, atkPhys: 2, atkMag: 2, defPhys: 2, defMag: 2 } } },
  },
  '滅魂': {
    act: 'buff', tgt: 'SELF', quick: true,
    buff: { dur: 3, stats: { atkPhys: 2, atkMag: 2 } },
  },

  // ---------------- No.29 テレス ----------------
  '魔弓撃': {
    act: 'passive',
    passive: { magicBow: true },
  },
  'インドラの矢': {
    act: 'attack', tgt: 'ENEMY_ONE',
    atk: { base: 'atkMag', mod: 8, dmg: 'MAG', pierce: true },
  },

  // ---------------- No.30 カオス ----------------
  '終わりの始まり': {
    act: 'passive',
    passive: { roundEndPierceAll: 1 },
  },
  'メギドの火': {
    act: 'attack', tgt: 'ENEMY_AREA',
    atk: { base: 'atkMag', mod: -2, dmg: 'MAG', pierce: true },
  },
  '終焉': {
    act: 'special', tgt: 'ENEMY_ALL', custom: 'shuen',
  },

  // =================================================================
  // ストーリーのボス専用スキル（ストーリー/*.md の「ボスデータ」の表）
  // 名前・コスト・説明文は stories.js から読み込まれ、効果はここで定義する。
  // =================================================================

  // ---------------- 喰星の古龍（アリシア第3話） ----------------
  '竜鱗': {
    act: 'passive',
    passive: { stats: { atkPhys: 3, defPhys: 3, defMag: 3 } },
  },
  '薙ぎ払い': {
    act: 'attack', tgt: 'ENEMY_AREA',
    atk: { base: 'atkPhys', mod: -2, dmg: 'PHYS' },
  },
  'ドラゴニックパワー': {
    act: 'buff', tgt: 'SELF', quick: true,
    buff: { dur: 1, stats: { speed: 4, atkPhys: 4, defPhys: 4 } },
  },
  'ドラゴンブレス': {
    // 2エリア: 選んだエリアと、その隣（後ろ側。後衛を選んだ場合は中衛）
    act: 'attack', tgt: 'ENEMY_AREA', areaSpan: 2,
    atk: { base: 'atkMag', mod: -2, dmg: 'MAG' },
  },

  // ---------------- 深淵に呑まれた先代師範（双海隆二第3話） ----------------
  '二刀真剣': {
    act: 'passive',
    passive: { flags: { ignoreStealth: true }, extraActions: 1 },
  },

  // ---------------- 星喰みの使徒（沖田雫第3話）/ 無貌の簒奪者（キョウ第3話） ----------------
  '顔剥ぎ': {
    act: 'attack', tgt: 'ENEMY_ONE',
    atk: { base: 'atkPhys', mod: 1, dmg: 'PHYS' },
    then: [{ act: 'buff', tgt: 'TARGET', buff: { dur: 3, stats: { atkPhys: -2, atkMag: -2 } } }],
  },

  // ---------------- 夢喰らいの司祭（連炎華凛第3話） ----------------
  '夢喰らい': {
    act: 'passive',
    passive: { roundEndMpDrainAll: 2 },
  },

  // ---------------- 無貌の簒奪者（キョウ第3話） ----------------
  '千の貌': {
    act: 'passive',
    passive: { eva: 20 },
  },
  '偽りの貌': {
    act: 'special', tgt: 'ENEMY_ONE', custom: 'charm', immunePassive: '心眼',
  },
  '千の囁き': {
    act: 'attack', tgt: 'ENEMY_AREA',
    atk: { base: 'atkMag', mod: -3, dmg: 'MAG' },
  },
  '虚ろなる抱擁': {
    act: 'attack', tgt: 'ENEMY_ONE',
    atk: { base: 'atkPhys', mod: 3, dmg: 'PHYS' },
  },
  '仮面の盾': {
    act: 'buff', tgt: 'SELF', quick: true,
    buff: { dur: 99, shield: { base: 'atkMag', div: 1 } },
  },
  '貌の付け替え': {
    act: 'heal', tgt: 'SELF',
    heal: { base: 'atkMag', mod: -4 },
  },

  // ---------------- 角に棲む猟犬の主（瞬瞑龍斗第3話） ----------------
  '狩人の嗅覚': {
    act: 'passive',
    passive: { flags: { ignoreStealth: true, alwaysHit: true } },
  },
  '角からの強襲': {
    act: 'attack', tgt: 'ENEMY_ONE',
    atk: { base: 'atkPhys', mod: 3, dmg: 'PHYS' },
    then: [{ act: 'buff', tgt: 'SELF', buff: { dur: 2, flags: { stealth: true } } }],
  },
  '朽ちの牙': {
    act: 'attack', tgt: 'ENEMY_ONE',
    atk: { base: 'atkPhys', mod: 1, dmg: 'PHYS' },
    then: [{ act: 'buff', tgt: 'TARGET', buff: { dur: 3, stats: { speed: -3 } } }],
  },
  '老いの吐息': {
    act: 'buff', tgt: 'ENEMY_AREA',
    buff: { dur: 3, stats: { speed: -2, atkPhys: -2, atkMag: -2 } },
  },
  '群れの遠吠え': {
    act: 'special', tgt: 'NONE', custom: 'summon', summonName: '角より這い出る猟犬',
  },
  '獲物の匂い': {
    act: 'buff', tgt: 'SELF', quick: true,
    buff: { dur: 3, stats: { speed: 3, atkPhys: 3 } },
  },
  '首狩り': {
    act: 'attack', tgt: 'ENEMY_ONE',
    atk: { base: 'atkPhys', mod: 6, dmg: 'PHYS', pierce: true },
  },

  // ---------------- 天より堕ちし色（レイア第3話） ----------------
  '星の落とし子': {
    act: 'passive',
    // HPが半分以下になった時に1度だけ能力が変わる（battle.js checkHalfHp）
    passive: { regen: { hp: 2 }, halfHpOnce: { defPhys: -5, defMag: -5, atkMag: 5 } },
  },
  '灰化の光': {
    act: 'attack', tgt: 'ENEMY_AREA',
    atk: { base: 'atkMag', mod: -3, dmg: 'MAG' },
    then: [{ act: 'buff', tgt: 'ENEMY_AREA', buff: { dur: 2, stats: { speed: -2 } } }],
  },
  '命の吸い上げ': {
    act: 'attack', tgt: 'ENEMY_ONE',
    atk: { base: 'atkMag', mod: 0, dmg: 'MAG' },
    then: [{ act: 'special', custom: 'drainHeal' }],
  },
  '名状しがたき色彩': {
    act: 'buff', tgt: 'ENEMY_AREA',
    buff: { dur: 3, acc: -15 },
  },
  '結晶の棘': {
    act: 'attack', tgt: 'ENEMY_ONE',
    atk: { base: 'atkPhys', mod: 3, dmg: 'PHYS' },
  },
  '地に張る根': {
    act: 'buff', tgt: 'SELF', quick: true,
    buff: { dur: 99, shield: { base: 'defPhys', div: 1 } },
  },
  '開花': {
    act: 'attack', tgt: 'ENEMY_AREA',
    atk: { base: 'atkMag', mod: 4, dmg: 'MAG', pierce: true },
  },
};
