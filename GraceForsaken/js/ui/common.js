// ===================================================================
// 画面共通パーツ / 簡易ルーター
// ===================================================================

const App = {
  root: null,
  stack: [],

  init() {
    this.root = document.getElementById('app');
  },

  /** 画面を表示する。fn は DOM ノードを返す関数。 */
  show(fn, args, opt) {
    opt = opt || {};
    if (!opt.replace) this.stack.push({ fn: fn, args: args });
    clear(this.root);
    const node = fn.apply(null, args || []);
    this.root.appendChild(node);
    window.scrollTo(0, 0);
  },

  /** 現在の画面を作り直す */
  refresh() {
    const cur = this.stack[this.stack.length - 1];
    if (cur) this.show(cur.fn, cur.args, { replace: true });
  },

  back() {
    this.stack.pop();
    const prev = this.stack[this.stack.length - 1];
    if (prev) this.show(prev.fn, prev.args, { replace: true });
    else this.show(Screens.mainMenu, [], { replace: true });
  },

  /** スタックを捨ててメインメニューへ */
  home() {
    this.stack = [];
    this.show(Screens.mainMenu, []);
  },

  /**
   * 背景を切り替える: 'title' | 'menu' | 'gacha' | 'battle' | 'story'
   * scene に {place, night} を渡すと背景画像（img/背景_*.jpg）を使う。
   */
  setBackground(kind, scene) {
    const bg = document.getElementById('bg');
    if (!bg) return;
    const pick = scene ? sceneBackground(scene.place, scene.night) : null;
    bg.className = 'bg-' + kind + (pick ? ' bg-scene' + (pick.dim ? ' night' : '') : '');
    // CSS 変数内の相対 URL はブラウザにより基準が変わるため絶対 URL にしておく
    if (pick) bg.style.setProperty('--bg-img', 'url("' + new URL('img/' + pick.file, location.href).href + '")');
    else bg.style.removeProperty('--bg-img');
  },

  toast(msg, ms) {
    const t = el('div', { class: 'toast', text: msg });
    document.body.appendChild(t);
    setTimeout(() => { if (t.parentNode) t.parentNode.removeChild(t); }, ms || 2200);
  },

  /** モーダルを開く。content(closeFn) がノードを返す。 */
  modal(content, opt) {
    opt = opt || {};
    const overlay = el('div', { class: 'overlay' });
    const close = () => { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); };
    const box = el('div', { class: 'modal frame' + (opt.wide ? ' wide' : '') });
    box.appendChild(content(close));
    overlay.appendChild(box);
    if (!opt.persistent) {
      overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    }
    document.body.appendChild(overlay);
    return close;
  },

  confirm(title, message, onYes) {
    this.modal(close => el('div', {}, [
      el('h2', { text: title }),
      el('p', { class: 'muted', text: message }),
      el('div', { class: 'row end', style: 'margin-top:18px' }, [
        el('button', { class: 'btn ghost', 'data-se': 'cancel', onclick: close, text: 'キャンセル' }),
        el('button', {
          class: 'btn primary', text: 'はい',
          onclick: () => { close(); onYes(); },
        }),
      ]),
    ]));
  },
};

// -------------------------------------------------------------------
// 画像
// -------------------------------------------------------------------
/** キャラクター（マスター）・戦闘ユニット・立ち絵名のいずれかから立ち絵名を得る */
function portraitKey(x) {
  if (!x) return '';
  return typeof x === 'string' ? x : (x.portrait || '');
}
/** 表示用の立ち絵（余白を切り取り高さを揃えたもの。tools/build_faces.py が生成） */
function portraitUrl(x) {
  const k = portraitKey(x);
  return k ? 'img/stand/' + k + '.webp' : '';
}
function faceUrl(x) {
  const k = portraitKey(x);
  return k ? 'img/face/' + k + '.webp' : '';
}

/**
 * 立ち絵の <img>。高さを揃えて表示し、横に広い絵は顔が中央に来るようにずらす（CSS の --fx）。
 */
