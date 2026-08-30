// ChaosSwordGarden - エントリポイント
//
// 画面遷移:
//   セットアップ → [戦闘 → 決着 → インターバル(流派選択/スキル交換)] × N → マッチ結果
//
// モード:
//   勝ち抜き … 要件定義.md 準拠の全5戦（+条件付き6戦目の裏ボス）
//   自由対戦 … 任意の相手と1戦だけ（動作確認用）

'use strict';

import { calculateBaseStats, STAT_POINT_POOL, SKILLS, CHARACTERS } from './data.js';
import { Fighter } from './models.js';
import { BattleRound, BattleMatch, SCHOOLS, SECRET_BOSS_ROUND } from './battle-engine.js';
import { AIController } from './ai.js';
import { InputHandler, KeyConfig, ACTIONS, SKILL_ACTION_IDS, keyLabel, isReservedKey } from './input.js';
import { BattleUI } from './ui.js';
import { SoundManager, bgmKeyForBattle, bgmKeyForDialogue } from './sound.js';
import { Ranking } from './ranking.js';
import {
  getOpeningLines, getDefeatLines, getSceneHeader,
  SECRET_BOSS_UNLOCK_SCENE, ENDING_ROLL, isInnerVoice,
} from './story.js';
import { canActivateSkill } from './skill-effects.js';

const NO_SWAP = '__none__';

const el = (id) => document.getElementById(id);

const dom = {
  setup: el('setup'),
  battle: el('battle'),
  interval: el('interval'),
  matchResult: el('match-result'),

  ptHp: el('pt-hp'),
  ptAtk: el('pt-atk'),
  ptSpd: el('pt-spd'),
  ptRemaining: el('pt-remaining'),
  previewHp: el('preview-hp'),
  previewAtk: el('preview-atk'),
  previewSpd: el('preview-spd'),
  setupSteps: el('setup-steps'),
  step1Next: el('step1-next'),
  step2Next: el('step2-next'),
  step2Back: el('step2-back'),
  step3Back: el('step3-back'),
  step2Error: el('step2-error'),
  statSliders: { hp: el('slider-hp'), atk: el('slider-atk'), spd: el('slider-spd') },
  equipSlots: el('equip-slots'),
  equipFilter: el('equip-filter'),
  equipPicker: el('equip-picker'),
  freeEnemyBlock: el('free-enemy-block'),
  enemySelect: el('enemy-select'),
  enemyInfo: el('enemy-info'),
  startButton: el('start-button'),
  setupError: el('setup-error'),

  roundIndicator: el('round-indicator'),
  resultOverlay: el('result-overlay'),
  resultText: el('result-text'),
  resultNote: el('result-note'),
  retryButton: el('retry-button'),

  schoolBlock: el('school-block'),
  schoolChoices: el('school-choices'),
  swapSlotSelect: el('swap-slot-select'),
  rewardSelect: el('reward-select'),
  rewardDesc: el('reward-desc'),
  nextEnemyInfo: el('next-enemy-info'),
  nextBattleButton: el('next-battle-button'),
  intervalError: el('interval-error'),

  keyConfigList: el('key-config'),
  keyConfigNote: el('keyconfig-note'),
  keyConfigReset: el('keyconfig-reset'),
  keyGuide: el('key-guide'),
  muteButton: el('mute-button'),
  appHeader: el('app-header'),
  title: el('title'),
  titleStart: el('title-start'),
  titleOptions: el('title-options'),
  titleSkills: el('title-skills'),
  titleRanking: el('title-ranking'),

  playerName: el('player-name'),
  nameBlock: el('name-block'),

  ending: el('ending'),
  endingScene: el('ending-scene'),
  endingRoll: el('ending-roll'),

  rankingScreen: el('ranking'),
  rankingList: el('ranking-list'),
  rankingEmpty: el('ranking-empty'),
  rankingDetail: el('ranking-detail'),
  rankingBack: el('ranking-back'),

  matchRankResult: el('match-rank-result'),
  matchRankMessage: el('match-rank-message'),
  matchRankingList: el('match-ranking-list'),
  resultToTitle: el('result-to-title'),

  options: el('options'),
  optionsBack: el('options-back'),
  bgmVolume: el('bgm-volume'),
  bgmVolumeValue: el('bgm-volume-value'),
  seVolume: el('se-volume'),
  seVolumeValue: el('se-volume-value'),
  seTest: el('se-test'),

  skillList: el('skill-list'),
  skillCount: el('skill-count'),
  skillFilter: el('skill-filter'),
  skillTable: el('skill-table'),
  skillsBack: el('skills-back'),

  resultScore: el('result-score'),
  scoreValue: el('score-value'),
  scoreBreakdown: el('score-breakdown'),
  continueButton: el('continue-button'),
  matchScoreValue: el('match-score-value'),
  matchContinueNote: el('match-continue-note'),
  story: el('story'),
  storyScene: el('story-scene'),
  storyBg: document.querySelector('#story-scene .story-bg'),
  storyPortrait: el('story-portrait'),
  storySubtitle: el('story-subtitle'),
  storyPlace: el('story-place'),
  storyWindow: el('story-window'),
  storySpeaker: el('story-speaker'),
  storyText: el('story-text'),
  matchResultTitle: el('match-result-title'),
  matchHistory: el('match-history'),
  restartButton: el('restart-button'),
  setupBack: el('setup-back'),
  intervalBack: el('interval-back'),
};

const ui = new BattleUI({
  playerHud: el('player-panel'),
  enemyHud: el('enemy-panel'),
  enemyActor: el('enemy-actor'),
  playerPopups: el('player-popups'),
  playerWeapon: el('player-weapon'),
  playerAura: el('player-aura'),
  hitVignette: el('hit-vignette'),
  skillBar: el('skill-bar'),
  log: el('log'),
  stage: el('stage'),
  stageBg: document.querySelector('#stage .stage-bg'),
  laneField: el('lane-field'),
  playerLanes: document.querySelector('[data-role="player-lanes"]'),
  enemyLanes: document.querySelector('[data-role="enemy-lanes"]'),
});

const keyConfig = new KeyConfig();
const ranking = new Ranking();
const input = new InputHandler(keyConfig);
const sound = new SoundManager();

/** 進行中のマッチ（自由対戦モードでは null） */
let match = null;
/** 進行中の1戦闘のループ状態 */
let session = null;
/** インターバル画面で選択中の流派 */
let pendingSchool = null;
/** ランキングに記録する挑戦者名 */
let playerName = '名無し';
/** ランキングに残すためのステータス振り分け（開始時に控える） */
let matchPoints = { hp: 0, atk: 0, spd: 0 };

const selectedMode = () => document.querySelector('input[name="mode"]:checked').value;

