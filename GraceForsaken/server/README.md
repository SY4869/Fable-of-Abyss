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

## 2. 本番環境（構築済み）

カオスソードガーデンのランキングAPI（`api.sygames.net`）と同じ Lightsail インスタンスに同居させています。
既存サービスに合わせ、pm2 ではなく **systemd** で常駐させています。

| 項目 | 内容 |
|---|---|
| インスタンス | Lightsail 東京・Ubuntu 22.04・メモリ 512MB（`ubuntu@52.198.114.237`） |
| 配置先 | `/opt/gf-pvp/`（`js/` と `server/`。所有者 root、実行ユーザー `gfpvp` は読み取りのみ） |
| 常駐 | systemd の `gf-pvp.service`（`127.0.0.1:3100`。メモリ上限 192MB） |
| 公開 | nginx の `pvp.sygames.net` → `127.0.0.1:3100`（WebSocket、同一IPの同時接続は5まで） |
| 同居 | `csg-ranking.service`（`127.0.0.1:3000`、`api.sygames.net`） |
| 作業記録 | サーバーの `~/gf-work/`（実行したスクリプトとログ） |

設定ファイルと手順は `deploy/` にあります。

| ファイル | 内容 |
|---|---|
| `deploy/upload.sh` | 手元から転送して手順を実行する（Git Bash で使う） |
| `deploy/gf_01_deploy.sh` | アプリの配置・依存パッケージ・systemd 登録・起動・既存サービスの生存確認 |
| `deploy/gf_02_nginx.sh` | nginx に `pvp.sygames.net` を追加（80番） |
| `deploy/gf_03_tls.sh` | 証明書の取得と HTTPS 化（DNS 設定後に実行） |
| `deploy/gf-pvp.service` | systemd ユニット |
| `deploy/nginx-pvp.sygames.net` | nginx の設定 |

### DNS（お名前.com）

お名前.com Navi →「DNS設定/転送設定」→ `sygames.net` の「DNSレコード設定」で追加します。

| ホスト名 | TYPE | VALUE |
|---|---|---|
| `pvp` | A | `52.198.114.237`（`api` と同じIP） |

反映後（`nslookup pvp.sygames.net` で確認）に、証明書を取得します。

```sh
bash server/deploy/upload.sh gf_03_tls.sh
```

---

## 3. 運用

### 更新

手元の `GraceForsaken` フォルダ（Git Bash）で実行します。
進行中の対戦は、再起動の時点で無効試合になります。人がいる時間を避けるか、先にドレインしてください。

```sh
# （任意）新しい対戦の受付を止め、進行中の対戦が終わるのを待つ
ssh -i ~/Downloads/LightsailDefaultKey-ap-northeast-1.pem ubuntu@52.198.114.237 \
  'sudo systemctl kill -s SIGUSR2 gf-pvp; watch -n 5 curl -s http://127.0.0.1:3100/health'

# 転送して配置・再起動（既存のアプリは /opt/gf-pvp.bak_日時.tar.gz に退避される）
bash server/deploy/upload.sh
```

### プロトコルを変える更新

`js/net/protocol.js` の `VERSION` を変えたときは、
1. 上記の手順でサーバーを更新する
2. その後で GitHub Pages（ゲーム本体）を更新する

の順にします。古いゲーム画面から接続すると「ゲームが更新されました。ページを再読み込みしてください。」と表示されます。

### ログ・状態

```sh
sudo systemctl status gf-pvp
sudo journalctl -u gf-pvp -n 100 --no-pager      # アプリのログ（プレイヤー名は記録しない）
sudo tail /var/log/nginx/gf-pvp.access.log      # 接続記録
curl -s http://127.0.0.1:3100/health             # {"status":"ok","rooms":..,"queue":..,"connections":..}
```

### 設定値

時間・報酬などは `../js/core/config.js` の `PVP` にあり、サーバーとゲーム本体で共用しています。
待ち受けポートと接続元の許可は `deploy/gf-pvp.service` の `Environment=` で変更します
（`www.sygames.net` を使う場合は `ALLOWED_ORIGINS` にカンマ区切りで追加）。

### 注意

- インスタンスのメモリは 512MB で、ランキングAPIと共用しています。PVPサーバーは1試合あたり数MB程度ですが、
  利用者が増えてメモリが足りなくなったら Lightsail のプランを上げてください（`free -m` で確認）。
- 対戦はプロセスのメモリ上で管理しています。複数プロセスで動かさないでください。

