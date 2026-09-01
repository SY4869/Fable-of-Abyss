// ChaosSwordGarden - 戦闘画面の描画
//
// 画面構成は当初の画面イメージに準拠した一人称視点:
//   ・敵は画面中央、こちらを向いて立つ
//   ・上下に装飾HPバー、左列に円形スキルアイコン、右下に自分の剣
//
// 要件定義.md 7章:
//   ・スキルアイコン: CT残数をゲージ + 数値(秒)でリアルタイム更新
//     （円形アイコンなので、暗転オーバーレイは扇形スイープで表現）
//   ・バフ/デバフアイコン: HPバーに並べて残り時間カウントダウンを表示
//
// 敵の状態はモーションで伝える:
//   溜め（発生） … 沈み込んで力を溜め、着弾の瞬間に一気に踏み込む
//   後隙        … 振り抜いた姿勢から、減衰する揺れでよろけながら戻る
// モーションは固定尺のCSSアニメーションではなくJSがフレームごとに
// transform を計算する。発生時間はスキルごとに 0.15s〜1.10s と幅があり、
// CSS側で尺を固定すると実際の判定タイミングと演出がズレるため。

'use strict';

import { RECOVERY_TIME, SKILLS, INITIAL_LANE } from './data.js';
import { ActionState } from './models.js';
import { canActivateSkill } from './skill-effects.js';
import { keyLabel, SKILL_ACTION_IDS } from './input.js';

/** これ以上の後隙は「反撃チャンス」として強調する（ai.js の反撃判定と同じ閾値） */
const PUNISHABLE_RECOVERY = RECOVERY_TIME['中'];

/** レーンが1つ違うごとに、敵が画面上でどれだけ横にずれて見えるか */
const ENEMY_LANE_OFFSET_PX = 190;

/** 自分が横移動した時に背景を流す量（カメラが動いた感じを出す） */
const BACKGROUND_PARALLAX_PX = 26;

/** 溜めから踏み込みに切り替わる進行度（発生時間に対する割合） */
const CHARGE_RATIO = 0.76;

/** 被弾のけぞりが続く時間（秒） */
const HIT_REACTION_SEC = 0.26;

/* 流派ごとのアイコン配色 */
const SCHOOL_COLORS = Object.freeze({
  なし: ['#9aa3b2', '#2b3140'],
  双海流: ['#5fb8ff', '#0b2a4d'],
  連炎流: ['#ff8a4c', '#4d1a08'],
  瞬瞑流: ['#b784ff', '#2a0d4d'],
});

/* バフ/デバフの短縮ラベル（アイコン画像の代替） */
const STAT_LABELS = Object.freeze({
  attack: '攻',
  speed: '速',
  guardRate: '防',
  actionStartupReduction: '発',
  actionRecoveryReduction: '隙',
  startupSlow: '鈍',
  damageTakenMultiplier: '被',
});

const FLAG_LABELS = Object.freeze({
  guardDisabled: '防封',
  dodgeDisabled: '回封',
  visualObstruction: '盲',
  alwaysHit: '必中',
});

/** 保持者にとって有利なフラグ（不利フラグと色分けするため） */
const BENEFICIAL_FLAGS = new Set(['alwaysHit']);

/** その効果が「保持者にとって不利」かどうか（アイコンの色分けに使用） */
function isDetrimental(effect) {
  if (effect.flag) return !BENEFICIAL_FLAGS.has(effect.flag);
  if (effect.stat === 'startupSlow' || effect.stat === 'damageTakenMultiplier') return true;
  return effect.value < 0;
}

function describeEffect(effect) {
  if (effect.flag) return FLAG_LABELS[effect.flag] || effect.flag;
  const label = STAT_LABELS[effect.stat] || effect.stat;
  const sign = effect.value >= 0 ? '+' : '';
  return `${label}${sign}${Math.round(effect.value * 100)}%`;
}

