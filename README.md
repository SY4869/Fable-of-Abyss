# Fable-of-Abyss

個人制作のブラウザゲームを公開しているサイト **[sygames.net](https://sygames.net/)** のソースです。

GitHub Pages で配信しています。`main` に push すると反映されます。

## 構成

| URL | ファイル | 内容 |
|---|---|---|
| `/` | `index.html` | トップ（ゲーム一覧） |
| `/fable.html` | `fable.html` | 弾幕シューティング『フェイブル・オブ・アビス』 |
| `/howto.html` | `howto.html` | 遊び方と物語 |
| `/about.html` | `about.html` | このサイトについて |
| `/privacy.html` | `privacy.html` | プライバシーポリシー |
| `/contact.html` | `contact.html` | お問い合わせ |

ゲーム本体は素の JavaScript のみで、外部ライブラリもビルド工程もありません。

```
assets/js/assets.js   素材のパス表
assets/js/audio.js    BGM 再生エンジン
assets/js/logic.js    ゲーム本体
assets/js/ads.js      広告枠
```

## ローカルで開く

```sh
python -m http.server 8000     # → http://localhost:8000/
```

## ゲームを追加するとき

`/<ゲーム名>.html` を足し、`index.html` の `.gamecard` を1枚増やして、`sitemap.xml` と各ページのフッターナビを更新します。`assets/` への相対パスを壊さないよう、ディレクトリは切らない方針です。