function standImg(x, cls) {
  const k = portraitKey(x);
  const focus = typeof PORTRAIT_FOCUS !== 'undefined' && PORTRAIT_FOCUS[k] !== undefined ? PORTRAIT_FOCUS[k] : 0.5;
  return el('img', {
    class: cls || null, src: portraitUrl(k), alt: (x && x.name) || '', draggable: 'false',
    style: '--fx:' + focus,
  });
}

// 背景画像。昼夜の差分が無い場所は昼の画像を暗くして夜にする
const SCENE_BG_FILES = {
  '昼の草原': '背景_昼の草原.jpg', '夜の草原': '背景_夜の草原.jpg',
  '昼の水辺': '背景_昼の水辺.jpg', '夜の水辺': '背景_夜の水辺.jpg',
  '昼の裏路地': '背景_昼の裏路地.jpg', '夜の裏路地': '背景_夜の裏路地.jpg',
  '昼の港町': '背景_昼の港町.jpg',
  '山脈': '背景_山脈.jpg', '火事場': '背景_火事場.jpg', '森': '背景_森.jpg', '酒場': '背景_酒場.jpg',
  '道場': '背景_道場.jpg', '薔薇園': '背景_薔薇園.jpg', '異界の門': '背景_異界の門.jpg',
  '世界樹': '背景_世界樹.jpg', '地下水路': '背景_地下水路.jpg', '洞窟': '背景_洞窟.jpg',
  '森のダンジョン': '背景_森のダンジョン.jpg', 'ダンジョン内部': '背景_ダンジョン内部.jpg',
  '玉座': '背景_玉座.jpg',
};
const FIELD_PLACE = { PLAINS: '草原', WATERSIDE: '水辺', MOUNTAIN: '山脈', BLAZE: '火事場' };

function sceneBackground(place, night) {
  if (night && SCENE_BG_FILES['夜の' + place]) return { file: SCENE_BG_FILES['夜の' + place], dim: false };
  const file = SCENE_BG_FILES['昼の' + place] || SCENE_BG_FILES[place];
  return file ? { file: file, dim: !!night } : null;
}
function fieldScene(field) {
  return { place: FIELD_PLACE[field.location], night: field.time === 'NIGHT' };
}

/** 顔アイコン。master が無い（魔人など）ときはシルエットを出す */
function faceIcon(master, opt) {
  opt = opt || {};
  const url = faceUrl(master);
  return el('div', {
    class: 'face' + (url ? '' : ' mob') + (opt.class ? ' ' + opt.class : ''),
    style: url ? 'background-image:url("' + url + '")' : null,
  }, url ? [] : [el('span', { text: opt.glyph || '魔' })]);
}

/** 属性アイコン（菱形） */
function elementIcon(element) {
  return el('span', {
    class: 'el-icon el-' + element,
    title: ELEMENTS[element].name + '属性',
  }, [el('i', { text: ELEMENTS[element].name })]);
}

function elementChip(element) {
  return el('span', { class: 'el-chip el-' + element }, [
    elementIcon(element),
    el('span', { text: ELEMENTS[element].name + '属性' }),
  ]);
}

// -------------------------------------------------------------------
// 共通ヘッダ
// -------------------------------------------------------------------
function walletNode() {
  return el('div', { class: 'wallet' }, [
    el('span', { class: 'soul-gem' }),
    el('span', { class: 'lbl', text: 'Soul' }),
    el('b', { text: Save.data.currency.toLocaleString() }),
  ]);
}

function updateWallet() {
  document.querySelectorAll('.wallet b').forEach(b => {
    b.textContent = Save.data.currency.toLocaleString();
  });
}

/**
 * opt: { back, onBack, wallet, en, extra:[node] }
 */
