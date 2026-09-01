// ChaosSwordGarden - 全プレイヤー共通のランキング（サーバー連携）
//
// localStorage に残る自分だけの記録（ranking.js）とは別に、
// 全員のスコアを集めた順位表を扱う。
//
// 設計上の約束:
//   ・スコアは送らない。各戦闘の記録だけを送り、サーバーが再計算する
//   ・通信できなくてもゲームは止めない。送信に失敗したぶんは貯めて次回送る
//   ・getAll() は同期のまま。取得は refresh() で行い、結果をキャッシュする
//     （描画側を非同期に作り替えずに済ませるため）

'use strict';

/** サーバーのURL。localhost で開いているときは手元のサーバーを見る */
const API_BASE = (() => {
  const host = location.hostname;
  if (host === 'localhost' || host === '127.0.0.1' || host === '') {
    return 'http://127.0.0.1:3000';
  }
  return 'https://api.sygames.net';
})();

/** 送信データにつける版数。スコア式を変えたときにサーバー側で区別できる */
export const CLIENT_VERSION = '1.0.0';

/** 送れなかった記録を貯めておく場所 */
const PENDING_KEY = 'csg.pendingScores';

/** 通信の待ち時間（ミリ秒）。これを超えたら諦めてローカルだけで進む */
const TIMEOUT_MS = 8000;

/** 貯めておく上限。増えすぎても意味がないので古いものから捨てる */
const PENDING_LIMIT = 5;

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * マッチの結果を、サーバーへ送れる形に整える。
 * スコア・ステータス・到達戦は送らない（サーバーが rounds から導出する）。
 *
 * @param {{name:string, match:object, points:{hp:number,atk:number,spd:number}}} p
 */
export function buildSubmission({ name, match, points }) {
  return {
    name,
    school: match.selectedSchool,
    points: { hp: points.hp, atk: points.atk, spd: points.spd },
    skills: match.player.skills.map((s) => s.name),
    usedContinue: match.usedContinue,
    clientVersion: CLIENT_VERSION,
    rounds: match.history.map((h) => ({
      roundNumber: h.roundNumber,
      opponentName: h.opponentName,
      winnerId: h.winnerId,
      clearTimeSec: h.clearTimeSec,
      damageTaken: h.damageTaken,
    })),
  };
}

export class RemoteRanking {
  constructor(apiBase = API_BASE) {
    this.apiBase = apiBase;
    this.entries = [];
    /** 'idle' | 'loading' | 'ready' | 'error' */
    this.state = 'idle';
    this.lastError = null;
  }

  /** 描画側から同期で読む。refresh() の結果が入っている */
  getAll() {
    return this.entries.slice();
  }

  get isEmpty() {
    return this.entries.length === 0;
  }

  /**
   * サーバーから最新の順位表を取り込む。
   * 失敗しても例外は投げず、state を 'error' にして呼び出し側に判断を委ねる。
   */
  async refresh(limit = 10) {
    this.state = 'loading';
    try {
      const res = await fetchWithTimeout(`${this.apiBase}/api/scores/top?limit=${limit}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.ok || !Array.isArray(json.entries)) throw new Error('応答の形式が不正です');

      this.entries = json.entries;
      this.state = 'ready';
      this.lastError = null;
    } catch (e) {
      this.state = 'error';
      this.lastError = e;
      console.warn('[ranking] 共通ランキングを取得できませんでした:', e.message);
    }
    return this.state === 'ready';
  }

  /**
   * 記録を送る。
   * @returns {Promise<{ok:boolean, rank:number|null, score:number|null, accepted:boolean, reason:string|null}>}
   *   ok=false でも呼び出し側は進行を止めないこと。
   */
  async submit(submission) {
    try {
      const res = await fetchWithTimeout(`${this.apiBase}/api/scores`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submission),
      });
      const json = await res.json().catch(() => null);

      if (res.ok && json?.ok) {
        return {
          ok: true,
          rank: json.rank ?? null,
          score: json.score ?? null,
          accepted: json.accepted !== false,
          reason: null,
        };
      }

      // 400番台は送り直しても通らないので貯めない
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        console.warn('[ranking] 記録が受理されませんでした:', json?.detail ?? res.status);
        return { ok: false, rank: null, score: null, accepted: false, reason: json?.detail ?? '記録が受理されませんでした' };
      }

      this._savePending(submission);
      return { ok: false, rank: null, score: null, accepted: false, reason: 'サーバーが混み合っています' };
    } catch (e) {
      // 通信そのものが失敗した場合は、次回の起動で送り直す
      this._savePending(submission);
      console.warn('[ranking] 送信に失敗しました。次回起動時に再送します:', e.message);
      return { ok: false, rank: null, score: null, accepted: false, reason: '通信できませんでした' };
    }
  }

  /**
   * 前回送れなかった記録を送り直す。起動時に一度呼ぶ想定。
   * @returns {Promise<number>} 送信できた件数
   */
  async flushPending() {
    const pending = this._loadPending();
    if (pending.length === 0) return 0;

    // 送れたものだけ取り除く。失敗したぶんは残して次の機会に回す
    const remaining = [];
    let sent = 0;
    for (const item of pending) {
      try {
        const res = await fetchWithTimeout(`${this.apiBase}/api/scores`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item),
        });
        if (res.ok) { sent += 1; continue; }
        // 受理されない内容なら捨てる（残しても永久に送れない）
        if (res.status >= 400 && res.status < 500 && res.status !== 429) continue;
        remaining.push(item);
      } catch {
        remaining.push(item);
      }
    }
    this._writePending(remaining);
    if (sent > 0) console.info(`[ranking] 保留していた記録を${sent}件送信しました`);
    return sent;
  }

  get pendingCount() {
    return this._loadPending().length;
  }

  /* ---- 保留分の保存（localStorage が使えなくても落ちないようにする） ---- */

  _loadPending() {
    try {
      const raw = JSON.parse(localStorage.getItem(PENDING_KEY) ?? 'null');
      return Array.isArray(raw) ? raw : [];
    } catch {
      return [];
    }
  }

  _writePending(list) {
    try {
      if (list.length === 0) localStorage.removeItem(PENDING_KEY);
      else localStorage.setItem(PENDING_KEY, JSON.stringify(list.slice(-PENDING_LIMIT)));
    } catch {
      // 保存できなくてもプレイには支障がない
    }
  }

  _savePending(submission) {
    const list = this._loadPending();
    list.push(submission);
    this._writePending(list);
  }
}
