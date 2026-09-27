// ===================================================================
// 起動
// ===================================================================

(function boot() {
  const start = () => {
    Save.load();
    App.init();
    Sound.init();
    // データ整合チェック（xlsx 編集で消えたキャラ・スキルを掃除）
    Object.keys(Save.data.owned).forEach(id => {
      if (!getCharacter(Number(id))) delete Save.data.owned[id];
    });
    Save.data.party = Save.data.party.filter(id => Save.isOwned(id));
    Save.data.defenseParty = Save.data.defenseParty.filter(id => Save.isOwned(id));
    Save.save();

    App.show(Screens.title, []);
    // リアルタイム対戦の途中でページを閉じた・再読み込みした場合は試合へ復帰する
    PvpGame.tryResumeOnBoot();
  };

  // スマホ縦持ちの案内。画面の向きを固定できる端末（主に Android）では
  // ボタンで全画面＋横向き固定を試みる（iPhone のブラウザは向きを固定できない）
  const setupRotateHint = () => {
    const btn = document.getElementById('rotate-lock');
    const canLock = screen.orientation && typeof screen.orientation.lock === 'function' &&
      document.documentElement.requestFullscreen;
    if (!btn || !canLock) return;
    btn.hidden = false;
    btn.addEventListener('click', () => {
      document.documentElement.requestFullscreen({ navigationUI: 'hide' })
        .then(() => screen.orientation.lock('landscape'))
        .catch(() => { btn.hidden = true; });
    });
  };
  setupRotateHint();

  // スマホの横画面は高さが足りないので、PC と同じレイアウトを縮小して表示する
  // （仮想の画面高さが VIRTUAL_H になるよう viewport の幅を決める）
  const VIRTUAL_H = 700;
  const meta = document.querySelector('meta[name="viewport"]');
  const baseViewport = meta ? meta.getAttribute('content') : '';
  const isTouch = window.matchMedia && window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  const setViewport = v => { if (meta.getAttribute('content') !== v) meta.setAttribute('content', v); };
  const fitViewport = () => {
    if (!meta || !isTouch) return;
    const w = screen.width, h = screen.height;
    const landscapeW = Math.max(w, h), landscapeH = Math.min(w, h);
    const landscape = window.matchMedia('(orientation: landscape)').matches;
    if (landscape && landscapeH < 540) {
      const vw = Math.max(960, Math.round(VIRTUAL_H * landscapeW / landscapeH));
      setViewport('width=' + vw + ', viewport-fit=cover');
    } else {
      setViewport(baseViewport);
    }
  };
  fitViewport();
  window.addEventListener('orientationchange', () => setTimeout(fitViewport, 200));
  window.addEventListener('resize', fitViewport);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
