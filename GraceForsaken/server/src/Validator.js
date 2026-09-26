// ===================================================================
// 受信データの検証（PVP対戦_設計書 7章）
// ===================================================================
'use strict';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NAME_MAX = 12;
// 制御文字・幅ゼロ文字・書字方向の制御文字（名前の表示崩しに使われるもの）
const CONTROL_CHARS = new RegExp('[' + [
  [0x00, 0x1f], [0x7f, 0x9f], [0x200b, 0x200f], [0x2028, 0x202e], [0x2066, 0x2069],
].map(([a, b]) => String.fromCharCode(a) + '-' + String.fromCharCode(b)).join('') + ']', 'g');

function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }

/** 制御文字を除き、前後の空白を削って12文字までにする。空なら null */
function cleanName(name) {
  if (typeof name !== 'string') return null;
  const s = name.replace(CONTROL_CHARS, '').trim();
  const chars = Array.from(s).slice(0, NAME_MAX).join('');
  return chars.length ? chars : null;
}

function makeValidator(core) {
  const { PVP_PROTOCOL: P, getCharacter } = core;

  return {
    hello(p) {
      if (!isObj(p)) return { ok: false, error: P.ERR.INVALID_PAYLOAD };
      if (p.protocol !== P.VERSION) return { ok: false, error: P.ERR.VERSION_MISMATCH };
      if (typeof p.userId !== 'string' || !UUID_RE.test(p.userId)) return { ok: false, error: P.ERR.INVALID_PAYLOAD };
      const name = cleanName(p.name) || 'Player';
      return { ok: true, userId: p.userId.toLowerCase(), name: name };
    },

    /** 4体ちょうど／存在するキャラで重複なし／スキルが候補6種の中の重複なし3種／area 1〜3 */
    party(p) {
      if (!isObj(p) || !Array.isArray(p.party) || p.party.length !== 4) return { ok: false, error: P.ERR.INVALID_PARTY };
      const seen = new Set();
      const party = [];
      for (const m of p.party) {
        if (!isObj(m) || !Number.isInteger(m.charId)) return { ok: false, error: P.ERR.INVALID_PARTY };
        const master = getCharacter(m.charId);
        if (!master || master.id !== m.charId || seen.has(m.charId)) return { ok: false, error: P.ERR.INVALID_PARTY };
        seen.add(m.charId);
        if (!Array.isArray(m.skills) || m.skills.length !== 3) return { ok: false, error: P.ERR.INVALID_PARTY };
        const skills = m.skills.filter(s => typeof s === 'string');
        if (new Set(skills).size !== 3 || !skills.every(s => master.skillPool.indexOf(s) >= 0)) {
          return { ok: false, error: P.ERR.INVALID_PARTY };
        }
        if (![1, 2, 3].includes(m.area)) return { ok: false, error: P.ERR.INVALID_PARTY };
        party.push({ charId: m.charId, skills: skills, area: m.area });
      }
      return { ok: true, party: party };
    },

    /** 自分のユニット全員の配置（1〜3） */
    placement(p, unitIds) {
      if (!isObj(p) || !isObj(p.placement)) return { ok: false, error: P.ERR.INVALID_PAYLOAD };
      const keys = Object.keys(p.placement);
      if (keys.length !== unitIds.length || !unitIds.every(id => [1, 2, 3].includes(p.placement[id]))) {
        return { ok: false, error: P.ERR.INVALID_PAYLOAD };
      }
      return { ok: true, placement: Object.assign({}, p.placement) };
    },

    /** send_action の形式チェック（合法かどうかは戦闘エンジンで判定する） */
    action(p) {
      if (!isObj(p) || !Number.isInteger(p.seq) || typeof p.actorId !== 'string') return { ok: false, error: P.ERR.INVALID_PAYLOAD };
      const t = p.type;
      if (!['attack', 'skill', 'quick', 'move'].includes(t)) return { ok: false, error: P.ERR.INVALID_ACTION };
      const a = { type: t };
      if (p.targetId !== undefined) { if (typeof p.targetId !== 'string') return { ok: false, error: P.ERR.INVALID_ACTION }; a.targetId = p.targetId; }
      if (p.skillId !== undefined) { if (typeof p.skillId !== 'string') return { ok: false, error: P.ERR.INVALID_ACTION }; a.skillId = p.skillId; }
      if (p.area !== undefined) { if (![1, 2, 3].includes(p.area)) return { ok: false, error: P.ERR.INVALID_ACTION }; a.area = p.area; }
      if (p.to !== undefined) { if (![1, 2, 3].includes(p.to)) return { ok: false, error: P.ERR.INVALID_ACTION }; a.to = p.to; }
      return { ok: true, seq: p.seq, actorId: p.actorId, action: a };
    },
  };
}

module.exports = { makeValidator, cleanName, UUID_RE };
