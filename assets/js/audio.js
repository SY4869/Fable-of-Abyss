/* =============================================================================
   フェイブル・オブ・アビス ─ 音声エンジン
   -----------------------------------------------------------------------------
   旧版でスマホのBGMが切り替わらなかった原因

   1. iOS Safari（および一部のAndroidブラウザ）では audio 要素の volume が
      読み取り専用で、代入しても常に 1 のまま。
      旧版は「音量を 0 まで下げてから pause する」という作りだったため、
      音量が下がらない → pause 条件を満たさない → 前の曲が鳴り続けたまま
      次の曲が重なる、という状態になっていた。

   2. 曲ごとに new Audio() で要素を作っていたため、ユーザー操作の外
      （ボス撃破後の自動遷移など）で生まれた要素は自動再生制限に弾かれ、
      そもそも再生が始まらなかった。

   対策

   ・音声要素は 2 本だけ用意して使い回す（プール方式）。
     最初のタップで両方を「解錠」しておくので、以後は操作外でも再生できる。
   ・音量は Web Audio の GainNode で制御する。これは iOS でも確実に効く。
     Web Audio が使えなければ volume、それも駄目なら即時切り替えに退避する。
   ・タブ復帰・画面復帰で止まったままにならないよう再生を復旧する。
   ============================================================================= */
