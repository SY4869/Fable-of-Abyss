// ===================================================================
// プレイヤーデータ（localStorage 永続化）
// ===================================================================

const SAVE_KEY = 'graceforsaken.save.v1';
const SAVE_VERSION = 2;

// セーブ v1 当時のキャラID → キャラ名（データ一覧.xlsx の並び替えで ID が変わったため）
const V1_CHAR_IDS = {
  1: 'レイア', 2: 'アリシア', 3: 'クレア', 4: 'ソフィア', 5: '沖田雫', 6: '瞬瞑龍斗',
  7: '双海隆二', 8: '連炎華凛', 9: 'キョウ', 10: '切裂狂子', 11: '切裂劣子', 12: 'ネストル',
  13: 'ロナ', 14: 'アレクトロス', 15: 'ミリア', 16: 'セレス', 17: 'アネシア', 18: 'ディアナ',
  19: 'リリアーネ', 20: '緋天飛鳥', 21: 'アステル', 22: 'イレイナ', 23: 'アン', 24: 'シェリーニ',
  25: 'リサ', 26: 'ブラド', 27: 'フレア', 28: '鬼羅瑠', 29: 'テレス', 30: 'カオス',
};

const Save = {
  data: null,

  newGame() {
    return {
      version: SAVE_VERSION,
      playerName: '',
      settings: { bgm: 0.5, se: 0.7, cutin: true },
      tutorialDone: false,
      currency: CONFIG.START_CURRENCY,
      /** owned: { [charId]: { skills:[3], placement:1..3 } } */
      owned: {},
      party: [],               // charId の配列（最大4）
      defenseParty: [],        // 対戦モードの防衛パーティ
      defensePlacement: {},    // { charId: area }
      storyProgress: {},       // { キャラ名: 到達話数(クリア済み話数) }
      pvpRecord: { win: 0, lose: 0, draw: 0 },   // ゴースト対戦の戦績（勝率の計算に使う）
      // リアルタイム対戦（ゴースト対戦の勝率には含めない）
      pvp: { userId: '', stats: { win: 0, lose: 0, draw: 0 }, grantedMatchIds: [], session: null },
      gachaCount: 0,
    };
  },

  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      this.data = raw ? JSON.parse(raw) : this.newGame();
    } catch (e) {
      console.warn('セーブデータの読み込みに失敗しました。新規作成します。', e);
      this.data = this.newGame();
    }
    if (this.data && this.data.version === 1) this.data = this.migrateV1(this.data);
    if (!this.data || this.data.version !== SAVE_VERSION) this.data = this.newGame();
    // 後から追加した項目の補完
    const fresh = this.newGame();
    Object.keys(fresh).forEach(k => { if (this.data[k] === undefined) this.data[k] = fresh[k]; });
    this.data.settings = Object.assign({}, fresh.settings, this.data.settings);
    return this.data;
  },

  /** v1 → v2: キャラIDを名前経由で新しいIDへ付け替える */
  migrateV1(old) {
    const idOf = (oldId) => {
      const m = getCharacter(V1_CHAR_IDS[oldId]);
      return m ? m.id : null;
    };
    const mapList = (list) => (list || []).map(idOf).filter(id => id !== null);
    const owned = {};
    Object.keys(old.owned || {}).forEach(k => {
      const id = idOf(Number(k));
      if (id !== null) owned[id] = old.owned[k];
    });
    const placement = {};
    Object.keys(old.defensePlacement || {}).forEach(k => {
      const id = idOf(Number(k));
      if (id !== null) placement[id] = old.defensePlacement[k];
    });
    return Object.assign({}, old, {
      version: SAVE_VERSION,
      owned: owned,
      party: mapList(old.party),
      defenseParty: mapList(old.defenseParty),
      defensePlacement: placement,
    });
  },

  save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.data));
    } catch (e) {
      console.warn('セーブに失敗しました（ブラウザの設定を確認してください）。', e);
    }
  },

  reset() {
    this.data = this.newGame();
    this.save();
  },

  // ---------------- 所持キャラ ----------------
  isOwned(charId) { return !!this.data.owned[charId]; },
  ownedList() {
    return CHARACTER_MASTER.filter(c => this.isOwned(c.id));
  },
  ownedCount() { return Object.keys(this.data.owned).length; },

  /** キャラを獲得する。既に所持していれば通貨に変換。 */
  acquire(charId, rng) {
    const master = getCharacter(charId);
    if (!master) return { ok: false };
    if (this.isOwned(charId)) {
      const refund = Math.floor(CONFIG.GACHA_COST / 3);
      this.data.currency += refund;
      this.save();
      return { ok: true, duplicate: true, refund: refund, master: master };
    }
    const r = rng || makeRng(Date.now());
    // 初期スキル: 候補6種からランダムで3種
    const skills = r.sample(master.skillPool, 3);
    this.data.owned[charId] = { skills: skills, placement: master.range >= 3 ? 3 : (master.range === 2 ? 2 : 1) };
    if (this.data.party.length < CONFIG.PARTY_SIZE) this.data.party.push(charId);
    this.save();
    return { ok: true, duplicate: false, skills: skills, master: master };
  },

  /** 習得スキルを任意の3種に振り直す（通貨消費） */
  rerollSkills(charId, newSkills) {
    if (!this.isOwned(charId)) return { ok: false, msg: '未所持です' };
    if (newSkills.length !== 3) return { ok: false, msg: '3種類を選んでください' };
    if (this.data.currency < CONFIG.SKILL_REROLL_COST) {
      return { ok: false, msg: CONFIG.CURRENCY_NAME + 'が足りません' };
    }
    this.data.currency -= CONFIG.SKILL_REROLL_COST;
    this.data.owned[charId].skills = newSkills.slice();
    this.save();
    return { ok: true };
  },

  // ---------------- 通貨 ----------------
  addCurrency(n) { this.data.currency += n; this.save(); },
  spend(n) {
    if (this.data.currency < n) return false;
    this.data.currency -= n;
    this.save();
    return true;
  },

  // ---------------- パーティ ----------------
  setParty(list) {
    this.data.party = list.slice(0, CONFIG.PARTY_SIZE);
    this.save();
  },
  partyMasters() {
    return this.data.party.map(id => getCharacter(id)).filter(Boolean);
  },
  setPlacement(charId, area) {
    if (this.data.owned[charId]) { this.data.owned[charId].placement = area; this.save(); }
  },
  placementOf(charId) {
    const o = this.data.owned[charId];
    return o ? (o.placement || 1) : 1;
  },
  skillsOf(charId) {
    const o = this.data.owned[charId];
    if (o && o.skills && o.skills.length) return o.skills;
    const m = getCharacter(charId);
    return m ? m.skillPool.slice(0, 3) : [];
  },

  // ---------------- ストーリー ----------------
  storyCleared(charName) { return this.data.storyProgress[charName] || 0; },
  isEpisodeUnlocked(charName, epNo) { return epNo <= this.storyCleared(charName) + 1; },
  clearEpisode(charName, epNo) {
    const before = this.storyCleared(charName);
    const first = epNo > before;
    if (first) this.data.storyProgress[charName] = epNo;
    let reward = CONFIG.REWARD.storyEpisode;
    if (first) reward += CONFIG.REWARD.storyFirstClearBonus;
    this.data.currency += reward;
    this.save();
    return { firstClear: first, reward: reward };
  },

  // ---------------- プレイヤー ----------------
  setPlayerName(name) {
    this.data.playerName = String(name || '').trim().slice(0, 12);
    this.save();
  },
  playerName() { return this.data.playerName || 'Player'; },
  setVolume(kind, v) {
    this.data.settings[kind] = Math.max(0, Math.min(1, v));
    this.save();
  },

  // ---------------- 対戦 ----------------
  setDefenseParty(list) { this.data.defenseParty = list.slice(0, CONFIG.PARTY_SIZE); this.save(); },
  recordPvp(result) {
    if (result === 'WIN') this.data.pvpRecord.win++;
    else if (result === 'LOSE') this.data.pvpRecord.lose++;
    else this.data.pvpRecord.draw++;
    this.data.currency += result === 'WIN' ? CONFIG.REWARD.pvpWin : CONFIG.REWARD.pvpLose;
    this.save();
  },
  // ---------------- リアルタイム対戦 ----------------
  pvp() {
    const fresh = this.newGame().pvp;
    this.data.pvp = Object.assign(fresh, this.data.pvp);
    return this.data.pvp;
  },
  /** 試合の報酬と戦績を反映する。同じ試合で二重に受け取らない。戻り値: 付与したか */
  grantPvpResult(res) {
    const pvp = this.pvp();
    if (pvp.grantedMatchIds.indexOf(res.matchId) >= 0) return false;
    pvp.grantedMatchIds.push(res.matchId);
    if (pvp.grantedMatchIds.length > 20) pvp.grantedMatchIds.splice(0, pvp.grantedMatchIds.length - 20);
    if (pvp.stats[res.result] !== undefined) pvp.stats[res.result]++;
    this.data.currency += (res.reward && res.reward.soul) || 0;
    this.save();
    return true;
  },
  setPvpSession(sess) {
    this.pvp().session = sess ? Object.assign({ savedAt: Date.now() }, sess) : null;
    this.save();
  },

  /** 勝率（%）。未対戦なら null */
  winRate() {
    const r = this.data.pvpRecord;
    const total = r.win + r.lose + r.draw;
    return total ? (r.win / total) * 100 : null;
  },
};

