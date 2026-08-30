// ChaosSwordGarden - キーボード入力とキー設定（要件定義.md 7章: PCブラウザ / キーボード操作推奨）
//
// KeyboardEvent.code（物理キー位置）で判定する。
// KeyboardEvent.key を使うと日本語IMEがONの状態で入力を取りこぼすため、
// リアルタイム対戦では code での判定が必須。
// この方針のおかげでキー設定も「物理キーの位置」で保存でき、配列違いでもズレない。

'use strict';

/**
 * 割り当て可能なアクションの一覧。
 * type/value はそのまま BattleRound への指示に対応する:
 *   move   … 左右のレーン移動（value = -1 左 / +1 右）
 *   normal … 通常攻撃（value = 攻撃名）
 *   skill  … 装備スキル（value = スロット番号 0〜3）
 *   guard  … 押しっぱなしで持続するガード
 *   dodge  … 回避（押した瞬間だけ）
 */
export const ACTIONS = Object.freeze([
  { id: 'moveLeft', label: '左に移動', type: 'move', value: -1, defaultKey: 'ArrowLeft' },
  { id: 'moveRight', label: '右に移動', type: 'move', value: 1, defaultKey: 'ArrowRight' },
  { id: 'thrust', label: '突き', type: 'normal', value: '突き', defaultKey: 'KeyA' },
  { id: 'horizontal', label: '横振り', type: 'normal', value: '横振り', defaultKey: 'KeyS' },
  { id: 'vertical', label: '縦振り', type: 'normal', value: '縦振り', defaultKey: 'KeyD' },
  { id: 'guard', label: 'ガード', type: 'guard', defaultKey: 'Space' },
  { id: 'dodge', label: '回避', type: 'dodge', defaultKey: 'KeyF' },
  { id: 'skill1', label: 'スキル1', type: 'skill', value: 0, defaultKey: 'Digit1' },
  { id: 'skill2', label: 'スキル2', type: 'skill', value: 1, defaultKey: 'Digit2' },
  { id: 'skill3', label: 'スキル3', type: 'skill', value: 2, defaultKey: 'Digit3' },
  { id: 'skill4', label: 'スキル4', type: 'skill', value: 3, defaultKey: 'Digit4' },
]);

/** スキルスロット（0〜3）に対応するアクションID */
export const SKILL_ACTION_IDS = Object.freeze(['skill1', 'skill2', 'skill3', 'skill4']);

/**
 * 割り当てを禁止するキー。
 * ブラウザ自身の機能（リロード・開発者ツール・フォーカス移動）と競合するため。
 * Escape はキー設定中のキャンセル操作に使う。
 */
const RESERVED_KEYS = new Set([
  'Escape', 'Tab', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6',
  'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
]);

export function isReservedKey(code) {
  return RESERVED_KEYS.has(code);
}

const NAMED_KEY_LABELS = Object.freeze({
  Space: 'Space',
  ShiftLeft: '左Shift', ShiftRight: '右Shift',
  ControlLeft: '左Ctrl', ControlRight: '右Ctrl',
  AltLeft: '左Alt', AltRight: '右Alt',
  Enter: 'Enter', NumpadEnter: 'テンキーEnter',
  Backspace: 'BackSpace', Delete: 'Delete', Insert: 'Insert',
  Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown',
  Comma: ',', Period: '.', Slash: '/', Backslash: '\\',
  Semicolon: ';', Quote: ':', BracketLeft: '[', BracketRight: ']',
  Minus: '-', Equal: '^', Backquote: '@',
  IntlRo: '\\(ろ)', IntlYen: '¥',
});

const ARROW_LABELS = Object.freeze({ Up: '↑', Down: '↓', Left: '←', Right: '→' });

/** キーコードを画面表示用の短い名前にする */
export function keyLabel(code) {
  if (!code) return '未設定';
  if (code.startsWith('Key')) return code.slice(3);            // KeyA → A
  if (code.startsWith('Digit')) return code.slice(5);          // Digit1 → 1
  if (code.startsWith('Numpad')) return `テンキー${code.slice(6)}`;
  if (code.startsWith('Arrow')) return ARROW_LABELS[code.slice(5)] ?? code;
  return NAMED_KEY_LABELS[code] ?? code;
}

/* =========================================================
 * KeyConfig: アクション ↔ キーの割り当てを管理する
 * =======================================================*/

const STORAGE_KEY = 'csg.keyConfig';

