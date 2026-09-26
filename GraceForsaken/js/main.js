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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
