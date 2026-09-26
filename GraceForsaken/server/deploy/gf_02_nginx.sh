#!/bin/bash
# nginx に pvp.sygames.net のサイトを追加する（80番のみ。証明書は gf_03_tls.sh）。
set -euo pipefail
TS=$(date +%Y%m%d_%H%M%S)
AVAIL=/etc/nginx/sites-available/pvp.sygames.net
ENABLED=/etc/nginx/sites-enabled/zz-pvp.sygames.net
echo "===== 開始: $(date '+%F %T') ====="

echo "----- 1. 設定を置く -----"
if [ -f "$AVAIL" ]; then
  sudo cp -a "$AVAIL" "${AVAIL}.bak_$TS"
  echo "  バックアップ: ${AVAIL}.bak_$TS"
  if sudo grep -q 'managed by Certbot' "$AVAIL"; then
    echo "  ※ すでに証明書が設定済みのため上書きしません（更新する場合は手で差分を当てる）"
  else
    sudo cp /tmp/zz-pvp.sygames.net "$AVAIL"
  fi
else
  sudo cp /tmp/zz-pvp.sygames.net "$AVAIL"
fi
sudo ln -sfn "$AVAIL" "$ENABLED"
ls -la /etc/nginx/sites-enabled/ | sed 's/^/  /'

echo "----- 2. 構文チェックして反映 -----"
if sudo nginx -t 2>&1 | sed 's/^/  /'; then
  sudo systemctl reload nginx
  echo "  reload しました"
else
  echo "  構文エラーのため元に戻します"
  sudo rm -f "$ENABLED"
  exit 1
fi

echo "----- 3. 確認（Host ヘッダーを付けてローカルから） -----"
curl -s --max-time 5 -H 'Host: pvp.sygames.net' http://127.0.0.1/health | sed 's/^/  pvp health: /'; echo
curl -s -o /dev/null -w '  pvp /（404 の想定）: %{http_code}\n' --max-time 5 -H 'Host: pvp.sygames.net' http://127.0.0.1/

echo "----- 4. 既存サイトの生存確認 -----"
curl -s -o /dev/null -w '  api.sygames.net (https): %{http_code}\n' --max-time 10 https://api.sygames.net/api/health || true
curl -s -o /dev/null -w '  既存サイト(localhost:80): %{http_code}\n' --max-time 5 http://127.0.0.1/ || true
systemctl is-active csg-ranking | sed 's/^/  csg-ranking: /'
systemctl is-active gf-pvp | sed 's/^/  gf-pvp: /'
echo "===== 完了: $(date '+%F %T') ====="
