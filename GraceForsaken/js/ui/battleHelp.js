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
    text: '【ブレイブハート】【生への執着】など。HPが0になるダメージを受けた時、確率でHP1で耐える（1度発動すると消える）。' },
  { key: '抜刀', cls: 'good',
    text: '次に行う物理攻撃の威力が上がる。1度攻撃すると消える。' },
  { key: '能力変化', cls: '',
    text: 'スキルによる能力値・命中率・回避率の上昇／低下。「（2R）」のように残りラウンド数が表示され、0になると元に戻る。' },
  { key: '貫通', cls: '',
    text: '相手の防御力を無視してダメージを与える。【絶対領域】などのダメージ無効化も貫通する。' },
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