/** 行動の進行度 0〜1 */
function actionProgress(action, totalSeconds) {
  if (!action || totalSeconds <= 0) return 1;
  return Math.min(1, action.elapsed / totalSeconds);
}

/* =========================================================
 * FighterPanel: 1人分の表示
 *   hud    … 名前・HPバー・バフアイコン・状態テキスト（+敵はキャストバー）
 *   actor  … キャラクタースプライト（一人称視点のため敵のみ）
 *   popups … ダメージ数値の表示先
 * =======================================================*/

class FighterPanel {
  constructor({ hud, actor, popups, fighter, auraTarget }) {
    this.fighter = fighter;
    this.hud = hud;
    this.actor = actor || null;
    this.popupsEl = popups;

    this.nameEl = hud.querySelector('[data-role="name"]');
    this.hpFillEl = hud.querySelector('[data-role="hp-fill"]');
    this.hpTextEl = hud.querySelector('[data-role="hp-text"]');
    this.buffsEl = hud.querySelector('[data-role="buffs"]');
    this.stateEl = hud.querySelector('[data-role="state"]');
    this.castEl = hud.querySelector('.cast-bar');
    this.castNameEl = hud.querySelector('.cast-name');
    this.castFillEl = hud.querySelector('.cast-fill');

    this.spriteEl = this.actor?.querySelector('.actor-sprite') ?? null;
    this.auraEl = auraTarget ?? null;
    this._auraSkill = null; // 現在表示中のオーラの付与元スキル名

    this.nameEl.textContent = fighter.name;
    this._buffNodes = new Map(); // sourceSkill -> DOM要素（毎フレーム作り直さないためのキャッシュ）
    this._hitAt = null;          // 被弾のけぞりの起点（秒）

    // 前の戦闘で残った表示を掃除する（アイコンはキャッシュ側で管理するため、
    // クリアし忘れると再戦時に同じバフが二重に並ぶ）
    this.buffsEl.innerHTML = '';
    this.popupsEl.innerHTML = '';
    this.auraEl?.classList.remove('visible');
    if (this.actor) {
      this.actor.classList.remove('hit', 'punishable', 'dodging');
      this.actor.dataset.state = 'idle';
    }
  }

  /** @param {number} time 戦闘開始からの経過秒数（待機モーションなどに使用） */
  render(time) {
    this._renderHp();
    this._renderBuffs();
    this._renderAura();
    this._renderActorState();
    this._renderMotion(time);
    this._renderCast();
    this._renderStateText();
  }

  /**
   * エンチャント発動中のオーラ。
   * 敵は立ち絵に重ね、プレイヤーは一人称で立ち絵が無いため画面のフチを染める。
   */
  _renderAura() {
    if (!this.auraEl) return;

    // 効果時間つきの自己バフのうち、オーラ画像を持つスキルを探す
    const active = this.fighter.activeEffects.find(
      (e) => !e.expired && SKILLS[e.sourceSkill]?.aura
    );
    const skillName = active?.sourceSkill ?? null;
    if (skillName === this._auraSkill) return; // 変化なし（毎フレームのDOM更新を避ける）
    this._auraSkill = skillName;

    if (!skillName) {
      this.auraEl.classList.remove('visible');
      return;
    }

    const src = SKILLS[skillName].aura;
    if (this.auraEl.tagName === 'IMG') {
      this.auraEl.src = src;
    } else {
      this.auraEl.style.backgroundImage = `url('${src}')`;
    }
    this.auraEl.classList.add('visible');
  }

  _renderHp() {
    const f = this.fighter;
    const ratio = Math.max(0, f.currentHp / f.baseStats.maxHp);
    this.hpFillEl.style.width = `${ratio * 100}%`;
    this.hpFillEl.classList.toggle('low', ratio <= 0.5); // 底力の発動ラインと一致
    this.hpTextEl.textContent = `${Math.ceil(f.currentHp)} / ${f.baseStats.maxHp}`;
  }

