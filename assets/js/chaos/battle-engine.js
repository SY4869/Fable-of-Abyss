// ChaosSwordGarden - バトルロジック本体
// BattleRound  : 1戦闘分（発生→後隙のタイムライン管理・判定・フルリセット）
// BattleMatch  : 全5戦闘の勝ち抜き進行（スキル1枠交換・敵の選出）

'use strict';

import {
  NORMAL_ATTACKS, DODGE_TIMING_TOLERANCE_SEC, MATCH_CONFIG, CHARACTERS, SKILLS,
  FLINCH_DAMAGE_RATIO, FLINCH_DURATION_SEC,
  MOVE_STARTUP_SEC, MOVE_RECOVERY_SEC, calculateBattleScore,
} from './data.js';
import { ActionState } from './models.js';
import {
  applyPassives, updateConditionalPassives, applyHpRegenPassives,
  getCooldownMultiplier, getRecoveryOverrideSeconds, getStartupMultiplier,
  getRecoveryMultiplier, getEnemyStartupSlowMultiplier,
  onUseSkill, onJudgmentSkill, canActivateSkill,
} from './skill-effects.js';

/* =========================================================
 * BattleRound: 1戦闘（勝敗が決まるまでの1本）
 *
 * 行動タイムライン:
 *   IDLE --(宣言)--> STARTUP --(発生完了=判定)--> RECOVERY --> IDLE
 *
 * CTは「宣言した瞬間」から消費開始する（= 発生中もCTは減っていく）。
 * 回避(ダッジ)は「攻撃側の判定タイミング」と「回避入力タイミング」の
 * 差が DODGE_TIMING_TOLERANCE_SEC 以内であれば成立する。
 * =======================================================*/

export class BattleRound {
  /**
   * @param {import('./models.js').Fighter} player
   * @param {import('./models.js').Fighter} enemy
   * @param {(type:string, data:object)=>void} [onEvent] ログ/UI通知用フック
   */
  constructor(player, enemy, onEvent) {
    this.player = player;
    this.enemy = enemy;
    this.time = 0;
    this.log = [];
    this.finished = false;
    this.winner = null; // Fighter | null(相打ち)
    // 各陣営が「受けた」累計ダメージ。裏ボス出現条件（ボスをノーダメージで撃破）の判定に使う
    this.damageTaken = { player: 0, enemy: 0 };
    this.onEvent = onEvent || (() => {});
    this.start();
  }

  /** ラウンド開始（=フルリセット。要件定義.md 2章） */
  start() {
    this.player.resetForNewRound();
    this.enemy.resetForNewRound();
    applyPassives(this.player);
    applyPassives(this.enemy);
    this.time = 0;
    this.finished = false;
    this.winner = null;
    this.damageTaken = { player: 0, enemy: 0 };
    this._emit('roundStart', {});
  }

  _emit(type, data) {
    const entry = { t: Number(this.time.toFixed(3)), type, ...data };
    this.log.push(entry);
    this.onEvent(type, data);
  }

  /** 指定したFighterから見た対戦相手を返す（AIControllerからも参照される） */
  opponentOf(fighter) {
    return fighter === this.player ? this.enemy : this.player;
  }

  /* ---- 行動宣言API（プレイヤー入力 / AIController から呼ばれる） ---- */

  /**
   * 行動を開始できるか。
   * 通常はIDLE時のみだが、回避代替スキル(即応反射/即応反撃)で回避に成功した直後は
   * 「回避行動中に攻撃(スキル含む)が行える」ため後隙をキャンセルして行動できる。
   */
  _canAct(fighter) {
    if (fighter.actionState === ActionState.FLINCH) return false; // ひるみ中は何もできない
    return fighter.isIdle || fighter.canActWhileDodging;
  }

  /** 回避代替スキルの成功で得た行動許可を消費し、進行中の後隙をキャンセルする */
  _consumeDodgeActWindow(fighter) {
    if (!fighter.canActWhileDodging) return;
    fighter.canActWhileDodging = false;
    fighter.currentAction = null;
    fighter.actionState = ActionState.IDLE;
  }

