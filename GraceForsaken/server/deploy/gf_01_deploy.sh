#!/bin/bash
# GraceForsaken 対戦サーバーの配置と systemd での常駐化（初回・更新どちらでも使える）。
#   事前に /tmp/gf-pvp.tar.gz（js/ と server/）と /tmp/gf-pvp.service を転送しておく。
set -euo pipefail
TS=$(date +%Y%m%d_%H%M%S)
TARBALL=/tmp/gf-pvp.tar.gz
UNIT=/etc/systemd/system/gf-pvp.service
APP=/opt/gf-pvp
echo "===== 開始: $(date '+%F %T') ====="

echo "----- 1. 転送物の確認 -----"
ls -la "$TARBALL" /tmp/gf-pvp.service | sed 's/^/  /'
echo "  ファイル数: $(tar tzf "$TARBALL" | wc -l)"

echo "----- 2. 実行用ユーザー -----"
if id gfpvp >/dev/null 2>&1; then
  echo "  既存: $(id gfpvp)"
else
  sudo useradd --system --no-create-home --shell /usr/sbin/nologin gfpvp
  echo "  作成: $(id gfpvp)"
fi

echo "----- 3. アプリを展開する -----"
if [ -e "$APP/server" ]; then
  sudo tar czf "/opt/gf-pvp.bak_$TS.tar.gz" -C "$APP" --exclude=server/node_modules .
  echo "  既存を退避: /opt/gf-pvp.bak_$TS.tar.gz"
  sudo rm -rf "$APP/js" "$APP/server/src" "$APP/server/test"
fi
sudo mkdir -p "$APP"
sudo tar xzf "$TARBALL" -C "$APP"
echo "  展開先:"
sudo ls -la "$APP" "$APP/server" | sed 's/^/    /'

echo "----- 4. 依存パッケージ（本番用のみ） -----"
cd "$APP/server"
sudo npm ci --omit=dev --no-audit --no-fund 2>&1 | tail -3 | sed 's/^/  /'
cd - >/dev/null
sudo chown -R root:root "$APP"
sudo find "$APP" -type f -exec chmod 644 {} \;
sudo find "$APP" -type d -exec chmod 755 {} \;
# 書き込みは不要なので、実行ユーザーには読み取りだけを許す（所有者は root のまま）

echo "----- 5. systemd ユニットを配置する -----"
if [ -f "$UNIT" ]; then
  sudo cp -a "$UNIT" "${UNIT}.bak_$TS"
  echo "  バックアップ: ${UNIT}.bak_$TS"
fi
sudo cp /tmp/gf-pvp.service "$UNIT"
sudo chown root:root "$UNIT"
sudo chmod 644 "$UNIT"
sudo grep '^Environment=' "$UNIT" | sed 's/^/    /'

echo "----- 6. 起動する -----"
sudo systemctl daemon-reload
sudo systemctl enable gf-pvp >/dev/null 2>&1
sudo systemctl restart gf-pvp
sleep 3
sudo systemctl status gf-pvp --no-pager -l | head -12 | sed 's/^/  /'

echo "----- 7. 疎通確認（ローカルの 3100 番） -----"
for i in 1 2 3 4 5; do
  if curl -s --max-time 5 http://127.0.0.1:3100/health | sed 's/^/  health: /'; then echo; break; fi
  echo "  応答待ち... ($i/5)"; sleep 2
done
echo "  許可していない接続元からの接続は拒否されること（403 になる想定）:"
curl -s -o /dev/null -w '    Origin: https://example.com → %{http_code}\n' --max-time 5 \
  -H 'Origin: https://example.com' 'http://127.0.0.1:3100/socket.io/?EIO=4&transport=polling' || true
curl -s -o /dev/null -w '    Origin: https://sygames.net → %{http_code}\n' --max-time 5 \
  -H 'Origin: https://sygames.net' 'http://127.0.0.1:3100/socket.io/?EIO=4&transport=polling' || true

echo "----- 8. 既存サービスの生存確認 -----"
systemctl is-active csg-ranking | sed 's/^/  csg-ranking: /'
curl -s --max-time 5 http://127.0.0.1:3000/api/health | head -c 200 | sed 's/^/  ranking health: /'; echo
pgrep -f gunicorn >/dev/null && echo "  gunicorn: 稼働中" || echo "  gunicorn: 停止（要確認）"
systemctl is-active nginx | sed 's/^/  nginx: /'
free -m | awk 'NR==2{printf "  メモリ: 使用 %sMB / 空き %sMB\n", $3, $7}'
echo "===== 完了: $(date '+%F %T') ====="
