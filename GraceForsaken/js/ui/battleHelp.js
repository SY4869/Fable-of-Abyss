// ===================================================================
// 戦闘中の説明（属性相性・状態異常）
//   ・戦闘画面上部の「相性・状態」ボタン → BattleHelp.openGuide()
//   ・キャラ情報欄の状態タグをタップ → BattleHelp.explain(key)
// ===================================================================

const STATUS_HELP = [
  { key: '洗脳', cls: 'bad',
    text: '【チャーム】などで付与される。攻撃・スキルを使う時、70%の確率で対象がランダムに変わる（味方を攻撃してしまうこともある）。' +
      '自分の手番の開始時に「魔法防御力×' + CONFIG.BRAINWASH_CURE_PER_DEFMAG + '%」の確率で解除される。' },
  { key: '隠密', cls: 'good',
    text: '単体攻撃の対象に選ばれなくなる。範囲攻撃・全体攻撃は当たる。' +
      '【鏡よ鏡】【魂転】【二刀真剣】【狩人の嗅覚】を持つキャラクターには無視される。' },
  { key: 'シールド', cls: 'good',
    text: '受けるダメージを数値の分だけ肩代わりする。シールドが尽きると残りのダメージはHPに入る。' },
  { key: 'リーサルカウント', cls: 'bad',
    text: '表示された残りラウンド数が0になると、ラウンド終了時に戦闘不能になる。' },
  { key: 'アンチヒール', cls: 'bad',
    text: 'HPの回復・蘇生を受けられなくなる。' },
  { key: '耐え', cls: 'good',
    text: 'HPが0になるダメージを受けた時、HP1で耐える。【ブレイブハート】は1度耐えると消える。【生への執着】は何度でも60%の確率で耐える。' },
  { key: '抜刀', cls: 'good',
    text: '次に行う物理攻撃の威力が上がる。1度攻撃すると消える。' },
  { key: '能力変化', cls: '',
    text: 'スキルによる能力値・命中率・回避率の上昇／低下。「（2R）」のように残りラウンド数が表示され、0になると元に戻る。' },
  { key: '貫通', cls: '',
    text: '相手の防御力を無視してダメージを与える。【絶対領域】などのダメージ無効化も貫通する。属性相性の影響は受けない。' },
];

const BattleHelp = {
  /** 属性相性図＋状態異常一覧 */
  openGuide() {
    const chip = k => el('span', { class: 'help-el el-' + k }, [elementIcon(k), el('b', { text: ELEMENTS[k].name })]);
    const arrow = () => el('span', { class: 'help-arrow', text: '→' });
    App.modal(close => el('div', { class: 'battle-help' }, [
      el('h2', { text: '属性相性・状態' }),
      el('h3', { text: '属性相性' }),
      el('p', { class: 'muted', text: '矢印の先の属性に攻撃すると、ダメージが ×' + CONFIG.ELEMENT_MULT + ' になる。不利による軽減はない。' }),
      el('div', { class: 'help-cycle' }, [
        chip('FIRE'), arrow(), chip('WIND'), arrow(), chip('THUNDER'), arrow(), chip('WATER'), arrow(), chip('FIRE'),
      ]),
      el('div', { class: 'help-cycle' }, [
        chip('LIGHT'), el('span', { class: 'help-arrow', text: '⇄' }), chip('DARK'),
        el('span', { class: 'faint', text: '（互いに ×' + CONFIG.ELEMENT_MULT + '）' }),
      ]),
      el('div', { class: 'help-cycle' }, [
        chip('NONE'), el('span', { class: 'faint', text: '有利・不利なし' }),
      ]),
      el('h3', { text: '状態' }),
      el('dl', { class: 'help-list' }, [].concat.apply([], STATUS_HELP.map(s => [
        el('dt', { class: s.cls, text: s.key }),
        el('dd', { text: s.text }),
      ]))),
      el('p', { class: 'faint', text: 'キャラクター情報欄の状態タグをタップすると、その効果を確認できます。' }),
      el('div', { class: 'row end', style: 'margin-top:14px' }, [
        el('button', { class: 'btn primary', 'data-se': 'cancel', onclick: close, text: '閉じる' }),
      ]),
    ]), { wide: true });
  },

  /** 状態タグの説明文 */
  describe(key) {
    const base = STATUS_HELP.find(s => s.key === key);
    if (base) return { title: key, text: base.text };
    const sk = typeof getSkill === 'function' ? getSkill(key) : null;
    if (sk) return { title: '【' + key + '】', text: sk.desc || '' };
    return { title: key, text: 'スキルによる効果。' };
  },

  explain(key) {
    const d = this.describe(key);
    App.modal(close => el('div', { class: 'battle-help' }, [
      el('h2', { text: d.title }),
      el('p', { text: d.text }),
      el('div', { class: 'row end', style: 'margin-top:14px' }, [
        el('button', { class: 'btn ghost small', onclick: () => { close(); BattleHelp.openGuide(); }, text: '相性・状態一覧' }),
        el('button', { class: 'btn primary small', 'data-se': 'cancel', onclick: close, text: '閉じる' }),
      ]),
    ]));
  },
};

// ===================================================================
// チュートリアル戦闘の解説（場面ごとに1回ずつ表示）
//   const guide = TutorialGuide.create();
//   guide.run(['start'], next) … まだ見せていない解説を順に出し、閉じたら next()
// ===================================================================

