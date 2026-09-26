// ===================================================================
// リアルタイム対戦の画面（PVP対戦_設計書 10章）
//   対戦モード選択 → PVPロビー → マッチング中 → 戦闘準備 → 戦闘 → 結果
//
// 戦闘の計算はすべてサーバーで行い、この画面は届いた結果を再生するだけ。
// ===================================================================

const PvpGame = {
  match: null,        // match_found の内容
  screen: null,       // 表示中の画面の受信処理 { turn_start: fn, ... }

  /** サーバーからのイベントを、表示中の画面へ振り分ける */
  bind() {
    const EV = PVP_PROTOCOL.EV;
    const route = (ev) => (data) => {
      const fn = this.screen && this.screen[ev];
      if (fn) fn(data);
    };
    const h = {};
    Object.keys(EV).forEach(k => { h[EV[k]] = route(EV[k]); });
    h.connection = route('connection');

    h[EV.MATCH_FOUND] = (m) => {
      this.match = m;
      Save.setPvpSession({ roomId: m.roomId, reconnectToken: m.reconnectToken, matchId: m.matchId });
      PvpScreens.showMatchFound(m, () => App.show(PvpScreens.placement, [null], { replace: true }));
    };
    h[EV.BATTLE_START] = (b) => App.show(PvpScreens.battle, [b], { replace: true });
    h[EV.STATE_SYNC] = (s) => {
      this.match = Object.assign({}, s.matchInfo, { reconnectToken: (Save.pvp().session || {}).reconnectToken });
      closeOverlays();
      App.show(s.phase === 'PLACEMENT' ? PvpScreens.placement : PvpScreens.battle, [s], { replace: true });
    };
    h[EV.BATTLE_END] = (res) => {
      Save.grantPvpResult(res);
      Save.setPvpSession(null);
      closeOverlays();
      // 戦闘画面では最後の演出を見せてから結果へ
      const go = () => App.show(PvpScreens.result, [res], { replace: true });
      if (this.screen && this.screen.beforeEnd) this.screen.beforeEnd(go); else go();
    };
    h[EV.SERVER_ERROR] = (e) => {
      if (e.error === PVP_PROTOCOL.ERR.DUPLICATE_SESSION) {
        PvpClient.disconnect();
        pvpAlert('別の画面で対戦に接続されました。', () => { App.stack = []; App.show(Screens.mainMenu, []); });
      }
    };
    h.resume_failed = (r) => {
      Save.setPvpSession(null);
      closeOverlays();
      pvpAlert(r.error === PVP_PROTOCOL.ERR.ROOM_NOT_FOUND
        ? 'サーバーの都合により対戦が中断されました（無効試合）。'
        : '対戦は終了しました。', () => { App.stack = []; App.show(PvpScreens.lobby, []); });
    };
    h.fatal = (r) => pvpFatal(r.error);
    PvpClient.setHandlers(h);
  },

  /** 起動時: 保存された試合があれば復帰する（6.2） */
  async tryResumeOnBoot() {
    const sess = Save.pvp().session;
    if (!sess) return false;
    if (Date.now() - (sess.savedAt || 0) > CONFIG.PVP.SESSION_RESUME_MAX_MIN * 60000) {
      Save.setPvpSession(null);
      return false;
    }
    this.bind();
    const close = App.modal(() => el('div', { class: 'center' }, [
      el('span', { class: 'spinner big' }),
      el('p', { class: 'muted', text: '対戦に復帰しています…' }),
    ]), { persistent: true });
    const c = await PvpClient.connect();
    if (!c.ok) {
      close();
      Save.setPvpSession(null);
      pvpFatal(c.error);
      return true;
    }
    const r = await PvpClient.resume(sess);
    close();
    if (!r.ok) return true;       // resume_failed で案内する
    return true;
  },
};

function closeOverlays() {
  document.querySelectorAll('.overlay').forEach(o => o.remove());
}

function pvpAlert(message, onOk) {
  App.modal(close => el('div', {}, [
    el('h2', { text: 'リアルタイム対戦' }),
    el('p', { class: 'muted', text: message }),
    el('div', { class: 'row end', style: 'margin-top:16px' }, [
      el('button', { class: 'btn primary', text: 'OK', onclick: () => { close(); if (onOk) onOk(); } }),
    ]),
  ]), { persistent: true });
}

