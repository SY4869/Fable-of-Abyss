// ===================================================================
// ルームの生成・検索・破棄と、userId → ルームの対応表
// ===================================================================
'use strict';

const Room = require('./Room');
const { createBotPlayer } = require('./BotController');
const crypto = require('crypto');

class RoomManager {
  constructor(opt) {
    this.core = opt.core;
    this.settings = opt.settings;
    this.send = opt.send;
    this.rooms = new Map();       // roomId → Room
    this.userRoom = new Map();    // userId → roomId（進行中の試合のみ）
  }

  get size() { return this.rooms.size; }
  activeCount() { let n = 0; this.rooms.forEach(r => { if (r.state !== 'FINISHED') n++; }); return n; }

  get(roomId) { return this.rooms.get(roomId) || null; }
  roomOfUser(userId) {
    const id = this.userRoom.get(userId);
    return id ? this.get(id) : null;
  }

  /** players: [{userId,name,party,socketId}] 2人、または1人（BOT戦） */
  create(players) {
    const list = players.slice();
    if (list.length === 1) {
      const bot = createBotPlayer(this.core, crypto.randomBytes(4).readUInt32LE(0));
      list.push({ userId: 'bot', name: bot.name, party: bot.party, isBot: true });
    }
    const room = new Room({
      core: this.core,
      settings: this.settings,
      players: list,
      send: this.send,
      onFinished: (r) => r.players.forEach(p => {
        if (!p.isBot && this.userRoom.get(p.userId) === r.id) this.userRoom.delete(p.userId);
      }),
      onDestroy: (r) => this.rooms.delete(r.id),
    });
    this.rooms.set(room.id, room);
    room.players.forEach(p => { if (!p.isBot) this.userRoom.set(p.userId, room.id); });
    room.start();
    return room;
  }

  /** サーバー停止時: 進行中の試合を無効試合にする */
  voidAll() {
    this.rooms.forEach(r => r.finish({ void: true, reason: 'void' }));
  }
}

module.exports = RoomManager;
