// ===================================================================
// リアルタイム対戦サーバーとの通信（接続・再接続・送受信）
//
// 画面側は PvpClient.setHandlers({ イベント名: 関数 }) で受信処理を登録する。
// 接続が一瞬切れても自動で再接続し、試合中なら resume で復帰する。
// ===================================================================

const PvpClient = {
  socket: null,
  helloed: false,
  handlers: {},
  connecting: null,

  /** 接続先。localhost やファイルで開いたときは開発用サーバーへ */
  url() {
    const h = location.hostname;
    const local = location.protocol === 'file:' || h === 'localhost' || h === '127.0.0.1' || h === '';
    return local ? CONFIG.PVP.DEV_SERVER_URL : CONFIG.PVP.SERVER_URL;
  },

  /**
   * このブラウザのプレイヤーID（UUID）。
   * 開発時のみ、URL に ?pvpuser=名前 を付けるとタブごとに別プレイヤーとして接続できる（1台で対戦を試すため）。
   */
  userId() {
    const dev = new URLSearchParams(location.search).get('pvpuser');
    if (dev && this.url() === CONFIG.PVP.DEV_SERVER_URL) {
      const key = 'graceforsaken.pvp.devUser.' + dev;
      let id = null;
      try { id = sessionStorage.getItem(key); } catch (e) { /* 保存できない環境 */ }
      if (!id) { id = uuidv4(); try { sessionStorage.setItem(key, id); } catch (e) { /* 同上 */ } }
      return id;
    }
    const pvp = Save.pvp();
    if (!pvp.userId) { pvp.userId = uuidv4(); Save.save(); }
    return pvp.userId;
  },

  setHandlers(h) { this.handlers = h || {}; },
  dispatch(ev, data) {
    const fn = this.handlers[ev];
    if (fn) fn(data);
  },

  get connected() { return !!(this.socket && this.socket.connected && this.helloed); },

  /** 接続して hello まで済ませる。失敗時は { ok:false, error } */
  connect() {
    if (this.connected) return Promise.resolve({ ok: true });
    if (this.connecting) return this.connecting;
    if (typeof io === 'undefined') return Promise.resolve({ ok: false, error: 'NO_CLIENT' });
    const P = PVP_PROTOCOL;
    this.connecting = new Promise((resolve) => {
      let first = true;
      const s = this.socket || io(this.url(), {
        transports: ['websocket'],
        reconnection: true, reconnectionDelay: 1000, reconnectionDelayMax: 5000,
        timeout: 5000,
      });
      if (!this.socket) {
        this.socket = s;
        Object.keys(P.EV).forEach(k => {
          const ev = P.EV[k];
          s.on(ev, (data) => this.dispatch(ev, data));
        });
        s.on('disconnect', () => {
          this.helloed = false;
          this.dispatch('connection', { connected: false });
        });
      }
      const hello = async () => {
        const r = await this.req(P.EV.HELLO, { protocol: P.VERSION, userId: this.userId(), name: Save.playerName() });
        if (!r.ok) {
          if (first) { first = false; resolve(r); }
          this.dispatch('fatal', r);
          return;
        }
        this.helloed = true;
        this.dispatch('connection', { connected: true });
        // 通信が切れて戻ってきた場合は試合へ復帰する
        const sess = Save.pvp().session;
        if (!first && sess) this.resume(sess);
        if (first) { first = false; resolve({ ok: true }); }
      };
      s.on('connect', hello);
      s.on('connect_error', () => {
        if (first) { first = false; s.disconnect(); this.socket = null; resolve({ ok: false, error: 'CONNECT_FAILED' }); }
      });
      if (s.connected) hello();
    }).then(r => { this.connecting = null; return r; });
    return this.connecting;
  },

  /** 要求を送り、ack（応答）を待つ */
  req(ev, data) {
    return new Promise((resolve) => {
      if (!this.socket) { resolve({ ok: false, error: 'NOT_CONNECTED' }); return; }
      this.socket.timeout(8000).emit(ev, data, (err, res) => resolve(err ? { ok: false, error: 'TIMEOUT' } : (res || { ok: false })));
    });
  },

  /** 試合への復帰 */
  async resume(sess) {
    const r = await this.req(PVP_PROTOCOL.EV.RESUME, { roomId: sess.roomId, reconnectToken: sess.reconnectToken });
    if (!r.ok) this.dispatch('resume_failed', r);
    return r;
  },

  disconnect() {
    if (this.socket) { this.socket.disconnect(); this.socket = null; }
    this.helloed = false;
    this.connecting = null;
  },
};

/** UUID v4（crypto.randomUUID が使えない環境向けの予備つき） */
function uuidv4() {
  if (window.crypto && crypto.randomUUID) {
    try { return crypto.randomUUID(); } catch (e) { /* 安全でない接続では使えない */ }
  }
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
  return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
}