function topbar(title, opt) {
  opt = opt || {};
  const children = [];
  if (opt.back !== false) {
    children.push(el('button', {
      class: 'back-btn', 'data-se': 'cancel',
      onclick: opt.onBack || (() => App.back()),
    }, [el('span', { class: 'arrow' }), el('span', { text: '戻る' })]));
  }
  children.push(el('div', { class: 'title' }, [
    el('h1', { text: title }),
    opt.en ? el('div', { class: 'en', text: opt.en }) : null,
  ]));
  children.push(el('div', { class: 'spacer' }));
  (opt.extra || []).forEach(n => children.push(n));
  if (opt.wallet !== false) children.push(walletNode());
  if (opt.option !== false) {
    children.push(el('button', {
      class: 'icon-btn', title: 'オプション', onclick: () => openOptions(),
    }, [el('span', { class: 'gear' })]));
  }
  return el('div', { class: 'topbar' }, children);
}

// -------------------------------------------------------------------
// オプション・プレイヤー名
// -------------------------------------------------------------------
function openOptions() {
  App.modal(close => {
    const slider = (kind, label) => {
      const val = el('span', { class: 'vol-val', text: Math.round(Save.data.settings[kind] * 100) + '%' });
      const input = el('input', {
        type: 'range', min: '0', max: '100', step: '5',
        value: String(Math.round(Save.data.settings[kind] * 100)),
      });
      input.addEventListener('input', () => {
        Save.setVolume(kind, Number(input.value) / 100);
        val.textContent = input.value + '%';
        Sound.applyVolume();
      });
      input.addEventListener('change', () => { if (kind === 'se') Sound.se('confirm'); });
      return el('label', { class: 'vol-row' }, [el('span', { text: label }), input, val]);
    };
    return el('div', {}, [
      el('h2', { text: 'オプション' }),
      el('div', { class: 'sub-en', text: 'OPTION' }),
      slider('bgm', 'BGM'),
      slider('se', '効果音'),
      (() => {
        const c = el('input', { type: 'checkbox' });
        c.checked = Save.data.settings.cutin !== false;
        c.addEventListener('change', () => { Save.data.settings.cutin = c.checked; Save.save(); });
        return el('label', { class: 'check opt-check' }, [c, el('span', { text: '戦闘のカットイン演出を表示する' })]);
      })(),
      el('div', { class: 'row', style: 'margin-top:18px' }, [
        el('span', { class: 'muted', text: 'プレイヤー名: ' + Save.playerName() }),
        el('div', { class: 'spacer' }),
        el('button', {
          class: 'btn small', text: '名前を変更',
          onclick: () => { close(); askPlayerName(() => App.refresh()); },
        }),
      ]),
      el('div', { class: 'row end', style: 'margin-top:22px' }, [
        el('button', { class: 'btn', 'data-se': 'cancel', text: '閉じる', onclick: close }),
      ]),
    ]);
  });
}

/** プレイヤー名の入力。done() は決定後に呼ばれる */
function askPlayerName(done, opt) {
  opt = opt || {};
  App.modal(close => {
    const input = el('input', {
      class: 'text-input', type: 'text', maxlength: '12',
      placeholder: 'Player', value: Save.data.playerName || '',
    });
    const ok = () => {
      Save.setPlayerName(input.value || 'Player');
      close();
      if (done) done();
    };
    input.addEventListener('keydown', e => { if (e.key === 'Enter') ok(); });
    setTimeout(() => input.focus(), 50);
    return el('div', {}, [
      el('h2', { text: 'プレイヤー名' }),
      el('p', { class: 'muted', text: '冒険者としての名前を決めてください（12文字まで）。あとからオプションで変更できます。' }),
      input,
      el('div', { class: 'row end', style: 'margin-top:18px' }, [
        opt.required ? null : el('button', { class: 'btn ghost', 'data-se': 'cancel', text: 'キャンセル', onclick: close }),
        el('button', { class: 'btn primary', text: '決定', onclick: ok }),
      ]),
    ]);
  }, { persistent: !!opt.required });
}