/** 属性相性の図 */
function elementChart() {
  const chip = k => el('span', { class: 'help-el el-' + k }, [elementIcon(k), el('b', { text: ELEMENTS[k].name })]);
  const arrow = () => el('span', { class: 'help-arrow', text: '→' });
  return el('div', {}, [
    el('div', { class: 'help-cycle' }, [
      chip('FIRE'), arrow(), chip('WIND'), arrow(), chip('THUNDER'), arrow(), chip('WATER'), arrow(), chip('FIRE'),
    ]),
    el('div', { class: 'help-cycle' }, [
      chip('LIGHT'), el('span', { class: 'help-arrow', text: '⇄' }), chip('DARK'),
      el('span', { class: 'faint', text: '（互いに ×' + CONFIG.ELEMENT_MULT + '）' }),
    ]),
    el('div', { class: 'help-cycle' }, [chip('NONE'), el('span', { class: 'faint', text: '有利・不利なし' })]),
  ]);
}

const TUTORIAL_PAGES = {
  placement: {
    title: '配置と射程',
    body: () => [
      '自陣・敵陣はそれぞれ「前衛・中衛・後衛」の3マス。キャラクターをドラッグ（またはタップで選んでからマスをタップ）して配置を決めます。',
      '敵との距離は「自陣のマス番号 ＋ 敵陣のマス番号 − 1」。射程以内の敵にしか攻撃が届きません（射程1なら、前衛から敵の前衛だけ）。',
      'キャラクターを選ぶと、攻撃が届く敵のマスが光ります。打たれ弱い魔法使いは、射程が足りる範囲でなるべく後ろへ置きましょう。',
      '配置が決まったら「戦闘開始」を押してください。',
    ],
  },
  start: {
    title: '戦闘の流れ',
    body: () => [
      '戦闘はラウンド制です。ラウンドごとに、速度の高いキャラクターから順に1回ずつ行動します。上部の TURN ORDER が行動の順番です。',
      '今回の勝利条件は「敵の全滅」。味方が全員倒れると敗北です。',
      '前衛が全員倒れると、後ろの隊列が自動で前へ詰められます。',
    ],
  },
  command: {
    title: 'コマンド',
    body: () => [
      '自分のキャラクターの番になったら、画面下のコマンドから行動を選びます。',
      '・通常攻撃 … MPを使わずに射程内の敵1体を攻撃。\n・スキル … MPを使って攻撃・回復・強化などを行う。\n・移動 … 隣のマスへ1つ動く。\n・待機 … 何もせずに手番を終える。',
      'コマンドを押すと、狙える相手やマスが光ります。選ぶと実行、「キャンセル」で選び直せます。キャラクターをタップすると、HP・能力・状態を確認できます。',
    ],
  },
  quick: {
    title: 'クイックスキル',
    body: () => [
      '緑色の枠で表示される「QUICK」のスキルは、行動を消費しません。使ったあとも同じ手番で、続けて通常攻撃やスキルを選べます。',
      '同じクイックスキルは1回の手番で1度だけ。強化してから攻撃する、といった使い方ができます。',
    ],
  },
  element: {
    title: '属性相性',
    body: () => [
      '矢印の先の属性に攻撃すると、ダメージが ×' + CONFIG.ELEMENT_MULT + ' になります。不利による軽減はありません。',
      elementChart(),
      '防御力を無視する「貫通」攻撃は、属性相性の影響を受けません。相性はいつでも画面上部の「相性・状態」ボタンで確認できます。',
    ],
  },
  status: {
    title: '状態',
    body: () => [
      'スキルによって、能力の上昇・低下や「洗脳」「隠密」「シールド」などの状態が付くことがあります。',
      'キャラクター情報欄に並ぶ状態タグをタップすると、その効果の説明が出ます。「（2R）」は残りラウンド数です。',
      '主な状態の一覧は、画面上部の「相性・状態」ボタンからいつでも確認できます。',
    ],
  },
};

const TutorialGuide = {
  create() {
    const shown = {};
    let open = false;
    const showOne = (key, done) => {
      const page = TUTORIAL_PAGES[key];
      shown[key] = true;
      open = true;
      App.modal(close => el('div', { class: 'battle-help tutorial-page' }, [
        el('div', { class: 'tutorial-tag', text: 'TUTORIAL' }),
        el('h2', { text: page.title }),
        el('div', {}, page.body().map(b => typeof b === 'string'
          ? el('p', { class: 'tutorial-text', text: b }) : b)),
        el('div', { class: 'row end', style: 'margin-top:14px' }, [
          el('button', { class: 'btn primary', onclick: () => { close(); open = false; done(); }, text: 'OK' }),
        ]),
      ]), { persistent: true });
    };
    return {
      isShown: key => !!shown[key],
      isOpen: () => open,
      /** keys のうち未表示のものを順に表示し、すべて閉じたら next() */
      run(keys, next) {
        const queue = (keys || []).filter(k => k && TUTORIAL_PAGES[k] && !shown[k]);
        const go = () => {
          const k = queue.shift();
          if (!k) { if (next) next(); return; }
          showOne(k, go);
        };
        go();
      },
    };
  },
};