  declareNormalAttack(fighter, attackType) {
    if (!this._canAct(fighter)) return false;
    const def = NORMAL_ATTACKS[attackType];
    if (!def) return false;
    this._consumeDodgeActWindow(fighter);
    this._beginAction(fighter, {
      kind: 'normal',
      name: attackType,
      startupSeconds: def.startup * getStartupMultiplier(fighter) * getEnemyStartupSlowMultiplier(fighter),
      recoverySeconds: def.recovery * getRecoveryMultiplier(fighter),
      damageMultiplier: def.damageMultiplier,
    });
    return true;
  }

  declareSkill(fighter, skillName) {
    if (!this._canAct(fighter)) return false;
    const skillInstance = fighter.getSkill(skillName);
    if (!skillInstance || !canActivateSkill(fighter, skillInstance)) return false;
    this._consumeDodgeActWindow(fighter);

    const def = skillInstance.definition;
    const opponent = this.opponentOf(fighter);

    onUseSkill(fighter, opponent, skillInstance);
    skillInstance.startCooldown(getCooldownMultiplier(fighter, def));

    const recoveryOverride = getRecoveryOverrideSeconds(fighter, def);
    this._beginAction(fighter, {
      kind: 'skill',
      name: skillName,
      skillInstance,
      startupSeconds: def.startupSeconds * getStartupMultiplier(fighter) * getEnemyStartupSlowMultiplier(fighter),
      recoverySeconds: (recoveryOverride ?? def.recoverySeconds) * getRecoveryMultiplier(fighter),
    });
    return true;
  }

  /**
   * 左右のレーン移動。
   * 移動は「発生 → 到着 → 後隙」の流れで、発生中はまだ元のレーンにいる。
   * 早めに動き出さないと攻撃を避けられないので、移動も読み合いの対象になる。
   * @param {number} direction -1 = 左, +1 = 右
   */
  declareMove(fighter, direction) {
    if (!this._canAct(fighter)) return false;

    const target = fighter.lane + Math.sign(direction);
    if (!fighter.canMoveTo(target)) return false;

    this._consumeDodgeActWindow(fighter);
    fighter.isGuarding = false; // 動き出したらガードは解ける
    fighter.actionState = ActionState.MOVING;
    fighter.currentAction = {
      kind: 'move',
      name: direction < 0 ? '左移動' : '右移動',
      targetLane: target,
      fromLane: fighter.lane,
      arrived: false,
      elapsed: 0,
      judged: true,
      startupSeconds: MOVE_STARTUP_SEC,
      recoverySeconds: MOVE_RECOVERY_SEC,
    };
    this._emit('moveStart', { fighter: fighter.id, from: fighter.lane, to: target });
    return true;
  }

  /** ガードは発生・後隙を持たない即時トグル（要件定義.md 3.3: スタミナ消費なし） */
  declareGuard(fighter, isGuarding) {
    if (fighter.actionState === ActionState.RECOVERY) return false; // 後隙中は無防備
    if (fighter.actionState === ActionState.FLINCH) return false;   // ひるみ中も守れない
    // 移動中も不可。避けながら守れると防御手段が重なりすぎる
    if (fighter.actionState === ActionState.MOVING) return false;
    fighter.isGuarding = isGuarding;
    return true;
  }

  /** 相手の攻撃判定タイミングに合わせて入力する回避（要件定義.md 3.3） */
  declareDodge(fighter) {
    fighter.dodgeRequestedAt = this.time;
    return true;
  }

  /** 回避代替スキルの発生（無敵）フレーム中かどうか */
  _isInEvadeSkillStartup(fighter) {
    const action = fighter.currentAction;
    if (!action || fighter.actionState !== ActionState.STARTUP) return false;
    if (action.kind !== 'skill') return false;
    return action.skillInstance.definition.effect.kind === 'evadeSkill';
  }

  _beginAction(fighter, action) {
    fighter.actionState = ActionState.STARTUP;
    fighter.currentAction = { ...action, elapsed: 0, judged: false };
    this._emit('actionStart', { actor: fighter.id, action: action.name, kind: action.kind });
  }

  /* ---- メインループ：BattleEngineの外側(UIのrAFやタイマー)から dt(秒) を渡して呼ぶ ---- */

