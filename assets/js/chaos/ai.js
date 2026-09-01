// ChaosSwordGarden - 敵CPU思考ロジック（要件定義.md 6章）
//   1〜2戦目: ランダムトリガー
//   3〜5戦目: ルールベース（反撃優先 / HP50%以下で特定スキル優先）
//
// ガードは「行動」ではなく「状態」なので、行動選択とは別の周期で扱う。
// 判断が0.25秒ごとだと発生の速い攻撃に間に合わないため、構え直しは毎フレーム見る。
// 難易度は単一（固定データ）で、Fighterのステータス・スキルは
// data.js の CHARACTERS で戦ごとに固定されている。

'use strict';

import { NORMAL_ATTACKS, RECOVERY_TIME, MOVE_STARTUP_SEC } from './data.js';
import { ActionState } from './models.js';
import { canActivateSkill } from './skill-effects.js';

/* =========================================================
 * AIController: BattleRound の外側から dt を渡して駆動する
 * =======================================================*/

export class AIController {
  /**
   * @param {import('./models.js').Fighter} fighter CPU側のFighter
   * @param {number} roundNumber 現在の戦闘番号（1〜6）
   * @param {number} [decisionIntervalSec] 意思決定を行う間隔（秒）
   */
  constructor(fighter, roundNumber, decisionIntervalSec = 0.25) {
    this.fighter = fighter;
    this.roundNumber = roundNumber;
    this.strategy = roundNumber <= 2 ? new RandomAIStrategy() : new RuleBasedAIStrategy();
    this.decisionIntervalSec = decisionIntervalSec;
    this._sinceLastDecision = 0;
  }

  /** @param {import('./battle-engine.js').BattleRound} battleRound */
  update(battleRound, dt, rng = Math.random) {
    this._sinceLastDecision += dt;

    // ガードの構え直しは毎フレーム。相手の攻撃は0.15秒で出ることもあり、
    // 行動選択と同じ0.25秒周期では間に合わない。
    if (this.fighter.isIdle) {
      const opponent = battleRound.opponentOf(this.fighter);
      const guard = this.strategy.shouldGuard(this.fighter, opponent, rng);
      battleRound.declareGuard(this.fighter, guard);
      // 構えている間は攻撃に移らない。
      // ここで _sinceLastDecision は進めたままにして、解除された瞬間に動けるようにする
      if (guard) return;
    }

    if (this._sinceLastDecision < this.decisionIntervalSec) return;
    this._sinceLastDecision = 0;
    if (!this.fighter.isIdle) return;
    this.strategy.decide(this.fighter, battleRound, rng);
  }
}

/* =========================================================
 * 戦略の共通処理
 * =======================================================*/

class BaseAIStrategy {
  /** CT明け かつ 追加の発動条件を満たしているスキルのみを対象にする */
  availableSkills(fighter) {
    return fighter.skills.filter((s) => !s.isPassive && canActivateSkill(fighter, s));
  }

  /**
   * その行動が自分に当たる攻撃かどうか。
   * バフや自己強化スキルは避ける必要がないので区別する。
   */
  isDamagingAction(action) {
    if (!action) return false;
    if (action.kind === 'normal') return true;
    if (action.kind !== 'skill') return false;
    const effect = action.skillInstance.definition.effect;
    return effect.kind === 'damage' || effect.kind === 'special';
  }

  /** 相手が今まさに攻撃を振っている（着弾前）か */
  isAttackIncoming(opponent) {
    return opponent.actionState === ActionState.STARTUP
      && this.isDamagingAction(opponent.currentAction);
  }

  /**
   * レーンが違えば攻撃は当たらないので、横位置を合わせにいく。
   *
   * ただし相手の攻撃が飛んで来ている最中は寄らない。
   * 寄ってしまうと、せっかく避けた攻撃の着弾点へ自分から戻ることになり
   * 「一度避けた攻撃に当たりに行く」不自然な動きになる。
   * @returns {boolean} 移動を宣言したか
   */
  alignLane(fighter, battleRound, opponent) {
    if (fighter.lane === opponent.lane) return false;
    if (this.isAttackIncoming(opponent)) return false;
    return battleRound.declareMove(fighter, Math.sign(opponent.lane - fighter.lane));
  }