(function (global) {
  'use strict';

  /* 44 バイトの無音 WAV。最初のタップで要素を解錠するためだけに使う */
  var SILENT = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';

  var EDGE_IN = 1.2;    /* 曲頭をなだらかに立ち上げる秒数 */
  var EDGE_OUT = 1.6;   /* 曲尻をなだらかに落とす秒数 */
  var STEP = 0.014;     /* 1フレームあたりの音量変化 */

  var tracks = global.MUSIC || {};
  var slots = [];
  var vol = 0.12;
  var muted = false;
  var cur = null;
  var ctx = null, ctxTried = false;
  var mode = null;      /* 'gain' | 'volume' | 'cut' */
  var unlocked = false;
  var warmed = {};

  /* ---------- AudioContext ---------- */

  function getCtx() {
    if (!ctxTried) {
      ctxTried = true;
      try {
        var C = global.AudioContext || global.webkitAudioContext;
        ctx = C ? new C() : null;
      } catch (e) { ctx = null; }
    }
    return ctx;
  }

  function resumeCtx() {
    if (ctx && ctx.state === 'suspended' && ctx.resume) {
      try { ctx.resume(); } catch (e) {}
    }
  }

  /* ---------- スロット ---------- */

  function makeSlot() {
    var el = document.createElement('audio');
    el.loop = true;
    el.preload = 'auto';
    el.setAttribute('playsinline', '');
    el.setAttribute('webkit-playsinline', '');
    el.style.display = 'none';
    try { el.volume = 0; } catch (e) {}
    if (document.body) document.body.appendChild(el);
    return { el: el, gain: null, key: null, tg: 0, v: 0, retry: 0 };
  }

  function init() {
    if (slots.length || typeof Audio === 'undefined') return;
    slots = [makeSlot(), makeSlot()];
  }

  /* 音量制御の手段を決める。最初の解錠時に一度だけ走る

     順番が重要。まず素の volume を試し、効かない端末だけ Web Audio へ回す。
     Web Audio を先に使うと、file:// で開いたときに音声ファイルが別オリジン
     扱いになり、MediaElementSource から先が無音になってしまう
     （サーバーに置けば鳴るが、手元で開くと聞こえない、という状態になる）。 */
  function pickMode() {
    if (mode || !slots.length) return mode;

    /* volume に実際に書き込めるかを測る */
    var el = slots[0].el, before = el.volume, ok = false;
    try {
      el.volume = 0.345;
      ok = Math.abs(el.volume - 0.345) < 0.02;
      el.volume = before;
    } catch (e) { ok = false; }
    if (ok) { mode = 'volume'; return mode; }

    /* ここから先は volume が読み取り専用の端末（iOS Safari など）。
       GainNode なら音量を変えられるので、そちらへ音を通す。
       ただし file:// では上記の理由で無音になるため使わない */
    var a = (location.protocol !== 'file:') ? getCtx() : null;
    if (a && a.createMediaElementSource) {
      try {
        for (var i = 0; i < slots.length; i++) {
          var s = slots[i];
          if (!s.gain) {
            var node = a.createMediaElementSource(s.el);
            var g = a.createGain();
            g.gain.value = 0;
            node.connect(g);
            g.connect(a.destination);
            s.gain = g;
          }
          /* GainNode を通すので要素側は開けきっておく */
          try { s.el.volume = 1; } catch (e) {}
        }
        mode = 'gain';
        return mode;
      } catch (e) { /* 失敗したら下へ落ちる */ }
    }

    /* 音量をまったく変えられない環境。再生と停止だけで曲を切り替える */
    mode = 'cut';
    return mode;
  }

  function setLevel(s, v) {
    s.v = v;
    if (mode === 'gain' && s.gain) {
      try { s.gain.gain.value = v; } catch (e) {}
    } else if (mode === 'volume') {
      try { s.el.volume = v; } catch (e) {}
    }
  }

  function load(s, key) {
    s.key = key;
    s.retry = 0;
    try {
      s.el.src = tracks[key];
      s.el.load();
    } catch (e) {}
  }

  function play(s) {
    if (muted) return;
    resumeCtx();
    if (!s.el.paused) return;
    try { if (s.el.currentTime > 0.05 && s.v <= 0.001) s.el.currentTime = 0; } catch (e) {}
    var p = s.el.play();
    if (p && p['catch']) p['catch'](function () {});
  }

  /* ---------- 公開API ---------- */

  /* 鳴らす曲を指定する。null で停止 */
  function set(key) {
    if (cur === key) return;
    cur = key;
    if (!slots.length) init();
    var i;
    for (i = 0; i < slots.length; i++) slots[i].tg = 0;
    if (!key || !tracks[key]) return;

    var use = null;
    for (i = 0; i < slots.length; i++) {
      if (slots[i].key === key) { use = slots[i]; break; }
    }
    if (!use) {
      /* 鳴っていない方（音量が小さい方）へ読み込む */
      use = (slots[0].v <= slots[1].v) ? slots[0] : slots[1];
      load(use, key);
    }
    use.tg = vol;
    play(use);
  }

  /* 最初のユーザー操作で呼ぶ。要素の解錠と音量制御方式の決定を行う */
  function unlock() {
    if (!slots.length) init();
    getCtx();
    resumeCtx();
    pickMode();

    if (!unlocked) {
      unlocked = true;
      for (var i = 0; i < slots.length; i++) {
        (function (s) {
          if (!s.el.src) s.el.src = SILENT;
          var p = s.el.play();
          var stopIfIdle = function () {
            if (s.key !== cur) { try { s.el.pause(); } catch (e) {} }
          };
          if (p && p.then) p.then(stopIfIdle)['catch'](function () {});
          else stopIfIdle();
        })(slots[i]);
      }
    }
    for (var j = 0; j < slots.length; j++) {
      if (cur && slots[j].key === cur) play(slots[j]);
    }
  }

  /* 毎フレーム呼ぶ。音量の追従とループ継ぎ目の処理 */
  function tick() {
    if (!slots.length) return;
    for (var i = 0; i < slots.length; i++) {
      var s = slots[i], el = s.el;
      var tg = muted ? 0 : (s.tg || 0);

      /* ループの継ぎ目が目立たないよう曲頭と曲尻を絞る */
      if (tg > 0 && el.duration && isFinite(el.duration)) {
        var ct = el.currentTime, d = el.duration;
        if (ct < EDGE_IN) tg *= Math.max(0.05, ct / EDGE_IN);
        else if (d - ct < EDGE_OUT) tg *= Math.max(0.05, (d - ct) / EDGE_OUT);
      }

      /* 音量を一切変えられない環境では再生と停止だけで切り替える */
      if (mode === 'cut') {
        if (s.tg > 0 && !muted) { if (el.paused) play(s); }
        else if (!el.paused) { try { el.pause(); } catch (e) {} }
        continue;
      }

      var v = s.v;
      if (Math.abs(v - tg) <= STEP) v = tg;
      else v += (tg > v ? STEP : -STEP);
      if (v < 0) v = 0; else if (v > 1) v = 1;
      setLevel(s, v);

      if (v <= 0.001 && s.tg <= 0 && !el.paused) {
        try { el.pause(); } catch (e) {}
      }
      /* 端末側の都合で止められていたら鳴らし直す（毎フレームは試さない） */
      if (s.tg > 0 && !muted && el.paused) {
        if (++s.retry > 30) { s.retry = 0; play(s); }
      } else {
        s.retry = 0;
      }
    }
  }

  function setMuted(m) {
    muted = !!m;
    if (!muted) unlock();
  }

  function isMuted() { return muted; }

  /* 次に使う曲を先に取りに行かせる */
  function warm(key) {
    if (!tracks[key] || warmed[key]) return;
    warmed[key] = 1;
    try {
      var l = document.createElement('link');
      l.rel = 'prefetch';
      l.as = 'audio';
      l.href = tracks[key];
      document.head.appendChild(l);
    } catch (e) {}
  }

  /* タブや画面から戻ったときに無音のままにしない */
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) return;
    resumeCtx();
    if (muted || !cur) return;
    for (var i = 0; i < slots.length; i++) {
      if (slots[i].key === cur) play(slots[i]);
    }
  });
  global.addEventListener('pageshow', function () { resumeCtx(); });

  global.BGM = {
    init: init,
    set: set,
    tick: tick,
    unlock: unlock,
    warm: warm,
    setMuted: setMuted,
    isMuted: isMuted,
    ctx: getCtx,
    setVolume: function (v) { vol = v; },
    mode: function () { return mode; }
  };
})(window);
