// ChaosSwordGarden - ストーリー（ストーリー.md 準拠）
//
// 各戦闘の「開幕」「撃破時」のセリフと、第6戦（裏ボス）への分岐イベントを持つ。
// セリフはストーリー.md をそのまま写しているので、文言の修正は
// ストーリー.md 側を直してからここへ反映すること。
//
// 話者名について:
//   データ一覧.xlsx のキャラクター名と、ストーリー.md の話者名が
//   一致しない箇所がある（1戦目: データ「ごろつき」/ ストーリー「権造」）。
//   セリフの話者はストーリー.md の表記を正とする。

'use strict';

/** 主人公の心の声。話者名を出さず、地の文として見せる */
const INNER = '主人公（心声）';

/**
 * キャラクター名（データ一覧.xlsx 準拠）→ セリフ
 *   opening … 戦闘前
 *   defeat  … 撃破時
 */
export const BATTLE_STORIES = Object.freeze({
  ごろつき: {
    subtitle: '第1戦：野盗との遭遇',
    place: '鬱蒼と茂る山道',
    opening: [
      { speaker: '権造', text: 'おいおい、いいカモが飛んで火に入る夏の虫ってなぁ！ 命が惜しくば、身ぐるみ置いていきな！' },
    ],
    defeat: [
      { speaker: '権造', text: 'ぐはっ……！ 嘘だろ、こんなガキに……お、覚えてやがれ！' },
      { speaker: INNER, text: 'この程度の相手に苦戦するとは。。。己の剣を磨くため、まずは道場の門を叩こう' },
    ],
  },

  // 2戦目の門下生は3流派とも同じ内容（ストーリー.md では「道場の門下生（兄弟子）」で一括）
  双海流門下生: {
    subtitle: '第2戦：道場の門下生',
    place: '静寂の広がる道場の稽古場',
    opening: [{ speaker: '門下生', text: 'うちの流派に入門したそうだな。お前がどれほどやれるか、私の剣で確かめてやる！' }],
    defeat: [{ speaker: '門下生', text: '見事だ……！ 基礎とはいえ、これほどの太刀筋とは……！' }],
  },
  連炎流門下生: {
    subtitle: '第2戦：道場の門下生',
    place: '静寂の広がる道場の稽古場',
    opening: [{ speaker: '門下生', text: 'うちの流派に入門したそうだな。お前がどれほどやれるか、私の剣で確かめてやる！' }],
    defeat: [{ speaker: '門下生', text: '見事だ……！ 基礎とはいえ、これほどの太刀筋とは……！' }],
  },
  瞬瞑流門下生: {
    subtitle: '第2戦：道場の門下生',
    place: '静寂の広がる道場の稽古場',
    opening: [{ speaker: '門下生', text: 'うちの流派に入門したそうだな。お前がどれほどやれるか、私の剣で確かめてやる！' }],
    defeat: [{ speaker: '門下生', text: '見事だ……！ 基礎とはいえ、これほどの太刀筋とは……！' }],
  },

  // 3戦目の師範は流派ごとに口調が違う
  '双海 浩二': {
    subtitle: '第3戦：道場師範',
    place: '神棚が祀られた道場最奥の広間',
    opening: [{ speaker: '師範（双海流）', text: 'よくぞここまで腕を上げたな。……だが、下山を許すか否かは別だ。俺を越えてみせよ。容赦はせんぞ！' }],
    defeat: [{ speaker: '師範（双海流）', text: '……見事だ。もはや教えることは何もない。己の信じる剣の道を征くがいい！' }],
  },
  '連炎 華凛': {
    subtitle: '第3戦：道場師範',
    place: '神棚が祀られた道場最奥の広間',
    opening: [{ speaker: '師範（連炎流）', text: 'よくぞここまで腕を上げました。……ですが、下山を許すか否かは別です。私を越えてみせなさい。手加減はしませんよ！' }],
    defeat: [{ speaker: '師範（連炎流）', text: '……見事。もはや教えることは何もありません。己の信じる剣の道を進みなさい！' }],
  },
  キョウ: {
    subtitle: '第3戦：道場師範',
    place: '神棚が祀られた道場最奥の広間',
    opening: [{ speaker: '師範（瞬瞑流）', text: 'よくぞここまで腕を上げたね。……でも、下山を許すか否かは別。我が一撃を越えてみせよ。全力で楽しませてもらう！' }],
    defeat: [{ speaker: '師範（瞬瞑流）', text: '……見事。もう教えることは何もない。あとは己の信じる剣の道を存分に楽しめ！' }],
  },

  // 4戦目の旅の剣士
  '緋天 飛鳥': {
    subtitle: '第4戦：旅の剣士',
    place: '夕暮れの荒野（すすき野原）',
    opening: [{ speaker: '緋天 飛鳥', text: 'ほう……良い気風だな。各地を巡り様々な剣術を見てきたが、お前ほどの鋭さは久しい。いざ、尋常に勝負！' }],
    defeat: [{ speaker: '緋天 飛鳥', text: 'すごいな……！ やっぱり世界は広いな。良い勝負だった、ありがとな！' }],
  },
  ローザ: {
    subtitle: '第4戦：旅の剣士',
    place: '夕暮れの荒野（すすき野原）',
    opening: [{ speaker: 'ローザ', text: 'あら、御機嫌よう。そういえば、剣を新調したので1勝負いかが？' }],
    defeat: [{ speaker: 'ローザ', text: '負けましたわ。 私ももっと強くなれるように頑張りますわ！' }],
  },
  '武田 白波': {
    subtitle: '第4戦：旅の剣士',
    place: '夕暮れの荒野（すすき野原）',
    opening: [{ speaker: '武田 白波', text: 'ん？すごい闘気……。わかりやすいのは嫌いじゃない。そっちがその気なら相手になる！' }],
    defeat: [{ speaker: '武田 白波', text: '驚いた……。こんなに強いなんて。良い勝負だった、またね。' }],
  },
  '切裂 劣子': {
    subtitle: '第4戦：旅の剣士',
    place: '夕暮れの荒野（すすき野原）',
    opening: [{ speaker: '切裂 劣子', text: '……クフフ。あなたいい目をしているわね。美味しそうないい目を！' }],
    // ストーリー.md の撃破時セリフが空欄のため、埋まるまでセリフ無しで進行する
    defeat: [],
  },

  '瞬瞑 龍斗': {
    subtitle: '第5戦：辻斬りの龍斗',
    place: '雷鳴轟く竜の山脈（山の中腹）',
    opening: [
      { speaker: '龍斗', text: '……足音で解る。貴様、幾多の戦いを経て、この竜の山脈まで辿り着いたようだな。目など見えずとも、その刀身が放つ『殺気』の形がはっきりとわかる……' },
      { speaker: '龍斗', text: '俺は瞬瞑 龍斗。我が必殺の刃、見切れるか！' },
    ],
    defeat: [
      { speaker: '龍斗', text: '見事……俺の全力の『雷刃』を破るか。まさに天下無双、最後にお前と戦えてよかった……' },
    ],
  },

  '沖田 雫': {
    subtitle: '第6戦：英雄の影',
    place: '神秘的な光が降り注ぐ世界樹の麓',
    opening: [
      { speaker: '沖田 雫', text: '人の身でありながら、ここまで来たんですか？ 人の域を越えたその力、素晴らしいですね。' },
      { speaker: '沖田 雫', text: 'あなたの力、試させてもらいます！' },
    ],
    defeat: [
      { speaker: '沖田 雫', text: '人はここまで強くなれるんですね。少し安心しました。私がいなくても人の世は安泰ですね。' },
    ],
  },
});

