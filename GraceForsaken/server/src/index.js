// ===================================================================
// GraceForsaken リアルタイム対戦サーバー
//
//   node src/index.js          … 本番（ALLOWED_ORIGINS からの接続のみ許可）
//   node src/index.js --dev    … 開発（localhost とローカルファイルからの接続も許可）
//
// 設定は server/.env（.env.example 参照）または環境変数で行う。
// ===================================================================
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const { loadCore } = require('./loadCore');
const { makeValidator } = require('./Validator');
const RateLimiter = require('./RateLimiter');
const RoomManager = require('./RoomManager');
const MatchQueue = require('./MatchQueue');
const log = require('./logger');

// ---------- 設定 ----------
function loadEnvFile() {
  const file = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(file)) return;
  fs.readFileSync(file, 'utf8').split(/\r?\n/).forEach(line => {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  });
}
loadEnvFile();

const DEV = process.argv.includes('--dev') || process.env.PVP_DEV === '1';
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || (DEV ? '0.0.0.0' : '127.0.0.1');   // 本番は nginx 経由のみ
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://sygames.net')
  .split(',').map(s => s.trim()).filter(Boolean);

const core = loadCore();
const P = core.PVP_PROTOCOL;
const PV = core.CONFIG.PVP;
const envNum = (key, def) => (process.env[key] !== undefined ? Number(process.env[key]) : def);

// 秒・分の設定値をミリ秒にしたもの（テスト用に環境変数で上書きできる）
const settings = {
  MATCH_TIMEOUT_MS: envNum('PVP_MATCH_TIMEOUT_SEC', PV.MATCH_TIMEOUT_SEC) * 1000,
  PLACEMENT_MS: envNum('PVP_PLACEMENT_TIMEOUT_SEC', PV.PLACEMENT_TIMEOUT_SEC) * 1000,
  TURN_MS: envNum('PVP_TURN_TIMEOUT_SEC', PV.TURN_TIMEOUT_SEC) * 1000,
  AFK_LIMIT: envNum('PVP_AFK_LIMIT', PV.AFK_LIMIT),
  ANIMATION_MAX_WAIT_MS: envNum('PVP_ANIMATION_MAX_WAIT_SEC', PV.ANIMATION_MAX_WAIT_SEC) * 1000,
  RECONNECT_GRACE_MS: envNum('PVP_RECONNECT_GRACE_SEC', PV.RECONNECT_GRACE_SEC) * 1000,
  FINISHED_ROOM_TTL_MS: envNum('PVP_FINISHED_ROOM_TTL_SEC', PV.FINISHED_ROOM_TTL_SEC) * 1000,
  ROOM_MAX_LIFETIME_MS: envNum('PVP_ROOM_MAX_LIFETIME_MIN', PV.ROOM_MAX_LIFETIME_MIN) * 60000,
  RATE_LIMIT_PER_SEC: envNum('PVP_RATE_LIMIT_PER_SEC', PV.RATE_LIMIT_PER_SEC),
};
if (process.env.PVP_BOT_THINK_MS) {
  const [a, b] = process.env.PVP_BOT_THINK_MS.split(',').map(Number);
  PV.BOT_THINK_MS = [a, b === undefined ? a : b];
}

// ---------- 接続元の検証 ----------
function originAllowed(origin) {
  if (!origin) return true;                          // ブラウザ以外（テストツール等）。ブラウザは必ず Origin を送る
  if (ALLOWED_ORIGINS.indexOf(origin) >= 0) return true;
  if (DEV && (origin === 'null' || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin))) return true;
  return false;
}

// ---------- HTTP（死活確認） ----------
let draining = false;
const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({
      status: 'ok', rooms: rooms.activeCount(), queue: queue.size,
      connections: io.engine.clientsCount, draining: draining,
    }));
    return;
  }
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('not found');
});

const io = new Server(server, {
  pingInterval: 5000,
  pingTimeout: 5000,
  maxHttpBufferSize: 4096,
  cors: { origin: (origin, cb) => cb(null, originAllowed(origin)) },
  allowRequest: (req, cb) => cb(null, originAllowed(req.headers.origin)),
});

// ---------- 状態 ----------
const validator = makeValidator(core);
const sockets = new Map();          // socketId → { userId, name }
const userSocket = new Map();       // userId → socketId
const send = (socketId, ev, data) => io.to(socketId).emit(ev, data);
const rooms = new RoomManager({ core, settings, send });
const queue = new MatchQueue({
  timeoutMs: settings.MATCH_TIMEOUT_MS,
  onMatch: (entries) => rooms.create(entries),
  onTimeout: (entry) => rooms.create([entry]),
});

