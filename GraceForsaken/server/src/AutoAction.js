// ===================================================================
// 時間切れ時の自動行動（PVP対戦_設計書 4.6）
//   1. 通常攻撃が届く敵がいれば、その中からランダムに1体へ通常攻撃
//   2. 1が不可で、前のマスへ移動できれば前へ1マス
//   3. どちらも不可なら待機
// ===================================================================
'use strict';

function decideAutoAction(legal, actor, rng) {
  const attack = legal.find(e => e.type === 'attack' && !e.disabled && e.targets.length);
  if (attack) {
    const t = attack.targets[Math.floor(rng() * attack.targets.length)];
    return { type: 'attack', targetId: t };
  }
  const move = legal.find(e => e.type === 'move' && !e.disabled);
  if (move && actor.area > 1 && move.to.indexOf(actor.area - 1) >= 0) {
    return { type: 'move', to: actor.area - 1 };
  }
  return { type: 'wait' };
}

module.exports = { decideAutoAction };
