/* =============================================================================
   Google AdSense
   -----------------------------------------------------------------------------
   審査に通って発行された ID を下の ADS に書き入れ、enabled を true にすると
   広告枠が現れる。false のあいだは枠ごと出ないので、ゲームの表示は変わらない。

     client     … サイト運営者ID  例 'ca-pub-1234567890123456'
     slotSide   … PC の左右に置く広告ユニットのID（縦長）
     slotTop    … スマホの上部に置く広告ユニットのID（横長）
     slotInline … 遊び方などテキストページの本文下に置く広告ユニットのID

   広告ユニットは AdSense の管理画面で「ディスプレイ広告」として作り、
   できあがったコードの data-ad-slot の数字をここへ写す。
   ============================================================================= */
var ADS = {
  enabled: false,
  client: 'ca-pub-0000000000000000',
  slotSide: '0000000000',
  slotTop: '0000000000',
  slotInline: '0000000000'
};

(function () {
  'use strict';

  if (!ADS.enabled || !/^ca-pub-\d{10,}$/.test(ADS.client)) return;

  document.body.classList.add('ads-on');

  /* 配信スクリプトは広告を出すときだけ読み込む */
  var loader = document.createElement('script');
  loader.async = true;
  loader.crossOrigin = 'anonymous';
  loader.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' +
    encodeURIComponent(ADS.client);
  document.head.appendChild(loader);

  var units = [
    { box: 'ad-left', slot: ADS.slotSide, format: 'vertical' },
    { box: 'ad-right', slot: ADS.slotSide, format: 'vertical' },
    { box: 'ad-top', slot: ADS.slotTop, format: 'horizontal' },
    /* 遊び方・プライバシーポリシー・お問い合わせの各ページ、本文の下 */
    { box: 'ad-inline', slot: ADS.slotInline || ADS.slotTop, format: 'auto' }
  ];

  function build(u) {
    var box = document.getElementById(u.box);
    if (!box || box.getAttribute('data-built')) return;
    box.setAttribute('data-built', '1');

    var label = document.createElement('div');
    label.className = 'adlabel';
    label.textContent = '広告';

    var ins = document.createElement('ins');
    ins.className = 'adsbygoogle adslot';
    ins.setAttribute('data-ad-client', ADS.client);
    ins.setAttribute('data-ad-slot', u.slot);
    ins.setAttribute('data-ad-format', u.format);
    ins.setAttribute('data-full-width-responsive', 'false');

    box.appendChild(label);
    box.appendChild(ins);
    u.ins = ins;
  }

  /* 隠れている枠に広告を流し込むと幅0として扱われるため、
     実際に見えている枠だけを、見えた時点で読み込む */
  function push(u) {
    var box = document.getElementById(u.box);
    if (!box || u.pushed) return;
    if (!box.offsetWidth || !box.offsetHeight) return;
    build(u);
    u.pushed = true;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (e) { u.pushed = false; }
  }

  function sweep() {
    for (var i = 0; i < units.length; i++) push(units[i]);
  }

  sweep();
  window.addEventListener('resize', function () { setTimeout(sweep, 200); });
  window.addEventListener('orientationchange', function () { setTimeout(sweep, 400); });
})();
