# Fable-of-Abyss

個人制作のブラウザゲームを公開しているサイト **[sygames.net](https://sygames.net/)** のソースです。

GitHub Pages で配信しています。`main` に push すると反映されます。

## 構成

| URL | ファイル | 内容 |
|---|---|---|
| `/` | `index.html` | トップ（ゲーム一覧） |
| `/fable.html` | `fable.html` | 弾幕シューティング『フェイブル・オブ・アビス』 |
| `/chaos.html` | `chaos.html` | 剣戟バトル『カオスソードガーデン』 |
| `/GraceForsaken/` | `GraceForsaken/` | ターン制コマンドバトルRPG『GraceForsaken』（作品紹介 `grace-about.html`・遊び方 `grace-howto.html`） |
| `/howto.html` | `howto.html` | 遊び方と物語 |
| `/about.html` | `about.html` | このサイトについて |
| `/credits.html` | `credits.html` | 素材提供元のクレジット |
| `/privacy.html` | `privacy.html` | プライバシーポリシー |
| `/contact.html` | `contact.html` | お問い合わせ |

ゲーム本体は素の JavaScript のみで、外部ライブラリもビルド工程もありません。

```
assets/js/assets.js   フェイブル：素材のパス表
assets/js/audio.js    フェイブル：BGM 再生エンジン
assets/js/logic.js    フェイブル：ゲーム本体
assets/js/ads.js      広告枠（両ゲーム共通）

assets/js/chaos/      カオス：ES モジュール一式（main.js が入口）
assets/css/chaos/     カオス：style / battle / story の3枚
assets/images/chaos/  カオス：立ち絵・背景・オーラ・サムネイル
assets/audio/chaos/   カオス：BGM と効果音
```

カオスソードガーデンは ES モジュール（`<script type="module">`）で動くため、
`file://` では開けません。下記のローカルサーバー経由で確認してください。
素材のパスは `assets/js/chaos/data.js` の `IMAGE_BASE` と
`assets/js/chaos/sound.js` の `SOUND_BASE` に集約しています。

### GraceForsaken

ゲーム本体は `GraceForsaken/` フォルダにまとまっています（素材が多いため、ルート直下ではなくフォルダごと配置）。
このフォルダは開発用フォルダから `python tools/deploy_site.py` で丸ごとコピーして作るので、**ここを直接編集しないでください。**

```
GraceForsaken/index.html     ゲーム本体（/GraceForsaken/ で開く）
GraceForsaken/server/        リアルタイム対戦サーバー（AWS Lightsail で動かす。GitHub Pages では動かない）
assets/images/grace/thumb.webp  ゲーム一覧・作品紹介のサムネイル
```

リアルタイム対戦サーバーの構築・更新手順は `GraceForsaken/server/README.md` にあります。

## ローカルで開く

```sh
python -m http.server 8000     # → http://localhost:8000/
```

## ゲームを追加するとき

`/<ゲーム名>.html` を足し、`index.html` の `.gamecard` を1枚増やして、`sitemap.xml` と各ページのフッターナビを更新します。HTML はルート直下に置き、`assets/` への相対パスを壊さないようにします。素材が多いゲームは `assets/<種別>/<ゲーム名>/` にまとめます。

素材を新しく使ったときは `credits.html` の提供元一覧にも追記します。個別の作品名・曲名は載せず、提供元名のみを掲載する方針です。
