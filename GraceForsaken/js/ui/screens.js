// ===================================================================
// 各画面
// ===================================================================

const Screens = {

  // =================================================================
  // タイトル
  // =================================================================
  title() {
    App.setBackground('title');
    Sound.playBgm('title');
    const hasSave = Save.ownedCount() > 0 || Save.data.tutorialDone;

    const startNew = () => {
      const go = () => askPlayerName(() => {
        App.stack = [];
        App.show(Screens.tutorialSelect, []);
      }, { required: true });
      if (hasSave) {
        App.confirm('はじめから', 'これまでの進行データはすべて消えます。よろしいですか？', () => {
          Save.reset();
          go();
        });
      } else go();
    };

    return el('div', { class: 'screen title-screen' }, [
      el('h1', { class: 'sr-only', text: 'GraceForsaken' }),
      el('div', { class: 'title-menu' }, [
        el('button', { class: 'title-btn', onclick: startNew }, [
          el('span', { class: 'en', text: 'START' }), el('span', { class: 'jp', text: 'はじめから' }),
        ]),
        el('button', {
          class: 'title-btn', disabled: hasSave ? null : 'disabled',
          onclick: () => App.home(),
        }, [el('span', { class: 'en', text: 'LOAD' }), el('span', { class: 'jp', text: 'つづきから' })]),
        el('button', { class: 'title-btn', onclick: () => openOptions() }, [
          el('span', { class: 'en', text: 'OPTION' }), el('span', { class: 'jp', text: 'オプション' }),
        ]),
      ]),
      el('div', { class: 'title-foot', text: '4vs4 マス目・間合い配置型 ターン制コマンドバトルRPG' }),
    ]);
  },

  // =================================================================
  // ① チュートリアル：初期4体選択
  // =================================================================
  tutorialSelect() {
    App.setBackground('menu');
    Sound.playBgm('menu');
    let picked = [];
    let focus = CHARACTER_MASTER[0];
    let filter = 'ALL';
    const gridBox = el('div', { class: 'tile-grid' });
    const detailBox = el('div', { class: 'panel frame detail-panel' });
    const tabsBox = el('div');
    const footer = el('div', { class: 'row pick-footer' });

    const render = () => {
      clear(tabsBox);
      tabsBox.appendChild(elementTabs(filter, k => { filter = k; render(); }));
      clear(gridBox);
      CHARACTER_MASTER.filter(m => filter === 'ALL' || m.element === filter).forEach(m => {
        const idx = picked.indexOf(m.id);
        gridBox.appendChild(charTile(m, {
          selected: m === focus,
          inParty: idx >= 0,
          badge: idx >= 0 ? String(idx + 1) : null,
          onClick: () => { focus = m; render(); },
        }));
      });
      clear(detailBox);
      const inPick = picked.indexOf(focus.id) >= 0;
      detailBox.appendChild(charDetail(focus, {
        actions: [el('button', {
          class: 'btn ' + (inPick ? 'ghost' : 'primary'),
          'data-se': inPick ? 'cancel' : 'confirm',
          text: inPick ? '選択を外す' : 'パーティに加える',
          disabled: !inPick && picked.length >= CONFIG.PARTY_SIZE ? 'disabled' : null,
          onclick: () => {
            if (inPick) picked = picked.filter(id => id !== focus.id);
            else picked.push(focus.id);
            render();
          },
        })],
      }));
      clear(footer);
      footer.appendChild(el('div', { class: 'pick-faces' }, [0, 1, 2, 3].map(i => {
        const m = getCharacter(picked[i]);
        return m ? faceIcon(m, { class: 'small' }) : el('div', { class: 'face empty small' });
      })));
      footer.appendChild(el('div', { class: 'muted', text: picked.length + ' / ' + CONFIG.PARTY_SIZE + ' 体選択中' }));
      footer.appendChild(el('div', { class: 'spacer' }));
      footer.appendChild(el('button', {
        class: 'btn primary', text: 'この編成で始める',
        disabled: picked.length !== CONFIG.PARTY_SIZE ? 'disabled' : null,
        onclick: () => {
          const rng = makeRng(Date.now());
          picked.forEach(id => Save.acquire(id, rng));
          Save.setParty(picked);
          Save.data.tutorialDone = false;
          Save.save();
          Screens.startTutorialBattle();
        },
      }));
    };
    render();

    return el('div', { class: 'screen' }, [
      topbar('初期パーティ編成', { back: false, en: 'FIRST PARTY', wallet: false }),
      el('div', { class: 'split' }, [
        el('div', { class: 'panel frame' }, [
          el('p', { class: 'muted', style: 'margin:0 0 10px', text:
            '全キャラクターから4体を選んで最初のパーティを編成してください。習得スキルは候補6種からランダムで3種が選ばれます（あとで振り直し可能）。' }),
          tabsBox, gridBox, footer,
        ]),
        detailBox,
      ]),
    ]);
  },

  /** チュートリアル戦闘（魔人3体） */
  startTutorialBattle() {
    const rng = makeRng(Date.now());
    const enemies = ['深淵の落とし子', '狂乱した狂信者', '星の異形']
      .map(n => unitMob(n, 'ENEMY', 0, rng));
    AI.autoPlace(enemies);

    BattleFlow.begin({
      title: 'チュートリアル戦闘',
      field: { time: 'DAY', location: 'PLAINS' },
      mode: 'STORY',
      enemies: enemies,
      tutorial: true,
      intro: [
        'ギルドの訓練場。深淵より漏れ出した気配が、歪んだ影を三つ結んでいる。',
        '「まずは腕試しだ。あの異形を退けてみせろ」',
      ],
      onEnd: (result) => {
        Save.data.tutorialDone = true;
        Save.addCurrency(200);
        App.stack = [];
        resultModal(result, [
          el('p', { class: 'muted center', text: result === 'WIN'
            ? 'チュートリアルを突破した。ここからが本当の旅の始まりだ。'
            : '敗れはしたが、訓練は終わった。準備を整えて挑もう。' }),
          el('p', { class: 'center reward', text: 'Soul +200' }),
        ], [el('button', { class: 'btn primary wide', text: 'メインメニューへ', onclick: () => App.home() })]);
      },
    });
  },

  // =================================================================
  // ② メインメニュー
  // =================================================================
  mainMenu() {
    App.setBackground('menu');
    Sound.playBgm('menu');
    const party = Save.partyMasters();
    // 編成中の4人からランダムに1人を背景に立たせる
    const hero = party.length ? party[Math.floor(Math.random() * party.length)] : null;

    const storyTotal = STORY_MASTER.reduce((a, s) => a + s.episodes.length, 0);
    const storyDone = STORY_MASTER.reduce((a, s) => a + Math.min(Save.storyCleared(s.character), s.episodes.length), 0);
    const rate = Save.winRate();
    const hasDefense = Save.data.defenseParty.length > 0;

    const tile = (cls, en, jp, onClick, extra) => el('button', { class: 'menu-tile ' + cls, onclick: onClick }, [
      el('span', { class: 'menu-emblem' }),
      el('span', { class: 'menu-label' }, [el('span', { class: 'en', text: en }), el('span', { class: 'jp', text: jp })]),
      extra ? el('span', { class: 'menu-extra' }, extra) : null,
    ]);

    return el('div', { class: 'screen main-menu' }, [
      hero ? el('div', { class: 'menu-hero' }, [
        standImg(hero),
      ]) : null,
      el('div', { class: 'menu-top' }, [
        el('button', { class: 'player-plate', title: '名前を変更', onclick: () => askPlayerName(() => App.refresh()) }, [
          hero ? faceIcon(hero, { class: 'small round' }) : el('div', { class: 'face small round empty' }),
          el('span', { class: 'player-name', text: Save.playerName() }),
        ]),
        el('div', { class: 'spacer' }),
        walletNode(),
        el('button', { class: 'icon-btn', title: 'オプション', onclick: () => openOptions() }, [el('span', { class: 'gear' })]),
      ]),
      el('div', { class: 'menu-body' }, [
        el('div', { class: 'logo' }, [
          el('div', { class: 'logo-main', text: 'GraceForsaken' }),
          el('div', { class: 'logo-sub', text: 'グレイスフォーセイカン' }),
        ]),
        el('div', { class: 'menu-grid' }, [
          tile('story', 'STORY', 'ストーリー', () => App.show(Screens.storyCharacters, []), [
            el('span', { text: 'シナリオ ' + STORY_MASTER.length + ' 編' }),
            el('span', { class: 'progress' }, [el('i', { style: 'width:' + (storyTotal ? storyDone / storyTotal * 100 : 0) + '%' })]),
            el('span', { text: storyDone + ' / ' + storyTotal }),
          ]),
          tile('battle', 'BATTLE', '対戦', () => App.show(PvpScreens.modeSelect, []), [
            hasDefense
              ? el('span', { text: '勝率 ' + (rate === null ? '—' : rate.toFixed(1) + '%') })
              : el('span', { class: 'warn', text: '! DEFENSE PARTY 未設定' }),
          ]),
          tile('party', 'PARTY', 'パーティ編成', () => App.show(Screens.partyEdit, []), [
            el('span', { class: 'mini-faces' }, party.map(m => faceIcon(m, { class: 'mini' }))),
            el('span', { text: party.length + ' / ' + CONFIG.PARTY_SIZE }),
          ]),
          tile('character', 'CHARACTER', 'キャラクター', () => App.show(Screens.characterList, []), [
            el('span', { text: Save.ownedCount() + ' / ' + CHARACTER_MASTER.length }),
          ]),
          tile('gacha', 'GACHA', 'ガチャ', () => App.show(Screens.gacha, []), [
            el('span', { text: CONFIG.GACHA_COST + ' Soul / 回' }),
          ]),
        ]),
      ]),
      el('div', { class: 'menu-foot' }, [
        el('button', { class: 'btn small ghost', 'data-se': 'cancel', text: 'タイトルへ', onclick: () => { App.stack = []; App.show(Screens.title, []); } }),
        el('div', { class: 'spacer' }),
        el('span', { class: 'faint', text: 'Ver. 1.2.0' }),
      ]),
    ]);
  },

  // =================================================================
  // ③ ストーリー（キャラクター選択＋話選択）
  // =================================================================
  storyCharacters(selectedName) {
    App.setBackground('menu');
    Sound.playBgm('menu');
    const written = CHARACTER_MASTER.filter(m => STORY_MASTER.some(s => s.character === m.name));
    const unwritten = CHARACTER_MASTER.filter(m => written.indexOf(m) < 0);
    let current = getCharacter(selectedName) || written[0] || null;

    const left = el('div', { class: 'story-stage' });
    const list = el('div', { class: 'story-banners' });

    const render = () => {
      clear(left);
      clear(list);
      if (current) {
        const story = STORY_MASTER.find(s => s.character === current.name);
        const cleared = Save.storyCleared(current.name);
        left.appendChild(standImg(current, 'story-art'));
        const eps = el('div', { class: 'episode-list' });
        story.episodes.forEach(ep => {
          const unlocked = Save.isEpisodeUnlocked(current.name, ep.no);
          const done = ep.no <= cleared;
          eps.appendChild(el('button', {
            class: 'episode' + (done ? ' done' : '') + (unlocked ? '' : ' locked'),
            disabled: unlocked ? null : 'disabled',
            onclick: () => App.show(Screens.storyPlay, [current.name, ep.no]),
          }, [
            el('span', { class: 'ep-no', text: '第' + ep.no + '話' }),
            el('span', { class: 'ep-title' }, [
              el('b', { text: ep.title }),
              el('small', { text: ep.battle ? '勝利条件: ' + (ep.battle.winText || '敵の全滅') : '戦闘なし' }),
            ]),
            el('span', { class: 'tag' + (done ? ' hl' : ''), text: done ? 'CLEAR' : (unlocked ? '挑戦可能' : '未解放') }),
          ]));
        });
        left.appendChild(el('div', { class: 'story-info panel frame' }, [
          el('div', { class: 'row' }, [
            elementIcon(current.element),
            el('h2', { text: current.name }),
            el('div', { class: 'spacer' }),
            el('span', { class: 'tag' + (Save.isOwned(current.id) ? ' hl' : ''), text: Save.isOwned(current.id) ? '獲得済み' : '全' + story.episodes.length + '話クリアで獲得' }),
          ]),
          el('p', { class: 'muted profile', text: story.profile }),
          eps,
        ]));
      }

      written.forEach(m => {
        const story = STORY_MASTER.find(s => s.character === m.name);
        const cleared = Math.min(Save.storyCleared(m.name), story.episodes.length);
        list.appendChild(el('button', {
          class: 'story-banner' + (m === current ? ' on' : ''),
          onclick: () => { current = m; render(); },
        }, [
          el('span', { class: 'banner-art', style: 'background-image:url("' + faceUrl(m) + '")' }),
          el('span', { class: 'banner-text' }, [
            el('b', { text: m.name }),
            el('small', { text: story.episodes[0] ? story.episodes[0].title : '' }),
          ]),
          el('span', { class: 'banner-prog', text: Save.isOwned(m.id) ? '獲得済み' : cleared + ' / ' + story.episodes.length }),
        ]));
      });
      unwritten.forEach(m => {
        list.appendChild(el('div', { class: 'story-banner locked' }, [
          el('span', { class: 'banner-art', style: 'background-image:url("' + faceUrl(m) + '")' }),
          el('span', { class: 'banner-text' }, [el('b', { text: m.name }), el('small', { text: 'Coming Soon' })]),
        ]));
      });
    };
    render();

    return el('div', { class: 'screen' }, [
      topbar('ストーリー', { en: 'STORY' }),
      el('div', { class: 'story-layout' }, [left, el('div', { class: 'story-side panel frame' }, [
        el('div', { class: 'panel-head', text: 'キャラクターシナリオ' }),
        list,
      ])]),
    ]);
  },

  /** ストーリー1話の再生（ノベル → 戦闘 → クリア後パート） */
  storyPlay(charName, epNo) {
    const story = STORY_MASTER.find(s => s.character === charName);
    const ep = story.episodes.find(e => e.no === epNo);
    const master = getCharacter(charName);
    const lastEp = story.episodes[story.episodes.length - 1].no;

    // 戦闘前・戦闘後シーンに分割（戦闘パートは .md 上で中間に挟まる想定）
    const pre = [], post = [];
    let seenClear = false;
    ep.scenes.forEach(sc => {
      if (/クリア後|エピローグ/.test(sc.title)) seenClear = true;
      (seenClear ? post : pre).push(sc);
    });

    const toList = () => { App.stack = []; App.show(Screens.storyCharacters, [charName]); };

    const runBattle = () => {
      if (!ep.battle) { finish('WIN'); return; }
      const setup = StoryBattle.build(ep.battle, charName);
      BattleFlow.begin({
        title: charName + ' 第' + epNo + '話',
        field: setup.field,
        mode: 'STORY',
        enemies: setup.enemies,
        guests: setup.guests,
        winCondition: setup.winCondition,
        winText: ep.battle.winText,
        // 沖田雫の最終話は専用BGM
        bgm: charName === '沖田雫' && epNo === lastEp ? 'battleOkita' : 'battle',
        onEnd: finish,
      });
    };

    const finish = (result) => {
      if (result !== 'WIN') {
        resultModal('LOSE', [
          el('p', { class: 'muted center', text: '敗北した。編成や配置を見直して再挑戦しよう。' }),
        ], [
          el('button', { class: 'btn', 'data-se': 'cancel', text: 'シナリオ一覧へ', onclick: toList }),
          el('button', { class: 'btn primary', text: 'もう一度', onclick: () => { App.stack = []; App.show(Screens.storyPlay, [charName, epNo]); } }),
        ]);
        return;
      }
      const r = Save.clearEpisode(charName, epNo);
      let acquired = null;
      if (epNo >= lastEp && master && !Save.isOwned(master.id)) {
        acquired = Save.acquire(master.id, makeRng(Date.now()));
      }
      // クリア後パート → 結果
      Novel.play(post, () => Screens.showStoryResult(charName, epNo, r, acquired), { character: master });
    };

    // 戦闘前パート
    setTimeout(() => Novel.play(pre, runBattle, { character: master }), 0);
    return el('div', { class: 'screen' });
  },

  showStoryResult(charName, epNo, reward, acquired) {
    const body = [
      el('p', { class: 'center muted', text: charName + ' 第' + epNo + '話 クリア' }),
      el('p', { class: 'center reward', text: 'Soul +' + reward.reward + (reward.firstClear ? '（初回クリアボーナス込み）' : '') }),
    ];
    if (acquired && acquired.ok && !acquired.duplicate) {
      body.push(el('div', { class: 'acquire' }, [
        standImg(acquired.master),
        el('div', {}, [
          el('div', { class: 'acq-head', text: 'NEW CHARACTER' }),
          el('b', { text: acquired.master.name + ' が仲間になった！' }),
          el('p', { class: 'faint', text: '習得スキル: ' + acquired.skills.join(' / ') }),
        ]),
      ]));
    }
    resultModal('WIN', body, [
      el('button', {
        class: 'btn primary', text: 'シナリオ一覧へ',
        onclick: () => { App.stack = []; App.show(Screens.storyCharacters, [charName]); },
      }),
    ]);
  },

  // =================================================================
  // ④ 対戦相手選択（非同期ゴースト）
  // =================================================================
  pvpMenu(seedBase) {
    App.setBackground('menu');
    Sound.playBgm('menu');
    const base = seedBase || (Date.now() & 0x7fffffff);
    const myRate = Save.winRate();
    const ghosts = [1, 2, 3].map(i => Ghost.generate(base * 7 + i, myRate));
    const myDef = Save.data.defenseParty.length ? Save.data.defenseParty : Save.data.party;

    const card = (g, i) => {
      const members = g.members.map(m => getCharacter(m.charId)).filter(Boolean);
      const lead = members[0];
      return el('div', { class: 'opp-card frame' + (i === 1 ? ' featured' : '') }, [
        el('div', { class: 'opp-head' }, [
          el('span', { class: 'opp-emblem' }),
          el('b', { text: g.name }),
        ]),
        el('div', { class: 'opp-main' }, [
          el('div', { class: 'opp-art', style: 'background-image:url("' + faceUrl(lead) + '")' }),
          el('div', { class: 'opp-stats' }, [
            el('span', { class: 'ghost-tag', text: 'GHOST' }),
            el('div', { class: 'opp-rate' }, [el('small', { text: '勝率' }), el('b', { text: g.winRate.toFixed(1) + '%' })]),
          ]),
        ]),
        el('div', { class: 'opp-party-label', text: '防衛パーティ' }),
        el('div', { class: 'opp-party' }, members.map(m => el('div', { class: 'opp-member', title: m.name }, [
          faceIcon(m), elementIcon(m.element),
        ]))),
        el('button', { class: 'btn primary wide', text: '対戦する', onclick: () => Screens.startPvp(g) }),
      ]);
    };

    return el('div', { class: 'screen' }, [
      topbar('対戦相手選択', { en: 'BATTLE OPPONENT' }),
      el('div', { class: 'choose-head' }, [
        el('div', { class: 'choose-en', text: 'CHOOSE YOUR OPPONENT' }),
        el('div', { class: 'choose-jp', text: '対戦相手を選択してください' }),
      ]),
      el('div', { class: 'rate-bar frame' }, [
        el('span', { class: 'muted', text: 'あなたの勝率' }),
        el('b', { class: 'my-rate', text: myRate === null ? '—' : myRate.toFixed(1) + '%' }),
        el('span', { class: 'faint', text: Save.data.pvpRecord.win + '勝 ' + Save.data.pvpRecord.lose + '敗 ' + Save.data.pvpRecord.draw + '分' }),
        el('div', { class: 'spacer' }),
        el('span', { class: 'faint', text: '現在の勝率に近いプレイヤーから、3名を選出しています。' }),
      ]),
      el('div', { class: 'opp-grid' }, ghosts.map(card)),
      el('div', { class: 'row pvp-foot' }, [
        el('button', { class: 'btn', text: '別の相手を探す', onclick: () => App.show(Screens.pvpMenu, [], { replace: true }) }),
        el('div', { class: 'spacer' }),
        el('div', { class: 'def-party' }, [
          el('span', { class: 'faint', text: '自分の防衛パーティ' }),
          el('span', { class: 'mini-faces' }, myDef.map(id => faceIcon(getCharacter(id), { class: 'mini' }))),
          Save.data.defenseParty.length ? null : el('span', { class: 'warn', text: '未設定' }),
        ]),
        el('button', {
          class: 'btn', text: '現在のパーティを防衛に設定',
          onclick: () => { Save.setDefenseParty(Save.data.party); App.refresh(); App.toast('防衛パーティを設定しました'); },
        }),
      ]),
      el('p', { class: 'faint center', text:
        '他プレイヤーが設定した防衛パーティ（AI操作のゴースト）と戦います。フィールドはランダム。' +
        CONFIG.PVP_ROUND_LIMIT + 'ラウンドで決着がつかない場合は残りHP割合で判定します。' }),
    ]);
  },

  startPvp(ghost) {
    const rng = makeRng(ghost.seed);
    const field = { time: rng.pick(Object.keys(FIELD_TIME)), location: rng.pick(Object.keys(FIELD_LOCATION)) };
    const enemies = ghost.members.map(m => unitFromMaster(getCharacter(m.charId), m.skills, 'ENEMY', 1));
    AI.autoPlace(enemies);

    BattleFlow.begin({
      title: ghost.name,
      field: field,
      mode: 'PVP',
      enemies: enemies,
      onEnd: (result) => {
        Save.recordPvp(result);
        resultModal(result, [
          el('p', { class: 'center reward', text: 'Soul +' + (result === 'WIN' ? CONFIG.REWARD.pvpWin : CONFIG.REWARD.pvpLose) }),
        ], [
          el('button', { class: 'btn primary', text: '対戦相手選択へ', onclick: () => { App.stack = []; App.show(Screens.pvpMenu, []); } }),
        ]);
      },
    });
  },

  // =================================================================
  // ⑤ パーティ編成
  // =================================================================
  partyEdit() {
    App.setBackground('menu');
    Sound.playBgm('menu');
    const owned = Save.ownedList();
    let party = Save.data.party.slice();
    let focus = getCharacter(party[0]) || owned[0] || null;
    let filter = 'ALL';

    const leftBox = el('div', { class: 'party-focus panel frame' });
    const formation = el('div', { class: 'formation' });
    const gridBox = el('div', { class: 'tile-grid' });
    const tabsBox = el('div');

    const commit = () => { Save.setParty(party); };

    const render = () => {
      // --- 選択中キャラ ---
      clear(leftBox);
      if (focus) {
        const inParty = party.indexOf(focus.id) >= 0;
        leftBox.appendChild(charDetail(focus, {
          actions: [
            el('button', {
              class: 'btn ghost', 'data-se': 'cancel', text: '編成解除',
              disabled: inParty ? null : 'disabled',
              onclick: () => { party = party.filter(id => id !== focus.id); commit(); render(); },
            }),
            el('button', {
              class: 'btn primary', text: '編成する',
              disabled: !inParty && party.length < CONFIG.PARTY_SIZE ? null : 'disabled',
              onclick: () => { party.push(focus.id); commit(); render(); },
            }),
            el('button', {
              class: 'btn small', text: 'スキル振り直し',
              onclick: () => Screens.openSkillReroll(focus, render),
            }),
          ],
        }));
      }

      // --- CURRENT PARTY（左: 後衛 / 中央: 中衛 / 右: 前衛） ---
      clear(formation);
      for (let a = CONFIG.AREA_COUNT; a >= 1; a--) {
        const col = el('div', { class: 'form-col area-' + a, 'data-drop': String(a) }, [
          el('div', { class: 'form-label' }, [
            el('b', { text: AREA_LABEL[a] }),
            el('small', { text: ['', 'FRONT', 'MIDDLE', 'BACK'][a] }),
          ]),
        ]);
        const members = el('div', { class: 'form-members' });
        party.filter(id => Save.placementOf(id) === a).forEach(id => {
          const m = getCharacter(id);
          const node = el('div', {
            class: 'form-member' + (m === focus ? ' selected' : ''),
            onclick: () => { focus = m; render(); },
          }, [faceIcon(m), elementIcon(m.element), el('span', { class: 'fm-name', text: m.name }),
            el('span', { class: 'fm-range', text: '射程' + m.range })]);
          makeDraggable(node, {
            onDrop: (d) => { Save.setPlacement(id, Number(d.getAttribute('data-drop'))); render(); },
          });
          members.appendChild(node);
        });
        if (!members.children.length) members.appendChild(el('div', { class: 'form-empty', text: 'ここへドラッグ' }));
        col.appendChild(members);
        // タップ操作用: 選択中のメンバーをこの列へ移す
        if (focus && party.indexOf(focus.id) >= 0 && Save.placementOf(focus.id) !== a) {
          col.appendChild(el('button', {
            class: 'form-move', text: focus.name + ' をここへ',
            onclick: () => { Save.setPlacement(focus.id, a); render(); },
          }));
        }
        formation.appendChild(col);
      }

      // --- 所持キャラ一覧 ---
      clear(tabsBox);
      tabsBox.appendChild(elementTabs(filter, k => { filter = k; render(); }));
      clear(gridBox);
      owned.filter(m => filter === 'ALL' || m.element === filter).forEach(m => {
        const idx = party.indexOf(m.id);
        gridBox.appendChild(charTile(m, {
          selected: m === focus,
          inParty: idx >= 0,
          badge: idx >= 0 ? AREA_LABEL[Save.placementOf(m.id)] : null,
          onClick: () => { focus = m; render(); },
        }));
      });
    };
    render();

    return el('div', { class: 'screen' }, [
      topbar('パーティ編成', { en: 'PARTY FORMATION' }),
      el('div', { class: 'party-layout' }, [
        leftBox,
        el('div', { class: 'party-main' }, [
          el('div', { class: 'panel frame' }, [
            el('div', { class: 'panel-head' }, [
              el('span', { class: 'en', text: 'CURRENT PARTY' }),
              el('span', { class: 'faint', text: '現在のパーティ（' + CONFIG.PARTY_SIZE + '体まで）— ドラッグで配置を変更' }),
            ]),
            formation,
            el('p', { class: 'faint', style: 'margin:8px 0 0', text:
              '距離 = 自陣マス番号 + 敵陣マス番号 − 1。射程以内の敵にしか攻撃が届きません（射程1なら前衛から敵の前衛のみ）。' }),
          ]),
          el('div', { class: 'panel frame' }, [
            el('div', { class: 'panel-head' }, [
              el('span', { class: 'jp-head', text: 'キャラクター一覧' }),
              el('span', { class: 'faint', text: owned.length + ' 体所持' }),
            ]),
            tabsBox,
            owned.length ? gridBox : el('p', { class: 'muted', text: 'まだキャラクターを所持していません。' }),
          ]),
        ]),
      ]),
    ]);
  },

  // =================================================================
  // ⑥ キャラクター一覧
  // =================================================================
  characterList(focusId) {
    App.setBackground('menu');
    Sound.playBgm('menu');
    let showAll = false;
    let filter = 'ALL';
    let sort = 'NO';
    let focus = getCharacter(focusId) || Save.ownedList()[0] || CHARACTER_MASTER[0];

    const gridBox = el('div', { class: 'tile-grid' });
    const detailBox = el('div', { class: 'panel frame detail-panel' });
    const controls = el('div', { class: 'list-controls' });

    const render = () => {
      let list = showAll ? CHARACTER_MASTER.slice() : Save.ownedList();
      list = list.filter(m => filter === 'ALL' || m.element === filter);
      if (sort === 'RANGE') list.sort((a, b) => b.range - a.range || a.id - b.id);

      clear(controls);
      controls.appendChild(el('div', { class: 'row' }, [
        el('span', { class: 'jp-head', text: '所持キャラクター' }),
        el('b', { class: 'count', text: Save.ownedCount() + ' / ' + CHARACTER_MASTER.length }),
        el('div', { class: 'spacer' }),
        el('label', { class: 'check' }, [
          (() => {
            const c = el('input', { type: 'checkbox' });
            c.checked = showAll;
            c.addEventListener('change', () => { showAll = c.checked; render(); });
            return c;
          })(),
          el('span', { text: '未所持も表示' }),
        ]),
        (() => {
          const s = el('select', { class: 'select' }, [
            el('option', { value: 'NO', text: 'No.順' }),
            el('option', { value: 'RANGE', text: '射程順' }),
          ]);
          s.value = sort;
          s.addEventListener('change', () => { sort = s.value; render(); });
          return s;
        })(),
      ]));
      controls.appendChild(elementTabs(filter, k => { filter = k; render(); }));

      clear(gridBox);
      if (!list.length) gridBox.appendChild(el('p', { class: 'muted', text: '該当するキャラクターがいません。' }));
      list.forEach(m => {
        gridBox.appendChild(charTile(m, {
          selected: m === focus,
          locked: !Save.isOwned(m.id),
          inParty: Save.data.party.indexOf(m.id) >= 0,
          onClick: () => {
            focus = m; render();
            if (window.innerWidth <= 900) detailBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
          },
        }));
      });

      clear(detailBox);
      const owned = Save.isOwned(focus.id);
      detailBox.appendChild(charDetail(focus, {
        showPool: true,
        actions: owned ? [
          el('button', { class: 'btn small', text: 'スキル振り直し（' + CONFIG.SKILL_REROLL_COST + ' Soul）', onclick: () => Screens.openSkillReroll(focus, render) }),
          el('button', { class: 'btn primary', text: 'パーティ編成へ', onclick: () => App.show(Screens.partyEdit, []) }),
        ] : [],
      }));
    };
    render();

    return el('div', { class: 'screen' }, [
      topbar('キャラクター一覧', { en: 'CHARACTER LIST' }),
      el('div', { class: 'split' }, [
        el('div', { class: 'panel frame' }, [controls, gridBox]),
        detailBox,
      ]),
    ]);
  },

  /** スキル振り直しモーダル */
  openSkillReroll(master, onDone) {
    let picked = Save.skillsOf(master.id).slice();
    App.modal(close => {
      const list = el('div', {});
      const footer = el('div', { class: 'row', style: 'margin-top:16px' });

      const render = () => {
        clear(list);
        master.skillPool.forEach(id => {
          const on = picked.indexOf(id) >= 0;
          list.appendChild(skillRow(id, {
            picked: on,
            onClick: () => {
              if (on) picked = picked.filter(x => x !== id);
              else if (picked.length < 3) picked.push(id);
              else { App.toast('3種類までです'); return; }
              render();
            },
          }));
        });
        clear(footer);
        footer.appendChild(el('div', { class: 'muted', text: picked.length + ' / 3 種選択中' }));
        footer.appendChild(el('div', { class: 'spacer' }));
        footer.appendChild(el('button', { class: 'btn ghost', 'data-se': 'cancel', text: 'キャンセル', onclick: close }));
        footer.appendChild(el('button', {
          class: 'btn primary',
          text: '確定（' + CONFIG.SKILL_REROLL_COST + ' Soul）',
          disabled: picked.length !== 3 ? 'disabled' : null,
          onclick: () => {
            const r = Save.rerollSkills(master.id, picked);
            if (!r.ok) { App.toast(r.msg); return; }
            close();
            updateWallet();
            if (onDone) onDone(); else App.refresh();
            App.toast('スキルを変更しました');
          },
        }));
      };
      render();

      return el('div', {}, [
        el('h2', { text: master.name + ' — スキル振り直し' }),
        el('p', { class: 'faint', text: '候補6種から任意の3種を選べます。' }),
        list, footer,
      ]);
    });
  },

  // =================================================================
  // ⑦ ガチャ
  // =================================================================
  gacha() {
    App.setBackground('gacha');
    Sound.playBgm('menu');
    const resultBox = el('div', { class: 'gacha-result' });
    const countNode = el('p', { class: 'faint', style: 'margin-bottom:0' });
    const updateCount = () => { countNode.textContent = '所持 ' + Save.ownedCount() + ' / ' + CHARACTER_MASTER.length + ' 体'; };
    updateCount();

    const pull = (count) => {
      const r = Gacha.pull(count);
      if (!r.ok) { App.toast(r.msg); return; }
      updateWallet();
      updateCount();
      GachaShow.play(r.results, () => showResults(r));
    };

    const showResults = (r) => {
      clear(resultBox);
      r.results.forEach((res, i) => {
        const m = res.master;
        resultBox.appendChild(el('div', {
          class: 'gacha-card' + (res.duplicate ? ' dup' : ' new'),
          style: 'animation-delay:' + (i * 70) + 'ms',
          onclick: () => App.show(Screens.characterList, [m.id]),
        }, [
          faceIcon(m),
          elementIcon(m.element),
          el('b', { text: m.name }),
          el('small', { text: res.duplicate ? '重複 → Soul +' + res.refund : 'NEW!' }),
        ]));
      });
    };

    const single = CONFIG.GACHA_COST;
    const multi = Math.floor(CONFIG.GACHA_COST * CONFIG.GACHA_MULTI * CONFIG.GACHA_MULTI_DISCOUNT);

    return el('div', { class: 'screen' }, [
      topbar('ガチャ', { en: 'GACHA' }),
      el('div', { class: 'panel frame gacha-panel center' }, [
        el('div', { class: 'gacha-gem' }),
        el('p', { text: '深淵の門より、新たな魂を招き寄せる。' }),
        el('p', { class: 'faint', text:
          '未所持キャラクターが優先的に排出されます（80%）。重複した場合は Soul ' + Math.floor(CONFIG.GACHA_COST / 3) + ' に還元されます。' }),
        el('div', { class: 'row center-row', style: 'margin-top:14px' }, [
          el('button', { class: 'btn', text: '1回 / ' + single + ' Soul', onclick: () => pull(1) }),
          el('button', { class: 'btn primary', text: CONFIG.GACHA_MULTI + '回 / ' + multi + ' Soul', onclick: () => pull(CONFIG.GACHA_MULTI) }),
        ]),
        countNode,
      ]),
      resultBox,
    ]);
  },
};

