# GraceForsaken リアルタイム対戦サーバー

`PVP対戦_設計書.md` に基づく対戦サーバーです。戦闘の計算はすべてこのサーバーで行い、
ゲーム本体（`../js/core`・`../js/data`）の戦闘ロジックをそのまま読み込んで動かします。

- ゲーム本体 … GitHub Pages（`https://sygames.net/GraceForsaken/`）
- 対戦サーバー … AWS Lightsail（`https://pvp.sygames.net`）

---

## 1. 手元で動かす（開発・動作確認）

```sh
cd server
npm install
npm run dev                      # http://localhost:3000 で起動（localhost・ファイルからの接続を許可）
```

別のターミナルでゲームを配信し、ブラウザで開きます。

```sh
cd ..                            # GraceForsaken フォルダ
python -m http.server 8765       # → http://localhost:8765/
```

`localhost` やファイルで開いたゲームは、自動的に `http://localhost:3000` の開発サーバーへ接続します
（`js/core/config.js` の `PVP.DEV_SERVER_URL`）。

**1台で対人戦を試すとき**は、ブラウザのタブを2つ開き、URL の末尾にそれぞれ別の名前を付けます。
タブごとに別のプレイヤーとして接続されます（開発サーバーに接続するときだけ有効）。

```
http://localhost:8765/index.html?pvpuser=A
http://localhost:8765/index.html?pvpuser=B
```

### テスト

```sh
npm test                         # 単体テスト（検証・自動行動・マッチング・タイマー・戦闘の再現性）
cd .. && node tools/pvp_sim.js   # 結合テスト（サーバーを起動し、BOTクライアント同士を実際に対戦させる）
node tools/pvp_sim.js 100        # 対人戦の試合数を指定
```

---

## 2. 本番環境の構築手順（初回のみ）

AWS・お名前.com の操作が必要なため、ご自身で行ってください。
コマンドはインスタンスへ SSH 接続した後、`ubuntu` ユーザーで実行します。

### 2.1 Lightsail インスタンス

1. Lightsail コンソール →「インスタンスの作成」
   - リージョン: **東京（ap-northeast-1）**
   - プラットフォーム: Linux/Unix、ブループリント: **OS のみ → Ubuntu 24.04 LTS**
   - プラン: メモリ **1GB** から開始（負荷が高ければ後から 2GB へ）
2. 作成後、「ネットワーキング」タブで
   - **静的 IP** を作成してインスタンスにアタッチ
   - IPv4 ファイアウォールに **HTTP(80)・HTTPS(443)** を追加（SSH(22) は既定で開いています。可能なら接続元を自分のIPに限定）

### 2.2 DNS（お名前.com）

お名前.com Navi →「DNS設定/転送設定」→ `sygames.net` の「DNSレコード設定」で、次のレコードを追加します。
既存の GitHub Pages 向けのレコードは変更しません。

| ホスト名 | TYPE | VALUE |
|---|---|---|
| `pvp` | A | Lightsail の静的IP |

反映に時間がかかることがあるため、証明書の取得（2.6）の前に済ませておきます。
反映の確認: `nslookup pvp.sygames.net`

### 2.3 ソフトウェアのインストール

```sh
sudo apt update && sudo apt -y upgrade
# Node.js 22 LTS
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt -y install nodejs nginx certbot python3-certbot-nginx git
sudo npm install -g pm2
node -v    # v22 以降であること
```

### 2.4 サーバーのプログラムを配置

```sh
cd ~
git clone https://github.com/SY4869/Fable-of-Abyss.git
cd Fable-of-Abyss/GraceForsaken/server
npm ci --omit=dev
cp .env.example .env             # 必要なら編集（通常はそのままでよい）
```

### 2.5 nginx（HTTPS の終端とリバースプロキシ）

`/etc/nginx/sites-available/pvp` を作成します（`sudo nano /etc/nginx/sites-available/pvp`）。

```nginx
# 同じIPからの同時接続を 5 までに制限（PVP対戦_設計書 7章）
limit_conn_zone $binary_remote_addr zone=pvp_conn:10m;

server {
    listen 80;
    server_name pvp.sygames.net;

    location / {
        limit_conn pvp_conn 5;
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        # WebSocket のための引き継ぎ
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
```

```sh
sudo ln -s /etc/nginx/sites-available/pvp /etc/nginx/sites-enabled/pvp
sudo nginx -t && sudo systemctl reload nginx
```

### 2.6 証明書（Let's Encrypt）

```sh
sudo certbot --nginx -d pvp.sygames.net
# メールアドレスの入力と規約への同意を求められます。
# 「HTTP を HTTPS へリダイレクトするか」は「する」を選びます。自動更新も設定されます。
sudo certbot renew --dry-run     # 自動更新の確認
```

### 2.7 起動（pm2）

```sh
cd ~/Fable-of-Abyss/GraceForsaken/server
pm2 start ecosystem.config.js
pm2 save
pm2 startup                      # 表示されたコマンド（sudo env PATH=... ）をそのまま実行
pm2 install pm2-logrotate        # ログの肥大化を防ぐ
```

> **cluster モードにしないこと。** 試合はプロセスのメモリ上にあるため、1プロセス固定で動かします。

### 2.8 確認

```sh
curl https://pvp.sygames.net/health
# {"status":"ok","rooms":0,"queue":0,"connections":0,"draining":false}
```

ゲーム（`https://sygames.net/GraceForsaken/`）を開き、BATTLE →「リアルタイム対戦」→「対戦を開始する」で、
15秒後に BOT との対戦が始まれば成功です。最後に Lightsail で**スナップショット**を1つ取得しておきます。

---

## 3. 運用

### 更新（通常）

プロトコル（`js/net/protocol.js` の `VERSION`）を変えない更新は、そのまま反映してかまいません。
進行中の試合を失わないよう、ドレイン（新規受付の停止）してから再起動します。

```sh
cd ~/Fable-of-Abyss && git pull
cd GraceForsaken/server && npm ci --omit=dev
pm2 sendSignal SIGUSR2 gf-pvp                  # 新しい対戦の受付を停止
watch -n 5 curl -s https://pvp.sygames.net/health   # rooms が 0 になるまで待つ（Ctrl+C で抜ける）
pm2 restart gf-pvp
```

### プロトコルを変える更新

1. 上記の手順でサーバーを更新する
2. その後で GitHub Pages（ゲーム本体）を更新する

古いゲーム画面から接続すると「ゲームが更新されました。ページを再読み込みしてください。」と表示されます。

### ログ・監視

```sh
pm2 logs gf-pvp          # ログを見る
pm2 status               # 状態・メモリ
```

- Lightsail の「メトリクス」で CPU 使用率のアラーム（例: 80% 超で通知）を設定しておくと安心です。
- `https://pvp.sygames.net/health` を外部の無料監視サービスで定期確認することもできます（任意）。

### 設定値

時間・報酬などは `../js/core/config.js` の `PVP` にあり、サーバーとゲーム本体で共用しています。
接続を許可する接続元は `.env` の `ALLOWED_ORIGINS` で変更します（`www.sygames.net` を使う場合は追加）。