export class KeyConfig {
  constructor() {
    this.map = new Map();  // actionId -> keyCode
    this.reset();
    this.load();
  }

  /** 既定のキー割り当てに戻す */
  reset() {
    this.map.clear();
    for (const action of ACTIONS) this.map.set(action.id, action.defaultKey);
  }

  getKey(actionId) {
    return this.map.get(actionId) ?? null;
  }

  /** そのキーが割り当てられているアクションID（未使用なら null） */
  findActionByKey(code) {
    for (const [actionId, key] of this.map) {
      if (key === code) return actionId;
    }
    return null;
  }

  /**
   * キーを割り当てる。
   * すでに他のアクションが使っているキーなら「入れ替え」にする。
   * 単に奪うと相手のアクションが未割り当てになり操作不能になるため。
   * @returns {{ok: boolean, reason?: string, swappedWith?: string}}
   */
  assign(actionId, code) {
    if (!this.map.has(actionId)) return { ok: false, reason: '不明なアクションです' };
    if (isReservedKey(code)) return { ok: false, reason: 'このキーはブラウザの機能で使われるため設定できません' };

    const holder = this.findActionByKey(code);
    if (holder === actionId) return { ok: true }; // 変化なし

    if (holder) {
      const previous = this.map.get(actionId);
      this.map.set(holder, previous); // 元のキーを相手に渡して入れ替える
      this.map.set(actionId, code);
      this.save();
      return { ok: true, swappedWith: holder };
    }

    this.map.set(actionId, code);
    this.save();
    return { ok: true };
  }

  /** InputHandler が使う「キーコード → アクション定義」の逆引き表 */
  toBindings() {
    const bindings = new Map();
    for (const action of ACTIONS) {
      const code = this.map.get(action.id);
      if (code) bindings.set(code, action);
    }
    return bindings;
  }

  /* ---- 永続化（localStorageが使えない環境でも動作を止めない） ---- */

  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(this.map)));
    } catch {
      // プライベートモード等で保存できなくても、その場のプレイには支障がないため無視する
    }
  }

  load() {
    let stored;
    try {
      stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    } catch {
      return;
    }
    if (!stored || typeof stored !== 'object') return;

    // 保存内容が壊れていても操作不能にならないよう、妥当な項目だけ取り込む
    const applied = new Map(this.map);
    for (const action of ACTIONS) {
      const code = stored[action.id];
      if (typeof code === 'string' && code && !isReservedKey(code)) applied.set(action.id, code);
    }
    // 重複が生じていたら既定値に戻す（片方が未割り当てになるのを防ぐ）
    if (new Set(applied.values()).size === applied.size) this.map = applied;
  }
}

/* =========================================================
 * InputHandler: 押しっぱなし（ガード）と押した瞬間（攻撃・スキル・回避）を分けて管理する
 * =======================================================*/

export class InputHandler {
  /** @param {KeyConfig} keyConfig */
  constructor(keyConfig) {
    this.keyConfig = keyConfig;
    this.heldKeys = new Set();
    this.pressQueue = [];
    this.enabled = false;

    this._onKeyDown = (e) => {
      if (!this.enabled) return;
      const binding = this.keyConfig.toBindings().get(e.code);
      if (!binding) return;
      e.preventDefault(); // Spaceでのページスクロール等を抑止
      if (e.repeat) return; // OSのキーリピートは押下イベントとして扱わない
      this.heldKeys.add(e.code);
      this.pressQueue.push(binding);
    };

    this._onKeyUp = (e) => {
      this.heldKeys.delete(e.code);
    };

    // ウィンドウからフォーカスが外れた際に「押しっぱなし」が残らないようにする
    this._onBlur = () => this.heldKeys.clear();
  }

  attach(target = window) {
    target.addEventListener('keydown', this._onKeyDown);
    target.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
    this.enabled = true;
  }

  detach(target = window) {
    target.removeEventListener('keydown', this._onKeyDown);
    target.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
    this.enabled = false;
    this.reset();
  }

  /** このフレームで新たに押されたアクションを取り出す（取り出すとキューは空になる） */
  consumePresses() {
    const presses = this.pressQueue;
    this.pressQueue = [];
    return presses;
  }

  /** ガードキーが押されているか */
  get isGuardHeld() {
    const code = this.keyConfig.getKey('guard');
    return code != null && this.heldKeys.has(code);
  }

  reset() {
    this.heldKeys.clear();
    this.pressQueue = [];
  }
}
