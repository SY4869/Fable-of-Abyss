// ===================================================================
// マッチングキュー（PVP対戦_設計書 4.3）
//   先着順。別の userId の待機者がいれば対人戦、15秒待っても現れなければ BOT 戦。
// ===================================================================
'use strict';

const Timer = require('./Timer');

class MatchQueue {
  /**
   * opt: { timeoutMs, onMatch(entries: [a, b]) , onTimeout(entry), clock? }
   * entry: { userId, name, party, socketId }
   */
  constructor(opt) {
    this.timeoutMs = opt.timeoutMs;
    this.onMatch = opt.onMatch;
    this.onTimeout = opt.onTimeout;
    this.clock = opt.clock;
    this.waiting = [];     // [{ entry, timer }]
  }

  get size() { return this.waiting.length; }
  has(userId) { return this.waiting.some(w => w.entry.userId === userId); }

  join(entry) {
    const idx = this.waiting.findIndex(w => w.entry.userId !== entry.userId);
    if (idx >= 0) {
      const other = this.waiting.splice(idx, 1)[0];
      other.timer.clear();
      this.onMatch([other.entry, entry]);    // 先に待っていた側が side 0
      return 'matched';
    }
    const timer = new Timer(this.clock);
    const w = { entry: entry, timer: timer };
    this.waiting.push(w);
    timer.start(this.timeoutMs, () => {
      const i = this.waiting.indexOf(w);
      if (i < 0) return;
      this.waiting.splice(i, 1);
      this.onTimeout(entry);
    });
    return 'queued';
  }

  /** キャンセル・切断。キューにいた場合は true */
  remove(userId) {
    const i = this.waiting.findIndex(w => w.entry.userId === userId);
    if (i < 0) return false;
    this.waiting[i].timer.clear();
    this.waiting.splice(i, 1);
    return true;
  }
}

module.exports = MatchQueue;