  /** 効果は付与元スキル単位でまとめて1アイコンにする */
  _groupEffects() {
    const groups = new Map();
    for (const effect of this.fighter.activeEffects) {
      let group = groups.get(effect.sourceSkill);
      if (!group) {
        group = { sourceSkill: effect.sourceSkill, effects: [], remaining: effect.remaining, duration: effect.duration };
        groups.set(effect.sourceSkill, group);
      }
      group.effects.push(effect);
      // 同一スキル由来で残り時間が違う場合は短い方（先に切れる方）に合わせる
      if (effect.remaining != null && (group.remaining == null || effect.remaining < group.remaining)) {
        group.remaining = effect.remaining;
        group.duration = effect.duration;
      }
    }
    return groups;
  }

  _renderBuffs() {
    const groups = this._groupEffects();

    // 消滅した効果のアイコンを取り除く
    for (const [key, node] of this._buffNodes) {
      if (!groups.has(key)) {
        node.remove();
        this._buffNodes.delete(key);
      }
    }

    for (const [key, group] of groups) {
      let node = this._buffNodes.get(key);
      if (!node) {
        node = document.createElement('div');
        node.className = 'buff-icon';
        node.innerHTML = '<span class="buff-label"></span><div class="buff-gauge"><div class="buff-gauge-fill"></div></div>';
        this.buffsEl.appendChild(node);
        this._buffNodes.set(key, node);
      }

      node.classList.toggle('detrimental', group.effects.some(isDetrimental));
      node.querySelector('.buff-label').textContent = key.slice(0, 2);

      const detail = group.effects.map(describeEffect).join(' / ');
      const remainText = group.remaining == null ? '常時' : `残り${group.remaining.toFixed(1)}s`;
      node.title = `${key}（${detail}）${remainText}`;

      // 有効時間の残りカウントダウンゲージ（常時効果はゲージを出さず満タン固定）
      const fill = node.querySelector('.buff-gauge-fill');
      if (group.remaining == null || !group.duration) {
        fill.style.width = '100%';
        node.classList.add('permanent');
      } else {
        fill.style.width = `${Math.max(0, (group.remaining / group.duration) * 100)}%`;
        node.classList.remove('permanent');
      }
    }
  }

  /** キャラクターの状態を data-state に反映する（発光などのCSS側の演出用） */
  _renderActorState() {
    if (!this.actor) return;
    const f = this.fighter;

    let state = 'idle';
    if (f.isDown) state = 'down';
    else if (f.actionState === ActionState.FLINCH) state = 'flinch';
    else if (f.actionState === ActionState.STARTUP) state = 'startup';
    else if (f.actionState === ActionState.RECOVERY) state = 'recovery';
    else if (f.isGuarding) state = 'guard';

    this.actor.dataset.state = state;
    this.actor.classList.toggle('dodging', f.dodgeRequestedAt != null || f.invulnerableUntil != null);

    // 後隙(中・大)とひるみは攻め込める時間なので明示的に強調する
    const punishable = state === 'flinch'
      || (state === 'recovery' && f.currentAction
        && f.currentAction.recoverySeconds >= PUNISHABLE_RECOVERY);
    this.actor.classList.toggle('punishable', !!punishable);
  }