// ---------- 接続 ----------
io.on('connection', (socket) => {
  const limiter = new RateLimiter(settings.RATE_LIMIT_PER_SEC);
  const who = () => sockets.get(socket.id) || null;

  /** 受信ハンドラの共通処理（頻度制限・ack・例外処理） */
  const on = (ev, fn, needHello) => {
    socket.on(ev, (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      const r = limiter.hit();
      if (r !== 'ok') {
        reply({ ok: false, error: P.ERR.RATE_LIMITED });
        if (r === 'kick') { log.warn('rate limit kick', socket.id); socket.disconnect(true); }
        return;
      }
      if (needHello !== false && !who()) { reply({ ok: false, error: P.ERR.NOT_HELLO }); return; }
      try {
        reply(fn(payload, who()) || { ok: true });
      } catch (e) {
        log.error('handler error', ev, e);
        reply({ ok: false, error: P.ERR.SERVER_ERROR });
      }
    });
  };

  on(P.EV.HELLO, (payload) => {
    const v = validator.hello(payload);
    if (!v.ok) return v;
    // 同じ userId の古い接続は切る（新しい方を優先）
    const oldId = userSocket.get(v.userId);
    if (oldId && oldId !== socket.id) {
      const old = io.sockets.sockets.get(oldId);
      if (old) {
        old.emit(P.EV.SERVER_ERROR, { error: P.ERR.DUPLICATE_SESSION });
        old.disconnect(true);
      }
    }
    sockets.set(socket.id, { userId: v.userId, name: v.name });
    userSocket.set(v.userId, socket.id);
    return { ok: true, serverTime: Date.now(), inRoom: !!rooms.roomOfUser(v.userId) };
  }, false);

  on(P.EV.JOIN_QUEUE, (payload, me) => {
    if (draining) return { ok: false, error: P.ERR.MAINTENANCE };
    if (rooms.roomOfUser(me.userId)) return { ok: false, error: P.ERR.ALREADY_IN_ROOM };
    if (queue.has(me.userId)) return { ok: false, error: P.ERR.ALREADY_IN_QUEUE };
    const v = validator.party(payload);
    if (!v.ok) return v;
    // 待ち時間の通知は ack の後に届くよう次のタイミングで送る
    setImmediate(() => socket.emit(P.EV.QUEUE_TIMER, { timeoutSec: settings.MATCH_TIMEOUT_MS / 1000 }));
    setImmediate(() => queue.join({ userId: me.userId, name: me.name, party: v.party, socketId: socket.id }));
    return { ok: true };
  });

  on(P.EV.CANCEL_QUEUE, (payload, me) => {
    if (queue.remove(me.userId)) return { ok: true };
    if (rooms.roomOfUser(me.userId)) return { ok: false, error: P.ERR.ALREADY_IN_ROOM };
    return { ok: true };
  });

  const roomFor = (payload, me) => {
    const room = payload && typeof payload.roomId === 'string' ? rooms.get(payload.roomId) : null;
    if (!room) return { error: P.ERR.ROOM_NOT_FOUND };
    const i = room.playerIndex(me.userId);
    if (i < 0) return { error: P.ERR.NOT_IN_ROOM };
    if (room.players[i].socketId !== socket.id) return { error: P.ERR.NOT_IN_ROOM };
    return { room, i };
  };

  on(P.EV.SUBMIT_PLACEMENT, (payload, me) => {
    const r = roomFor(payload, me);
    if (r.error) return { ok: false, error: r.error };
    const v = validator.placement(payload, r.room.session.unitIds(r.i));
    if (!v.ok) return v;
    const err = r.room.submitPlacement(r.i, v.placement);
    return err ? { ok: false, error: err } : { ok: true };
  });

  on(P.EV.SEND_ACTION, (payload, me) => {
    const r = roomFor(payload, me);
    if (r.error) return { ok: false, error: r.error };
    const v = validator.action(payload);
    if (!v.ok) return v;
    const err = r.room.handleAction(r.i, v);
    return err ? { ok: false, error: err } : { ok: true };
  });

  on(P.EV.ACTION_COMPLETE, (payload, me) => {
    const r = roomFor(payload, me);
    if (r.error) return { ok: false, error: r.error };
    if (payload && Number.isInteger(payload.seq)) r.room.actionComplete(r.i, payload.seq);
    return { ok: true };
  });

  on(P.EV.SURRENDER, (payload, me) => {
    const r = roomFor(payload, me);
    if (r.error) return { ok: false, error: r.error };
    const err = r.room.surrender(r.i);
    return err ? { ok: false, error: err } : { ok: true };
  });

  on(P.EV.RESUME, (payload, me) => {
    const room = payload && typeof payload.roomId === 'string' ? rooms.get(payload.roomId) : null;
    if (!room) return { ok: false, error: P.ERR.ROOM_NOT_FOUND };
    const i = room.playerIndex(me.userId);
    if (i < 0 || room.players[i].token !== payload.reconnectToken) return { ok: false, error: P.ERR.INVALID_TOKEN };
    // 応答（ack）の後に state_sync / battle_end が届くよう、次のタイミングで復帰させる
    setImmediate(() => room.resume(i, socket.id));
    return { ok: true, finished: room.state === 'FINISHED' };
  });

  socket.on('disconnect', () => {
    const me = who();
    sockets.delete(socket.id);
    if (!me) return;
    if (userSocket.get(me.userId) === socket.id) userSocket.delete(me.userId);
    queue.remove(me.userId);
    const room = rooms.roomOfUser(me.userId);
    if (room) {
      const i = room.playerIndex(me.userId);
      if (i >= 0 && room.players[i].socketId === socket.id) room.disconnect(i);
    }
  });
});

// ---------- 起動・停止 ----------
server.listen(PORT, HOST, () => {
  log.info('pvp server listening', HOST + ':' + PORT, DEV ? '(dev)' : '', 'origins=' + ALLOWED_ORIGINS.join(','));
});

// ドレイン（新規受付停止）: pm2 sendSignal SIGUSR2 <アプリ名>
process.on('SIGUSR2', () => {
  draining = true;
  log.info('draining: new matches are refused. active rooms=' + rooms.activeCount());
});

let stopping = false;
function shutdown(sig) {
  if (stopping) return;
  stopping = true;
  log.info('shutting down', sig);
  rooms.voidAll();
  io.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('uncaughtException', (e) => log.error('uncaughtException', e));
process.on('unhandledRejection', (e) => log.error('unhandledRejection', e));

module.exports = { server, io, rooms, queue, settings };
