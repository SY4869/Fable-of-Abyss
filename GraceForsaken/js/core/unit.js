// ===================================================================
// ユニット生成とステータス計算
// ===================================================================

const STAT_KEYS = ['speed', 'atkPhys', 'atkMag', 'defPhys', 'defMag'];

let _uidCounter = 0;
function nextUid() { return 'u' + (++_uidCounter); }

function getSkill(id) {
  return SKILL_MASTER.find(s => s.id === id) || null;
}
function getLogic(id) {
  return SKILL_LOGIC[id] || null;
}
function getCharacter(idOrName) {
  return CHARACTER_MASTER.find(c => c.id === idOrName || c.name === idOrName) || null;
}

function emptyStats() {
  return { hp: 0, mp: 0, speed: 0, atkPhys: 0, atkMag: 0, defPhys: 0, defMag: 0 };
}

/**
 * 戦闘ユニットを生成する。
 * @param {object} opt
 *   name, element, range, baseStats, passiveSkillId, skills[], side, area,
 *   isMob, isBoss, isGuest, charId, flavorName
 */
function createUnit(opt) {
  const base = Object.assign(emptyStats(), opt.baseStats);
  const u = {
    uid: nextUid(),
    charId: opt.charId || null,
    name: opt.name,
    displayName: opt.flavorName || opt.name,
    portrait: opt.portrait || '',  // 立ち絵ファイル名（img/立ち絵/<portrait>.png）
    element: opt.element || 'NONE',
    range: opt.range || 1,
    base: base,
    perm: emptyStats(),          // 戦闘中の永続強化（シリアルキラー等）
    maxHp: base.hp,
    maxMp: base.mp,
    hp: base.hp,
    mp: base.mp,
    shield: 0,
    side: opt.side,              // 'ALLY' | 'ENEMY'
    area: opt.area || 1,         // 自陣内 1(前衛)〜3(後衛)
    passiveId: opt.passiveSkillId || '',
    skills: (opt.skills || []).slice(),
    buffs: [],
    alive: true,
    isMob: !!opt.isMob,
    isBoss: !!opt.isBoss,
    isGuest: !!opt.isGuest,
    isPlayerControlled: opt.side === 'ALLY',   // ストーリーのゲストもプレイヤーが操作する
    brainwashed: false,
    doom: 0,                     // リーサルカウント残ラウンド（0=なし）
    kills: 0,
    alliesLost: 0,
    tookDamageThisRound: false,
    tookDamageLastRound: false,
    undyingUsed: false,
    usedEndureStoryFree: false,
    extraActionsUsedThisRound: 0,
  };
  return u;
}

/** マスターデータからプレイヤー／NPCキャラを生成 */
function unitFromMaster(master, skills, side, area, opt) {
  opt = opt || {};
  return createUnit({
    charId: master.id,
    name: master.name,
    flavorName: opt.flavorName,
    portrait: master.portrait,
    element: master.element,
    range: master.range,
    baseStats: master.baseStats,
    passiveSkillId: master.passiveSkillId,
    skills: skills && skills.length ? skills : master.skillPool.slice(0, 3),
    side: side,
    area: area,
    isGuest: !!opt.isGuest,
    isBoss: !!opt.isBoss,
  });
}

/**
 * 敵の立ち絵を名前から探す（「星蝕の根獣A」→「星蝕の根獣」）。無ければ魔人の立ち絵。
 * 一覧は tools/build_faces.py が js/data/portraits.js に書き出す。
 */
function enemyPortrait(name) {
  const list = typeof PORTRAIT_LIST !== 'undefined' ? PORTRAIT_LIST : [];
  const base = String(name || '').replace(/[A-H]$/, '');
  if (list.indexOf(base) >= 0) return base;
  // 名前の一部が立ち絵名と一致すれば使う（「角より這い出る猟犬」→「猟犬」）。長く一致するものを優先
  const hit = list.filter(k => /[^\x00-\x7f]/.test(k) && k !== '魔人' && base.indexOf(k) >= 0)
    .sort((a, b) => b.length - a.length)[0];
  if (hit) return hit;
  return list.indexOf('魔人') >= 0 ? '魔人' : '';
}

/** 「魔人ベース」のモブ敵を生成 */
function unitMob(flavorName, side, area, rng) {
  const pool = SKILL_MASTER.filter(s => s.category !== 'PASSIVE');
  const picked = rng.sample(pool, CONFIG.MOB.skillCount).map(s => s.id);
  const m = CONFIG.MOB;
  return createUnit({
    name: '魔人',
    flavorName: flavorName || '魔人',
    portrait: enemyPortrait(flavorName),
    element: m.element,
    range: m.range,
    baseStats: { hp: m.hp, mp: m.mp, speed: m.speed, atkPhys: m.atkPhys, atkMag: m.atkMag, defPhys: m.defPhys, defMag: m.defMag },
    passiveSkillId: '',
    skills: picked,
    side: side, area: area, isMob: true,
  });
}

/** ボス補正を適用する */
function applyBossScaling(unit) {
  const b = CONFIG.BOSS;
  unit.isBoss = true;
  unit.base.hp = unit.base.hp * b.hpMult;
  STAT_KEYS.forEach(k => { unit.base[k] += b.statBonus; });
  unit.base.mp += b.statBonus * 3;
  unit.range += b.rangeBonus;
  unit.maxHp = unit.base.hp;
  unit.maxMp = unit.base.mp;
  unit.hp = unit.maxHp;
  unit.mp = unit.maxMp;
  return unit;
}