/**
 * 第5戦を無傷で勝った時にだけ挟まる、裏ボスへの分岐イベント。
 * 龍斗の撃破セリフのあとに続けて再生する。
 */
export const SECRET_BOSS_UNLOCK_SCENE = Object.freeze([
  { speaker: '龍斗', text: '……いや、見事の一言に尽きる。一度のかすり傷すら追わずに俺を叩き伏せるとはな。かつてこれほどの領域に達した者を、俺は一人しか知らん……' },
  { speaker: '龍斗', text: 'その昔、この世界を絶望から救い、魔王を退けた英雄——『沖田 雫』。彼女はいま、世界の果てにある『世界樹の麓』にて静かに眠り、真の強者が現れるのを待っているという……' },
  { speaker: '龍斗', text: '人の域を超えたお前の剣なら、あるいは……向かうがいい、世界樹へ。' },
  { speaker: INNER, text: 'かつて魔王を倒した英雄……！ 己の剣がどこまで届くのか、確かめずにはいられない' },
]);

/**
 * エンドロール（ストーリー.md「【Ending】（裏ボス含めて全クリ）」準拠）。
 * 第6戦（沖田 雫）を撃破した完全クリア時にのみ流す。
 *
 * type:
 *   text  … 本文
 *   title … ゲームタイトル（スタート画面のロゴと同じ意匠で見せる）
 *   grand … 大きく出す一行
 *   space … 余白
 */
export const ENDING_ROLL = Object.freeze([
  { type: 'space' },
  { type: 'text', text: '幾多の戦いを超え、あなたは己の剣技を極めた。' },
  { type: 'text', text: 'その刃は伝説となった。' },
  { type: 'space' },
  { type: 'text', text: '剣が示す道を信じ、己を磨き続けたその意志は、確かにここに刻まれた。' },
  { type: 'space' },
  { type: 'text', text: 'あなたの戦いは伝説となり、その名は記録される。' },
  { type: 'space' },
  { type: 'title' },
  { type: 'space' },
  { type: 'grand', text: 'CONGRATULATIONS' },
  { type: 'space' },
  { type: 'text', text: '全ての戦いを乗り越え、真なる剣士の頂きへと至った。' },
  { type: 'space' },
  { type: 'grand', text: 'Thank you for playing' },
  { type: 'space' },
]);

export function isInnerVoice(speaker) {
  return speaker === INNER;
}

/** その相手の戦闘前セリフ（無ければ空配列） */
export function getOpeningLines(characterName) {
  return BATTLE_STORIES[characterName]?.opening ?? [];
}

/** その相手の撃破時セリフ（無ければ空配列） */
export function getDefeatLines(characterName) {
  return BATTLE_STORIES[characterName]?.defeat ?? [];
}

/** 見出しに使う「第N戦：〜」と舞台 */
export function getSceneHeader(characterName) {
  const story = BATTLE_STORIES[characterName];
  if (!story) return null;
  return { subtitle: story.subtitle, place: story.place };
}