  tick(dt) {
    if (this.finished) return;
    this.time += dt;

    for (const f of [this.player, this.enemy]) {
      f.tickCooldowns(dt);
      f.tickEffects(dt);
      updateConditionalPassives(f);
      applyHpRegenPassives(f, dt);
      if (f.currentAction) f.currentAction.elapsed += dt;
      // 回避入力の受付ウィンドウを失効させる（UIの「回避中」表示もこの値を参照する）
      if (f.dodgeRequestedAt != null && this.time - f.dodgeRequestedAt > DODGE_TIMING_TOLERANCE_SEC) {
        f.dodgeRequestedAt = null;
      }
    }

    this._advanceAction(this.player, this.enemy);
    this._advanceAction(this.enemy, this.player);

    this._checkRoundEnd();
  }

  _advanceAction(fighter, opponent) {
    const action = fighter.currentAction;
    if (!action) return;

    if (fighter.actionState === ActionState.STARTUP) {
      if (!action.judged && action.elapsed + 1e-9 >= action.startupSeconds) {
        action.judged = true;
        this._resolveJudgment(fighter, opponent, action);
        if (!this.finished) {
          fighter.actionState = ActionState.RECOVERY;
          action.elapsed = 0;
        }
      }
    } else if (fighter.actionState === ActionState.RECOVERY) {
      if (action.elapsed >= action.recoverySeconds) {
        fighter.actionState = ActionState.IDLE;
        fighter.currentAction = null;
        // 回避成功で得た「後隙キャンセル行動」の権利は、その行動が終わった時点で失効する
        fighter.canActWhileDodging = false;
      }
    } else if (fighter.actionState === ActionState.FLINCH) {
      if (action.elapsed >= action.recoverySeconds) {
        fighter.actionState = ActionState.IDLE;
        fighter.currentAction = null;
      }
    } else if (fighter.actionState === ActionState.MOVING) {
      // 発生を過ぎた時点で実際にレーンが変わり、そこから後隙に入る
      if (!action.arrived && action.elapsed >= action.startupSeconds) {
        action.arrived = true;
        fighter.lane = action.targetLane;
        this._emit('moveArrive', { fighter: fighter.id, lane: fighter.lane });
      }
      if (action.elapsed >= action.startupSeconds + action.recoverySeconds) {
        fighter.actionState = ActionState.IDLE;
        fighter.currentAction = null;
      }
    }
  }

  _resolveJudgment(attacker, defender, action) {
    // 「攻撃が必ず当たる」（必中・瞬歩）が乗っている間は、
    // レーンのずれも回避も無視して命中させる
    const alwaysHit = attacker.hasFlag('alwaysHit');

    // 回避代替スキル(即応反射/即応反撃)の無敵判定（要件定義.md 5.3）
    // 敵の攻撃判定が、これらのスキルの発生時間と重なった場合は無敵。
    if (!alwaysHit && this._isInEvadeSkillStartup(defender) && !defender.hasFlag('dodgeDisabled')) {
      defender.canActWhileDodging = true; // 回避行動中に攻撃(スキル含む)が行える
      this._emit('dodge', { defender: defender.id, attacker: attacker.id, action: action.name, viaSkill: defender.currentAction.name });
      return; // ダメージ完全無効化
    }

    // 回避判定: 攻撃の判定タイミングと回避入力タイミングの差が許容誤差以内なら成立
    if (!alwaysHit && defender.dodgeRequestedAt != null) {
      const diff = Math.abs(this.time - defender.dodgeRequestedAt);
      const succeeded = diff <= DODGE_TIMING_TOLERANCE_SEC && !defender.hasFlag('dodgeDisabled');
      defender.dodgeRequestedAt = null;
      if (succeeded) {
        this._emit('dodge', { defender: defender.id, attacker: attacker.id, action: action.name });
        return; // ダメージ完全無効化
      }
    }

    const damageInfo = action.kind === 'normal'
      ? { damageMultiplier: action.damageMultiplier, hits: 1, ignoresGuard: false, ignoresNitoryuPenalty: false }
      : onJudgmentSkill(attacker, defender, action.skillInstance);

    if (damageInfo.damageMultiplier == null && !damageInfo.flatDamage) return; // 純粋なバフ/デバフ効果のみ

    // レーンがずれていれば空振り。左右移動が3つ目の防御手段になる
    if (!alwaysHit && attacker.lane !== defender.lane) {
      this._emit('miss', {
        attacker: attacker.id, defender: defender.id, action: action.name,
        attackerLane: attacker.lane, defenderLane: defender.lane,
      });
      return;
    }

    this._applyDamage(attacker, defender, damageInfo, action.name);
  }

