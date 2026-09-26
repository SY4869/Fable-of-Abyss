// ===================================================================
// BOT（マッチングで相手が見つからなかったときの対戦相手）
// パーティはゴースト対戦と同じ生成処理（js/core/save.js の Ghost）で作り、
// 配置は CPU と同じ自動配置、行動は js/core/ai.js で決める。
// ===================================================================
'use strict';

function createBotPlayer(core, seed) {
  const ghost = core.Ghost.generate(seed, null);
  // 自動配置（射程・打たれ強さで前後に振り分け）
  const units = ghost.members.map(m => core.unitFromMaster(core.getCharacter(m.charId), m.skills, 'ENEMY', 1));
  core.AI.autoPlace(units);
  return {
    name: ghost.name,
    party: ghost.members.map((m, i) => ({ charId: m.charId, skills: m.skills.slice(), area: units[i].area })),
  };
}

/** BOT が行動するまでの待ち時間（人間らしく見せるため） */
function botThinkMs(core, rng) {
  const [min, max] = core.CONFIG.PVP.BOT_THINK_MS;
  return Math.round(min + rng() * (max - min));
}

module.exports = { createBotPlayer, botThinkMs };
