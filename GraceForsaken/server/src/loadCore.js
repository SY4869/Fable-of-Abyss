// ===================================================================
// ゲーム本体の戦闘ロジック（js/core・js/data）をサーバーで読み込む
// tools/simulate.js と同じく vm で読み込み、ブラウザと同じコードを動かす。
// DOM・音声に依存するファイル（js/ui/*, js/core/audio.js）は読み込まない。
// ===================================================================
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const FILES = [
  'js/core/config.js',
  'js/data/skills.js',
  'js/data/characters.js',
  'js/data/stories.js',
  'js/data/portraits.js',
  'js/data/skillLogic.js',
  'js/core/util.js',
  'js/core/unit.js',
  'js/core/battle.js',
  'js/core/ai.js',
  'js/core/actions.js',
  'js/core/save.js',        // ゴースト（BOT）のパーティ生成を使う
  'js/net/protocol.js',
];

// vm では const / class がコンテキストのプロパティにならないため、明示的に取り出す
const EXPORTS = [
  'CONFIG', 'ELEMENTS', 'FIELD_TIME', 'FIELD_LOCATION', 'AREA_LABEL',
  'SKILL_MASTER', 'CHARACTER_MASTER', 'SKILL_LOGIC',
  'Battle', 'AI', 'BattleActions', 'Ghost', 'PVP_PROTOCOL',
  'makeRng', 'getSkill', 'getLogic', 'getCharacter', 'unitFromMaster', 'unitMob',
  'stats', 'normalizeFront', 'hpRatio',
];

function loadCore() {
  const sandbox = { console: console, Math: Math, Date: Date, JSON: JSON, setTimeout: setTimeout, clearTimeout: clearTimeout };
  vm.createContext(sandbox);
  FILES.forEach(f => {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    vm.runInContext(src, sandbox, { filename: f });
  });
  return vm.runInContext('({' + EXPORTS.join(',') + '})', sandbox);
}

module.exports = { loadCore, ROOT };