  /**
   * 溜め・踏み込み・よろけのモーション。
   * 進行度は実際の発生/後隙の秒数から求めるので、演出と判定が必ず一致する。
   */
  _renderMotion(time) {
    if (!this.spriteEl) return;
    const f = this.fighter;
    const action = f.currentAction;
    let ty = 0;
    let scale = 1;
    let rot = 0;

    if (f.isDown) {
      ty = 34; rot = -16; scale = 0.94;
    } else if (f.actionState === ActionState.FLINCH && action) {
      // ひるみ: 強く弾かれて仰け反り、揺れながら体勢を戻す
      const t = actionProgress(action, action.recoverySeconds);
      const decay = 1 - t;
      scale = 1 - 0.06 * decay;
      ty = 8 * decay;
      rot = -14 * decay * Math.cos(t * 11);
    } else if (f.actionState === ActionState.STARTUP && action) {
      const t = actionProgress(action, action.startupSeconds);
      if (t < CHARGE_RATIO) {
        // 溜め: 沈み込みながら後ろへ引く（力を溜めている）
        const k = t / CHARGE_RATIO;
        const ease = k * k;
        scale = 1 - 0.08 * ease;
        ty = 16 * ease;
        rot = -5 * ease;
      } else {
        // 踏み込み: 着弾に向かって一気にこちらへ迫る
        const k = (t - CHARGE_RATIO) / (1 - CHARGE_RATIO);
        const ease = 1 - Math.pow(1 - k, 3);
        scale = 0.92 + 0.34 * ease;
        ty = 16 - 38 * ease;
        rot = -5 + 11 * ease;
      }
    } else if (f.actionState === ActionState.RECOVERY && action) {
      // 後隙: 振り抜いた姿勢から、減衰する揺れでよろけながら戻る
      const t = actionProgress(action, action.recoverySeconds);
      const decay = 1 - t;
      scale = 1 + 0.2 * decay;
      ty = -14 * decay;
      rot = 10 * decay * Math.cos(t * 9);
    } else {
      // 待機: ゆっくり呼吸させて生きている感じを出す
      const breath = Math.sin(time * 1.9);
      ty = breath * 3;
      scale = 1 + breath * 0.005;
    }

    // 被弾のけぞりは現在のモーションに上乗せする
    if (this._hitAt != null) {
      const since = time - this._hitAt;
      if (since >= 0 && since < HIT_REACTION_SEC) {
        const decay = 1 - since / HIT_REACTION_SEC;
        scale -= 0.07 * decay;
        ty -= 6 * decay;
        rot += 9 * decay * Math.sin(since * 60);
      } else if (since >= HIT_REACTION_SEC) {
        this._hitAt = null;
      }
    }

    this.spriteEl.style.transform =
      `translateY(${ty.toFixed(2)}px) scale(${scale.toFixed(4)}) rotate(${rot.toFixed(2)}deg)`;
  }

  /**
   * キャストバー。
   * 発生中は「着弾までの進行」、後隙中は「反撃できる残り時間」を表示する。
   */
  _renderCast() {
    if (!this.castEl) return;
    const f = this.fighter;
    const action = f.currentAction;
    const isStartup = f.actionState === ActionState.STARTUP;
    const isRecovery = f.actionState === ActionState.RECOVERY;
    const isFlinch = f.actionState === ActionState.FLINCH;

    if (!action || (!isStartup && !isRecovery && !isFlinch)) {
      this.castEl.classList.remove('visible');
      return;
    }

    const total = isStartup ? action.startupSeconds : action.recoverySeconds;
    const ratio = actionProgress(action, total);

    this.castEl.classList.add('visible');
    this.castEl.classList.toggle('recovery', isRecovery || isFlinch);

    if (isStartup) {
      this.castNameEl.textContent = action.name;
      this.castFillEl.style.width = `${ratio * 100}%`; // 満タンで着弾
    } else {
      // 後隙・ひるみはどちらも「攻め込める残り時間」を減っていくゲージで示す
      const remaining = Math.max(0, total - action.elapsed);
      this.castNameEl.textContent = isFlinch
        ? `ひるみ ${remaining.toFixed(1)}s`
        : `後隙 ${remaining.toFixed(1)}s`;
      this.castFillEl.style.width = `${(1 - ratio) * 100}%`;
    }
  }