  _applyDamage(attacker, defender, damageInfo, actionName) {
    const hits = damageInfo.hits || 1;
    let totalDamage = 0;
    let guardedAny = false; // ガードで受けたかどうか（UI/SEの出し分けに使う）

    for (let i = 0; i < hits; i++) {
      const excludeSource = damageInfo.ignoresNitoryuPenalty ? '二刀流' : null;
      const attack = attacker.getEffectiveStat('attack', { excludeSource });
      let damage = (damageInfo.flatDamage || 0) + attack * (damageInfo.damageMultiplier || 0);

      const isGuarded = !damageInfo.ignoresGuard && defender.isGuarding && !defender.hasFlag('guardDisabled');
      if (isGuarded) {
        damage *= defender.getGuardDamageMultiplier();
        defender.lastGuardDamageTaken = damage;
        guardedAny = true;
      }

      const damageTakenMultiplier = 1 + defender.activeEffects
        .filter((e) => e.stat === 'damageTakenMultiplier')
        .reduce((sum, e) => sum + e.value, 0);
      damage *= damageTakenMultiplier;

      totalDamage += defender.applyDamage(damage);
    }

    this.damageTaken[defender.id] += totalDamage;
    this._emit('damage', {
      attacker: attacker.id, defender: defender.id,
      amount: Math.round(totalDamage), action: actionName, guarded: guardedAny,
    });

    if (defender.isDown) {
      this.finished = true;
      this.winner = attacker;
      this._emit('roundEnd', { winner: attacker.id });
      return;
    }

    // 発生中に大ダメージを受けたら、その行動を潰す
    if (this._shouldFlinch(defender, totalDamage)) this._applyFlinch(defender);
  }

  /**
   * ひるみ判定。
   * 対象は「発生（溜め）」中のみ。後隙中はすでに無防備な時間なので対象外とする。
   */
  _shouldFlinch(fighter, damage) {
    if (fighter.actionState !== ActionState.STARTUP) return false;
    return damage >= fighter.baseStats.maxHp * FLINCH_DAMAGE_RATIO;
  }

  /** 実行中の行動をキャンセルしてひるませる（CTは消費したまま戻さない） */
  _applyFlinch(fighter) {
    const canceledAction = fighter.currentAction?.name ?? null;

    fighter.actionState = ActionState.FLINCH;
    fighter.currentAction = {
      kind: 'flinch',
      name: 'ひるみ',
      elapsed: 0,
      judged: true,
      startupSeconds: 0,
      recoverySeconds: FLINCH_DURATION_SEC,
    };
    fighter.isGuarding = false;
    fighter.canActWhileDodging = false;
    fighter.dodgeRequestedAt = null;

    this._emit('flinch', { fighter: fighter.id, canceledAction });
  }

  _checkRoundEnd() {
    if (this.finished) return;
    if (this.player.isDown || this.enemy.isDown) {
      this.finished = true;
      this.winner = this.player.isDown && this.enemy.isDown
        ? null
        : (this.player.isDown ? this.enemy : this.player);
      this._emit('roundEnd', { winner: this.winner ? this.winner.id : 'draw' });
    }
  }
}

/* =========================================================
 * 敵選出ユーティリティ（データ一覧.xlsx キャラクター一覧「戦闘タイミング」列準拠）
 * =======================================================*/

/** 1戦目・5戦目・6戦目など、流派やランダム性に依存しない固定対戦相手 */
export function resolveFixedOpponent(roundNumber) {
  if (roundNumber === 1) return 'ごろつき';
  if (roundNumber === 5) return '瞬瞑 龍斗';
  if (roundNumber === 6) return '沖田 雫';
  return null;
}

/** 2戦目・3戦目: プレイヤーが選択した流派に応じた固定対戦相手 */
export function resolveSchoolOpponent(roundNumber, school) {
  const key = `${school}選択時${roundNumber}戦目`;
  const found = Object.values(CHARACTERS).find((c) => c.timing === key);
  return found ? found.name : null;
}

