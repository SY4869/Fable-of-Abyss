// ===================================================================
// 戦闘準備（配置）→ 戦闘画面
//
// 戦場は必ず 6 マスを横一列で表示する:  自3 | 自2 | 自1 | 敵1 | 敵2 | 敵3
// 1マスに何体いても、マスの幅は変えずにマス内でトークンを縮小して収める。
//
// 戦闘画面は「表示（BattleView）」と「進行役（ドライバー）」に分かれている。
//   ・ストーリー／ゴースト対戦 … 手元の戦闘エンジンを動かす（BattleFlow.battleScreen）
//   ・リアルタイム対戦       … サーバーから届いた結果を再生する（js/ui/pvpScreens.js）
// どちらも BattleActions（js/core/actions.js）の同じ形式のデータで BattleView を動かす。
// ===================================================================

/** 戦場の6マス（左から 自3 自2 自1 敵1 敵2 敵3） */
const FIELD_CELLS = [
  { side: 'ALLY', area: 3 }, { side: 'ALLY', area: 2 }, { side: 'ALLY', area: 1 },
  { side: 'ENEMY', area: 1 }, { side: 'ENEMY', area: 2 }, { side: 'ENEMY', area: 3 },
];

function cellKey(side, area) { return side + ':' + area; }

/**
 * 6マスの戦場を組み立てる。
 * fill(cell, cellNode, unitsBox) で各マスの中身を詰める。
 */
function buildFieldRow(fill) {
  const row = el('div', { class: 'field-row' });
  FIELD_CELLS.forEach(c => {
    const units = el('div', { class: 'cell-units' });
    const cell = el('div', { class: 'cell ' + (c.side === 'ALLY' ? 'ally' : 'enemy') + ' area-' + c.area, 'data-cell': cellKey(c.side, c.area) }, [
      el('div', { class: 'cell-label' }, [
        el('b', { text: (c.side === 'ALLY' ? '自' : '敵') + c.area }),
        el('small', { text: AREA_LABEL[c.area] }),
      ]),
      units,
    ]);
    fill(c, cell, units);
    units.setAttribute('data-count', String(units.children.length));
    row.appendChild(cell);
  });
  return row;
}

/** 配置画面用：戦闘前のユニットから表示用データを作る */
function prepView(u) {
  return {
    uid: u.uid, side: u.side, displayName: u.displayName, portrait: u.portrait, element: u.element,
    range: u.range, area: u.area, alive: true, hp: u.maxHp, maxHp: u.maxHp, mp: u.maxMp, maxMp: u.maxMp,
    shield: 0, isBoss: u.isBoss, isGuest: u.isGuest, buffs: [], skills: u.skills,
  };
}

/** 戦場上のユニット表示（v は BattleActions.unitView の形式） */
function unitToken(v, opt) {
  opt = opt || {};
  const badges = [];
  if (v.stealth) badges.push(['隠', 'good', '隠密']);
  if (v.brainwashed) badges.push(['洗', 'bad', '洗脳']);
  if (v.doom) badges.push(['死' + v.doom, 'bad', 'リーサルカウント 残り' + v.doom]);
  if (v.shield > 0) badges.push(['盾', 'good', 'シールド ' + v.shield]);
  (v.buffs || []).forEach(b => { if (!b.stealth) badges.push([b.name.slice(0, 1), '', b.name]); });
  const hpRate = v.maxHp ? Math.max(0, v.hp) / v.maxHp : 0;
  return el('div', {
    class: 'token ' + (v.side === 'ALLY' ? 'ally' : 'enemy') + (opt.cls ? ' ' + opt.cls : ''),
    'data-uid': v.uid,
    title: v.displayName + (v.isBoss ? '（ボス）' : '') + (v.isGuest ? '（ゲスト）' : '') +
      '\n' + ELEMENTS[v.element].name + '属性 / 射程' + v.range +
      '\nHP ' + Math.max(0, v.hp) + '/' + v.maxHp + '  MP ' + v.mp + '/' + v.maxMp,
  }, [
    el('div', { class: 'tk-face' }, [
      faceIcon(v),
      elementIcon(v.element),
      v.isBoss ? el('span', { class: 'tk-boss', text: 'BOSS' }) : null,
      v.isGuest ? el('span', { class: 'tk-guest', text: 'GUEST' }) : null,
    ]),
    el('div', { class: 'tk-name', text: v.displayName }),
    el('div', { class: 'tk-bars' }, [
      el('div', { class: 'bar hp' }, [el('i', { style: 'width:' + hpRate * 100 + '%' })]),
      el('div', { class: 'bar mp' }, [el('i', { style: 'width:' + (v.maxMp ? (v.mp / v.maxMp * 100) : 0) + '%' })]),
    ]),
    el('div', { class: 'tk-hp', text: Math.max(0, v.hp) + '/' + v.maxHp + (v.shield > 0 ? ' +' + v.shield : '') }),
    badges.length ? el('div', { class: 'tk-badges' },
      badges.slice(0, 4).map(([t, c, full]) => el('span', { class: 'bdg ' + c, title: full, text: t }))) : null,
  ]);
}