/** 現在表示している画面（BGMの選択に使う） */
let currentScreen = 'title';

function showScreen(name) {
  const screens = {
    title: dom.title, setup: dom.setup, battle: dom.battle,
    interval: dom.interval, result: dom.matchResult, story: dom.story,
    options: dom.options, skills: dom.skillList, ranking: dom.rankingScreen,
    ending: dom.ending,
  };
  for (const [key, node] of Object.entries(screens)) {
    node.classList.toggle('hidden', key !== name);
  }
  // タイトル画面ではロゴが絵の中にあるので、ページ見出しは隠す
  dom.appHeader.classList.toggle('on-title', name === 'title');

  currentScreen = name;
  applyScreenBgm(name);
}

/**
 * 画面に応じたBGMを流す。
 * 戦闘中の曲は setupSession が決めるので、ここでは触らない。
 */
function applyScreenBgm(name) {
  if (!audioUnlocked) return;
  switch (name) {
    case 'title':
      sound.playBgm('title');
      break;
    case 'setup':
    case 'options':
    case 'skills':
    case 'ranking':
    case 'interval':
      sound.playBgm('menu');
      break;
    // story は会話ごとに曲が変わるので playStory 側で指定する
    case 'ending':
      sound.playBgm('ending');
      break;
    case 'result':
      // エンディング曲は裏ボス(6戦目)を倒した完全クリア時のみ。
      // エンドロールから続けて流したいので、結果画面でも止めずに鳴らす
      if (match?.lastResultIsWin && match.roundNumber >= SECRET_BOSS_ROUND) sound.playBgm('ending');
      else sound.stopBgm();
      break;
    default:
      break; // battle は setupSession 側で決める
  }
}

/**
 * ブラウザは操作前に音を鳴らせないため、最初のクリック／キー入力を待って
 * その時点の画面のBGMを流し始める。
 */
let audioUnlocked = false;

function unlockAudio() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  applyScreenBgm(currentScreen);
}

/* =========================================================
 * ストーリー再生（ストーリー.md のセリフ）
 * =======================================================*/

/** 再生中のシーン。null なら再生していない */
let storyScene = null;

/**
 * セリフを1行ずつ表示する。読み終えたら onComplete を呼ぶ。
 * @param {{speaker:string, text:string}[]} lines
 * @param {{characterName?: string, roundNumber?: number, onComplete: () => void}} options
 *   roundNumber … その会話が紐づく戦闘番号（BGMの選択に使う）
 */
function playStory(lines, { characterName = null, roundNumber = 1, onComplete }) {
  if (!lines || lines.length === 0) {
    onComplete();
    return;
  }

  const character = characterName ? CHARACTERS[characterName] : null;
  const header = characterName ? getSceneHeader(characterName) : null;

  dom.storySubtitle.textContent = header?.subtitle ?? '';
  dom.storyPlace.textContent = header?.place ?? '';
  dom.storyBg.style.backgroundImage = character?.background ? `url('${character.background}')` : '';
  if (character?.portrait) {
    dom.storyPortrait.src = character.portrait;
    dom.storyPortrait.classList.remove('hidden-portrait');
  } else {
    dom.storyPortrait.classList.add('hidden-portrait');
  }

  storyScene = { lines, index: 0, onComplete };
  renderStoryLine();
  showScreen('story');
  // 会話中は専用BGM。裏ボス戦の会話だけ別曲になる
  sound.playBgm(bgmKeyForDialogue(roundNumber));
}

function renderStoryLine() {
  const { lines, index } = storyScene;
  const line = lines[index];
  dom.storySpeaker.textContent = line.speaker;
  dom.storyText.textContent = line.text;
  dom.storyWindow.classList.toggle('inner', isInnerVoice(line.speaker));
}

/** 次のセリフへ。最後まで来たらシーンを終える */
function advanceStory() {
  if (!storyScene) return;
  storyScene.index += 1;
  if (storyScene.index >= storyScene.lines.length) {
    finishStory();
    return;
  }
  renderStoryLine();
}

/** 残りを飛ばして次へ進む */
function skipStory() {
  if (storyScene) finishStory();
}

function finishStory() {
  const { onComplete } = storyScene;
  storyScene = null;
  onComplete();
}

function initStoryUI() {
  dom.storyScene.addEventListener('click', advanceStory);
  window.addEventListener('keydown', (e) => {
    if (!storyScene) return;
    if (e.code === 'Escape') {
      e.preventDefault();
      skipStory();
    } else if (e.code === 'Enter' || e.code === 'Space') {
      e.preventDefault();
      advanceStory();
    }
  });
}

/* =========================================================
 * セットアップ画面
 * =======================================================*/

function initSetupScreen() {
  dom.enemySelect.innerHTML = Object.values(CHARACTERS)
    .map((c) => `<option value="${c.name}">${c.name}（${c.timing}）</option>`)
    .join('');
  dom.enemySelect.addEventListener('change', renderEnemyInfo);

  // 数値入力とスライダーは同じ値を指す。どちらを動かしても互いに追従させる
  for (const [key, inputEl] of Object.entries({ hp: dom.ptHp, atk: dom.ptAtk, spd: dom.ptSpd })) {
    const slider = dom.statSliders[key];
    inputEl.addEventListener('input', () => { slider.value = inputEl.value; validateSetup(); });
    slider.addEventListener('input', () => { inputEl.value = slider.value; validateSetup(); });
  }

  // ステップ移動
  dom.step1Next.addEventListener('click', () => showSetupStep(2));
  dom.step2Next.addEventListener('click', () => { if (validateStats()) showSetupStep(3); });
  dom.step2Back.addEventListener('click', () => showSetupStep(1));
  dom.step3Back.addEventListener('click', () => showSetupStep(2));
  initEquipUI();
  for (const radio of document.querySelectorAll('input[name="mode"]')) {
    radio.addEventListener('change', onModeChange);
  }

  dom.muteButton.addEventListener('click', () => {
    const muted = !sound.muted;
    sound.setMuted(muted);
    dom.muteButton.textContent = muted ? '♪ OFF' : '♪ ON';
    dom.muteButton.classList.toggle('muted', muted);
  });

  dom.startButton.addEventListener('click', onStart);
  dom.retryButton.addEventListener('click', onResultButton);
  dom.nextBattleButton.addEventListener('click', onNextBattle);
  dom.restartButton.addEventListener('click', returnToSetup);
  dom.swapSlotSelect.addEventListener('change', onSwapSelectionChange);
  dom.rewardSelect.addEventListener('change', onSwapSelectionChange);

  // 最初の操作を拾ってBGMを解禁する（ブラウザの自動再生制限への対応）
  document.addEventListener('click', unlockAudio, { once: true });
  document.addEventListener('keydown', unlockAudio, { once: true });

  dom.titleStart.addEventListener('click', () => { showSetupStep(1); showScreen('setup'); });
  dom.titleOptions.addEventListener('click', () => showScreen('options'));
  dom.titleRanking.addEventListener('click', showRanking);
  dom.resultToTitle.addEventListener('click', returnToTitle);
  dom.setupBack.addEventListener('click', returnToTitle);
  dom.intervalBack.addEventListener('click', returnToTitle);
  dom.titleSkills.addEventListener('click', () => showScreen('skills'));
  dom.continueButton.addEventListener('click', onContinue);

  initKeyConfigUI();
  initOptionsUI();
  initSkillListUI();
  initRankingUI();
  initStoryUI();
  initEndingUI();
  renderKeyGuide();
  onModeChange();
  renderEnemyInfo();
  showSetupStep(1);
  validateSetup();
  showScreen('title'); // 起動時はタイトル画面から
}