/**
 * 4戦目: 緋天飛鳥/ローザ/武田白波(各30%) と 切裂劣子(10%、レアエネミー)の確率抽選。
 * 要件定義.md 6章「確率テーブル参照型」の最小実装。
 */
export function pickRound4Opponent(rng = Math.random) {
  const pool = [
    { name: '緋天 飛鳥', weight: 0.30 },
    { name: 'ローザ', weight: 0.30 },
    { name: '武田 白波', weight: 0.30 },
    { name: '切裂 劣子', weight: 0.10 },
  ];
  const roll = rng();
  let acc = 0;
  for (const { name, weight } of pool) {
    acc += weight;
    if (roll < acc) return name;
  }
  return pool[0].name;
}

/* =========================================================
 * BattleMatch: 全5戦闘（+条件付き6戦目）の勝ち抜き進行
 * =======================================================*/

/** プレイヤーが選択できる流派 */
export const SCHOOLS = Object.freeze(['双海流', '連炎流', '瞬瞑流']);

/** 裏ボス（沖田 雫）が出現する戦闘番号 */
export const SECRET_BOSS_ROUND = 6;

export class BattleMatch {
  /**
   * @param {import('./models.js').Fighter} playerFighter
   * @param {() => number} [rng] 4戦目の抽選に使う乱数（テストで差し替え可能）
   */
  constructor(playerFighter, rng = Math.random) {
    this.player = playerFighter;
    this.rng = rng;
    this.roundNumber = 0;          // 完了済みも含む「現在の戦闘番号」。0 = 未開始
    this.selectedSchool = null;    // 1戦目勝利後に選択する流派
    this.history = [];             // { roundNumber, opponentName, winnerId, damageTaken }
    this.currentRound = null;
    this.currentOpponentName = null;
    this.secretBossUnlocked = false; // ボスをノーダメージで撃破したか
    this._pendingOpponentName = null; // 抽選済みの次戦相手（resolveNextOpponentName のキャッシュ）

    this.totalScore = 0;       // 勝利した戦闘のスコア合計
    this.usedContinue = false; // コンテニューを使ったか（使うとスコアは0から数え直し）
  }

  /* ---- 対戦相手の決定（データ一覧.xlsx「戦闘タイミング」列準拠） ---- */

  /**
   * 次に戦う相手の名前。流派未選択で2戦目に進もうとした場合は null。
   *
   * 4戦目は抽選で決まるため、一度決まった相手をキャッシュする。
   * （インターバル画面での予告表示と実際の対戦相手がズレないようにするため）
   */
  resolveNextOpponentName() {
    if (this._pendingOpponentName) return this._pendingOpponentName;

    const next = this.roundNumber + 1;
    let name;
    if (next === 2 || next === 3) {
      name = this.selectedSchool ? resolveSchoolOpponent(next, this.selectedSchool) : null;
    } else if (next === 4) {
      name = pickRound4Opponent(this.rng);
    } else {
      name = resolveFixedOpponent(next); // 1戦目・5戦目・6戦目
    }

    this._pendingOpponentName = name; // null(流派未選択)はキャッシュしない
    return name;
  }

  /* ---- 流派選択 ---- */

  /**
   * 流派は1戦目勝利後に選択する。
   * これにより2戦目(門下生)・3戦目(師範)の対戦相手と、以降の報酬プールが決まる。
   */
  get requiresSchoolSelection() {
    return this.roundNumber === 1 && this.selectedSchool === null;
  }

  selectSchool(school) {
    if (!SCHOOLS.includes(school)) throw new Error(`未定義の流派です: ${school}`);
    this.selectedSchool = school;
  }

  /* ---- 戦闘の進行 ---- */

  /**
   * 次の戦闘を開始する。
   * @param {import('./models.js').Fighter} enemyFighter 事前に選出・生成したFighter
   * @param {(type:string, data:object)=>void} [onEvent]
   */
  startNextRound(enemyFighter, onEvent) {
    if (this.isMatchOver) throw new Error('全戦闘が終了しています');
    this.roundNumber += 1;
    this.currentOpponentName = enemyFighter.name;
    this._pendingOpponentName = null; // 次の戦闘に向けて抽選し直す
    this.currentRound = new BattleRound(this.player, enemyFighter, onEvent);
    return this.currentRound;
  }

