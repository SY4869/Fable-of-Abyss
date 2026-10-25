// ===================================================================
// 非同期対戦（ゴースト対戦）の防衛パーティ置き場
//
// 各プレイヤーが設定した防衛パーティを userId ごとに1件だけ保持し、
// 勝率の近いプレイヤーの防衛パーティを対戦相手として返す。
// 再起動しても消えないよう JSON ファイルへ書き出す（書き込みはまとめて行う）。
// ===================================================================
'use strict';

const fs = require('fs');
const path = require('path');
const log = require('./logger');

const MAX_ENTRIES = 5000;                         // 保持する人数の上限（古い順に消す）
const EXPIRE_MS = 60 * 24 * 60 * 60 * 1000;       // 60日更新のない防衛パーティは候補から外す
const SAVE_DELAY_MS = 5000;
const NEAREST_POOL = 10;                          // 勝率の近い順にこの人数から、ランダムに選ぶ

class DefenseStore {
  /**
   * @param {object} opt
   *   file  … 保存先の JSON ファイル（null ならメモリのみ。テスト用）
   *   now   … 時計（テスト用）
   */
  constructor(opt) {
    opt = opt || {};
    this.file = opt.file || null;
    this.now = opt.now || Date.now;
    this.entries = new Map();     // userId → { name, winRate, party, updatedAt }
    this.saveTimer = null;
    this.load();
  }

  load() {
    if (!this.file || !fs.existsSync(this.file)) return;
    try {
      const list = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      (Array.isArray(list) ? list : []).forEach(e => { if (e && e.userId) this.entries.set(e.userId, e); });
      log.info('defense parties loaded', this.entries.size);
    } catch (e) {
      log.error('defense parties load failed', e);
    }
  }

  /** 変更をまとめて書き出す */
  scheduleSave() {
    if (!this.file || this.saveTimer) return;
    this.saveTimer = setTimeout(() => { this.saveTimer = null; this.flush(); }, SAVE_DELAY_MS);
    if (this.saveTimer.unref) this.saveTimer.unref();
  }

  flush() {
    if (!this.file) return;
    if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = null; }
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify([...this.entries.values()]));
      fs.renameSync(tmp, this.file);
    } catch (e) {
      log.error('defense parties save failed', e);
    }
  }

  /** 防衛パーティを登録（同じ userId は上書き） */
  set(userId, name, party, winRate) {
    this.entries.delete(userId);   // 挿入順＝更新順にして、上限超過時は古いものから消す
    this.entries.set(userId, { userId, name, winRate, party, updatedAt: this.now() });
    while (this.entries.size > MAX_ENTRIES) this.entries.delete(this.entries.keys().next().value);
    this.scheduleSave();
  }

  get(userId) { return this.entries.get(userId) || null; }

  /**
   * 勝率の近いプレイヤーを最大 count 人返す（自分は除く）。
   * 近い順に NEAREST_POOL 人まで候補にして、その中からランダムに選ぶ。
   */
  findOpponents(userId, winRate, count, rng) {
    const now = this.now();
    const base = winRate === null || winRate === undefined ? 50 : winRate;
    const pool = [...this.entries.values()]
      .filter(e => e.userId !== userId && now - e.updatedAt < EXPIRE_MS)
      .map(e => ({ e, d: Math.abs((e.winRate === null ? 50 : e.winRate) - base) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, NEAREST_POOL)
      .map(x => x.e);
    const random = rng || Math.random;
    const picked = [];
    while (pool.length && picked.length < count) picked.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
    return picked.map(e => ({ id: e.userId, name: e.name, winRate: e.winRate, party: e.party }));
  }

  get size() { return this.entries.size; }
}

module.exports = DefenseStore;