/** 接続・版数などのエラー表示（10.8） */
function pvpFatal(error) {
  const E = PVP_PROTOCOL.ERR;
  if (error === E.VERSION_MISMATCH) {
    App.modal(() => el('div', {}, [
      el('h2', { text: 'リアルタイム対戦' }),
      el('p', { class: 'muted', text: 'ゲームが更新されました。ページを再読み込みしてください。' }),
      el('div', { class: 'row end' }, [el('button', { class: 'btn primary', text: '再読み込み', onclick: () => location.reload() })]),
    ]), { persistent: true });
    return;
  }
  const msg = {
    MAINTENANCE: '現在メンテナンス中のため、リアルタイム対戦は利用できません。',
    INVALID_PARTY: 'パーティ編成を確認してください（4体の編成が必要です）。',
    NO_CLIENT: '通信用のファイルを読み込めませんでした。ページを再読み込みしてください。',
  }[error] || '対戦サーバーに接続できません。時間をおいて再度お試しください。';
  pvpAlert(msg, () => { App.stack = []; App.show(PvpScreens.lobby, []); });
}

/** 相手の名前（BOT バッジ付き）。名前は必ず textContent で表示する */
function opponentTag(name, isBot) {
  return el('span', { class: 'opp-tag' }, [
    el('span', { class: 'opp-name', text: name }),
    isBot ? el('span', { class: 'bot-badge', text: 'BOT' }) : null,
  ]);
}