  /**
   * 相手の攻撃の発生中なら、横にずれて避けられないか試す。
   * 移動にも発生時間があるので、間に合わない場合は避けられない。
   * @returns {boolean} 回避のための移動を宣言したか
   */
  sidestep(fighter, battleRound, opponent, rng) {
    if (fighter.lane !== opponent.lane) return false;
    if (!this.isAttackIncoming(opponent)) return false; // バフ相手に逃げても意味がない

    // 発生の遅い攻撃ほど避ける余裕があるので、間に合う時だけ動く
    const remaining = opponent.currentAction.startupSeconds - opponent.currentAction.elapsed;
    if (remaining < MOVE_STARTUP_SEC) return false;

    // 左右どちらへ逃げるかは、盤面の外に出ない方向から選ぶ
    const directions = [-1, 1].filter((d) => fighter.canMoveTo(fighter.lane + d));
    if (directions.length === 0) return false;
    const pick = directions[Math.floor(rng() * directions.length)];
    return battleRound.declareMove(fighter, pick);
  }

  /**
   * 相手の攻撃をガードで受けるか。
   *
   * 判断は「攻撃1回につき一度だけ」行い、その攻撃が終わるまで結果を保つ。
   * 毎フレーム抽選し直すと構えが小刻みに点滅し、当たるかどうかが運任せになるため。
   *
   * @returns {boolean} ガードを構えるべきか
   */
  shouldGuard(fighter, opponent, rng) {
    const action = opponent.currentAction;

    // 攻撃が来ていないなら構えない（構えっぱなしだと何もしない敵になる）
    if (!this.isAttackIncoming(opponent)) {
      this._guardTarget = null;
      return false;
    }
    // レーンがずれていればそもそも当たらない
    if (fighter.lane !== opponent.lane) {
      this._guardTarget = null;
      return false;
    }
    // 防御不可（ペネトレイトを受けている）なら構えても意味がない
    if (fighter.hasFlag('guardDisabled')) {
      this._guardTarget = null;
      return false;
    }

    // 同じ攻撃に対しては最初の判断を使い回す
    if (this._guardTarget?.action !== action) {
      this._guardTarget = { action, guard: rng() < this.guardChance(fighter, opponent) };
    }
    return this._guardTarget.guard;
  }

  /** その状況でガードを選ぶ確率。戦略ごとに上書きする */
  guardChance() {
    return 0;
  }

  /** スキル優先/通常攻撃のどちらかをランダムに実行する共通処理 */
  actRandomly(fighter, battleRound, rng, candidateSkills) {
    if (candidateSkills.length > 0 && rng() < 0.6) {
      const pick = candidateSkills[Math.floor(rng() * candidateSkills.length)];
      battleRound.declareSkill(fighter, pick.name);
      return;
    }
    const attackTypes = Object.keys(NORMAL_ATTACKS);
    const pick = attackTypes[Math.floor(rng() * attackTypes.length)];
    battleRound.declareNormalAttack(fighter, pick);
  }
}

/* =========================================================
 * 1〜2戦目: ランダムトリガー
 * =======================================================*/

export class RandomAIStrategy extends BaseAIStrategy {
  /**
   * 1〜2戦目はチュートリアル寄りなので、たまに受ける程度に留める。
   * 数値は要件定義.md 未定義のプロトタイプ暫定値（要調整）。
   */
  guardChance() {
    return 0.25;
  }

  decide(fighter, battleRound, rng) {
    const opponent = battleRound.opponentOf(fighter);

    // レーンが合っていなければ寄る。1〜2戦目は回避的な横移動まではしない
    if (this.alignLane(fighter, battleRound, opponent)) return;

    const candidates = this.availableSkills(fighter);
    this.actRandomly(fighter, battleRound, rng, candidates);
  }
}