  /** ガード中・回避受付中などの瞬間的な状態表示 */
  _renderStateText() {
    const f = this.fighter;
    const states = [];
    if (f.isGuarding) states.push('ガード中');
    if (f.dodgeRequestedAt != null) states.push('回避受付');
    if (f.invulnerableUntil != null) states.push('無敵');
    if (f.hasFlag('dodgeDisabled')) states.push('回避不可');
    if (f.hasFlag('guardDisabled')) states.push('防御不可');

    // 一人称視点の自分にはキャストバーが無いので、状態テキストで発生/後隙を補う
    if (!this.castEl && f.currentAction) {
      const a = f.currentAction;
      const remaining = Math.max(0, a.recoverySeconds - a.elapsed).toFixed(1);
      if (f.actionState === ActionState.STARTUP) {
        states.unshift(`${a.name} 発生中`);
      } else if (f.actionState === ActionState.RECOVERY) {
        states.unshift(`後隙 ${remaining}s`);
      } else if (f.actionState === ActionState.FLINCH) {
        states.unshift(`ひるみ ${remaining}s`);
      }
    }
    this.stateEl.textContent = states.join(' / ');
  }

  /* ---- イベント由来の演出（毎フレームではなく発生時に1回呼ぶ） ---- */

  showPopup(text, kind = '') {
    const node = document.createElement('div');
    node.className = `popup ${kind}`;
    node.textContent = text;
    // 連続ヒット時に数値が重ならないよう横位置を散らす
    node.style.setProperty('--dx', `${Math.round(Math.random() * 56 - 28)}px`);
    this.popupsEl.appendChild(node);
    node.addEventListener('animationend', () => node.remove());
  }

  /** @param {number} time 現在の戦闘経過秒数（のけぞりの起点に使う） */
  flashHit(time) {
    this._hitAt = time;
    if (!this.actor) return;
    this.actor.classList.remove('hit');
    void this.actor.offsetWidth; // アニメーションを再生し直すためのリフロー
    this.actor.classList.add('hit');
  }
}

/* =========================================================
 * WeaponView: 一人称視点のプレイヤーの剣
 *   自分にはスプライトが無いので、剣の動きで自分の状態を伝える。
 *   振りかぶり → 振り下ろし → 戻し、ガード時は前に構える。
 * =======================================================*/

class WeaponView {
  /** 構え位置の傾き（刃先を右上へ逃がし、中央の敵を隠さない） */
  static BASE_ROTATION = 16;

  constructor(root, fighter) {
    this.root = root;
    this.fighter = fighter;
  }

  render(time) {
    const f = this.fighter;
    const action = f.currentAction;
    let tx = 0;
    let ty = 0;
    let rot = 0;

    if (f.actionState === ActionState.STARTUP && action) {
      const t = actionProgress(action, action.startupSeconds);
      if (t < CHARGE_RATIO) {
        // 振りかぶる（右下へ引く）
        const ease = Math.pow(t / CHARGE_RATIO, 2);
        rot = 26 * ease; tx = 22 * ease; ty = 26 * ease;
      } else {
        // 振り下ろす（画面を横切って左上へ）
        const k = (t - CHARGE_RATIO) / (1 - CHARGE_RATIO);
        const ease = 1 - Math.pow(1 - k, 3);
        rot = 26 - 78 * ease; tx = 22 - 70 * ease; ty = 26 - 46 * ease;
      }
    } else if (f.actionState === ActionState.RECOVERY && action) {
      // 振り抜いた位置から構えへ戻る
      const decay = 1 - actionProgress(action, action.recoverySeconds);
      rot = -52 * decay; tx = -48 * decay; ty = -20 * decay;
    } else if (f.isGuarding) {
      // 前に構えて受ける
      rot = -16; tx = -30; ty = -34;
    } else {
      // 待機：呼吸に合わせて上下に揺れる
      ty = Math.sin(time * 1.6) * 5;
      rot = Math.sin(time * 1.1) * 1.5;
    }

    const angle = WeaponView.BASE_ROTATION + rot;
    this.root.style.transform = `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px) rotate(${angle.toFixed(1)}deg)`;
  }
}

/* =========================================================
 * SkillBar: 装備スキル4枠（円形アイコン + CTスイープ + 残り秒数）
 * =======================================================*/