/* =========================================================
 * キー設定
 * =======================================================*/

/** キー入力待ちのアクションID（null = 待機していない） */
let listeningActionId = null;

function initKeyConfigUI() {
  dom.keyConfigList.innerHTML = '';
  for (const action of ACTIONS) {
    const row = document.createElement('div');
    row.className = 'key-row';
    row.innerHTML = `<span class="key-action">${action.label}</span>`;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'key-bind';
    button.dataset.actionId = action.id;
    button.addEventListener('click', () => startListening(action.id));
    row.appendChild(button);

    dom.keyConfigList.appendChild(row);
  }
  renderKeyConfig();

  dom.keyConfigReset.addEventListener('click', () => {
    stopListening();
    keyConfig.reset();
    keyConfig.save();
    renderKeyConfig();
    renderKeyGuide();
    setKeyConfigNote('既定のキーに戻しました。');
  });

  // キー割り当ての受付。設定中だけ横取りするので、戦闘中の入力とは競合しない
  window.addEventListener('keydown', onKeyConfigKeyDown, true);
}

function onKeyConfigKeyDown(e) {
  if (listeningActionId === null) return;
  e.preventDefault();
  e.stopPropagation();

  if (e.code === 'Escape') {
    stopListening();
    setKeyConfigNote('変更をキャンセルしました。');
    return;
  }
  if (isReservedKey(e.code)) {
    setKeyConfigNote(`${keyLabel(e.code)} はブラウザの機能で使うため設定できません。`, true);
    return;
  }

  const actionId = listeningActionId;
  const result = keyConfig.assign(actionId, e.code);
  stopListening();

  if (!result.ok) {
    setKeyConfigNote(result.reason, true);
    return;
  }

  const actionLabel = ACTIONS.find((a) => a.id === actionId)?.label ?? actionId;
  if (result.swappedWith) {
    // 奪うと相手が未割り当てになるため入れ替えている。その旨を伝える
    const other = ACTIONS.find((a) => a.id === result.swappedWith)?.label ?? result.swappedWith;
    setKeyConfigNote(`${actionLabel} を ${keyLabel(e.code)} に設定しました（${other} と入れ替え）。`);
  } else {
    setKeyConfigNote(`${actionLabel} を ${keyLabel(e.code)} に設定しました。`);
  }
  renderKeyConfig();
  renderKeyGuide();
}

function startListening(actionId) {
  listeningActionId = actionId;
  renderKeyConfig();
  setKeyConfigNote('割り当てたいキーを押してください（Escでキャンセル）。');
}

function stopListening() {
  listeningActionId = null;
  renderKeyConfig();
}

function renderKeyConfig() {
  for (const button of dom.keyConfigList.querySelectorAll('.key-bind')) {
    const actionId = button.dataset.actionId;
    const listening = actionId === listeningActionId;
    button.textContent = listening ? 'キーを押す…' : keyLabel(keyConfig.getKey(actionId));
    button.classList.toggle('listening', listening);
  }
}

function setKeyConfigNote(text, isError = false) {
  dom.keyConfigNote.textContent = text;
  dom.keyConfigNote.classList.toggle('error', isError);
}

/** 戦闘画面下部の操作ガイド。キー設定に追従させる */
function renderKeyGuide() {
  dom.keyGuide.innerHTML = ACTIONS.map((action) => {
    const suffix = action.id === 'guard' ? '（押しっぱなし）' : '';
    return `<span><b>${keyLabel(keyConfig.getKey(action.id))}</b> ${action.label}${suffix}</span>`;
  }).join('');
}

/* =========================================================
 * オプション画面（キー設定 + 音量）
 * =======================================================*/

function initOptionsUI() {
  const bind = (slider, valueEl, get, set) => {
    slider.value = String(Math.round(get() * 100));
    valueEl.textContent = `${slider.value}%`;
    slider.addEventListener('input', () => {
      set(Number(slider.value) / 100);
      valueEl.textContent = `${slider.value}%`;
    });
  };
  bind(dom.bgmVolume, dom.bgmVolumeValue, () => sound.bgmVolume, (v) => sound.setBgmVolume(v));
  bind(dom.seVolume, dom.seVolumeValue, () => sound.seVolume, (v) => sound.setSeVolume(v));

  // 音量を動かしながら耳で確かめられるようにする
  dom.seTest.addEventListener('click', () => sound.playSe('hit'));
  dom.optionsBack.addEventListener('click', () => showScreen('title'));
}

/* =========================================================
 * ランキング画面
 * =======================================================*/

function initRankingUI() {
  dom.rankingBack.addEventListener('click', () => showScreen('title'));
}

function showRanking() {
  renderRanking(dom.rankingList, { selectable: true });
  // 最上位の記録を最初から開いておく
  const entries = ranking.getAll();
  dom.rankingDetail.innerHTML = entries.length > 0 ? buildRankingDetail(entries[0]) : '';
  if (entries.length > 0) dom.rankingList.querySelector('.rank-row:not(.head)')?.classList.add('selected');
  showScreen('ranking');
}

/**
 * 順位表を描画する。
 * @param {HTMLElement} container
 * @param {{selectable?: boolean, highlightIndex?: number}} options
 */