// -------------------------------------------------------------------
// 表示ヘルパー
// -------------------------------------------------------------------
const STAT_ROWS = [
  ['hp', 'HP', '♥'], ['mp', 'MP', '◆'], ['speed', '速度', '➤'],
  ['atkPhys', '物理攻撃力', '⚔'], ['atkMag', '魔法攻撃力', '✦'],
  ['defPhys', '物理防御力', '⛨'], ['defMag', '魔法防御力', '❖'],
];

function statList(b, range, compact) {
  const rows = STAT_ROWS.map(([k, label, icon]) => el('div', { class: 'stat' }, [
    el('i', { text: icon }), el('span', { text: label }), el('b', { text: String(b[k]) }),
  ]));
  if (range !== undefined) {
    rows.push(el('div', { class: 'stat' }, [
      el('i', { text: '✥' }), el('span', { text: '射程' }), el('b', { text: String(range) }),
    ]));
  }
  return el('div', { class: 'stat-list' + (compact ? ' compact' : '') }, rows);
}

/** スキル1行の表示 */
function skillRow(skillId, opt) {
  opt = opt || {};
  const sk = getSkill(skillId);
  if (!sk) return el('div', { class: 'skill-row disabled', text: skillId + '（未定義）' });
  const lg = getLogic(skillId);
  const tags = [];
  if (sk.category === 'PASSIVE') tags.push('パッシブ');
  else {
    tags.push(sk.element ? ELEMENTS[sk.element].name + '属性' : sk.typeRaw);
    tags.push('MP' + sk.costMp);
    if (lg && lg.costHp) tags.push('HP' + lg.costHp);
    if (lg && lg.quick) tags.push('クイック');
  }
  const iconEl = sk.element || (sk.category === 'HEAL' ? 'LIGHT' : 'NONE');
  return el('div', {
    class: 'skill-row' + (opt.picked ? ' picked' : '') + (opt.disabled ? ' disabled' : '') +
      (opt.onClick ? ' clickable' : ''),
    onclick: opt.onClick || null,
    'data-se': opt.onClick ? 'confirm' : null,
  }, [
    el('div', { class: 'skill-ico ico-' + iconEl + (sk.category === 'PASSIVE' ? ' passive' : '') }),
    el('div', { class: 'skill-body' }, [
      el('div', { class: 'h' }, [
        el('span', { class: 'n', text: sk.name }),
        el('span', { class: 'tag', text: tags.join(' / ') }),
        opt.badge ? el('span', { class: 'tag hl', text: opt.badge }) : null,
      ]),
      el('div', { class: 'd', text: sk.desc }),
    ]),
  ]);
}

/** キャラクターのグリッド用カード（顔アイコン） */
function charTile(master, opt) {
  opt = opt || {};
  return el('div', {
    class: 'char-tile' + (opt.selected ? ' selected' : '') + (opt.inParty ? ' in-party' : '') +
      (opt.locked ? ' locked' : ''),
    'data-se': 'confirm',
    onclick: opt.onClick || null,
  }, [
    faceIcon(master),
    elementIcon(master.element),
    opt.badge ? el('span', { class: 'tile-badge', text: opt.badge }) : null,
    el('div', { class: 'tile-name', text: master.name }),
  ]);
}

/** 属性フィルタのタブ。onChange(key) */
function elementTabs(current, onChange) {
  const keys = ['ALL', 'FIRE', 'WATER', 'WIND', 'THUNDER', 'LIGHT', 'DARK'];
  return el('div', { class: 'el-tabs' }, keys.map(k => el('button', {
    class: 'el-tab' + (current === k ? ' on' : ''),
    onclick: () => onChange(k),
  }, k === 'ALL' ? [el('span', { text: 'すべて' })] : [elementIcon(k), el('span', { text: ELEMENTS[k].name })])));
}

/**
 * キャラクター詳細（立ち絵＋ステータス＋スキル）
 * opt: { actions:[node], showPool }
 */