// ===================================================================
// ガチャ
// ===================================================================
const Gacha = {
  /** 未所持を優先しつつ、全キャラから抽選する */
  draw(rng) {
    const all = CHARACTER_MASTER;
    const unowned = all.filter(c => !Save.isOwned(c.id));
    // 未所持がある間は 80% の確率で未所持から出す（天井なしの緩い救済）
    const pool = (unowned.length && rng.chance(80)) ? unowned : all;
    const picked = rng.pick(pool);
    Save.data.gachaCount++;
    return Save.acquire(picked.id, rng);
  },

  pull(count) {
    const rng = makeRng(Date.now() ^ (Save.data.gachaCount * 2654435761));
    const cost = count === 1
      ? CONFIG.GACHA_COST
      : Math.floor(CONFIG.GACHA_COST * count * CONFIG.GACHA_MULTI_DISCOUNT);
    if (!Save.spend(cost)) return { ok: false, msg: CONFIG.CURRENCY_NAME + 'が足りません（必要: ' + cost + '）' };
    const results = [];
    for (let i = 0; i < count; i++) results.push(this.draw(rng));
    Save.save();
    return { ok: true, results: results, cost: cost };
  },
};

// ===================================================================
// 非同期対戦（ゴースト）
// ===================================================================
const Ghost = {
  /** 疑似的な他プレイヤーの防衛パーティを生成する */
  generate(seed, baseRate) {
    const rng = makeRng(seed);
    const names = ['深淵の追跡者', '黄昏の巡礼者', '星喰みの徒', '名もなき挑戦者',
      '灰燼の守り手', '虚無を歩む者', '狂気の観測者', '銀嶺の剣客'];
    const members = rng.sample(CHARACTER_MASTER, CONFIG.PARTY_SIZE);
    // 自分の勝率に近いプレイヤーを擬似的に選出する（±4%）
    const base = baseRate === null || baseRate === undefined ? 50 : baseRate;
    const rate = Math.max(0, Math.min(100, base + (rng.next() * 8 - 4)));
    return {
      name: rng.pick(names),
      winRate: Math.round(rate * 10) / 10,
      members: members.map(m => ({
        charId: m.id,
        skills: rng.sample(m.skillPool, 3),
      })),
      seed: seed,
    };
  },

  /** 自分の防衛パーティ（対戦相手からはこう見える） */
  myDefense() {
    const list = Save.data.defenseParty.length ? Save.data.defenseParty : Save.data.party;
    return {
      name: 'あなたの防衛隊',
      members: list.map(id => ({ charId: id, skills: Save.skillsOf(id) })),
    };
  },
};