class SkillBar {
  /**
   * @param {HTMLElement} root
   * @param {import('./models.js').Fighter} fighter
   * @param {import('./input.js').KeyConfig} keyConfig 表示するキーは設定に追従させる
   */
  constructor(root, fighter, keyConfig) {
    this.root = root;
    this.fighter = fighter;
    this.root.innerHTML = '';

    this.slots = fighter.skills.map((skillInstance, index) => {
      const def = skillInstance.definition;
      const [light, dark] = SCHOOL_COLORS[def.school ?? 'なし'];

      const el = document.createElement('div');
      el.className = 'skill-icon';
      el.style.setProperty('--icon-light', light);
      el.style.setProperty('--icon-dark', dark);
      el.innerHTML = `
        <div class="icon-circle">
          <span class="icon-glyph">${def.name.slice(0, 1)}</span>
          <div class="ct-sweep"></div>
          <span class="ct-text"></span>
          <span class="slot-key">${keyLabel(keyConfig.getKey(SKILL_ACTION_IDS[index]))}</span>
        </div>
        <span class="icon-name">${def.name}</span>`;
      el.title = `${def.name}\n${def.description}`;
      this.root.appendChild(el);

      return {
        el,
        sweep: el.querySelector('.ct-sweep'),
        text: el.querySelector('.ct-text'),
        skillInstance,
      };
    });
  }

  render() {
    for (const slot of this.slots) {
      const { skillInstance, el, sweep, text } = slot;

      if (skillInstance.isPassive) {
        el.className = 'skill-icon passive';
        sweep.style.setProperty('--sweep', '0deg');
        text.textContent = '常時';
        continue;
      }

      const remaining = skillInstance.remainingCooldown;
      if (remaining > 0) {
        // CT残数を扇形の暗転スイープ + 数値(秒)でリアルタイム表示
        el.className = 'skill-icon cooling';
        sweep.style.setProperty('--sweep', `${(remaining / skillInstance.cooldownTotal) * 360}deg`);
        text.textContent = remaining.toFixed(1);
        continue;
      }

      sweep.style.setProperty('--sweep', '0deg');
      // CTは明けているが発動条件（ネオスラッシュの時限ゲート等）を満たしていない
      if (!canActivateSkill(this.fighter, skillInstance)) {
        el.className = 'skill-icon locked';
        text.textContent = '条件外';
        continue;
      }

      el.className = 'skill-icon ready';
      text.textContent = '';
    }
  }
}

/* =========================================================
 * BattleUI: 画面全体のとりまとめ
 * =======================================================*/

export class BattleUI {
  constructor(elements) {
    this.elements = elements;
    this.panels = {};
    this.skillBar = null;
    this.weapon = null;
    this.player = null;
    this.time = 0;
  }

  /**
   * 戦闘のFighterに紐づけてDOMを構築する。
   * BattleRoundは生成時点で roundStart イベントを発火するため、
   * ログを消さないよう「ラウンド生成より前」に呼ぶこと。
   */
  bind(player, enemy, keyConfig) {
    const e = this.elements;
    this.player = player;
    this.time = 0;
    this.panels = {
      player: new FighterPanel({
        hud: e.playerHud, actor: null, popups: e.playerPopups,
        fighter: player, auraTarget: e.playerAura,
      }),
      enemy: new FighterPanel({
        hud: e.enemyHud, actor: e.enemyActor, popups: e.enemyActor.querySelector('.popups'),
        fighter: enemy, auraTarget: e.enemyActor.querySelector('.aura'),
      }),
    };
    this.skillBar = new SkillBar(e.skillBar, player, keyConfig);
    this.weapon = new WeaponView(e.playerWeapon, player);

    // 立ち絵と背景は対戦相手ごとに差し替える（data.js のキャラクター定義が持つ）
    if (enemy.portrait) e.enemyActor.querySelector('.portrait').src = enemy.portrait;
    if (enemy.background) e.stageBg.style.backgroundImage = `url('${enemy.background}')`;

    e.log.innerHTML = '';
  }