function fieldInfo(field) {
  return el('div', { class: 'field-info frame' }, [
    el('div', { class: 'fi-name' }, [
      el('b', { text: FIELD_TIME[field.time].name + ' × ' + FIELD_LOCATION[field.location].name }),
    ]),
    el('div', { class: 'fi-label', text: 'FIELD EFFECT' }),
    el('div', { class: 'fi-desc', text: FIELD_TIME[field.time].desc }),
    el('div', { class: 'fi-desc', text: FIELD_LOCATION[field.location].desc }),
  ]);
}

// ===================================================================
// BattleView … 戦闘画面の表示と操作（進行役から state を受け取って描画する）
//
// cfg: { title, en, bgm, field, onBack, extra:[node], onAction(action),
//        headRight: node（相手の名前など）, timer: true（手番タイマーを表示） }
// state:
//   field, round, units:[unitView], order:[uid], actorUid,
//   mine（自分が操作する手番か）, legal:[BattleActions.legal の項目] | null,
//   waitText（相手の手番中の表示）, finished
// ===================================================================
function createBattleView(cfg) {
  const state = {
    field: cfg.field, round: 0, units: [], order: [], actorUid: null,
    mine: false, legal: null, waitText: '', finished: false,
  };
  const POPUP_MS = 2200;             // css の .popup のアニメーション時間と合わせる
  const popups = [];                 // 次の描画で貼るダメージ数値
  const activePopups = [];           // 表示中のダメージ数値
  const sounds = [];                 // 次の描画で鳴らす効果音
  let bgField = cfg.field.time + cfg.field.location;
  let busy = false;                  // 演出中（入力を受け付けない）
  let timerEnd = null, timerHandle = null;

  App.setBackground('battle', fieldScene(cfg.field));
  if (cfg.bgm) Sound.playBgm(cfg.bgm);

  const cutinLayer = el('div', { class: 'cutin-layer' });
  const hud = el('div', { class: 'battle-hud' });
  const fieldBox = el('div', { class: 'battle-field' });
  const targetBar = el('div', { class: 'target-bar' });
  const banner = el('div', { class: 'battle-banner' });
  const actorBox = el('div', { class: 'actor-panel panel frame' });
  const cmdBox = el('div', { class: 'cmd-panel panel frame' });
  const timerBox = el('div', { class: 'turn-timer' });
  const logBox = el('div', { class: 'log' });
  const logWrap = el('div', { class: 'log-wrap' }, [logBox]);

  const ui = {
    mode: 'IDLE',          // 'IDLE' | 'TARGET_UNIT' | 'TARGET_AREA' | 'CONFIRM'
    entry: null,           // 選択中の行動（legal の項目）
    units: [], areas: [], targetSide: null,
    inspect: null,         // タップで確認中のユニット uid
  };

  const logToggle = el('button', {
    class: 'btn small ghost', text: 'ログ',
    onclick: () => { logWrap.classList.toggle('closed'); },
  });

  const root = el('div', { class: 'screen battle' }, [
    topbar(cfg.title, {
      en: cfg.en || 'BATTLE', wallet: false, extra: [cfg.headRight || null, logToggle].concat(cfg.extra || []).filter(Boolean),
      onBack: cfg.onBack,
    }),
    hud, banner, fieldBox, targetBar, cutinLayer,
    el('div', { class: 'battle-bottom' }, [actorBox, el('div', { class: 'cmd-col' }, [timerBox, cmdBox])]),
    logWrap,
  ]);

  const unitOf = (uid) => state.units.find(u => u.uid === uid) || null;

  // ---------- ログ ----------
  const appendLog = (text, kind) => {
    logBox.appendChild(el('div', { class: kind || 'info', text: text }));
    while (logBox.children.length > 300) logBox.removeChild(logBox.firstChild);
    logBox.scrollTop = logBox.scrollHeight;
  };

  // ---------- 描画 ----------
  const renderHud = () => {
    clear(hud);
    hud.appendChild(el('div', { class: 'turn-box frame' }, [
      el('small', { text: 'TURN' }),
      el('b', { text: String(Math.max(1, state.round)).padStart(2, '0') }),
    ]));
    hud.appendChild(el('div', { class: 'order-box frame' }, [
      el('small', { text: 'TURN ORDER' }),
      el('div', { class: 'order-strip' }, state.order.map((uid, i) => {
        const u = unitOf(uid);
        if (!u) return null;
        return el('div', {
          class: 'order-unit ' + (u.side === 'ALLY' ? 'ally' : 'enemy') + (i === 0 && uid === state.actorUid ? ' now' : ''),
          title: u.displayName,
        }, [faceIcon(u, { class: 'mini' })]);
      })),
    ]));
    hud.appendChild(fieldInfo(state.field));
  };

  const renderField = () => {
    clear(fieldBox);
    let rangeCells = [];
    if (ui.mode === 'TARGET_AREA') rangeCells = ui.areas.map(a => cellKey(ui.targetSide, a));
    else if (ui.mode !== 'IDLE') rangeCells = ui.units.map(uid => { const u = unitOf(uid); return u ? cellKey(u.side, u.area) : ''; });

    fieldBox.appendChild(buildFieldRow((c, cell, units) => {
      const key = cellKey(c.side, c.area);
      if (rangeCells.indexOf(key) >= 0) cell.classList.add('in-range');
      if (ui.mode === 'TARGET_AREA' && rangeCells.indexOf(key) >= 0) {
        cell.classList.add('selectable');
        cell.addEventListener('click', () => commit({ area: c.area }));
      }
      state.units.filter(u => u.alive && u.side === c.side && u.area === c.area).forEach(u => {
        const cls = [];
        if (u.uid === state.actorUid) cls.push('active');
        if (ui.mode === 'TARGET_UNIT' && ui.units.indexOf(u.uid) >= 0) cls.push('targetable');
        if (ui.mode === 'CONFIRM' && ui.units.indexOf(u.uid) >= 0) cls.push('affected');
        if (u.uid === ui.inspect) cls.push('selected');
        const t = unitToken(u, { cls: cls.join(' ') });
        t.addEventListener('click', (e) => {
          e.stopPropagation();
          if (ui.mode === 'TARGET_UNIT') {
            if (ui.units.indexOf(u.uid) >= 0) commit({ targetId: u.uid });
            return;
          }
          if (ui.mode === 'TARGET_AREA') {
            if (ui.areas.indexOf(u.area) >= 0 && ui.targetSide === u.side) commit({ area: u.area });
            return;
          }
          ui.inspect = ui.inspect === u.uid ? null : u.uid;
          render();
        });
        units.appendChild(t);
      });
    }));

    // ダメージ数値（アイコンの右上。多段ヒットは縦に積む）
    // 盤面は頻繁に作り直されるので、表示中の数値は時刻つきで保持し、描画のたびに貼り直す。
    const now = Date.now();
    const perUnit = {};
    popups.splice(0).forEach(p => {
      const n = perUnit[p.uid] = (perUnit[p.uid] || 0) + 1;
      activePopups.push(Object.assign({ t0: now + (n - 1) * 120 }, p));
    });
    for (let i = activePopups.length - 1; i >= 0; i--) {
      if (now - activePopups[i].t0 > POPUP_MS) activePopups.splice(i, 1);
    }
    const stacks = {};
    activePopups.forEach(p => {
      const face = fieldBox.querySelector('[data-uid="' + p.uid + '"] .tk-face');
      if (!face) return;
      let stack = stacks[p.uid];
      if (!stack) { stack = stacks[p.uid] = el('div', { class: 'dmg-stack' }); face.appendChild(stack); }
      stack.appendChild(el('span', {
        class: 'popup ' + p.cls, text: p.text,
        style: 'animation-delay:' + (p.t0 - now) + 'ms',   // 途中から再開（負の値）
      }));
    });
    sounds.splice(0).forEach(fn => fn());
  };

  const renderActor = () => {
    clear(actorBox);
    const actor = unitOf(state.actorUid);
    const u = unitOf(ui.inspect) || actor;
    if (!u) return;
    const s = u.stats || {};
    const isActor = u === actor;
    actorBox.appendChild(el('div', { class: 'actor-head' }, [
      faceIcon(u, { class: 'medium' }),
      el('div', { class: 'actor-title' }, [
        el('small', { text: isActor ? (u.side === 'ALLY' ? (state.mine ? (u.isGuest ? 'YOUR TURN（GUEST）' : 'YOUR TURN') : 'ALLY TURN') : 'ENEMY TURN') : '確認中' }),
        el('b', { text: u.displayName }),
        el('div', { class: 'row' }, [
          elementChip(u.element),
          el('span', { class: 'tag', text: (u.side === 'ALLY' ? '自' : '敵') + u.area + ' ' + AREA_LABEL[u.area] }),
        ]),
      ]),
    ]));
    const bar = (label, cls, cur, max) => el('div', { class: 'gauge ' + cls }, [
      el('span', { class: 'g-label', text: label }),
      el('div', { class: 'bar ' + cls }, [el('i', { style: 'width:' + (max ? Math.max(0, cur) / max * 100 : 0) + '%' })]),
      el('span', { class: 'g-num', text: Math.max(0, cur) + ' / ' + max }),
    ]);
    actorBox.appendChild(bar('HP', 'hp', u.hp, u.maxHp));
    actorBox.appendChild(bar('MP', 'mp', u.mp, u.maxMp));
    actorBox.appendChild(el('div', { class: 'stat-list compact' }, [
      ['速度', s.speed], ['物理攻撃力', s.atkPhys], ['魔法攻撃力', s.atkMag],
      ['物理防御力', s.defPhys], ['魔法防御力', s.defMag], ['射程', u.range],
    ].map(([k, v]) => el('div', { class: 'stat' }, [el('span', { text: k }), el('b', { text: String(v) })]))));
    const effects = [];
    if (u.shield > 0) effects.push('シールド ' + u.shield);
    if (u.stealth) effects.push('隠密');
    if (u.brainwashed) effects.push('洗脳');
    if (u.doom) effects.push('リーサルカウント 残り' + u.doom);
    (u.buffs || []).forEach(b => effects.push(b.name + (b.dur ? '（' + b.dur + 'R）' : '')));
    if (effects.length) {
      actorBox.appendChild(el('div', { class: 'effects' }, effects.map(t => el('span', { class: 'tag', text: t }))));
    }
    // 敵のスキルは確認できない（相手のスキルはサーバーからも送られてこない）
    if (!isActor && u.side === 'ALLY' && u.skills && u.skills.length) {
      actorBox.appendChild(el('div', { class: 'faint', style: 'margin-top:6px', text: 'スキル: ' + u.skills.join(' / ') }));
    }
  };

  const renderCommands = () => {
    clear(cmdBox);
    clear(targetBar);
    targetBar.classList.remove('on');
    if (state.finished) {
      cmdBox.appendChild(el('div', { class: 'cmd-wait', text: '戦闘終了' }));
      return;
    }
    const actor = unitOf(state.actorUid);
    if (!actor) return;

    if (!state.mine || !state.legal) {
      cmdBox.appendChild(el('div', { class: 'cmd-wait' }, [
        el('span', { class: 'spinner' }),
        el('span', { text: state.waitText || (actor.displayName + ' が行動中…') }),
      ]));
      return;
    }

    // --- 対象選択中: 対象（または決定）とキャンセルを選べる ---
    if (ui.mode !== 'IDLE' && ui.entry) {
      const e = ui.entry;
      const guide = ui.mode === 'CONFIRM' ? '効果範囲を確認して「決定」してください'
        : ui.mode === 'TARGET_AREA' ? (e.type === 'move' ? '移動先のマスを選んでください' : '対象のマスを選んでください')
        : '対象を選んでください';
      targetBar.classList.add('on');
      targetBar.appendChild(el('div', { class: 'tb-text' }, [
        el('b', { text: e.name }),
        el('span', { text: guide }),
        e.desc ? el('small', { text: e.desc }) : null,
      ]));
      targetBar.appendChild(el('div', { class: 'spacer' }));
      if (ui.mode === 'CONFIRM') {
        targetBar.appendChild(el('button', { class: 'btn primary', text: '決定', onclick: () => commit({}) }));
      }
      targetBar.appendChild(el('button', {
        class: 'btn ghost', 'data-se': 'cancel', text: 'キャンセル',
        onclick: () => { ui.mode = 'IDLE'; render(); },
      }));
    }

    const desc = el('div', { class: 'cmd-desc faint', text: 'コマンドを選択してください' });
    const describe = (t) => { desc.textContent = t; };
    const mkBtn = (text, sub, cls, enabled, onClick, help) => {
      const b = el('button', {
        class: 'cmd-btn ' + cls, disabled: enabled ? null : 'disabled', onclick: onClick,
      }, [el('span', { class: 'cb-name', text: text }), el('span', { class: 'cb-sub', text: sub })]);
      if (help) {
        b.addEventListener('pointerenter', () => describe(help));
        b.addEventListener('focus', () => describe(help));
      }
      return b;
    };

    const main = el('div', { class: 'cmd-row' });
    const quick = el('div', { class: 'cmd-row' });
    const sub = el('div', { class: 'cmd-row sub' });
    state.legal.forEach(e => {
      switch (e.type) {
        case 'attack':
          main.appendChild(mkBtn('通常攻撃', e.disabled || '行動', 'attack', !e.disabled,
            () => beginTargeting(e), '射程内の敵1体を攻撃する（物攻・魔攻の高い方）。'));
          break;
        case 'skill':
        case 'quick': {
          const costText = 'MP' + e.mpCost + (e.hpCost ? ' HP' + e.hpCost : '');
          (e.type === 'quick' ? quick : main).appendChild(mkBtn(e.name, e.disabled || costText,
            e.type + ' el-' + (e.element || 'NONE'), !e.disabled, () => beginTargeting(e), e.desc));
          break;
        }
        case 'move':
          sub.appendChild(mkBtn('移動', e.disabled || '行動', 'util', !e.disabled,
            () => beginTargeting(e), '隣のマスへ1マス移動する（行動を消費）。最後の前衛は後ろへ下がれない。'));
          break;
        case 'wait':
          sub.appendChild(mkBtn('待機', '行動', 'util', true, () => {
            if (busy) return;
            ui.inspect = null;
            send({ type: 'wait' });
          }, '何もせずにターンを終える。'));
          break;
      }
    });

    cmdBox.appendChild(el('div', { class: 'cmd-label', text: 'COMMAND' }));
    cmdBox.appendChild(main);
    if (quick.children.length) {
      cmdBox.appendChild(el('div', { class: 'cmd-label quick', text: 'QUICK（行動を消費しない）' }));
      cmdBox.appendChild(quick);
    }
    cmdBox.appendChild(sub);
    cmdBox.appendChild(desc);
    if (ui.mode !== 'IDLE') cmdBox.classList.add('dim'); else cmdBox.classList.remove('dim');
  };

  const renderTimer = () => {
    clear(timerBox);
    if (timerEnd === null || !state.mine || state.finished) { timerBox.classList.remove('on'); return; }
    const left = Math.max(0, Math.ceil((timerEnd - Date.now()) / 1000));
    timerBox.classList.add('on');
    timerBox.classList.toggle('urgent', left <= 10);
    timerBox.appendChild(el('span', { class: 'tt-label', text: '残り時間' }));
    timerBox.appendChild(el('b', { text: String(left) }));
    timerBox.appendChild(el('span', { class: 'tt-unit', text: '秒' }));
  };

  const render = () => {
    const key = state.field.time + state.field.location;   // フェイブル・オブ・アビスで夜になる等
    if (key !== bgField) { bgField = key; App.setBackground('battle', fieldScene(state.field)); }
    renderHud(); renderField(); renderActor(); renderCommands(); renderTimer();
  };

  // ---------- 対象選択 ----------
  // 対象が1体・1マスしかない場合も自動では実行せず、必ず選択（またはキャンセル）させる
  const beginTargeting = (e) => {
    if (busy) return;
    ui.entry = e;
    ui.inspect = null;
    ui.units = [];
    ui.areas = [];
    if (e.type === 'move') {
      ui.mode = 'TARGET_AREA';
      ui.targetSide = 'ALLY';
      ui.areas = e.to.slice();
    } else if (e.type === 'attack' || e.targetKind === 'UNIT') {
      ui.mode = 'TARGET_UNIT';
      ui.units = e.targets.slice();
    } else if (e.targetKind === 'AREA') {
      ui.mode = 'TARGET_AREA';
      ui.targetSide = e.areaSide;
      ui.areas = e.areas.slice();
    } else {
      // 自分自身・全体など対象指定が不要なスキルは、効果範囲を示して決定を待つ
      ui.mode = 'CONFIRM';
      ui.units = (e.affect || []).slice();
    }
    render();
  };

  const commit = (payload) => {
    if (busy || !ui.entry) return;
    const e = ui.entry;
    ui.mode = 'IDLE';
    ui.entry = null;
    let action;
    if (e.type === 'attack') action = { type: 'attack', targetId: payload.targetId };
    else if (e.type === 'move') action = { type: 'move', to: payload.area };
    else action = { type: e.type, skillId: e.skillId, targetId: payload.targetId, area: payload.area };
    send(action);
  };

  const send = (action) => {
    busy = true;          // 結果が返るまで二重送信しない
    render();
    cfg.onAction(action);
  };

  // ---------- 行動結果の再生 ----------
  /**
   * events: BattleActions の演出イベント列、apply(): 盤面の状態を最新にする処理。
   * カットイン → 盤面更新（ダメージ数値・効果音・ログ）→ done() の順に進む。
   */
  const play = (events, apply, done) => {
    busy = true;
    const cutin = events.find(e => e.t === 'cutin');
    const finish = () => {
      if (!root.isConnected) return;
      events.forEach(e => {
        switch (e.t) {
          case 'hit':
            sounds.push(() => Sound.hitSe(e.dmgType, e.element));
            popups.push({ uid: e.unitId, text: e.value ? String(e.value) : '無効', cls: e.crit ? 'crit' : '' });
            break;
          case 'raw': popups.push({ uid: e.unitId, text: String(e.value), cls: 'raw' }); break;
          case 'miss': sounds.push(() => Sound.se('dodge')); popups.push({ uid: e.unitId, text: 'MISS', cls: 'miss' }); break;
          case 'healCast': sounds.push(() => Sound.se('heal')); break;
          case 'heal': popups.push({ uid: e.unitId, text: '+' + e.value, cls: 'heal' }); break;
          case 'auto': popups.push({ uid: e.unitId, text: 'TIME UP', cls: 'miss' }); break;
          case 'log': appendLog(e.text, e.kind); break;
        }
      });
      if (apply) apply();
      busy = false;
      ui.mode = 'IDLE';
      ui.entry = null;
      render();
      if (done) done();
    };
    const actor = cutin ? unitOf(cutin.unitId) : null;
    if (!cutin || !actor || Save.data.settings.cutin === false) { finish(); return; }

    // カットイン
    cmdBox.classList.add('dim');
    targetBar.classList.remove('on');
    const node = el('div', { class: 'cutin ' + (actor.side === 'ALLY' ? 'ally' : 'enemy') + ' el-' + (cutin.element || 'NONE') }, [
      el('div', { class: 'ci-band' }),
      portraitKey(actor) ? standImg(actor, 'ci-art') : null,
      el('div', { class: 'ci-text' }, [
        el('small', { text: actor.displayName + (cutin.quick ? '　QUICK' : '') }),
        el('b', { text: cutin.name }),
      ]),
    ]);
    clear(cutinLayer);
    cutinLayer.appendChild(node);
    let ended = false;
    const end = () => {
      if (ended) return;
      ended = true;
      node.remove();
      finish();
    };
    node.addEventListener('click', end);
    setTimeout(end, CONFIG.CUTIN_MS);
  };

  const view = {
    root: root,
    state: state,
    render: render,
    unitOf: unitOf,
    appendLog: appendLog,
    play: play,
    isBusy: () => busy,
    /** 状態を差し替えて描画する */
    setState(patch) {
      Object.assign(state, patch);
      if (patch.actorUid !== undefined || patch.legal !== undefined) { ui.mode = 'IDLE'; ui.entry = null; busy = false; }
      render();
    },
    /** 手番の残り時間（ミリ秒）。null で非表示 */
    setTimer(ms) {
      clearInterval(timerHandle);
      timerEnd = ms === null || ms === undefined ? null : Date.now() + ms;
      if (timerEnd !== null) {
        timerHandle = setInterval(() => {
          if (!root.isConnected) { clearInterval(timerHandle); return; }
          renderTimer();
        }, 250);
      }
      renderTimer();
    },
    /** 画面中央の帯（相手の切断など）。null で消す */
    setBanner(text) {
      clear(banner);
      banner.classList.toggle('on', !!text);
      if (text) banner.appendChild(el('span', { text: text }));
    },
    /** 入力受付を解除する（送信が拒否された場合など） */
    unlock() { busy = false; render(); },
  };
  return view;
}

