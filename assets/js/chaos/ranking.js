// ChaosSwordGarden - スコアランキング（トップ10）
//
// 勝ち抜きモードの結果を localStorage に保存する。
// 順位はスコアの高い順。同点なら先に記録した方を上位とする。

'use strict';

const STORAGE_KEY = 'csg.ranking';

/** 保持する件数 */
export const RANKING_LIMIT = 10;

export class Ranking {
  constructor(limit = RANKING_LIMIT) {
    this.limit = limit;
    this.entries = [];
    this.load();
  }

  /**
   * 記録を追加する。
   * @param {object} entry
   * @returns {number|null} 入賞した順位（1始まり）。ランク外なら null
   */
  add(entry) {
    const record = {
      name: String(entry.name ?? '名無し').slice(0, 12) || '名無し',
      score: Math.max(0, Math.round(entry.score ?? 0)),
      cleared: !!entry.cleared,
      reachedRound: entry.reachedRound ?? 0,
      school: entry.school ?? null,
      points: entry.points ?? null,
      stats: entry.stats ?? null,
      skills: entry.skills ?? [],
      usedContinue: !!entry.usedContinue,
      date: entry.date ?? new Date().toISOString(),
    };

    // 同点は既存を上位に保つため、より高いスコアの後ろへ挿入する
    const index = this.entries.findIndex((e) => record.score > e.score);
    if (index === -1) this.entries.push(record);
    else this.entries.splice(index, 0, record);

    const rank = this.entries.indexOf(record) + 1;
    this.entries = this.entries.slice(0, this.limit);
    this.save();

    // 切り詰めで押し出された場合はランク外
    return this.entries.includes(record) ? rank : null;
  }

  getAll() {
    return this.entries.slice();
  }

  get isEmpty() {
    return this.entries.length === 0;
  }

  clear() {
    this.entries = [];
    this.save();
  }

  /* ---- 永続化（localStorageが使えない環境でも動作を止めない） ---- */

  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.entries));
    } catch {
      // 保存できなくてもプレイ自体には支障がないため無視する
    }
  }

  load() {
    let stored;
    try {
      stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    } catch {
      return;
    }
    if (!Array.isArray(stored)) return;

    // 壊れた項目が混ざっていても表示が崩れないよう、最低限の形だけ検証する
    this.entries = stored
      .filter((e) => e && typeof e.name === 'string' && Number.isFinite(e.score))
      .map((e) => ({ ...e, score: Math.max(0, Math.round(e.score)) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, this.limit);
  }
}