const PvpScreens = {

  // =================================================================
  // 対戦モード選択
  // =================================================================
  modeSelect() {
    App.setBackground('menu');
    Sound.playBgm('menu');
    const card = (en, jp, desc, fn, cls) => el('button', { class: 'mode-card frame ' + (cls || ''), onclick: fn }, [
      el('span', { class: 'mode-emblem' }),
      el('span', { class: 'mode-en', text: en }),
      el('span', { class: 'mode-jp', text: jp }),
      el('span', { class: 'mode-desc', text: desc }),
    ]);
    return el('div', { class: 'screen' }, [
      topbar('対戦', { en: 'BATTLE' }),
      el('div', { class: 'mode-grid' }, [
        card('GHOST BATTLE', 'ゴースト対戦', '他プレイヤーの防衛パーティ（AI操作）と戦う', () => App.show(Screens.pvpMenu, [])),
        card('REALTIME BATTLE', 'リアルタイム対戦', 'オンラインで今いるプレイヤーと戦う', () => App.show(PvpScreens.lobby, []), 'realtime'),
      ]),
    ]);
  },

  // =================================================================
  // PVP ロビー
  // =================================================================
  lobby() {
    App.setBackground('menu');
    Sound.playBgm('menu');
    const party = Save.partyMasters();
    const st = Save.pvp().stats;
    const R = CONFIG.PVP.REWARD;

    const formation = el('div', { class: 'formation lobby-formation' });
    for (let a = CONFIG.AREA_COUNT; a >= 1; a--) {
      formation.appendChild(el('div', { class: 'form-col area-' + a }, [
        el('div', { class: 'form-label' }, [el('b', { text: AREA_LABEL[a] }), el('small', { text: ['', 'FRONT', 'MIDDLE', 'BACK'][a] })]),
        el('div', { class: 'form-members' }, party.filter(m => Save.placementOf(m.id) === a).map(m =>
          el('div', { class: 'form-member' }, [faceIcon(m), elementIcon(m.element), el('span', { class: 'fm-name', text: m.name })]))),
      ]));
    }

    const start = async (btn) => {
      btn.disabled = true;
      PvpGame.bind();
      const c = await PvpClient.connect();
      if (!c.ok) { btn.disabled = false; pvpFatal(c.error); return; }
      const payload = {
        party: party.map(m => ({ charId: m.id, skills: Save.skillsOf(m.id).slice(), area: Save.placementOf(m.id) })),
      };
      const r = await PvpClient.req(PVP_PROTOCOL.EV.JOIN_QUEUE, payload);
      if (!r.ok && r.error !== PVP_PROTOCOL.ERR.ALREADY_IN_QUEUE) {
        btn.disabled = false;
        if (r.error === PVP_PROTOCOL.ERR.ALREADY_IN_ROOM && Save.pvp().session) { PvpClient.resume(Save.pvp().session); return; }
        pvpFatal(r.error);
        return;
      }
      App.show(PvpScreens.matching, [], { replace: true });
    };

    const canStart = party.length === CONFIG.PARTY_SIZE;
    return el('div', { class: 'screen' }, [
      topbar('リアルタイム対戦', { en: 'REALTIME BATTLE' }),
      el('div', { class: 'panel frame' }, [
        el('div', { class: 'panel-head' }, [
          el('span', { class: 'en', text: 'YOUR PARTY' }),
          el('span', { class: 'faint', text: '配置は戦闘準備で変更できます' }),
        ]),
        formation,
      ]),
      el('div', { class: 'panel frame lobby-info' }, [
        el('div', { class: 'row' }, [
          el('span', { class: 'muted', text: '戦績' }),
          el('b', { class: 'lobby-record', text: st.win + '勝 ' + st.lose + '敗 ' + st.draw + '分' }),
        ]),
        el('div', { class: 'row' }, [
          el('span', { class: 'muted', text: '報酬' }),
          el('span', { text: '勝利 ' + R.win + ' ／ 引き分け ' + R.draw + ' ／ 敗北 ' + R.lose + ' Soul' }),
        ]),
        el('p', { class: 'faint', text:
          '（BOT戦はゴースト対戦と同じ報酬）' + CONFIG.PVP.MATCH_TIMEOUT_SEC + '秒待っても相手が見つからない場合は BOT と対戦します。' +
          '手番ごとの制限時間は' + CONFIG.PVP.TURN_TIMEOUT_SEC + '秒で、' + CONFIG.PVP.AFK_LIMIT + '回連続で時間切れになると敗北です。' }),
      ]),
      canStart ? null : el('p', { class: 'warn center', text: 'リアルタイム対戦には4体のパーティが必要です。' }),
      el('div', { class: 'row center-row', style: 'margin-top:18px' }, [
        (() => {
          const b = el('button', { class: 'btn primary big', text: '対戦を開始する', disabled: canStart ? null : 'disabled' });
          b.addEventListener('click', () => start(b));
          return b;
        })(),
        el('button', { class: 'btn', text: 'パーティ編成', onclick: () => App.show(Screens.partyEdit, []) }),
      ]),
    ]);
  },

  // =================================================================
  // マッチング中
  // =================================================================
  matching() {
    App.setBackground('menu');
    const countNode = el('b', { class: 'match-count', text: String(CONFIG.PVP.MATCH_TIMEOUT_SEC) });
    let left = CONFIG.PVP.MATCH_TIMEOUT_SEC;
    const tick = setInterval(() => {
      if (!root.isConnected) { clearInterval(tick); return; }
      left = Math.max(0, left - 1);
      countNode.textContent = String(left);
    }, 1000);
    PvpGame.screen = {
      queue_timer: (d) => { left = d.timeoutSec; countNode.textContent = String(left); },
      connection: (c) => { if (!c.connected) { clearInterval(tick); pvpFatal('CONNECT_FAILED'); } },
    };
    const cancel = async () => {
      const r = await PvpClient.req(PVP_PROTOCOL.EV.CANCEL_QUEUE, {});
      if (!r.ok && r.error === PVP_PROTOCOL.ERR.ALREADY_IN_ROOM) return;   // もう成立していれば配置画面へ進む
      clearInterval(tick);
      App.show(PvpScreens.lobby, [], { replace: true });
    };
    const root = el('div', { class: 'screen matching' }, [
      el('div', { class: 'match-box' }, [
        el('div', { class: 'choose-en', text: 'SEARCHING OPPONENT' }),
        el('div', { class: 'choose-jp', text: '対戦相手を探しています' }),
        el('div', { class: 'match-dots' }, [el('i'), el('i'), el('i')]),
        el('p', { class: 'muted' }, [el('span', { text: '見つからない場合は BOT と対戦します　' }), countNode]),
        el('button', { class: 'btn ghost', 'data-se': 'cancel', text: 'キャンセル', onclick: cancel }),
      ]),
    ]);
    return root;
  },

  /** 「MATCH FOUND」を1秒ほど表示してから次へ */
  showMatchFound(m, next) {
    const close = App.modal(() => el('div', { class: 'match-found center' }, [
      el('div', { class: 'result-banner win', text: 'MATCH FOUND' }),
      el('p', { class: 'muted', text: '対戦相手' }),
      el('div', { class: 'row center-row' }, [opponentTag(m.opponent.name, m.opponent.isBot)]),
    ]), { persistent: true });
    setTimeout(() => { close(); next(); }, 1200);
  },

  // =================================================================
  // 戦闘準備（PVP）
  // =================================================================
  placement(sync) {
    const m = PvpGame.match;
    App.setBackground('battle', fieldScene(m.field));
    Sound.playBgm('menu');
    const units = m.myUnits.map(u => {
      const master = getCharacter(u.charId);
      return {
        uid: u.id, side: 'ALLY', displayName: master.name, portrait: master.portrait, element: master.element,
        range: master.range, area: u.area, alive: true,
        hp: master.baseStats.hp, maxHp: master.baseStats.hp, mp: master.baseStats.mp, maxMp: master.baseStats.mp,
        shield: 0, buffs: [], skills: Save.skillsOf(u.charId),
      };
    });
    let locked = !!(sync && sync.placementDone && sync.placementDone.self);
    let opponentReady = !!(sync && sync.placementDone && sync.placementDone.opponent);
    let selected = null;
    let endAt = Date.now() + (sync ? sync.placementRemainingMs : m.placementTimeoutSec * 1000);

    const fieldBox = el('div');
    const statusNode = el('div', { class: 'prep-status' });
    const timerNode = el('b', { class: 'prep-timer' });
    const confirmBtn = el('button', { class: 'btn primary big', text: '配置を確定' });

    const moveTo = (u, area) => { if (locked) return; u.area = area; render(); };
    const render = () => {
      clear(fieldBox);
      fieldBox.appendChild(buildFieldRow((c, cell, box) => {
        if (c.side === 'ENEMY') {
          cell.classList.add('hidden-cell');
          box.appendChild(el('div', { class: 'hidden-mark', text: '?' }));
          return;
        }
        cell.setAttribute('data-drop', String(c.area));
        if (selected && !locked && selected.area !== c.area) {
          cell.classList.add('movable');
          cell.addEventListener('click', () => moveTo(selected, c.area));
        }
        units.filter(u => u.area === c.area).forEach(u => {
          const t = unitToken(u, { cls: u === selected ? 'selected' : '' });
          t.addEventListener('click', (e) => { e.stopPropagation(); selected = selected === u ? null : u; render(); });
          if (!locked) makeDraggable(t, { onStart: () => { selected = u; }, onDrop: (d) => moveTo(u, Number(d.getAttribute('data-drop'))) });
          box.appendChild(t);
        });
      }));
      clear(statusNode);
      statusNode.appendChild(el('span', { class: locked ? 'ok' : 'muted', text: locked ? '配置を確定しました。相手の配置を待っています…' : '配置を決めて「配置を確定」を押してください（確定後は変更できません）' }));
      statusNode.appendChild(el('span', { class: opponentReady ? 'ok' : 'faint', text: opponentReady ? '相手：準備完了 ✓' : '相手：配置中…' }));
      confirmBtn.disabled = locked;
    };
    const tick = setInterval(() => {
      if (!root.isConnected) { clearInterval(tick); return; }
      const left = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
      timerNode.textContent = '残り ' + left + '秒';
      timerNode.classList.toggle('urgent', left <= 10);
    }, 250);

    confirmBtn.addEventListener('click', async () => {
      if (locked) return;
      const placement = {};
      units.forEach(u => { placement[u.uid] = u.area; });
      locked = true;
      render();
      const r = await PvpClient.req(PVP_PROTOCOL.EV.SUBMIT_PLACEMENT, { roomId: m.roomId, placement: placement });
      if (!r.ok) { App.toast('配置を送信できませんでした'); }
    });

    PvpGame.screen = {
      placement_status: (d) => { opponentReady = !!d.opponentReady; render(); },
      player_disconnected: (d) => { App.toast('相手の通信が切断されました（残り' + d.graceSec + '秒）'); },
      player_reconnected: () => App.toast('相手が復帰しました'),
      connection: (c) => { if (!c.connected) App.toast('再接続中…'); },
    };

    render();
    const root = el('div', { class: 'screen battle-prep' }, [
      topbar('戦闘準備', {
        en: 'REALTIME BATTLE', wallet: false, back: false, option: false,
        extra: [el('span', { class: 'my-name', text: m.myName || Save.playerName() }), timerNode, opponentTag(m.opponent.name, m.opponent.isBot)],
      }),
      el('div', { class: 'prep-head' }, [
        el('div', { class: 'side-tag ally', text: '自陣 — 配置変更可' }),
        el('div', { class: 'spacer' }),
        fieldInfo(m.field),
        el('div', { class: 'spacer' }),
        el('div', { class: 'side-tag enemy', text: '敵陣 — 戦闘開始時に公開' }),
      ]),
      fieldBox,
      el('div', { class: 'panel frame prep-info' }, [
        el('div', { class: 'row' }, [
          el('span', { class: 'muted', text: '相手のパーティ' }),
          el('div', { class: 'mini-faces' }, m.opponent.units.map(u => {
            const master = getCharacter(u.charId);
            return el('div', { class: 'opp-member small', title: u.name }, [faceIcon(master), elementIcon(master.element)]);
          })),
          el('span', { class: 'faint', text: '（配置は戦闘開始時に公開）' }),
        ]),
        statusNode,
      ]),
      el('div', { class: 'row end', style: 'margin-top:14px' }, [
        el('button', {
          class: 'btn ghost', 'data-se': 'cancel', text: '降参',
          onclick: () => confirmSurrender(m.roomId),
        }),
        confirmBtn,
      ]),
    ]);
    return root;
  },

  // =================================================================
  // 戦闘（PVP）… サーバーから届いた結果を BattleView で再生する
  // =================================================================
  battle(start) {
    const m = PvpGame.match;
    const mySide = start.mySide !== undefined ? start.mySide : m.mySide;
    const rel = (v) => Object.assign({}, v, { side: v.side === mySide ? 'ALLY' : 'ENEMY' });
    let turn = null;                  // 現在の turn_start
    let disconnectTick = null;

    const connNode = el('span', { class: 'conn-state' });
    const view = createBattleView({
      title: 'vs ' + m.opponent.name,
      en: 'REALTIME BATTLE',
      bgm: 'battle',
      field: start.field,
      headRight: opponentTag(m.opponent.name, m.opponent.isBot),
      extra: [connNode],
      onBack: () => confirmSurrender(m.roomId),
      onAction: async (action) => {
        if (!turn) { view.unlock(); return; }
        const r = await PvpClient.req(PVP_PROTOCOL.EV.SEND_ACTION,
          Object.assign({ roomId: m.roomId, seq: turn.seq, actorId: turn.actorId }, action));
        if (!r.ok) {
          const E = PVP_PROTOCOL.ERR;
          if (r.error !== E.STALE_SEQ && r.error !== E.NOT_YOUR_TURN) App.toast('その行動はできません');
          view.unlock();
        }
      },
    });
    Object.assign(view.state, {
      field: start.field, round: start.round, order: start.order || [],
      units: start.units.map(rel),
    });
    (start.events || []).forEach(e => { if (e.t === 'log') view.appendLog(e.text, e.kind); });
    (start.log || []).forEach(l => view.appendLog(l.text, l.kind));
    const topbarBack = view.root.querySelector('.back-btn span:last-child');
    if (topbarBack) topbarBack.textContent = '降参';

    // 届いたメッセージは演出が終わってから順に処理する
    const queue = [];
    let running = false;
    const enqueue = (fn) => { queue.push(fn); pump(); };
    const pump = () => {
      if (running || !queue.length) return;
      running = true;
      queue.shift()(() => { running = false; pump(); });
    };

    const applyTurn = (t) => {
      turn = t;
      (t.preEvents || []).forEach(e => { if (e.t === 'log') view.appendLog(e.text, e.kind); });
      const actor = view.unitOf(t.actorId);
      view.setState({
        round: t.round, order: t.order, actorUid: t.actorId,
        mine: !!t.isMine, legal: t.isMine ? t.legalActions : null,
        waitText: actor && actor.side === 'ENEMY' ? '相手が行動を選択中…' : '行動を待っています…',
      });
      view.setTimer(t.isMine ? t.remainingMs : null);
    };

    PvpGame.screen = {
      turn_start: (t) => enqueue(done => { applyTurn(t); done(); }),
      receive_action: (r) => enqueue(done => {
        view.setTimer(null);
        turn = null;
        view.play(r.events, () => {
          const map = {};
          view.state.units.forEach(u => { map[u.uid] = u; });
          r.diff.forEach(v => { map[v.uid] = rel(v); });
          view.state.units = Object.keys(map).map(k => map[k]);
          view.state.round = r.round;
          view.state.field = r.field;
          view.state.order = r.order;
          view.state.legal = null;
          view.state.mine = false;
        }, () => {
          PvpClient.req(PVP_PROTOCOL.EV.ACTION_COMPLETE, { roomId: m.roomId, seq: r.seq });
          done();
        });
      }),
      player_disconnected: (d) => {
        let left = d.graceSec;
        clearInterval(disconnectTick);
        view.setBanner('相手の通信が切断されました（残り' + left + '秒）');
        disconnectTick = setInterval(() => {
          left = Math.max(0, left - 1);
          if (!view.root.isConnected) { clearInterval(disconnectTick); return; }
          view.setBanner('相手の通信が切断されました（残り' + left + '秒）');
        }, 1000);
      },
      player_reconnected: () => { clearInterval(disconnectTick); view.setBanner(null); },
      connection: (c) => {
        connNode.textContent = c.connected ? '' : '再接続中…';
        connNode.classList.toggle('on', !c.connected);
      },
      /** 決着: 再生中の演出が終わってから結果画面へ */
      beforeEnd: (go) => enqueue(done => {
        view.setTimer(null);
        view.setState({ finished: true, legal: null, actorUid: null });
        clearInterval(disconnectTick);
        setTimeout(() => { done(); go(); }, 800);
      }),
    };

    if (start.currentTurn) applyTurn(start.currentTurn);
    else view.render();
    if (start.opponentConnected === false) PvpGame.screen.player_disconnected({ graceSec: CONFIG.PVP.RECONNECT_GRACE_SEC });
    return view.root;
  },

  // =================================================================
  // 結果
  // =================================================================
  result(res) {
    App.setBackground('menu');
    Sound.playBgm('menu');
    PvpGame.screen = null;
    const head = {
      win: ['VICTORY', '勝利', 'win'], lose: ['DEFEAT', '敗北', 'lose'],
      draw: ['DRAW', '引き分け', 'draw'], void: ['NO CONTEST', '無効試合', 'draw'],
    }[res.result] || ['DRAW', '引き分け', 'draw'];
    updateWallet();
    return el('div', { class: 'screen pvp-result' }, [
      el('div', { class: 'panel frame result-panel center' }, [
        el('div', { class: 'result-banner ' + head[2], text: head[0] }),
        el('div', { class: 'result-jp', text: head[1] }),
        el('div', { class: 'row center-row' }, [
          el('span', { class: 'muted', text: 'vs' }), opponentTag(res.opponentName || '', res.isBot),
          res.summary && res.summary.rounds ? el('span', { class: 'muted', text: res.summary.rounds + 'ラウンド' }) : null,
        ]),
        el('p', { class: 'muted', text: '決着：' + (PVP_PROTOCOL.REASON_LABEL[res.reason] || res.reason) }),
        res.result === 'void'
          ? el('p', { class: 'faint', text: 'サーバーの都合により対戦が中断されました（無効試合）。' })
          : el('p', { class: 'reward', text: '+ ' + ((res.reward && res.reward.soul) || 0) + ' Soul' }),
        el('div', { class: 'row center-row', style: 'margin-top:16px' }, [
          el('button', { class: 'btn primary', text: 'ロビーへ戻る', onclick: () => { App.stack = []; App.show(PvpScreens.lobby, []); } }),
        ]),
      ]),
    ]);
  },
};

function confirmSurrender(roomId) {
  App.modal(close => el('div', {}, [
    el('h2', { text: '降参' }),
    el('p', { class: 'muted', text: '降参しますか？ 敗北として扱われます。' }),
    el('div', { class: 'row end', style: 'margin-top:16px' }, [
      el('button', { class: 'btn ghost', 'data-se': 'cancel', text: '戻る', onclick: close }),
      el('button', {
        class: 'btn primary', text: '降参する',
        onclick: async () => {
          close();
          const r = await PvpClient.req(PVP_PROTOCOL.EV.SURRENDER, { roomId: roomId });
          if (!r.ok) App.toast('降参できませんでした');
        },
      }),
    ]),
  ]));
}