// ===================================================================
// 戦闘フロー（配置 → 戦闘）
// ===================================================================
const BattleFlow = {
  /**
   * opts: { title, field, mode, enemies, guests, winCondition, winText,
   *         intro, tutorial, bgm, onEnd }
   */
  begin(opts) {
    const party = Save.partyMasters();
    if (!party.length) {
      App.toast('先にパーティを編成してください');
      App.show(Screens.partyEdit, []);
      return;
    }
    const allies = party.map(m =>
      unitFromMaster(m, Save.skillsOf(m.id), 'ALLY', Save.placementOf(m.id)));
    (opts.guests || []).forEach(g => allies.push(g));

    App.show(BattleFlow.placementScreen, [opts, allies], { replace: false });
  },

  // -----------------------------------------------------------------
  // 戦闘準備
  // -----------------------------------------------------------------
  placementScreen(opts, allies) {
    App.setBackground('battle', fieldScene(opts.field));
    let selected = null;
    const fieldBox = el('div');
    const infoBox = el('div', { class: 'prep-info panel frame' });

    const moveTo = (u, area) => {
      u.area = area;
      // ゲストの配置はこの戦闘の間だけ（所持キャラの初期配置は書き換えない）
      if (u.charId && !u.isGuest) Save.setPlacement(u.charId, area);
      render();
    };

    const render = () => {
      clear(fieldBox);
      const reachCells = selected
        ? [1, 2, 3].filter(a => inRange(selected.range, areaDistance(selected.area, a)))
        : [];
      fieldBox.appendChild(buildFieldRow((c, cell, units) => {
        if (c.side === 'ALLY') {
          cell.setAttribute('data-drop', String(c.area));
          if (selected && selected.side === 'ALLY' && selected.area !== c.area) {
            cell.classList.add('movable');
            cell.addEventListener('click', () => moveTo(selected, c.area));
          }
        } else if (reachCells.indexOf(c.area) >= 0 && selected && selected.side === 'ALLY') {
          cell.classList.add('in-range');
        }
        const team = c.side === 'ALLY' ? allies : opts.enemies;
        team.filter(u => u.area === c.area).forEach(u => {
          const t = unitToken(prepView(u), { cls: u === selected ? 'selected' : '' });
          t.addEventListener('click', (e) => {
            e.stopPropagation();
            selected = selected === u ? null : u;
            render();
          });
          if (c.side === 'ALLY') {
            makeDraggable(t, {
              onStart: () => { selected = u; },
              onDrop: (d) => moveTo(u, Number(d.getAttribute('data-drop'))),
            });
          }
          units.appendChild(t);
        });
      }));

      clear(infoBox);
      if (selected) {
        const reach = opts.enemies.filter(e => inRange(selected.range, areaDistance(selected.area, e.area))).length;
        infoBox.appendChild(el('div', { class: 'row' }, [
          faceIcon(selected, { class: 'small' }),
          el('div', {}, [
            el('b', { text: selected.displayName + (selected.isBoss ? '（ボス）' : '') }),
            el('div', { class: 'faint', text: ELEMENTS[selected.element].name + '属性 / 射程' + selected.range + ' / HP' + selected.maxHp +
              (selected.side === 'ALLY' ? ' / 届く敵 ' + reach + '体' : '') }),
            // 敵のスキルは確認できない
            selected.side === 'ALLY'
              ? el('div', { class: 'faint', text: 'スキル: ' + (selected.skills.join(' / ') || 'なし') })
              : null,
          ]),
        ]));
      } else {
        infoBox.appendChild(el('p', { class: 'faint', style: 'margin:0', text:
          'キャラクターをドラッグ（またはタップで選んでからマスをタップ）して配置を変更できます。' +
          '敵をタップすると情報を確認できます。距離 = 自陣マス番号 + 敵陣マス番号 − 1、射程以内の敵にだけ攻撃が届きます。' }));
      }
      if (!allies.some(u => u.area === 1)) {
        infoBox.appendChild(el('p', { class: 'warn', style: 'margin:8px 0 0', text:
          '前衛が空いています。戦闘開始時に隊列全体が前へ詰められます。' }));
      }
    };
    render();

    const startFn = () => {
      const run = () => App.show(BattleFlow.battleScreen, [opts, allies], { replace: true });
      if (opts.intro && opts.intro.length) {
        Novel.play([{ title: opts.title, lines: opts.intro }], run);
      } else run();
    };

    return el('div', { class: 'screen battle-prep' }, [
      topbar(opts.title, { en: 'BATTLE PREPARATION', wallet: false }),
      el('div', { class: 'prep-head' }, [
        el('div', { class: 'side-tag ally', text: '自陣 — 配置変更可' }),
        el('div', { class: 'spacer' }),
        opts.winText ? el('div', { class: 'win-cond' }, [el('small', { text: '勝利条件' }), el('b', { text: opts.winText })]) : null,
        fieldInfo(opts.field),
        el('div', { class: 'spacer' }),
        el('div', { class: 'side-tag enemy', text: '敵陣 — 確認のみ' }),
      ]),
      fieldBox,
      infoBox,
      el('div', { class: 'row end', style: 'margin-top:14px' }, [
        el('button', { class: 'btn primary big', text: '戦闘開始', onclick: startFn }),
      ]),
    ]);
  },

  // -----------------------------------------------------------------
  // 戦闘（手元の戦闘エンジンで進める）
  // -----------------------------------------------------------------
  battleScreen(opts, allies) {
    const battle = new Battle({
      allies: allies,
      enemies: opts.enemies,
      field: opts.field,
      mode: opts.mode,
      winCondition: opts.winCondition,
      seed: Date.now(),
    });

    const view = createBattleView({
      title: opts.title,
      en: opts.mode === 'PVP' ? 'GHOST BATTLE' : 'STORY BATTLE',
      bgm: opts.bgm || 'battle',
      field: opts.field,
      onBack: () => App.confirm('戦闘を中断', '戦闘を中断してメニューに戻りますか？（進行状況は失われます）',
        () => App.home()),
      onAction: (action) => {
        const actor = battle.currentActor();
        if (!actor || !BattleActions.check(battle, actor, action, { allowWait: true })) { view.unlock(); return; }
        playResult(BattleActions.run(battle, actor, BattleActions.toEngine(action)));
      },
    });

    const snapshot = () => ({
      field: Object.assign({}, battle.field),
      round: battle.round,
      units: battle.allUnits().map(u => BattleActions.unitView(u, battle, { hideSkills: u.side !== 'ALLY' })),
      order: BattleActions.remainingOrder(battle),
    });

    const playResult = (res) => {
      view.play(res.events, () => Object.assign(view.state, snapshot()), step);
    };

    // ---------- 進行 ----------
    let aiGuard = 0;
    let ended = false;
    const step = () => {
      if (!view.root.isConnected) return;       // 画面を離れた
      if (battle.finished) { finishSoon(); return; }
      const actor = battle.currentActor();
      if (!actor) { finishSoon(); return; }
      const pre = BattleActions.capture(battle, () => battle.onTurnStart(actor));   // 洗脳の解除など
      pre.events.forEach(e => { if (e.t === 'log') view.appendLog(e.text, e.kind); });
      const mine = actor.isPlayerControlled;
      view.setState(Object.assign(snapshot(), {
        actorUid: actor.uid,
        mine: mine,
        legal: mine ? BattleActions.legal(battle, actor, { allowWait: true }) : null,
        waitText: actor.displayName + (actor.isGuest ? '（ゲスト）が行動中…' : ' が行動中…'),
      }));
      if (mine) { aiGuard = 0; return; }

      if (++aiGuard > 200) { battle.say('（AIの行動が収束しませんでした）', 'system'); battle.finishAction(); }
      setTimeout(() => {
        if (!view.root.isConnected) return;
        if (battle.finished) { finishSoon(); return; }
        const cur = battle.currentActor();
        if (!cur) { finishSoon(); return; }
        playResult(BattleActions.run(battle, cur, AI.decide(battle, cur)));
      }, CONFIG.AI_STEP_MS);
    };

    const finishSoon = () => {
      if (ended) return;
      ended = true;
      view.setState(Object.assign(snapshot(), { finished: true, actorUid: null, legal: null }));
      setTimeout(() => {
        if (!view.root.isConnected) return;
        if (opts.onEnd) opts.onEnd(battle.result || 'DRAW');
      }, 900);
    };

    const start = BattleActions.capture(battle, () => battle.start());
    start.events.forEach(e => { if (e.t === 'log') view.appendLog(e.text, e.kind); });
    Object.assign(view.state, snapshot());
    setTimeout(step, 0);
    return view.root;
  },
};
