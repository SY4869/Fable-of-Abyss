// === 自動生成ファイル ===
// データ一覧.xlsx から生成されています。直接編集せず、xlsx を編集してから
//   python tools/build_data.py
// を実行してください。

// cond.type: code（認証コード）/ allChars（全キャラ所持）/ obtain（char を count 回入手）/
//            pvpWin・pvpLose（リアルタイム対戦の勝敗数）/ skillUse（1試合で skill を count 回使う）
const TITLE_MASTER = [
  { name: "テストプレイヤー", desc: "認証コードで入手", cond: {"type": "code"} },
  { name: "コレクター", desc: "全キャラクターを所持", cond: {"type": "allChars"} },
  { name: "ナイトクイーン", desc: "レイアを10回入手", cond: {"type": "obtain", "char": "レイア", "count": 10} },
  { name: "女王", desc: "アリシアを10回入手", cond: {"type": "obtain", "char": "アリシア", "count": 10} },
  { name: "赤ずきん", desc: "クレアを10回入手", cond: {"type": "obtain", "char": "クレア", "count": 10} },
  { name: "白雪姫", desc: "ソフィアを10回入手", cond: {"type": "obtain", "char": "ソフィア", "count": 10} },
  { name: "二刀流の剣士", desc: "双海隆二を10回入手", cond: {"type": "obtain", "char": "双海隆二", "count": 10} },
  { name: "舞い踊る炎", desc: "連炎華凛を10回入手", cond: {"type": "obtain", "char": "連炎華凛", "count": 10} },
  { name: "最速の剣士", desc: "キョウを10回入手", cond: {"type": "obtain", "char": "キョウ", "count": 10} },
  { name: "辻斬り", desc: "瞬瞑龍斗を10回入手", cond: {"type": "obtain", "char": "瞬瞑龍斗", "count": 10} },
  { name: "シリアルキラー", desc: "切裂狂子を10回入手", cond: {"type": "obtain", "char": "切裂狂子", "count": 10} },
  { name: "ハーベスター", desc: "切裂劣子を10回入手", cond: {"type": "obtain", "char": "切裂劣子", "count": 10} },
  { name: "永遠を求めるもの", desc: "ネストルを10回入手", cond: {"type": "obtain", "char": "ネストル", "count": 10} },
  { name: "小説家", desc: "ミリアを10回入手", cond: {"type": "obtain", "char": "ミリア", "count": 10} },
  { name: "薔薇の騎士", desc: "フレアを10回入手", cond: {"type": "obtain", "char": "フレア", "count": 10} },
  { name: "魔神を操りし者", desc: "アステルを10回入手", cond: {"type": "obtain", "char": "アステル", "count": 10} },
  { name: "疾風迅雷", desc: "セレスを10回入手", cond: {"type": "obtain", "char": "セレス", "count": 10} },
  { name: "歌う筋肉", desc: "アレクトロスを10回入手", cond: {"type": "obtain", "char": "アレクトロス", "count": 10} },
  { name: "死神", desc: "ロナを10回入手", cond: {"type": "obtain", "char": "ロナ", "count": 10} },
  { name: "癒しと死の収穫者", desc: "アネシアを10回入手", cond: {"type": "obtain", "char": "アネシア", "count": 10} },
  { name: "変幻自在", desc: "リリアーネを10回入手", cond: {"type": "obtain", "char": "リリアーネ", "count": 10} },
  { name: "時空の旅人", desc: "緋天飛鳥を10回入手", cond: {"type": "obtain", "char": "緋天飛鳥", "count": 10} },
  { name: "テイマー", desc: "イレイナを10回入手", cond: {"type": "obtain", "char": "イレイナ", "count": 10} },
  { name: "受付嬢", desc: "アンを10回入手", cond: {"type": "obtain", "char": "アン", "count": 10} },
  { name: "火薬の魔女", desc: "シェリーニを10回入手", cond: {"type": "obtain", "char": "シェリーニ", "count": 10} },
  { name: "血の魔女", desc: "ブラドを10回入手", cond: {"type": "obtain", "char": "ブラド", "count": 10} },
  { name: "不死なる魔王", desc: "ディアナを10回入手", cond: {"type": "obtain", "char": "ディアナ", "count": 10} },
  { name: "復讐者", desc: "リサを10回入手", cond: {"type": "obtain", "char": "リサ", "count": 10} },
  { name: "優しい鬼", desc: "鬼羅瑠を10回入手", cond: {"type": "obtain", "char": "鬼羅瑠", "count": 10} },
  { name: "対邪神特殊部隊隊員", desc: "テレスを10回入手", cond: {"type": "obtain", "char": "テレス", "count": 10} },
  { name: "世界樹の英雄", desc: "沖田雫を10回入手", cond: {"type": "obtain", "char": "沖田雫", "count": 10} },
  { name: "始まりと終わりの魔王", desc: "カオスを10回入手", cond: {"type": "obtain", "char": "カオス", "count": 10} },
  { name: "シスコンお姉ちゃん", desc: "花渕なずなを10回入手", cond: {"type": "obtain", "char": "花渕なずな", "count": 10} },
  { name: "百戦錬磨", desc: "リアルタイム対戦で100勝する", cond: {"type": "pvpWin", "count": 100} },
  { name: "敗北者", desc: "リアルタイム対戦で100敗する", cond: {"type": "pvpLose", "count": 100} },
  { name: "忘れられない物語", desc: "1試合でフェイブル・オブ・アビスを3回使う", cond: {"type": "skillUse", "skill": "フェイブル・オブ・アビス", "count": 3} },
  { name: "流れ星の魔女", desc: "1試合で流れ星の奇跡を3回使う", cond: {"type": "skillUse", "skill": "流れ星の奇跡", "count": 3} },
  { name: "第0回大会優勝者", desc: "認証コードで入手", cond: {"type": "code"} },
];
