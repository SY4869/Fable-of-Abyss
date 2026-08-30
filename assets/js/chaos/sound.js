// ChaosSwordGarden - BGM / SE の再生
//
// assets/audio/chaos/ 配下の素材:
//   battle1.mp3       … 1〜4戦目のBGM
//   battle_boss.mp3   … 5戦目(ボス)のBGM
//   battle_secret.wav … 6戦目(裏ボス)のBGM
//   se_hit.wav        … 攻撃が命中した時
//   se_guard.wav      … ガードで攻撃を弾いた時
//   se_dodge.mp3      … 回避が成功した時
//   se_raijin.mp3     … 雷刃を発動した時
//
// ブラウザの自動再生ポリシー上、音はユーザー操作を起点にしないと鳴らない。
// 戦闘開始はボタンのクリックから始まるので、そこで再生を開始する。

'use strict';

const SOUND_BASE = 'assets/audio/chaos/';

/** 効果音の定義。volume は素材ごとの音量差を吸収するための係数 */
const SE_DEFS = Object.freeze({
  hit: { file: 'se_hit.wav', volume: 0.5 },
  guard: { file: 'se_guard.wav', volume: 0.6 },
  dodge: { file: 'se_dodge.mp3', volume: 0.9 },
  raijin: { file: 'se_raijin.mp3', volume: 0.7 },
});

const BGM_DEFS = Object.freeze({
  title: { file: 'title.mp3', volume: 0.30 },
  menu: { file: 'menu.mp3', volume: 0.28 },   // ステータス割り振り・インターバル等
  dialogue: { file: 'dialogue.mp3', volume: 0.30 },  // 戦闘前後の会話（1〜5戦目）
  dialogue6: { file: 'dialogue6.wav', volume: 0.30 },   // 裏ボス戦の会話
  normal: { file: 'battle1.mp3', volume: 0.32 },
  rare: { file: 'battle_rare.mp3', volume: 0.32 }, // レアエネミー戦
  boss: { file: 'battle_boss.mp3', volume: 0.32 },
  secretBoss: { file: 'battle_secret.wav', volume: 0.32 },
  ending: { file: 'ending.mp3', volume: 0.30 },
});

/** レアエネミー（専用BGMを持つ相手） */
const RARE_ENEMY_NAME = '切裂 劣子';

/**
 * その戦闘で流すBGMの種類。
 * @param {number} roundNumber
 * @param {string|null} opponentName 相手ごとの専用曲を選ぶために使う
 */
export function bgmKeyForBattle(roundNumber, opponentName = null) {
  if (opponentName === RARE_ENEMY_NAME) return 'rare';
  if (roundNumber >= 6) return 'secretBoss';
  if (roundNumber === 5) return 'boss';
  return 'normal';
}

/**
 * 戦闘前後の会話で流すBGMの種類。
 * @param {number} roundNumber その会話が紐づく戦闘番号
 */
export function bgmKeyForDialogue(roundNumber) {
  return roundNumber >= 6 ? 'dialogue6' : 'dialogue';
}

const VOLUME_STORAGE_KEY = 'csg.volume';

export class SoundManager {
  constructor() {
    this.muted = false;
    this.currentBgmKey = null;
    this.bgm = null;

    // 0〜1 の倍率。素材ごとの基準音量に掛けて使う
    this.bgmVolume = 1;
    this.seVolume = 1;
    this._loadVolume();

    // SEは連打されるので、再生のたびに複製できるよう元となるAudioを持っておく
    this._seSources = new Map();
    for (const [name, def] of Object.entries(SE_DEFS)) {
      const audio = new Audio(SOUND_BASE + def.file);
      audio.preload = 'auto';
      this._seSources.set(name, { audio, volume: def.volume });
    }
    this._playingSe = new Set(); // 再生中の複製（停止時にまとめて止める）
  }

  /**
   * BGMを切り替える。同じ曲が既に流れている場合は流しっぱなしにする
   * （戦闘ごとにHP等はリセットされるが、曲まで途切れると気持ち悪いため）。
   */
  playBgm(key) {
    const def = BGM_DEFS[key];
    if (!def) return;
    if (this.currentBgmKey === key && this.bgm && !this.bgm.paused) return;

    this.stopBgm();
    const audio = new Audio(SOUND_BASE + def.file);
    audio.loop = true;
    audio.volume = this.muted ? 0 : def.volume * this.bgmVolume;
    this.bgm = audio;
    this.currentBgmKey = key;
    // 自動再生を拒否された場合も戦闘は続けたいので、失敗は握りつぶす
    audio.play().catch(() => {});
  }

  stopBgm() {
    if (!this.bgm) return;
    this.bgm.pause();
    this.bgm.currentTime = 0;
    this.bgm = null;
    this.currentBgmKey = null;
  }

  /** @param {keyof SE_DEFS} name */
  playSe(name) {
    if (this.muted) return;
    const src = this._seSources.get(name);
    if (!src) return;

    const node = src.audio.cloneNode();
    node.volume = src.volume * this.seVolume;
    this._playingSe.add(node);
    node.addEventListener('ended', () => this._playingSe.delete(node));
    node.play().catch(() => {});
  }

  /** 決着時など、鳴りっぱなしのSEを止める */
  stopAllSe() {
    for (const node of this._playingSe) {
      node.pause();
      node.currentTime = 0;
    }
    this._playingSe.clear();
  }

  setMuted(muted) {
    this.muted = muted;
    this._applyBgmVolume();
    if (muted) this.stopAllSe();
  }

  /* ---- 音量設定（オプション画面から変更する） ---- */

  /** @param {number} value 0〜1 */
  setBgmVolume(value) {
    this.bgmVolume = clamp01(value);
    this._applyBgmVolume();
    this._saveVolume();
  }

  /** @param {number} value 0〜1 */
  setSeVolume(value) {
    this.seVolume = clamp01(value);
    this._saveVolume();
  }

  _applyBgmVolume() {
    if (!this.bgm) return;
    const base = BGM_DEFS[this.currentBgmKey]?.volume ?? 0.3;
    this.bgm.volume = this.muted ? 0 : base * this.bgmVolume;
  }

  _saveVolume() {
    try {
      localStorage.setItem(VOLUME_STORAGE_KEY, JSON.stringify({ bgm: this.bgmVolume, se: this.seVolume }));
    } catch {
      // 保存できなくてもその場のプレイには支障がないため無視する
    }
  }

  _loadVolume() {
    let stored;
    try {
      stored = JSON.parse(localStorage.getItem(VOLUME_STORAGE_KEY) ?? 'null');
    } catch {
      return;
    }
    if (!stored || typeof stored !== 'object') return;
    if (typeof stored.bgm === 'number') this.bgmVolume = clamp01(stored.bgm);
    if (typeof stored.se === 'number') this.seVolume = clamp01(stored.se);
  }
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(1, Math.max(0, value));
}