// -------------------------------------------------------------------
// パッシブ取得
// -------------------------------------------------------------------
function passiveOf(unit) {
  if (!unit.passiveId) return null;
  const lg = getLogic(unit.passiveId);
  return lg && lg.passive ? lg.passive : null;
}

/** ユニットが持つフラグ（パッシブ＋バフ）をまとめて取得 */
function unitFlags(unit) {
  const flags = {};
  const p = passiveOf(unit);
  if (p && p.flags) Object.assign(flags, p.flags);
  unit.buffs.forEach(b => { if (b.flags) Object.assign(flags, b.flags); });
  return flags;
}

function hasFlag(unit, key) {
  return !!unitFlags(unit)[key];
}

// -------------------------------------------------------------------
// ステータス計算
// -------------------------------------------------------------------
/**
 * 補正込みの現在ステータスを返す。
 * 加算順: 基礎 + 永続強化 + パッシブ + バフ/デバフ + フィールド → 倍率 → 下限1
 */
function stats(unit, field) {
  field = field || { time: 'DAY', location: 'PLAINS' };
  const night = field.time === 'NIGHT';
  const s = {};
  STAT_KEYS.forEach(k => { s[k] = unit.base[k] + unit.perm[k]; });

  const add = (src) => {
    if (!src) return;
    STAT_KEYS.forEach(k => { if (src[k]) s[k] += src[k]; });
  };

  // --- パッシブ ---
  const p = passiveOf(unit);
  if (p) {
    if (p.cond === 'NIGHT') {
      if (night) { add(p.stats); }
    } else {
      add(p.stats);
    }
    if (night) add(p.nightStats);
    if (p.statsUnlessNight && !night) add(p.statsUnlessNight);
  }

  // --- バフ・デバフ ---
  unit.buffs.forEach(b => {
    add(b.stats);
    if (night) add(b.nightStats);
  });

  // --- フィールド ---
  add(fieldStatBonus(field, unit.element));

  // --- 倍率系 ---
  const flags = unitFlags(unit);
  if (flags.atkPhysHalf) s.atkPhys = Math.floor(s.atkPhys / 2);
  if (p && p.gentleOni && unit._allAlliesFullHp) {
    s.atkPhys = Math.floor(s.atkPhys / 2);
    s.atkMag = Math.floor(s.atkMag / 2);
  }
  if (p && p.gentleOni && unit.alliesLost > 0) {
    STAT_KEYS.forEach(k => { if (p.gentleOni.perKill[k]) s[k] += p.gentleOni.perKill[k] * unit.alliesLost; });
  }

  // --- 加算系パッシブ（他ステータス参照） ---
  if (p && p.magicBow) s.atkPhys += Math.floor(s.atkMag / 2);
  if (p && p.singingMuscle && !unit.tookDamageLastRound) s.atkPhys += Math.floor(s.defPhys / 2);

  // --- 下限1（HP/MPを除く） ---
  STAT_KEYS.forEach(k => { if (s[k] < 1) s[k] = 1; });
  return s;
}

/** 基礎回避率（％） */
function evasionRate(unit, field, isRangedAttack) {
  const s = stats(unit, field);
  let eva = Math.floor(s.speed / CONFIG.EVASION_DIVISOR);
  const p = passiveOf(unit);
  if (p && p.eva) eva += p.eva;
  if (p && p.evaVsRanged && isRangedAttack) eva += p.evaVsRanged;
  unit.buffs.forEach(b => { if (b.eva) eva += b.eva; });
  return eva;
}

/** 命中補正（％） */
function accuracyBonus(unit, field) {
  let acc = 0;
  const p = passiveOf(unit);
  if (p && p.acc) acc += p.acc;
  unit.buffs.forEach(b => { if (b.acc) acc += b.acc; });
  acc += fieldAccuracyBonus(field, unit.element);
  return acc;
}

/** このユニットが1ラウンドに行動できる回数 */
function actionCount(unit) {
  let n = 1;
  const p = passiveOf(unit);
  if (p && p.extraActions) n += p.extraActions;
  const flags = unitFlags(unit);
  if (flags.extraActions) n += flags.extraActions;
  return n;
}

/** スキルの実コスト（心頭滅却・花鳥風月・ブラッドマジック考慮） */
function skillCost(unit, skillId) {
  const sk = getSkill(skillId);
  const lg = getLogic(skillId);
  if (!sk) return { mp: 0, hp: 0 };
  const p = passiveOf(unit);
  let mp = sk.costMp;
  if (p && p.costReduce) mp = Math.max(0, mp - p.costReduce);
  let hp = (lg && lg.costHp) || 0;
  if (p && p.bloodNoHpCost && lg && lg.blood) hp = 0;
  return { mp: mp, hp: hp };
}

function canPayCost(unit, skillId) {
  const c = skillCost(unit, skillId);
  return unit.mp >= c.mp && unit.hp > c.hp;
}

/** 隠密状態か（単体攻撃の対象にならない） */
function isStealthed(unit) {
  return !!unitFlags(unit).stealth;
}

function hpRatio(unit) {
  return unit.maxHp > 0 ? unit.hp / unit.maxHp : 0;
}

/**
 * 前衛（エリア1）に生存ユニットがいなければ、全員を1マスずつ前進させる。
 * 中衛も空なら後衛がそのまま前衛まで上がる。前進させたら true を返す。
 */
function normalizeFront(units) {
  const alive = units.filter(u => u.alive !== false);
  let shifted = false;
  while (alive.length && !alive.some(u => u.area === 1)) {
    alive.forEach(u => { u.area = Math.max(1, u.area - 1); });
    shifted = true;
  }
  return shifted;
}