function renderRanking(container, { selectable = false, highlightIndex = -1 } = {}) {
  const entries = ranking.getAll();
  dom.rankingEmpty?.classList.toggle('hidden', entries.length > 0 || container !== dom.rankingList);

  if (entries.length === 0) {
    container.innerHTML = '';
    return;
  }

  const head = `<div class="rank-row head">
    <span>順位</span><span>名前</span><span>スコア</span><span>到達</span>
  </div>`;

  container.innerHTML = head + entries.map((entry, i) => {
    const medal = i < 3 ? ` top${i + 1}` : '';
    const current = i === highlightIndex ? ' current' : '';
    const tag = entry.cleared
      ? '<span class="rank-tag cleared">完全制覇</span>'
      : (entry.usedContinue ? '<span class="rank-tag">コンテニュー</span>' : '');
    const reach = entry.cleared ? 'クリア' : `第${entry.reachedRound}戦`;
    return `<div class="rank-row${medal}${current}" data-index="${i}">
      <span class="rank-no">${i + 1}</span>
      <span class="rank-name">${escapeHtml(entry.name)}${tag}</span>
      <span class="rank-score">${entry.score}</span>
      <span class="rank-reach">${reach}</span>
    </div>`;
  }).join('');

  if (!selectable) return;
  for (const row of container.querySelectorAll('.rank-row:not(.head)')) {
    row.addEventListener('click', () => {
      for (const other of container.querySelectorAll('.rank-row')) other.classList.remove('selected');
      row.classList.add('selected');
      dom.rankingDetail.innerHTML = buildRankingDetail(entries[Number(row.dataset.index)]);
    });
  }
}

/** 選択した記録の詳細（ステータス・スキル） */
function buildRankingDetail(entry) {
  if (!entry) return '';
  const stats = entry.stats
    ? `最大HP ${entry.stats.maxHp} / 攻撃力 ${entry.stats.attack} / スピード ${Number(entry.stats.speed).toFixed(1)}`
    : '記録なし';
  const points = entry.points
    ? `HP ${entry.points.hp} / 攻撃 ${entry.points.atk} / 速さ ${entry.points.spd}`
    : '記録なし';
  const skills = entry.skills?.length
    ? entry.skills.map((s) => `<span class="detail-skill">${escapeHtml(s)}</span>`).join('')
    : '<span class="detail-skill">記録なし</span>';
  const date = entry.date ? new Date(entry.date).toLocaleString('ja-JP') : '';

  return `
    <div class="detail-title">${escapeHtml(entry.name)}　${entry.score}点</div>
    <dl class="detail-grid">
      <dt>結果</dt><dd>${entry.cleared ? '完全制覇（裏ボス撃破）' : `第${entry.reachedRound}戦まで到達`}${entry.usedContinue ? '　※コンテニュー使用' : ''}</dd>
      <dt>流派</dt><dd>${entry.school ?? '未選択'}</dd>
      <dt>ステータス</dt><dd>${stats}</dd>
      <dt>振り分け</dt><dd>${points}</dd>
      <dt>最終装備</dt><dd class="detail-skills">${skills}</dd>
      <dt>日時</dt><dd>${date}</dd>
    </dl>`;
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/* =========================================================
 * スキル一覧画面
 * =======================================================*/

/** 表示中の流派フィルタ（null = すべて） */
let skillFilterSchool = null;

function initSkillListUI() {
  const schools = [...new Set(Object.values(SKILLS).map((s) => s.school))];
  const options = [{ label: 'すべて', value: null }, ...schools.map((s) => ({
    label: s ?? '流派なし', value: s ?? 'none',
  }))];

  dom.skillFilter.innerHTML = '';
  for (const option of options) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'filter-chip';
    chip.textContent = option.label;
    chip.dataset.value = option.value ?? '';
    chip.addEventListener('click', () => {
      skillFilterSchool = option.value;
      renderSkillList();
    });
    dom.skillFilter.appendChild(chip);
  }

  dom.skillCount.textContent = String(Object.keys(SKILLS).length);
  dom.skillsBack.addEventListener('click', () => showScreen('title'));
  renderSkillList();
}

function renderSkillList() {
  for (const chip of dom.skillFilter.children) {
    const value = chip.dataset.value === '' ? null : chip.dataset.value;
    chip.classList.toggle('active', value === skillFilterSchool);
  }

  const skills = Object.values(SKILLS).filter((def) => {
    if (skillFilterSchool === null) return true;
    if (skillFilterSchool === 'none') return def.school === null;
    return def.school === skillFilterSchool;
  });

  const head = `<div class="skill-entry head">
    <span>スキル名</span><span>流派</span><span>発生 / 後隙</span><span>CT</span><span>効果</span>
  </div>`;

  const rows = skills.map((def) => {
    // パッシブは発生・後隙・CTを持たないので、数値の代わりに種別を出す
    const tier = def.isPassive ? '<span class="s-passive">パッシブ</span>'
      : `${def.startupTier} / ${def.recoveryTier}`;
    const ct = def.cooldownSeconds != null ? `${def.cooldownSeconds}s` : '—';
    const duration = def.durationSeconds != null ? `　<span class="s-passive">効果時間 ${def.durationSeconds}s</span>` : '';
    return `<div class="skill-entry">
      <span class="s-name">${def.name}</span>
      <span class="s-school" style="color:${schoolColor(def.school)}">${def.school ?? 'なし'}</span>
      <span class="s-tier">${tier}</span>
      <span class="s-ct">${ct}</span>
      <span class="s-desc">${def.description}${duration}</span>
    </div>`;
  }).join('');

  dom.skillTable.innerHTML = head + rows;
}

/** 一覧の流派バッジの色（戦闘画面のスキルアイコンと揃える） */
function schoolColor(school) {
  return { 双海流: '#5fb8ff', 連炎流: '#ff8a4c', 瞬瞑流: '#b784ff' }[school] ?? '#9aa3b2';
}

/* =========================================================
 * セットアップのステップ進行
 * =======================================================*/