function charDetail(master, opt) {
  opt = opt || {};
  const owned = Save.isOwned(master.id);
  const learned = owned ? Save.skillsOf(master.id) : [];
  const skills = el('div', { class: 'detail-skills' });
  skills.appendChild(el('div', { class: 'sec', text: '固有パッシブ' }));
  skills.appendChild(skillRow(master.passiveSkillId, {}));
  if (owned) {
    skills.appendChild(el('div', { class: 'sec', text: '習得スキル' }));
    learned.forEach(id => skills.appendChild(skillRow(id, {})));
  }
  if (!owned || opt.showPool) {
    skills.appendChild(el('div', { class: 'sec', text: owned ? '候補スキル（全6種）' : 'スキル候補（6種から3種を習得）' }));
    master.skillPool.forEach(id => skills.appendChild(skillRow(id, {
      badge: owned && learned.indexOf(id) >= 0 ? '習得中' : null,
    })));
  }

  return el('div', { class: 'char-detail' }, [
    el('div', { class: 'detail-art' }, [
      standImg(master),
    ]),
    el('div', { class: 'detail-info' }, [
      el('div', { class: 'detail-name' }, [
        elementIcon(master.element),
        el('div', {}, [
          el('h2', { text: master.name }),
          el('div', { class: 'detail-sub' }, [
            elementChip(master.element),
            owned ? null : el('span', { class: 'tag', text: '未所持' }),
          ]),
        ]),
      ]),
      statList(master.baseStats, master.range),
      skills,
      master.storyText ? el('details', { class: 'lore' }, [
        el('summary', { text: 'プロフィール' }),
        el('p', { text: master.storyText }),
      ]) : null,
      opt.actions && opt.actions.length ? el('div', { class: 'row end detail-actions' }, opt.actions) : null,
    ]),
  ]);
}

// -------------------------------------------------------------------
// ドラッグ＆ドロップ（マウス・タッチ共通）
//   node をドラッグして [data-drop] 要素に落とすと onDrop(dropEl) を呼ぶ。
//   ほとんど動かさずに離した場合は通常のクリックとして扱う。
// -------------------------------------------------------------------
function makeDraggable(node, opt) {
  node.classList.add('draggable');
  node.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    const startX = e.clientX, startY = e.clientY;
    let ghost = null, hover = null;

    const dropAt = (x, y) => {
      const under = document.elementFromPoint(x, y);
      return under ? under.closest('[data-drop]') : null;
    };
    const move = (ev) => {
      if (!ghost) {
        if (Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY) < 8) return;
        const r = node.getBoundingClientRect();
        ghost = node.cloneNode(true);
        ghost.classList.add('drag-ghost');
        ghost.style.width = r.width + 'px';
        ghost.style.height = r.height + 'px';
        document.body.appendChild(ghost);
        node.classList.add('dragging');
        if (opt.onStart) opt.onStart();
      }
      ev.preventDefault();
      ghost.style.left = (ev.clientX - ghost.offsetWidth / 2) + 'px';
      ghost.style.top = (ev.clientY - ghost.offsetHeight / 2) + 'px';
      const d = dropAt(ev.clientX, ev.clientY);
      if (d !== hover) {
        if (hover) hover.classList.remove('drop-hover');
        hover = d;
        if (hover) hover.classList.add('drop-hover');
      }
    };
    const up = (ev) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (!ghost) return;
      ghost.remove();
      node.classList.remove('dragging');
      if (hover) hover.classList.remove('drop-hover');
      // ドラッグ直後のクリックを無効化
      const block = (ce) => { ce.stopPropagation(); ce.preventDefault(); };
      node.addEventListener('click', block, { capture: true, once: true });
      setTimeout(() => node.removeEventListener('click', block, { capture: true }), 0);
      const d = dropAt(ev.clientX, ev.clientY);
      if (opt.onEnd) opt.onEnd();
      if (d && ev.type === 'pointerup') opt.onDrop(d);
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  });
}
