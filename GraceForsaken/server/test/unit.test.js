// ===================================================================
// 単体テスト（npm test）… Validator / AutoAction / MatchQueue / Timer / BattleSession
// 結合テスト（実際に接続して対戦させる）は tools/pvp_sim.js
// ===================================================================
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { loadCore } = require('../src/loadCore');
const { makeValidator } = require('../src/Validator');
const { decideAutoAction } = require('../src/AutoAction');
const MatchQueue = require('../src/MatchQueue');
const Timer = require('../src/Timer');
const BattleSession = require('../src/BattleSession');

const core = loadCore();
const V = makeValidator(core);
const P = core.PVP_PROTOCOL;
const UUID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

/** 手動で時間を進められる時計 */
function fakeClock() {
  let now = 0, id = 0;
  const tasks = new Map();
  return {
    now: () => now,
    set: (fn, ms) => { const h = ++id; tasks.set(h, { at: now + ms, fn }); return h; },
    clear: (h) => tasks.delete(h),
    advance(ms) {
      now += ms;
      [...tasks.entries()].sort((a, b) => a[1].at - b[1].at).forEach(([h, t]) => {
        if (t.at <= now && tasks.has(h)) { tasks.delete(h); t.fn(); }
      });
    },
  };
}

function party() {
  return core.CHARACTER_MASTER.slice(0, 4).map((c, i) => ({ charId: c.id, skills: c.skillPool.slice(0, 3), area: (i % 3) + 1 }));
}

test('hello: 版数・userId・名前の検証', () => {
  assert.strictEqual(V.hello({ protocol: 99, userId: UUID }).error, P.ERR.VERSION_MISMATCH);
  assert.strictEqual(V.hello({ protocol: P.VERSION, userId: 'abc' }).error, P.ERR.INVALID_PAYLOAD);
  const ok = V.hello({ protocol: P.VERSION, userId: UUID, name: '  ab\u0007c' + 'x'.repeat(20) });
  assert.ok(ok.ok);
  assert.strictEqual(ok.name, 'abc' + 'x'.repeat(9));          // 制御文字を除き12文字まで
  assert.strictEqual(V.hello({ protocol: P.VERSION, userId: UUID, name: '' }).name, 'Player');
});

test('join_queue: パーティの検証', () => {
  assert.ok(V.party({ party: party() }).ok);
  const dup = party(); dup[1].charId = dup[0].charId;
  assert.strictEqual(V.party({ party: dup }).error, P.ERR.INVALID_PARTY);
  const badSkill = party(); badSkill[0].skills = ['ヒール', 'ヒール', 'ヒール'];
  assert.strictEqual(V.party({ party: badSkill }).error, P.ERR.INVALID_PARTY);
  const badArea = party(); badArea[0].area = 4;
  assert.strictEqual(V.party({ party: badArea }).error, P.ERR.INVALID_PARTY);
  assert.strictEqual(V.party({ party: party().slice(0, 3) }).error, P.ERR.INVALID_PARTY);
});

test('自動行動: 攻撃 → 前進 → 待機 の優先順', () => {
  const rng = () => 0;
  assert.deepStrictEqual(decideAutoAction([{ type: 'attack', targets: ['s1-1'] }], { area: 2 }, rng), { type: 'attack', targetId: 's1-1' });
  assert.deepStrictEqual(decideAutoAction([{ type: 'attack', targets: [], disabled: '射程外' }, { type: 'move', to: [1, 3] }], { area: 2 }, rng), { type: 'move', to: 1 });
  assert.deepStrictEqual(decideAutoAction([{ type: 'attack', targets: [], disabled: '射程外' }, { type: 'move', to: [2] }], { area: 1 }, rng), { type: 'wait' });
});

test('Timer: 一時停止すると残り時間を保持する', () => {
  const clock = fakeClock();
  const t = new Timer(clock);
  let fired = 0;
  t.start(1000, () => fired++);
  clock.advance(400);
  t.pause();
  clock.advance(5000);
  assert.strictEqual(fired, 0);
  assert.strictEqual(t.remaining(), 600);
  t.resume();
  clock.advance(599);
  assert.strictEqual(fired, 0);
  clock.advance(1);
  assert.strictEqual(fired, 1);
});

test('MatchQueue: 2人目で成立・時間切れでBOT・キャンセル', () => {
  const clock = fakeClock();
  const matched = [], bots = [];
  const q = new MatchQueue({ timeoutMs: 15000, clock, onMatch: e => matched.push(e), onTimeout: e => bots.push(e) });
  q.join({ userId: 'a' });
  q.join({ userId: 'a' });                     // 同じ userId 同士は組まない
  assert.strictEqual(matched.length, 0);
  q.join({ userId: 'b' });
  assert.strictEqual(matched.length, 1);
  assert.deepStrictEqual(matched[0].map(e => e.userId), ['a', 'b']);   // 先に待っていた側が side 0
  q.remove('a');
  q.join({ userId: 'c' });
  clock.advance(15000);
  assert.deepStrictEqual(bots.map(e => e.userId), ['c']);
  assert.strictEqual(q.size, 0);
});

test('BattleSession: 相手のスキルは送らない・同じ乱数で同じ結果', () => {
  const run = () => {
    const s = new BattleSession(core, { parties: [party(), party().reverse()], field: { time: 'DAY', location: 'PLAINS' }, seed: 42 });
    s.start();
    for (let i = 0; i < 400 && !s.finished; i++) {
      const a = s.currentActor();
      s.turnStart(a);
      s.run(a, s.aiAction(a));
    }
    return s;
  };
  const a = run(), b = run();
  assert.deepStrictEqual(a.outcome(), b.outcome());
  const views = a.views(0);
  views.forEach(v => assert.strictEqual(v.side === 0, !!v.skills));
});

test('待機: PVPでも手動で選べる', () => {
  const r = V.action({ roomId: 'r', seq: 1, actorId: 'u', type: 'wait' });
  assert.ok(r.ok, JSON.stringify(r));
  const s = new BattleSession(core, { parties: [party(), party().reverse()], field: { time: 'DAY', location: 'PLAINS' }, seed: 7 });
  s.start();
  const a = s.currentActor();
  s.turnStart(a);
  assert.ok(s.legal(a).some(e => e.type === 'wait'));
  assert.ok(s.check(a, { type: 'wait' }));
  const res = s.run(a, { type: 'wait' });
  assert.ok(res && Array.isArray(res.events));
  assert.notStrictEqual(s.currentActor(), a);
});