// ===================================================================
// ガチャ演出
//   1. 魔法陣と結晶に光が集まる（新キャラがいれば金色に変化）
//   2. 閃光と画面の揺れ
//   3. 結果を1枚ずつめくって公開（NEW は光の柱つき）
//   画面をタップすると次の段階まで飛ばせる。
// ===================================================================
const GachaShow = {
  play(results, done) {
    const hasNew = results.some(r => !r.duplicate);
    const single = results.length === 1;
    const timers = [];
    const later = (ms, fn) => timers.push(setTimeout(fn, ms));
    const stopTimers = () => { timers.forEach(clearTimeout); timers.length = 0; };

    // --- 1. チャージ ---
    const particles = el('div', { class: 'gs-particles' });
    for (let i = 0; i < 36; i++) {
      const a = Math.random() * 360;
      const d = 30 + Math.random() * 25;
      particles.appendChild(el('i', {
        style: '--a:' + a + 'deg;--d:' + d + 'vmin;--t:' + (0.7 + Math.random() * 0.9).toFixed(2) + 's;' +
          '--delay:' + (Math.random() * 1.2).toFixed(2) + 's',
      }));
    }
    const charge = el('div', { class: 'gs-charge' + (hasNew ? ' rare' : '') }, [
      el('div', { class: 'gs-circle c1' }), el('div', { class: 'gs-circle c2' }), el('div', { class: 'gs-circle c3' }),
      el('div', { class: 'gs-beam' }),
      particles,
      el('div', { class: 'gs-gem' }),
      el('div', { class: 'gs-caption', text: hasNew ? '強大な魂の気配…！' : '魂を招き寄せています…' }),
    ]);
    const stage = el('div', { class: 'gs-stage' });
    const flash = el('div', { class: 'gs-flash' });
    const skipHint = el('div', { class: 'gs-hint', text: 'タップでスキップ' });
    const overlay = el('div', { class: 'gacha-show' }, [charge, stage, flash, skipHint]);
    document.body.appendChild(overlay);

    let phase = 'charge';
    Sound.se('wind');
    later(700, () => Sound.se('wind'));
    later(1400, () => { if (hasNew) Sound.se('thunder'); });

    const burst = () => {
      if (phase !== 'charge') return;
      phase = 'burst';
      stopTimers();
      Sound.se(hasNew ? 'thunder' : 'fire');
      overlay.classList.add('shake');
      flash.classList.add('on');
      later(420, reveal);
    };

    // --- 3. 公開 ---
    const cards = [];
    const reveal = () => {
      phase = 'reveal';
      charge.remove();
      overlay.classList.remove('shake');
      flash.classList.remove('on');
      if (single) {
        const res = results[0];
        const m = res.master;
        stage.appendChild(el('div', { class: 'gs-single' + (res.duplicate ? ' dup' : ' new') }, [
          el('div', { class: 'gs-rays' }),
          standImg(m, 'gs-stand'),
          el('div', { class: 'gs-name' }, [
            elementIcon(m.element),
            el('b', { text: m.name }),
          ]),
          el('div', { class: 'gs-tag', text: res.duplicate ? '重複 → Soul +' + res.refund : 'NEW CHARACTER' }),
        ]));
        if (!res.duplicate) Sound.se('heal');
        finishReveal();
        return;
      }
      const grid = el('div', { class: 'gs-grid' });
      results.forEach(res => {
        const m = res.master;
        const card = el('div', { class: 'gs-card' + (res.duplicate ? ' dup' : ' new') }, [
          el('div', { class: 'gs-inner' }, [
            el('div', { class: 'gs-back' }, [el('span', { class: 'gs-sigil' })]),
            el('div', { class: 'gs-front' }, [
              res.duplicate ? null : el('div', { class: 'gs-pillar' }),
              faceIcon(m),
              elementIcon(m.element),
              el('b', { text: m.name }),
              el('small', { text: res.duplicate ? 'Soul +' + res.refund : 'NEW!' }),
            ]),
          ]),
        ]);
        cards.push({ node: card, res: res });
        grid.appendChild(card);
      });
      stage.appendChild(grid);
      cards.forEach((c, i) => later(350 + i * 230, () => flip(c)));
      later(350 + cards.length * 230 + 200, finishReveal);
    };

    const flip = (c) => {
      if (c.node.classList.contains('open')) return;
      c.node.classList.add('open');
      Sound.se(c.res.duplicate ? 'confirm' : 'heal');
    };

    const finishReveal = () => {
      if (phase === 'done') return;
      phase = 'done';
      stopTimers();
      cards.forEach(c => c.node.classList.add('open'));
      skipHint.remove();
      stage.appendChild(el('div', { class: 'gs-ok' }, [
        el('button', {
          class: 'btn primary big', text: 'OK',
          onclick: (e) => { e.stopPropagation(); overlay.remove(); done(); },
        }),
      ]));
    };

    overlay.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      if (phase === 'charge') burst();
      else if (phase === 'reveal') finishReveal();
    });
    later(2100, burst);
  },
};