function showSetupStep(step) {
  for (const node of dom.setup.querySelectorAll('.setup-step')) {
    node.classList.toggle('hidden', Number(node.dataset.step) !== step);
  }
  for (const item of dom.setupSteps.children) {
    const n = Number(item.dataset.step);
    item.classList.toggle('active', n === step);
    item.classList.toggle('done', n < step);
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/** ステップ2で先に進めるか（ポイント配分） */
function validateStats() {
  const points = readPoints();
  const total = points.hp + points.atk + points.spd;
  if (total !== STAT_POINT_POOL) {
    dom.step2Error.textContent = `ステータスポイントの合計を${STAT_POINT_POOL}にしてください（現在 ${total}）。`;
    return false;
  }
  dom.step2Error.textContent = '';
  return true;
}

/* =========================================================
 * スキル装備（ステップ3）
 *
 * 装備枠を選んでから一覧のスキルをクリックして入れ替える。
 * 一覧には効果・発生・後隙・CTを併記し、選ぶ前に性能が分かるようにする。
 * =======================================================*/

/** 現在の装備（スキル名の配列） */
let equippedSkills = ['ソードスラッシュ', 'フレイムエンチャント', '鉄壁', '即応反射'];
/** 装備先として選択中の枠 */
let selectedSlot = 0;
/** 一覧の絞り込み（null = すべて） */
let equipFilter = null;

/** 初期装備に選べるのは流派なしスキルのみ（流派スキルは2戦目以降の報酬で入手する） */
function selectableSkills() {
  return Object.values(SKILLS).filter((def) => def.school === null);
}

function initEquipUI() {
  const kinds = [
    { label: 'すべて', value: null },
    { label: '攻撃', value: 'damage' },
    { label: '強化・妨害', value: 'buff' },
    { label: 'パッシブ', value: 'passive' },
  ];
  dom.equipFilter.innerHTML = '';
  for (const kind of kinds) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'filter-chip';
    chip.textContent = kind.label;
    chip.addEventListener('click', () => { equipFilter = kind.value; renderEquipPicker(); });
    chip.dataset.value = kind.value ?? '';
    dom.equipFilter.appendChild(chip);
  }
  renderEquipSlots();
  renderEquipPicker();
}

function renderEquipSlots() {
  dom.equipSlots.innerHTML = equippedSkills.map((name, i) => {
    const def = SKILLS[name];
    const key = keyLabel(keyConfig.getKey(SKILL_ACTION_IDS[i]));
    return `<button type="button" class="equip-slot${i === selectedSlot ? ' selected' : ''}" data-slot="${i}">
      <span class="slot-index">枠${i + 1}<span class="slot-key-hint">${key}</span></span>
      <span class="slot-skill">${def.name}</span>
      <span class="slot-spec">${skillSpecText(def)}</span>
    </button>`;
  }).join('');

  for (const button of dom.equipSlots.querySelectorAll('.equip-slot')) {
    button.addEventListener('click', () => {
      selectedSlot = Number(button.dataset.slot);
      renderEquipSlots();
      renderEquipPicker();
    });
  }
  validateSetup();
}

/** 発生・後隙・CTを1行にまとめた表記 */
function skillSpecText(def) {
  if (def.isPassive) return 'パッシブ（常時発動）';
  const ct = def.cooldownSeconds != null ? `CT ${def.cooldownSeconds}s` : '';
  const duration = def.durationSeconds != null ? ` / 効果 ${def.durationSeconds}s` : '';
  return `発生 ${def.startupTier} / 後隙 ${def.recoveryTier} / ${ct}${duration}`;
}

/** スキルの大まかな種別（絞り込み用） */
function skillKind(def) {
  if (def.isPassive) return 'passive';
  if (def.effect.kind === 'damage' || def.effect.kind === 'special') return 'damage';
  return 'buff';
}

function renderEquipPicker() {
  for (const chip of dom.equipFilter.children) {
    const value = chip.dataset.value === '' ? null : chip.dataset.value;
    chip.classList.toggle('active', value === equipFilter);
  }

  const list = selectableSkills().filter((def) => !equipFilter || skillKind(def) === equipFilter);

  dom.equipPicker.innerHTML = list.map((def) => {
    const equippedAt = equippedSkills.indexOf(def.name);
    const state = equippedAt === selectedSlot ? ' current'
      : (equippedAt !== -1 ? ' equipped' : '');
    const badge = equippedAt !== -1 ? `<span class="equip-badge">枠${equippedAt + 1}</span>` : '';
    return `<button type="button" class="skill-card${state}" data-name="${def.name}">
      <span class="card-head"><span class="card-name">${def.name}</span>${badge}</span>
      <span class="card-spec">${skillSpecText(def)}</span>
      <span class="card-desc">${def.description}</span>
    </button>`;
  }).join('');

  for (const card of dom.equipPicker.querySelectorAll('.skill-card')) {
    card.addEventListener('click', () => equipSkill(card.dataset.name));
  }
}

/**
 * 選択中の枠にスキルを装備する。
 * すでに別の枠にあるスキルなら入れ替える（同じスキルの重複装備を防ぐ）。
 */
function equipSkill(name) {
  const existing = equippedSkills.indexOf(name);
  if (existing === selectedSlot) return;
  if (existing !== -1) equippedSkills[existing] = equippedSkills[selectedSlot];
  equippedSkills[selectedSlot] = name;

  renderEquipSlots();
  renderEquipPicker();
}

function onModeChange() {
  const isFree = selectedMode() === 'free';
  dom.freeEnemyBlock.classList.toggle('hidden', !isFree);
  // 自由対戦は動作確認用でランキングに残らないため、名前は聞かない
  dom.nameBlock.classList.toggle('hidden', isFree);
}

function readPoints() {
  return {
    hp: Number(dom.ptHp.value) || 0,
    atk: Number(dom.ptAtk.value) || 0,
    spd: Number(dom.ptSpd.value) || 0,
  };
}

function validateSetup() {
  const points = readPoints();
  const total = points.hp + points.atk + points.spd;
  const remaining = STAT_POINT_POOL - total;

  dom.ptRemaining.textContent = `残り ${remaining} pt`;
  dom.ptRemaining.classList.toggle('over', remaining !== 0);

  if (remaining === 0) {
    const stats = calculateBaseStats(points);
    dom.previewHp.textContent = `最大HP ${stats.maxHp}`;
    dom.previewAtk.textContent = `攻撃力 ${stats.attack}`;
    dom.previewSpd.textContent = `スピード ${stats.speed.toFixed(1)}`;
  } else {
    dom.previewHp.textContent = dom.previewAtk.textContent = dom.previewSpd.textContent = '-';
  }

  // 同じスキルを複数枠に装備すると、名前でのスキル参照が最初の枠に固定されてしまうため禁止する
  // （装備UI側で入れ替えているので通常は起きないが、念のため最終確認する）
  const hasDuplicate = new Set(equippedSkills).size !== equippedSkills.length;

  let error = '';
  if (remaining !== 0) error = `ステータスポイントの合計を${STAT_POINT_POOL}にしてください。`;
  else if (hasDuplicate) error = '同じスキルを複数の枠に装備することはできません。';

  dom.setupError.textContent = error;
  dom.startButton.disabled = error !== '';
  return error === '';
}

function describeCharacter(name) {
  const data = CHARACTERS[name];
  const { maxHp, attack, speed } = data.baseStats;
  return `${data.name}\n最大HP ${maxHp} / 攻撃力 ${attack} / スピード ${speed}　戦力 ${data.power}\n`
    + `スキル: ${data.skillNames.join('、')}`
    + (data.note ? `\n${data.note}` : '');
}

function renderEnemyInfo() {
  dom.enemyInfo.textContent = describeCharacter(dom.enemySelect.value);
}

/* =========================================================
 * Fighter生成
 * =======================================================*/

function createPlayerFighter() {
  return new Fighter({
    id: 'player',
    name: playerName,
    baseStats: calculateBaseStats(readPoints()),
    skillNames: equippedSkills.slice(),
    isCpu: false,
  });
}

function createEnemyFighter(characterName) {
  const data = CHARACTERS[characterName];
  return new Fighter({
    id: 'enemy',
    name: data.name,
    baseStats: data.baseStats,
    skillNames: data.skillNames,
    isCpu: true,
    portrait: data.portrait,
    background: data.background,
  });
}

/**
 * 「戦闘タイミング」文字列から戦闘番号を推定する（自由対戦モード用）。
 * AIの思考ルーチンは1〜2戦目/3戦目以降で切り替わるため（要件定義.md 6章）、
 * 選んだ敵が本来登場する戦闘番号に合わせた思考をさせる。
 */
function inferRoundNumber(character) {
  const matched = /(\d+)戦目/.exec(character.timing);
  return matched ? Number(matched[1]) : 1;
}

/* =========================================================
 * 戦闘の開始と進行
 * =======================================================*/

function onStart() {
  if (!validateSetup()) return;

  // 名前と振り分けは、あとでランキングに残すため開始時に確定させる
  playerName = dom.playerName.value.trim().slice(0, 12) || '名無し';
  matchPoints = readPoints();

  const player = createPlayerFighter();
  if (selectedMode() === 'free') {
    match = null;
    const enemyName = dom.enemySelect.value;
    beginRound(player, createEnemyFighter(enemyName), inferRoundNumber(CHARACTERS[enemyName]));
  } else {
    match = new BattleMatch(player);
    startMatchRound();
  }
}

/**
 * 勝ち抜きモードで次の1戦へ。
 * 戦闘前のセリフを挟んでから実際の戦闘を始める（自由対戦では挟まない）。
 */
function startMatchRound() {
  const opponentName = match.resolveNextOpponentName();
  playStory(getOpeningLines(opponentName), {
    characterName: opponentName,
    roundNumber: match.roundNumber + 1, // これから始まる戦闘の会話
    onComplete: () => beginMatchRound(opponentName),
  });
}

function beginMatchRound(opponentName) {
  const enemy = createEnemyFighter(opponentName);
  const roundNumber = match.roundNumber + 1;

  showScreen('battle');
  ui.bind(match.player, enemy, keyConfig);
  const round = match.startNextRound(enemy, handleBattleEvent);
  setupSession(round, match.player, enemy, roundNumber);
}

/** 自由対戦モードで1戦を開始する */
function beginRound(player, enemy, aiRoundNumber) {
  showScreen('battle');
  ui.bind(player, enemy, keyConfig);
  const round = new BattleRound(player, enemy, handleBattleEvent);
  setupSession(round, player, enemy, aiRoundNumber);
}

function setupSession(round, player, enemy, aiRoundNumber) {
  dom.roundIndicator.innerHTML = match
    ? `<b>第${match.roundNumber}戦</b> / 全${match.secretBossUnlocked ? 6 : 5}戦　　対戦相手: ${enemy.name}`
      + (match.selectedSchool ? `　　流派: ${match.selectedSchool}` : '')
    : `自由対戦　　対戦相手: ${enemy.name}`;

  dom.resultOverlay.classList.add('hidden');
  session = {
    round, player, enemy,
    enemyAI: new AIController(enemy, aiRoundNumber),
    rafId: null,
    lastTimestamp: null,
  };

  // 戦闘番号と相手に応じた曲。切裂 劣子のようにキャラ専用曲を持つ相手もいる
  sound.playBgm(bgmKeyForBattle(match ? match.roundNumber : aiRoundNumber, enemy.name));

  ui.render(round.time);
  input.reset();
  input.attach();
  session.rafId = requestAnimationFrame(frame);
}

function frame(timestamp) {
  if (!session) return;

  // 初回フレームは前回時刻が無いためdt=0とし、タブ非表示明けの巨大なdtは切り詰める
  const dt = session.lastTimestamp == null
    ? 0
    : Math.min((timestamp - session.lastTimestamp) / 1000, 0.05);
  session.lastTimestamp = timestamp;

  processPlayerInput();
  session.enemyAI.update(session.round, dt);
  session.round.tick(dt);
  ui.render(session.round.time);

  if (session.round.finished) {
    finishRound();
    return;
  }
  session.rafId = requestAnimationFrame(frame);
}

function processPlayerInput() {
  const { round, player } = session;

  // ガードは押しっぱなしの状態をそのまま反映する（後隙中は engine 側が拒否する）
  round.declareGuard(player, input.isGuardHeld);

  for (const action of input.consumePresses()) {
    switch (action.type) {
      case 'move':
        round.declareMove(player, action.value);
        break;
      case 'normal':
        round.declareNormalAttack(player, action.value);
        break;
      case 'skill': {
        const skillInstance = player.skills[action.value];
        if (skillInstance && !skillInstance.isPassive) round.declareSkill(player, skillInstance.name);
        break;
      }
      case 'dodge':
        performDodge();
        break;
      default:
        break; // guard は押しっぱなしの状態として処理済み
    }
  }
}

/**
 * 回避入力。
 * 回避代替スキル（即応反射 / 即応反撃）を装備していて発動可能なら、
 * 通常の回避の代わりにそちらを発動する（要件定義.md 5.3）。
 */
function performDodge() {
  const { round, player } = session;
  const evadeSkill = player.skills.find(
    (s) => s.definition.effect.kind === 'evadeSkill' && canActivateSkill(player, s)
  );
  if (evadeSkill) {
    round.declareSkill(player, evadeSkill.name);
  } else {
    round.declareDodge(player);
  }
}

function handleBattleEvent(type, data) {
  switch (type) {
    case 'roundStart':
      ui.appendLog('戦闘開始（HP・CT・バフを全リセット）', 'system');
      break;
    case 'actionStart':
      if (data.actor === 'enemy') ui.appendLog(`敵: ${data.action}`, 'system');
      if (data.action === '雷刃') sound.playSe('raijin'); // 専用SEを持つ大技
      break;
    case 'dodge': {
      const who = data.defender === 'player' ? 'プレイヤー' : '敵';
      const via = data.viaSkill ? `${data.viaSkill}で` : '';
      ui.appendLog(`${who}が${via}${data.action}を回避！`, 'dodge');
      ui.notifyDodge(data.defender);
      sound.playSe('dodge');
      break;
    }
    case 'damage': {
      const kind = data.defender === 'player' ? 'damage-player' : 'damage-enemy';
      const attacker = data.attacker === 'player' ? 'プレイヤー' : '敵';
      ui.appendLog(`${attacker}の${data.action} → ${data.amount} ダメージ`, kind);
      ui.notifyDamage(data.defender, data.amount);
      // ガードで受け止めた時は「弾く」音に差し替える
      sound.playSe(data.guarded ? 'guard' : 'hit');
      break;
    }
    case 'miss': {
      const attacker = data.attacker === 'player' ? 'プレイヤー' : '敵';
      ui.appendLog(`${attacker}の${data.action} → 空振り（レーンが違う）`, 'miss');
      ui.notifyMiss(data.attacker);
      break;
    }
    case 'flinch': {
      const who = data.fighter === 'player' ? 'プレイヤー' : '敵';
      ui.appendLog(`${who}がひるんだ！（${data.canceledAction} が中断）`, 'flinch');
      ui.notifyFlinch(data.fighter);
      sound.playSe('guard'); // 技を弾いた表現として「弾く」音を流用する
      break;
    }
    default:
      break;
  }
}

/* =========================================================
 * 決着処理
 * =======================================================*/

function finishRound() {
  input.detach();
  if (session.rafId != null) cancelAnimationFrame(session.rafId);
  sound.stopBgm();
  sound.stopAllSe();

  const { round, player } = session;
  const isWin = round.winner === player;
  const isDraw = round.winner == null;

  dom.resultText.textContent = isDraw ? '相打ち' : (isWin ? 'WIN' : 'LOSE');
  dom.resultText.style.color = isWin ? 'var(--hp)' : 'var(--hp-enemy)';
  dom.resultNote.textContent = '';
  dom.resultScore.classList.add('hidden');
  dom.continueButton.classList.add('hidden');

  if (!match) {
    setResultButton('セットアップに戻る', returnToSetup);
  } else {
    const opponentName = session.enemy.name;
    match.recordRoundResult();
    renderRoundScore(match.lastScore, round);

    if (!isWin) {
      // 負けても同じ装備・ステータスで続きから挑める（スコアは0になる）
      dom.continueButton.classList.remove('hidden');
      setResultButton('結果を見る', showMatchResult);
    } else if (match.canSwapSkill) {
      setResultButton('インターバルへ', () => playDefeatStory(opponentName, showInterval));
    } else if (!match.isMatchOver) {
      // ボスをノーダメージ撃破 → 撃破セリフ・分岐イベントを挟んで裏ボス戦へ
      dom.resultNote.textContent = 'ノーダメージ撃破！ 裏ボスが出現する';
      setResultButton('先へ進む', () => playDefeatStory(opponentName, playSecretBossUnlock));
    } else {
      // 裏ボスを倒した完全クリアなら、撃破セリフのあとにエンドロールを流す
      const clearedAll = match.roundNumber >= SECRET_BOSS_ROUND;
      setResultButton(clearedAll ? 'エンディングへ' : '結果を見る',
        () => playDefeatStory(opponentName, clearedAll ? showEnding : showMatchResult));
    }
  }

  ui.appendLog(`決着: ${dom.resultText.textContent}`, 'system');
  dom.resultOverlay.classList.remove('hidden');
}

/** 1戦分のスコアと、その内訳を表示する */
function renderRoundScore(score, round) {
  if (!score) return;

  dom.scoreValue.textContent = String(score.total);
  dom.scoreBreakdown.innerHTML = [
    `撃破 ${round.time.toFixed(1)}秒 / 被ダメージ ${Math.round(round.damageTaken.player)}`,
    `基礎 ${score.base}`,
    `<span class="plus">速攻 +${score.timeBonus}</span>`,
    score.noDamageBonus > 0 ? `<span class="plus">無傷 +${score.noDamageBonus}</span>` : null,
    score.damagePenalty > 0 ? `<span class="minus">被弾 -${score.damagePenalty}</span>` : null,
  ].filter(Boolean).join('　');
  dom.resultScore.classList.remove('hidden');
}

/** 敗北した戦闘をやり直す */
function onContinue() {
  stopSession();
  if (!match?.continueAfterDefeat()) return;
  startMatchRound();
}

/** 撃破時のセリフを見せてから次の画面へ */
function playDefeatStory(opponentName, next) {
  playStory(getDefeatLines(opponentName), {
    characterName: opponentName,
    roundNumber: match?.roundNumber ?? 1, // 今終わった戦闘の会話
    onComplete: next,
  });
}

/* =========================================================
 * エンドロール（裏ボス撃破後）
 * =======================================================*/

/** スクロールの終わりを待つタイマー。スキップ時に解除する */
let endingTimer = null;
/** エンドロールを開始した時刻。表示直後の誤スキップを防ぐために見る */
let endingStartedAt = 0;

/**
 * 表示直後はスキップ操作を受け付けない時間。
 * 直前の会話送り（クリック連打）がそのまま流れ込んで、
 * エンドロールが一瞬で飛ばされるのを防ぐ。
 */
const ENDING_SKIP_GUARD_MS = 1500;

function showEnding() {
  dom.endingRoll.innerHTML = ENDING_ROLL.map((line) => {
    switch (line.type) {
      case 'title':
        // スタート画面のロゴと同じ意匠でタイトルを出す
        return `<div class="roll-title"><span class="game-title">
          <span class="t-chaos">Chaos</span><span class="t-sword">Sword</span><span class="t-garden">Garden</span>
        </span></div>`;
      case 'grand':
        return `<p class="roll-grand">${line.text}</p>`;
      case 'space':
        return '<div class="roll-space"></div>';
      default:
        return `<p class="roll-text">${line.text}</p>`;
    }
  }).join('');

  // アニメーションを最初から再生させる
  dom.endingRoll.style.animation = 'none';
  void dom.endingRoll.offsetWidth;
  dom.endingRoll.style.animation = '';

  showScreen('ending');
  endingStartedAt = performance.now();

  // 流し終わったら結果画面へ。CSSのスクロール尺と合わせる
  clearTimeout(endingTimer);
  endingTimer = setTimeout(() => finishEnding({ auto: true }), 42_000);
}

/**
 * エンドロールを終えて結果画面へ。
 * @param {{auto?: boolean}} options auto=true は最後まで流し切った場合（ガードを無視する）
 */
function finishEnding({ auto = false } = {}) {
  if (dom.ending.classList.contains('hidden')) return;
  if (!auto && performance.now() - endingStartedAt < ENDING_SKIP_GUARD_MS) return;

  clearTimeout(endingTimer);
  endingTimer = null;
  showMatchResult();
}

function initEndingUI() {
  dom.endingScene.addEventListener('click', () => finishEnding());
  window.addEventListener('keydown', (e) => {
    if (dom.ending.classList.contains('hidden')) return;
    // Enter / Space は会話送りにも使うため、ここでは受け付けない。
    // 直前の入力が流れ込んでエンドロールが飛ばされるのを防ぐ
    if (e.code === 'Escape') {
      e.preventDefault();
      finishEnding();
    }
  });
}

/** 裏ボス出現の分岐イベント（龍斗が沖田 雫について語る） */
function playSecretBossUnlock() {
  playStory(SECRET_BOSS_UNLOCK_SCENE, {
    characterName: '瞬瞑 龍斗',
    roundNumber: 5, // 龍斗が語る場面なので5戦目の続きとして扱う
    onComplete: startMatchRound,
  });
}

let resultButtonAction = null;

function setResultButton(label, action) {
  dom.retryButton.textContent = label;
  resultButtonAction = action;
}

function onResultButton() {
  stopSession();
  if (resultButtonAction) resultButtonAction();
}

function stopSession() {
  if (session?.rafId != null) cancelAnimationFrame(session.rafId);
  input.detach();
  session = null;
}

/* =========================================================
 * インターバル画面（流派選択 / スキル交換）
 * =======================================================*/

function showInterval() {
  pendingSchool = null;
  dom.intervalError.textContent = '';
  dom.schoolBlock.classList.toggle('hidden', !match.requiresSchoolSelection);

  if (match.requiresSchoolSelection) {
    renderSchoolChoices();
  }
  renderSwapControls();
  renderNextEnemyPreview();
  showScreen('interval');
}

function renderSchoolChoices() {
  dom.schoolChoices.innerHTML = '';
  for (const school of SCHOOLS) {
    const skills = Object.values(SKILLS).filter((s) => s.school === school).map((s) => s.name);
    const button = document.createElement('button');
    button.className = 'school-choice';
    button.innerHTML = `<span class="school-name">${school}</span><span class="school-skills">${skills.join('、')}</span>`;
    button.addEventListener('click', () => {
      pendingSchool = school;
      for (const node of dom.schoolChoices.children) node.classList.remove('selected');
      button.classList.add('selected');
      dom.intervalError.textContent = '';
      renderNextEnemyPreview();
    });
    dom.schoolChoices.appendChild(button);
  }
}

function renderSwapControls() {
  dom.swapSlotSelect.innerHTML = `<option value="${NO_SWAP}">交換しない</option>`
    + match.player.skills.map((s, i) => `<option value="${s.name}">${i + 1}: ${s.name}</option>`).join('');
  dom.swapSlotSelect.value = NO_SWAP;

  const rewards = match.getRewardSkillNames();
  dom.rewardSelect.innerHTML = rewards
    .map((name) => `<option value="${name}">${name}${SKILLS[name].school ? `（${SKILLS[name].school}）` : ''}</option>`)
    .join('');
  onSwapSelectionChange();
}

function onSwapSelectionChange() {
  const swapping = dom.swapSlotSelect.value !== NO_SWAP;
  dom.rewardSelect.disabled = !swapping;
  const def = SKILLS[dom.rewardSelect.value];
  dom.rewardDesc.textContent = swapping && def
    ? `${def.name}: ${def.description}\n発生 ${def.startupTier} / 後隙 ${def.recoveryTier}`
      + (def.cooldownSeconds != null ? ` / CT ${def.cooldownSeconds}s` : ' / パッシブ')
    : '';
}

function renderNextEnemyPreview() {
  // 流派未選択の間は2戦目の相手が確定しない
  if (match.requiresSchoolSelection && !pendingSchool) {
    dom.nextEnemyInfo.textContent = '流派を選択すると決まります';
    return;
  }
  const previousSchool = match.selectedSchool;
  if (pendingSchool) match.selectedSchool = pendingSchool; // 予告のため一時的に反映
  const name = match.resolveNextOpponentName();
  match.selectedSchool = previousSchool;

  dom.nextEnemyInfo.textContent = name ? describeCharacter(name) : '不明';
}

function onNextBattle() {
  if (match.requiresSchoolSelection && !pendingSchool) {
    dom.intervalError.textContent = '流派を選択してください。';
    return;
  }
  if (pendingSchool) match.selectSchool(pendingSchool);

  const slotSkillName = dom.swapSlotSelect.value;
  if (slotSkillName !== NO_SWAP) {
    match.applyVictoryReward(slotSkillName, dom.rewardSelect.value);
  }
  startMatchRound();
}

/* =========================================================
 * マッチ結果
 * =======================================================*/

function showMatchResult() {
  const won = match.lastResultIsWin && match.isMatchOver;

  // マッチが終わった時点でランキングへ登録する
  const cleared = match.lastResultIsWin && match.roundNumber >= SECRET_BOSS_ROUND;
  const rank = ranking.add({
    name: playerName,
    score: match.totalScore,
    cleared,
    reachedRound: match.roundNumber,
    school: match.selectedSchool,
    points: { ...matchPoints },
    stats: { ...match.player.baseStats },
    skills: match.player.skills.map((s) => s.name),
    usedContinue: match.usedContinue,
  });
  renderMatchRankResult(rank);
  dom.matchResultTitle.textContent = won
    ? (match.secretBossUnlocked ? '裏ボス撃破！ 完全制覇' : '全5戦 勝ち抜き達成！')
    : `第${match.roundNumber}戦で敗北`;

  dom.matchScoreValue.textContent = String(match.totalScore);
  dom.matchContinueNote.textContent = match.usedContinue ? '※コンテニュー使用（スコアは再挑戦後の分のみ）' : '';

  dom.matchHistory.innerHTML = match.history.map((h) => {
    const isWin = h.winnerId === 'player';
    return `<div class="history-row">
      <span class="round">第${h.roundNumber}戦</span>
      <span class="opponent">${h.opponentName}</span>
      <span class="outcome ${isWin ? 'win' : 'lose'}">${isWin ? '勝利' : '敗北'}</span>
      <span class="damage">${h.clearTimeSec.toFixed(1)}秒 / 被ダメージ ${Math.round(h.damageTaken)}</span>
      <span class="score">${h.score ? `${h.score.total}点` : '—'}</span>
    </div>`;
  }).join('');

  showScreen('result');
}

/** 結果画面に、今回の順位とトップ10を出す */
function renderMatchRankResult(rank) {
  dom.matchRankResult.classList.remove('hidden');
  if (rank !== null) {
    dom.matchRankMessage.textContent = `ランキング ${rank}位にランクイン！`;
    dom.matchRankMessage.classList.remove('out');
  } else {
    dom.matchRankMessage.textContent = 'ランキング圏外（トップ10に届きませんでした）';
    dom.matchRankMessage.classList.add('out');
  }
  renderRanking(dom.matchRankingList, { highlightIndex: rank !== null ? rank - 1 : -1 });
}

function returnToSetup() {
  stopSession();
  match = null;
  pendingSchool = null;
  showScreen('setup');
}

/** 進行中のマッチを破棄してタイトルへ戻る */
function returnToTitle() {
  stopSession();
  sound.stopAllSe();
  match = null;
  pendingSchool = null;
  showScreen('title');
}

initSetupScreen();
