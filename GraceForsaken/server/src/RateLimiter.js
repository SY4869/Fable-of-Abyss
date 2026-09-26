// ===================================================================
// 送信頻度の制限: 1接続あたり毎秒 N 件まで。10秒間に3回超過したら切断を促す。
// ===================================================================
'use strict';

class RateLimiter {
  constructor(perSec, now) {
    this.perSec = perSec;
    this.now = now || (() => Date.now());
    this.windowStart = 0;
    this.count = 0;
    this.violations = [];
  }

  /** 戻り値: 'ok' | 'limited' | 'kick' */
  hit() {
    const t = this.now();
    if (t - this.windowStart >= 1000) { this.windowStart = t; this.count = 0; }
    this.count++;
    if (this.count <= this.perSec) return 'ok';
    if (this.count === this.perSec + 1) {
      this.violations = this.violations.filter(v => t - v < 10000);
      this.violations.push(t);
      if (this.violations.length >= 3) return 'kick';
    }
    return 'limited';
  }
}

module.exports = RateLimiter;
