#!/bin/bash
# pvp.sygames.net の TLS 証明書を取得して HTTPS（wss）を有効にする。
# 前提: pvp.sygames.net の A レコードがこのホストを向いていること。
# certbot のアカウントは api.sygames.net 取得時に登録済みのものを使う（メールアドレスの再入力は不要）。
set -euo pipefail
TS=$(date +%Y%m%d_%H%M%S)
DOMAIN=pvp.sygames.net
AVAIL=/etc/nginx/sites-available/pvp.sygames.net
echo "===== 開始: $(date '+%F %T') ====="

echo "----- 1. DNS がこのホストを向いているか -----"
MYIP=$(curl -s --max-time 10 https://checkip.amazonaws.com | tr -d '[:space:]')
echo "  このホストのグローバルIP: $MYIP"
DNSIP=$(getent ahostsv4 "$DOMAIN" | awk 'NR==1{print $1}' || true)
echo "  $DOMAIN の解決結果    : ${DNSIP:-（解決できない）}"
if [ -z "$DNSIP" ]; then
  echo "  → DNS が未設定。A レコードを追加してから再実行すること"; exit 1
fi
if [ "$DNSIP" != "$MYIP" ]; then
  echo "  → DNS が別のホストを向いている。証明書は取得できない"; exit 1
fi
echo "  一致。続行する"

echo "----- 2. 80番で acme の確認応答が返せるか（事前の自己テスト） -----"
sudo mkdir -p /var/www/html/.well-known/acme-challenge
echo "gf-acme-test-$TS" | sudo tee /var/www/html/.well-known/acme-challenge/gf-test >/dev/null
CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "http://$DOMAIN/.well-known/acme-challenge/gf-test" || echo "失敗")
echo "  http://$DOMAIN/.well-known/acme-challenge/gf-test → $CODE"
sudo rm -f /var/www/html/.well-known/acme-challenge/gf-test
if [ "$CODE" != "200" ]; then
  echo "  → 200 が返らない。80番の到達性か Nginx 設定を確認すること"; exit 1
fi

echo "----- 3. 設定ファイルを退避（certbot が書き換えるため） -----"
sudo cp -a "$AVAIL" "${AVAIL}.bak_$TS"
echo "  バックアップ: ${AVAIL}.bak_$TS"

echo "----- 4. 証明書を取得して Nginx へ組み込む -----"
sudo certbot --nginx -d "$DOMAIN" --non-interactive --redirect --keep-until-expiring 2>&1 | sed 's/^/  /'

echo "----- 5. 設定を検査して反映 -----"
sudo nginx -t 2>&1 | sed 's/^/  /'
sudo systemctl reload nginx
sleep 1
systemctl is-active nginx | sed 's/^/  nginx: /'

echo "----- 6. HTTPS での確認 -----"
curl -s --max-time 10 "https://$DOMAIN/health" | sed 's/^/  health: /'; echo
curl -s -o /dev/null -w '  http → https のリダイレクト: %{http_code} %{redirect_url}\n' --max-time 10 "http://$DOMAIN/health" || true
echo "  WebSocket の接続（Origin: https://sygames.net）:"
curl -s -o /dev/null -w '    %{http_code}（101 なら成功）\n' --max-time 5 --http1.1 \
  -H 'Origin: https://sygames.net' -H 'Connection: Upgrade' -H 'Upgrade: websocket' \
  -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' \
  "https://$DOMAIN/socket.io/?EIO=4&transport=websocket" || true
sudo certbot certificates 2>/dev/null | grep -E "Certificate Name|Expiry" | sed 's/^/  /'

echo "----- 7. 既存サイトの生存確認 -----"
curl -s -o /dev/null -w '  api.sygames.net (https): %{http_code}\n' --max-time 10 https://api.sygames.net/api/health || true
systemctl is-active csg-ranking | sed 's/^/  csg-ranking: /'
systemctl is-active gf-pvp | sed 's/^/  gf-pvp: /'
echo "===== 完了: $(date '+%F %T') ====="
