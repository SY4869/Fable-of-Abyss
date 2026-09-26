// ===================================================================
// 一時停止できるタイマー（切断中は残り時間を保持して止める）
// ===================================================================
'use strict';

class Timer {
  constructor(clock) {
    this.clock = clock || { now: () => Date.now(), set: setTimeout, clear: clearTimeout };
    this.handle = null;
    this.fn = null;
    this.endsAt = null;
    this.remainingMs = null;   // 一時停止中の残り時間
  }

  /** ms 後に fn を呼ぶ（既存の予約は取り消す） */
  start(ms, fn) {
    this.clear();
    this.fn = fn;
    this.endsAt = this.clock.now() + ms;
    this.handle = this.clock.set(() => { this.handle = null; this.endsAt = null; const f = this.fn; this.fn = null; f(); }, ms);
  }

  get running() { return this.handle !== null; }
  get paused() { return this.remainingMs !== null; }

  /** 残り時間（ミリ秒） */
  remaining() {
    if (this.paused) return this.remainingMs;
    if (!this.running) return 0;
    return Math.max(0, this.endsAt - this.clock.now());
  }

  pause() {
    if (!this.running) return;
    this.remainingMs = this.remaining();
    this.clock.clear(this.handle);
    this.handle = null;
  }

  resume() {
    if (!this.paused) return;
    const ms = this.remainingMs;
    const fn = this.fn;
    this.remainingMs = null;
    this.start(ms, fn);
  }

  clear() {
    if (this.handle !== null) this.clock.clear(this.handle);
    this.handle = null;
    this.endsAt = null;
    this.remainingMs = null;
    this.fn = null;
  }
}

module.exports = Timer;
