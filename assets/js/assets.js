/* =============================================================================
   素材のありか
   -----------------------------------------------------------------------------
   以前は画像も音楽も base64 で HTML に直接書き込んでいたため、
   1ファイル18MBという極端な大きさになっていた。
   ここではファイルの場所だけを持ち、実体は必要になった時に読み込む。
   差し替えるときはこのファイルのパスだけ直せばよい。
   ============================================================================= */

/* 立ち絵（会話画面と戦闘中に出るボスの絵） */
var ART = {
  'A1':  'assets/images/art/A1.webp',    /* 赤ずきん  クレア */
  'A2a': 'assets/images/art/A2a.webp',   /* ヘンゼル  ルスト */
  'A2b': 'assets/images/art/A2b.webp',   /* グレーテル ラディナ */
  'A3':  'assets/images/art/A3.webp',    /* 白雪姫    ソフィア */
  'A4':  'assets/images/art/A4.webp',    /* シンデレラ アリシア */
  'A5':  'assets/images/art/A5.webp'     /* 吸血鬼    レイア */
};

/* 背景の一枚絵と自機 */
var SCENE = {
  'st': 'assets/images/scene/st.webp',   /* タイトル */
  'op': 'assets/images/scene/op.webp',   /* プロローグ */
  'S1': 'assets/images/scene/S1.webp',   /* 黒い森 */
  'S2': 'assets/images/scene/S2.webp',   /* お菓子の家 */
  'S3': 'assets/images/scene/S3.webp',   /* 鏡の城 */
  'S4': 'assets/images/scene/S4.webp',   /* 灰かぶりの城 */
  'S5': 'assets/images/scene/S5.webp',   /* 奈落の館 */
  'pj': 'assets/images/scene/pj.webp'    /* 自機 */
};

/* BGM。曲は再生が必要になった時点で取りに行く */
var MUSIC = {
  'prologue': 'assets/audio/prologue.mp3',
  'doutyuu':  'assets/audio/doutyuu.mp3',
  'vs1':      'assets/audio/vs1.mp3',
  'vs2':      'assets/audio/vs2.mp3',
  'vs3':      'assets/audio/vs3.mp3',
  'vs4':      'assets/audio/vs4.mp3',
  'vs5':      'assets/audio/vs5.mp3',
  'after':    'assets/audio/after.mp3',
  'epi':      'assets/audio/epi.mp3'
};