// ===================================================================
// 戦闘結果モーダル
// ===================================================================
function resultModal(result, body, buttons) {
  App.modal(close => {
    // どのボタンを押してもモーダルを閉じてから各ボタンの処理を行う
    const wrap = (btn) => {
      btn.addEventListener('click', close, { capture: true });
      return btn;
    };
    return el('div', { class: 'result' }, [
      el('div', {
        class: 'result-banner ' + (result === 'WIN' ? 'win' : (result === 'LOSE' ? 'lose' : 'draw')),
        text: result === 'WIN' ? 'VICTORY' : (result === 'LOSE' ? 'DEFEAT' : 'DRAW'),
      }),
    ].concat(body).concat([el('div', { class: 'row end', style: 'margin-top:16px' }, buttons.map(wrap))]));
  }, { persistent: true });
}

// ===================================================================
// ノベルパート再生
// ===================================================================
const Novel = {
  /**
   * scenes: [{title, lines[]}] を1行ずつ表示し、終わったら done()
   * opt: { character } … 立ち絵と話者名に使うキャラクター
   */
  play(scenes, done, opt) {
    opt = opt || {};
    if (!scenes || !scenes.length) { done(); return; }
    Sound.playBgm('menu');
    const chara = opt.character || null;
    let si = 0, li = 0;
    let auto = false, autoTimer = null;
    const history = [];

    const art = chara ? standImg(chara, 'novel-art') : null;
    const sceneNode = el('div', { class: 'novel-scene' });
    const nameNode = el('div', { class: 'novel-name' });
    const textNode = el('div', { class: 'novel-text' });
    // ストーリーの文章送り・操作ボタンでは効果音を鳴らさない
    const autoBtn = el('button', { class: 'novel-btn', 'data-se': 'none', text: '▶ Auto' });
    const logBtn = el('button', { class: 'novel-btn', 'data-se': 'none', text: 'Log' });
    const skipBtn = el('button', { class: 'novel-btn skip', 'data-se': 'none', text: 'Skip ▸▸' });
    const box = el('div', { class: 'novel-box' }, [nameNode, textNode, el('div', { class: 'novel-ctrl' }, [logBtn, el('div', { class: 'spacer' }), autoBtn])]);
    const screen = el('div', { class: 'screen novel' }, [art, sceneNode, skipBtn, box]);

    clear(App.root);
    App.root.appendChild(screen);
    window.scrollTo(0, 0);

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(autoTimer);
      done();
    };

    // 「」はそのキャラクター、『』は正体不明の声、それ以外は地の文として扱う
    const speakerOf = (line) => {
      if (/^「/.test(line)) return chara ? chara.name : '';
      if (/^『/.test(line)) return '？？？';
      return '';
    };

    let shownScene = null;
    const show = () => {
      const sc = scenes[si];
      const line = sc.lines[li];
      sceneNode.textContent = sc.title;
      if (shownScene !== sc) {
        shownScene = sc;
        App.setBackground('story', sc.bg || null);
      }
      const who = speakerOf(line);
      nameNode.textContent = who;
      nameNode.style.visibility = who ? 'visible' : 'hidden';
      textNode.textContent = line;
      textNode.classList.remove('in');
      void textNode.offsetWidth;
      textNode.classList.add('in');
      if (art) art.classList.toggle('dim', !who || who !== chara.name);
      history.push({ who: who, line: line });
      if (auto) {
        clearTimeout(autoTimer);
        autoTimer = setTimeout(advance, 1400 + line.length * 45);
      }
    };

    const advance = () => {
      if (finished) return;
      li++;
      while (si < scenes.length && li >= scenes[si].lines.length) { si++; li = 0; }
      if (si >= scenes.length) { finish(); return; }
      show();
    };

    // 空のシーンを飛ばして開始
    while (si < scenes.length && !scenes[si].lines.length) si++;
    if (si >= scenes.length) { done(); return; }

    screen.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      advance();
    });
    skipBtn.addEventListener('click', finish);
    autoBtn.addEventListener('click', () => {
      auto = !auto;
      autoBtn.classList.toggle('on', auto);
      clearTimeout(autoTimer);
      if (auto) autoTimer = setTimeout(advance, 1200);
    });
    logBtn.addEventListener('click', () => {
      App.modal(close => el('div', {}, [
        el('h2', { text: 'ログ' }),
        el('div', { class: 'novel-log' }, history.map(h => el('p', {}, [
          h.who ? el('b', { text: h.who + '　' }) : null,
          el('span', { text: h.line }),
        ]))),
        el('div', { class: 'row end', style: 'margin-top:14px' }, [
          el('button', { class: 'btn', 'data-se': 'none', text: '閉じる', onclick: close }),
        ]),
      ]));
    });
    show();
  },
};