/* =========================================================
 * 3〜5戦目: ルールベース
 * =======================================================*/

export class RuleBasedAIStrategy extends BaseAIStrategy {
  /**
   * 3戦目以降は状況を見て受ける。
   *   ・避けられない攻撃（もう横に動く余裕がない）ほど受ける
   *   ・重い技ほど受ける
   *   ・HPが減っているほど慎重になる
   * 数値は要件定義.md 未定義のプロトタイプ暫定値（要調整）。
   */
  guardChance(fighter, opponent) {
    const action = opponent.currentAction;
    let chance = 0.35;

    // 横に逃げる余裕がなければ、受けるしかない
    const remaining = action.startupSeconds - action.elapsed;
    const canSidestep = remaining >= MOVE_STARTUP_SEC
      && [-1, 1].some((d) => fighter.canMoveTo(fighter.lane + d));
    if (!canSidestep) chance += 0.35;

    // 後隙の大きい技＝重い一撃なので、通すと痛い。
    // スピードで秒数が伸び縮みするため、補正前の値で判断する
    if ((action.baseRecoverySeconds ?? action.recoverySeconds) >= RECOVERY_TIME['大']) chance += 0.15;

    // 半分を切ったら守りを固める
    if (fighter.currentHp <= fighter.baseStats.maxHp * 0.5) chance += 0.15;

    return Math.min(0.9, chance);
  }

  decide(fighter, battleRound, rng) {
    const opponent = battleRound.opponentOf(fighter);
    const candidates = this.availableSkills(fighter);

    // 3戦目以降は横移動で攻撃をかわす。避けきれる時だけ動く
    if (this.sidestep(fighter, battleRound, opponent, rng)) return;

    // 攻撃を通すにはレーンを合わせる必要がある
    if (this.alignLane(fighter, battleRound, opponent)) return;

    // かわしている最中は攻撃を振っても当たらないので、自己強化に時間を使う。
    // 攻撃したい場合は相手の技が終わるのを待つ
    if (fighter.lane !== opponent.lane && this.isAttackIncoming(opponent)) {
      const buff = candidates.find((s) => s.definition.effect.kind === 'buff');
      if (buff) battleRound.declareSkill(fighter, buff.name);
      return;
    }

    // 相手が後隙(中・大)状態の時は確定で攻撃スキルを発動（反撃優先）
    if (this._opponentIsPunishable(opponent)) {
      const attackSkill = candidates.find((s) => s.definition.effect.kind === 'damage');
      if (attackSkill) {
        battleRound.declareSkill(fighter, attackSkill.name);
        return;
      }
    }

    // 自HPが50%以下の時に底力・回復・大技の発動確率を引き上げる（確率テーブル参照型）
    // 具体的な確率値は要件定義.md未定義のプロトタイプ暫定値（要調整）。
    if (fighter.currentHp <= fighter.baseStats.maxHp * 0.5) {
      const priority = candidates.find((s) => this._isLastResortSkill(s));
      if (priority && rng() < 0.7) {
        battleRound.declareSkill(fighter, priority.name);
        return;
      }
    }

    this.actRandomly(fighter, battleRound, rng, candidates);
  }

  _opponentIsPunishable(opponent) {
    if (opponent.actionState !== ActionState.RECOVERY || !opponent.currentAction) return false;
    // 実際の秒数はスピードで縮むので、元の後隙（中以上か）で判断する
    const base = opponent.currentAction.baseRecoverySeconds ?? opponent.currentAction.recoverySeconds;
    return base >= RECOVERY_TIME['中'];
  }

  /** 底力(パッシブ)は対象外。回復(不死再生は発動不可のパッシブなので実質対象外)・高倍率の大技を優先候補とする */
  _isLastResortSkill(skillInstance) {
    const effect = skillInstance.definition.effect;
    return effect.kind === 'damage' && effect.multiplier >= 2.0;
  }
}
