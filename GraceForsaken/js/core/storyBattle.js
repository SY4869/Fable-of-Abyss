// ===================================================================
// ストーリー戦闘のセットアップ生成（DOM 非依存 / tools/simulate.js からも使用）
// ===================================================================

const SUFFIX = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/**
 * ストーリーのボスデータに書かれた専用スキル（名前・コスト・説明）をスキル一覧へ登録する。
 * 効果は js/data/skillLogic.js に定義する。
 */
(function registerStorySkills() {
  if (typeof STORY_MASTER === 'undefined') return;
  STORY_MASTER.forEach(st => st.episodes.forEach(ep => {
    const bd = ep.battle && ep.battle.bossData;
    if (!bd) return;
    Object.keys(bd).forEach(name => (bd[name].skillDefs || []).forEach(def => {
      if (!SKILL_MASTER.some(s => s.id === def.id)) SKILL_MASTER.push(def);
      if (!SKILL_LOGIC[def.id] && typeof console !== 'undefined') {
        console.warn('ボス専用スキル『' + def.id + '』の効果が skillLogic.js にありません');
      }
    }));
  }));
})();

const StoryBattle = {
  /**
   * .md の「○○の使用スキル例」を、その名前のユニット用のアクティブスキル一覧として返す。
   * 名前の記載がない場合はボス用として扱う。
   */
  listedSkills(spec, name, isBoss) {
    if (!spec.bossSkills || !spec.bossSkills.length) return null;
    const owner = spec.skillOwner;
    if (owner ? owner !== name : !isBoss) return null;
    const list = spec.bossSkills.filter(s => {
      const sk = getSkill(s);
      return sk && sk.category !== 'PASSIVE';
    });
    return list.length ? list : null;
  },

  /** ボスデータ（ストーリー/*.md の表）から敵ユニットを作る */
  unitFromBossData(name, label, bd, master, spec, isBoss, rng) {
    const skills = (bd.skills && bd.skills.length ? bd.skills : null) ||
      this.listedSkills(spec, name, isBoss) ||
      (master ? rng.sample(master.skillPool, CONFIG.BOSS.skillCount) : []);
    const u = createUnit({
      charId: master ? master.id : null,
      name: master ? master.name : name,
      flavorName: label,
      portrait: master ? master.portrait : enemyPortrait(name),
      element: bd.element || (master ? master.element : CONFIG.MOB.element),
      range: bd.range || (master ? master.range : CONFIG.MOB.range),
      baseStats: bd.stats,
      passiveSkillId: bd.passive || (master ? master.passiveSkillId : ''),
      skills: skills.filter(s => getSkill(s)),
      side: 'ENEMY', area: 1,
      isBoss: !!isBoss, isMob: !master,
    });
    return u;
  },

  /** stories.js の battle 定義から、戦闘セットアップを組み立てる */
  build(spec, charName) {
    const rng = makeRng(hashString(charName + '|' + spec.title));
    const field = {
      time: spec.time || 'DAY',
      location: spec.location || 'PLAINS',
    };

    const enemies = [];
    let bossUnit = null;

    spec.enemies.forEach(entry => {
      const master = getCharacter(entry.name);
      const bossData = spec.bossData && spec.bossData[entry.name];
      for (let i = 0; i < entry.count; i++) {
        const label = entry.count > 1 ? entry.name + SUFFIX[i] : entry.name;
        let u;
        if (bossData && bossData.stats) {
          // ボスデータがある敵は、表の数値そのまま（ボス補正はかけない）
          u = this.unitFromBossData(entry.name, label, bossData, master, spec, entry.boss, rng);
          if (entry.boss && !bossUnit) bossUnit = u;
          enemies.push(u);
          continue;
        }
        if (master) {
          // 実在キャラがボス／敵として登場する場合
          const skills = this.listedSkills(spec, entry.name, entry.boss) ||
            rng.sample(master.skillPool, entry.boss ? CONFIG.BOSS.skillCount : 3);
          u = unitFromMaster(master, skills, 'ENEMY', 1, { flavorName: label });
        } else {
          // 魔人ベースのモブ
          u = unitMob(label, 'ENEMY', 1, rng);
          if (entry.boss) {
            // ボスモブにはスキルを多めに与える
            const pool = SKILL_MASTER.filter(s => s.category !== 'PASSIVE');
            u.skills = rng.sample(pool, CONFIG.BOSS.skillCount).map(s => s.id);
          }
        }
        if (entry.boss) {
          applyBossScaling(u);
          if (!bossUnit) bossUnit = u;
        }
        enemies.push(u);
      }
    });

    AI.autoPlace(enemies);
    if (bossUnit) bossUnit.area = 2;   // ボスは中衛に据える
    normalizeFront(enemies);

    // ゲストNPC
    const guests = [];
    if (spec.guest) {
      const gm = getCharacter(spec.guest);
      if (gm) {
        const skills = this.listedSkills(spec, gm.name, false) || rng.sample(gm.skillPool, 3);
        const g = unitFromMaster(gm, skills, 'ALLY', 1, { isGuest: true });
        g.area = gm.range >= 3 ? 3 : (gm.range === 2 ? 2 : 1);
        guests.push(g);
      }
    }

    const winCondition = bossUnit
      ? { type: 'DEFEAT_TARGET', targetUid: bossUnit.uid }
      : { type: 'ANNIHILATE' };

    return { field: field, enemies: enemies, guests: guests, winCondition: winCondition };
  },
};
