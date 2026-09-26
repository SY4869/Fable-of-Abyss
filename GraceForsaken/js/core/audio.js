// ===================================================================
// BGM・効果音
//
// file:// で開いても鳴るよう HTMLAudioElement を使う（Web Audio の fetch は不可）。
// ブラウザは最初のクリック／タップまで再生を許可しないため、
// それ以前に要求された BGM は最初の操作時に再生を開始する。
// ===================================================================

const SOUND_DIR = 'Sound/';

const BGM_FILES = {
  title: 'Title_BGM.mp3',
  menu: 'Menu_BGM.mp3',
  battle: 'Battle_BGM.mp3',
  battleOkita: 'BattleOkita_BGM.mp3',
  story: 'AcceptQuest_BGM.mp3',
};

const SE_FILES = {
  confirm: 'ConfirmButton_SE.mp3',
  cancel: 'CancelButton_SE.mp3',
  slash: 'SlashingAttack_SE.mp3',
  dodge: 'Dodge_SE.mp3',
  heal: 'Heal_SE.mp3',
  fire: 'Fire_SE.mp3',
  ice: 'Ice_SE.mp3',
  wind: 'Wind_SE.mp3',
  thunder: 'Thunder_SE.mp3',
};

// 魔法攻撃の属性 → 効果音（光・闇・無は鳴らさない）
const MAGIC_SE = { FIRE: 'fire', WATER: 'ice', WIND: 'wind', THUNDER: 'thunder' };

const Sound = {
  bgm: null,          // 再生中の Audio
  bgmKey: null,
  unlocked: false,
  _lastSe: {},

  init() {
    const unlock = () => {
      if (this.unlocked) return;
      this.unlocked = true;
      if (this.bgm) this.bgm.play().catch(() => {});
    };
    document.addEventListener('pointerdown', unlock, { capture: true });
    document.addEventListener('keydown', unlock, { capture: true });

    // ボタン類のクリック音（data-se="cancel" / "none" で個別指定）
    document.addEventListener('click', (e) => {
      const t = e.target.closest('button, [data-se]');
      if (!t || t.disabled) return;
      const kind = t.getAttribute('data-se') || 'confirm';
      if (kind !== 'none') this.se(kind);
    }, { capture: true });
  },

  volume(kind) {
    const s = (typeof Save !== 'undefined' && Save.data && Save.data.settings) || {};
    return typeof s[kind] === 'number' ? s[kind] : (kind === 'bgm' ? 0.5 : 0.7);
  },

  /** BGM を切り替える（同じ曲なら何もしない） */
  playBgm(key) {
    if (this.bgmKey === key) return;
    this.stopBgm();
    const file = BGM_FILES[key];
    if (!file) return;
    const a = new Audio(SOUND_DIR + file);
    a.loop = true;
    a.volume = this.volume('bgm');
    this.bgm = a;
    this.bgmKey = key;
    if (this.unlocked) a.play().catch(() => {});
  },

  stopBgm() {
    if (this.bgm) { this.bgm.pause(); this.bgm.src = ''; }
    this.bgm = null;
    this.bgmKey = null;
  },

  applyVolume() {
    if (this.bgm) this.bgm.volume = this.volume('bgm');
  },

  /** 効果音。範囲攻撃などで同時に重なりすぎないよう短時間の連打は間引く */
  se(key) {
    const file = SE_FILES[key];
    const vol = this.volume('se');
    if (!file || vol <= 0) return;
    const now = Date.now();
    if (this._lastSe[key] && now - this._lastSe[key] < 70) return;
    this._lastSe[key] = now;
    const a = new Audio(SOUND_DIR + file);
    a.volume = vol;
    a.play().catch(() => {});
  },

  /** 戦闘の命中音 */
  hitSe(dmgType, element) {
    if (dmgType === 'PHYS') this.se('slash');
    else if (MAGIC_SE[element]) this.se(MAGIC_SE[element]);
  },
};