  /** @param {number} time 戦闘開始からの経過秒数 */
  render(time = 0) {
    this.time = time;
    this.panels.player.render(time);
    this.panels.enemy.render(time);
    this.skillBar.render();
    this.weapon.render(time);
    this._renderLanes();
    // 心眼(プレイヤー使用時)の視界妨害演出（要件定義.md 5.1）
    this.elements.stage.classList.toggle('blinded', this.player.hasFlag('visualObstruction'));
  }

  /**
   * レーン表示と、敵の見える位置。
   *
   * 一人称視点なのでカメラは常にプレイヤーに付いている。
   * つまり敵が画面のどこに見えるかは「敵と自分のレーン差」で決まり、
   * 正面に見える ＝ 同じレーン ＝ 攻撃が当たる、が一目で分かる。
   */
  _renderLanes() {
    const player = this.panels.player.fighter;
    const enemy = this.panels.enemy.fighter;
    const e = this.elements;

    const diff = enemy.lane - player.lane;
    e.enemyActor.style.transform = `translateX(calc(-50% + ${diff * ENEMY_LANE_OFFSET_PX}px))`;

    // 足元のマスもカメラと一緒に流す。こうしないと敵の立ち位置とマスがずれる
    if (e.laneField) {
      const shift = (INITIAL_LANE - player.lane) * ENEMY_LANE_OFFSET_PX;
      e.laneField.style.transform = `translateX(calc(-50% + ${shift}px))`;
    }

    // 背景を逆方向に少し流して、自分が横に動いた感じを出す
    if (e.stageBg) {
      const parallax = (INITIAL_LANE - player.lane) * BACKGROUND_PARALLAX_PX;
      e.stageBg.style.transform = `translateX(${parallax}px)`;
    }

    this._paintLaneRow(e.playerLanes, player.lane, diff === 0);
    this._paintLaneRow(e.enemyLanes, enemy.lane, diff === 0);
  }

  _paintLaneRow(row, occupiedLane, aligned) {
    if (!row) return;
    row.querySelectorAll('.lane-cell').forEach((cell, index) => {
      const isHere = index === occupiedLane;
      cell.classList.toggle('occupied', isHere);
      cell.classList.toggle('aligned', isHere && aligned);
    });
  }

  /* ---- 戦闘イベントに対応する演出 ---- */

  notifyDamage(defenderId, amount) {
    const panel = this.panels[defenderId];
    if (!panel) return;
    panel.flashHit(this.time);
    panel.showPopup(String(amount), defenderId === 'player' ? 'to-player' : 'to-enemy');

    // 自分の被弾は一人称なので画面全体を赤く縁取って伝える
    if (defenderId === 'player') {
      const v = this.elements.hitVignette;
      v.classList.remove('flash');
      void v.offsetWidth;
      v.classList.add('flash');
    }
  }

  notifyDodge(defenderId) {
    this.panels[defenderId]?.showPopup('回避！', 'dodge');
  }

  notifyFlinch(fighterId) {
    this.panels[fighterId]?.showPopup('ひるみ！', 'flinch');
  }

  /** 空振り。攻撃を外した側ではなく、かわした側の位置に出す方が状況が読みやすい */
  notifyMiss(attackerId) {
    const dodgedBy = attackerId === 'player' ? 'enemy' : 'player';
    this.panels[dodgedBy]?.showPopup('MISS', 'miss');
  }

  appendLog(text, kind = '') {
    const line = document.createElement('div');
    line.className = `log-line ${kind}`;
    line.textContent = text;
    this.elements.log.appendChild(line);
    // ログが伸び続けないよう古い行を捨てる
    while (this.elements.log.childElementCount > 60) {
      this.elements.log.firstElementChild.remove();
    }
    this.elements.log.scrollTop = this.elements.log.scrollHeight;
  }
}