  /** 戦闘終了後に呼び、結果を履歴へ記録する */
  recordRoundResult() {
    const round = this.currentRound;
    const playerWon = round.winner === this.player;

    // スコアは勝った戦闘だけ加算する（負けた戦闘は0点）
    const score = playerWon
      ? calculateBattleScore({
        clearTimeSec: round.time,
        damageTaken: round.damageTaken.player,
        maxHp: this.player.baseStats.maxHp,
      })
      : null;
    if (score) this.totalScore += score.total;

    this.history.push({
      roundNumber: this.roundNumber,
      opponentName: round.enemy.name,
      winnerId: round.winner ? round.winner.id : 'draw',
      damageTaken: round.damageTaken.player,
      clearTimeSec: round.time,
      score,
    });

    // 裏ボス出現条件: ボス(5戦目)をノーダメージで撃破する
    if (this.roundNumber === MATCH_CONFIG.totalRounds && playerWon && round.damageTaken.player === 0) {
      this.secretBossUnlocked = true;
    }
    return playerWon;
  }

  get lastResultIsWin() {
    return this.history.at(-1)?.winnerId === this.player.id;
  }

  /** 直近の戦闘のスコア（負けた戦闘は null） */
  get lastScore() {
    return this.history.at(-1)?.score ?? null;
  }

  /**
   * 敗北した戦闘をやり直す（コンテニュー）。
   * ステータスと装備スキルはそのまま引き継ぎ、負けた戦闘の直前の状態へ戻す。
   * 引き換えにスコアは0から数え直しになる。
   * @returns {boolean} コンテニューできたか
   */
  continueAfterDefeat() {
    const last = this.history.at(-1);
    if (!last || last.winnerId === this.player.id) return false;

    this.history.pop();          // 敗北の記録を取り消す
    this.roundNumber -= 1;       // 同じ戦闘をもう一度
    this.totalScore = 0;         // コンテニューの代償
    this.usedContinue = true;
    // 合計が0なのに過去の戦闘に点が残っていると食い違って見えるため、
    // それまでに稼いだスコアも無効にする（記録自体は残す）
    for (const entry of this.history) entry.score = null;
    this.currentRound = null;
    // 同じ相手と戦い直せるよう、抽選済みの相手をそのまま復元する
    this._pendingOpponentName = last.opponentName;
    return true;
  }

  /** 5戦全て勝ち抜いた（裏ボス条件を満たした場合は6戦目まで）か */
  get isMatchOver() {
    const finalRound = this.secretBossUnlocked ? SECRET_BOSS_ROUND : MATCH_CONFIG.totalRounds;
    return this.roundNumber >= finalRound;
  }

  /* ---- インターバル成長（要件定義.md 2章） ---- */

  /**
   * 勝利後にスキル交換のインターバルへ入れるか。
   * 要件定義.md 2章は交換タイミングを「1〜4戦目終了時」と明示しているため、
   * 5戦目(ボス)の勝利後は、裏ボス戦が控えていても交換できない。
   */
  get canSwapSkill() {
    return this.lastResultIsWin && this.roundNumber < MATCH_CONFIG.totalRounds;
  }

  /**
   * 勝利報酬として提示するスキル候補。
   *
   * 流派スキルは「2戦目以降の勝利報酬」として登場する（要件定義.md 2章）。
   * 1戦目の勝利報酬＝流派なしのみ、2〜4戦目の勝利報酬＝流派なし＋選択流派、
   * となるため流派スキルを取れる機会は3回 = 装着上限3個、と要件の記述と一致する。
   */
  getRewardSkillNames() {
    const equipped = new Set(this.player.skills.map((s) => s.name));
    const schoolUnlocked = this.roundNumber >= 2 && this.selectedSchool !== null;

    return Object.values(SKILLS)
      .filter((def) => {
        if (equipped.has(def.name)) return false;
        if (def.school === null) return true;
        return schoolUnlocked && def.school === this.selectedSchool;
      })
      .map((def) => def.name);
  }

  /** 装備スキル1枠を交換する */
  applyVictoryReward(oldSkillName, newSkillName) {
    this.player.replaceSkill(oldSkillName, newSkillName);
  }
}
