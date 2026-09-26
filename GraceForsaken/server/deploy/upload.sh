#!/bin/bash
# 手元（Git Bash）から Lightsail へ対戦サーバーを転送し、指定した手順を実行する。
#
#   bash server/deploy/upload.sh               … 転送して gf_01_deploy.sh（配置・再起動）を実行
#   bash server/deploy/upload.sh gf_02_nginx.sh … 転送して nginx の設定を実行
#   bash server/deploy/upload.sh none          … 転送だけ行う
#
# 鍵と接続先は環境変数で変えられる: GF_SSH_KEY / GF_SSH_HOST
set -euo pipefail
cd "$(dirname "$0")/../.."        # GraceForsaken フォルダ
KEY="${GF_SSH_KEY:-$HOME/Downloads/LightsailDefaultKey-ap-northeast-1.pem}"
HOST="${GF_SSH_HOST:-ubuntu@52.198.114.237}"
STEP="${1:-gf_01_deploy.sh}"
TMP="$(mktemp -d)"

echo "----- アプリ一式をまとめる（js/ と server/。node_modules・.env は含めない） -----"
tar czf - --exclude=server/node_modules --exclude=server/.env js server > "$TMP/gf-pvp.tar.gz"
ls -la "$TMP/gf-pvp.tar.gz"

echo "----- 転送する -----"
scp -q -i "$KEY" "$TMP/gf-pvp.tar.gz" "$HOST:/tmp/gf-pvp.tar.gz"
scp -q -i "$KEY" server/deploy/gf-pvp.service "$HOST:/tmp/gf-pvp.service"
scp -q -i "$KEY" server/deploy/nginx-pvp.sygames.net "$HOST:/tmp/zz-pvp.sygames.net"
ssh -i "$KEY" "$HOST" 'mkdir -p ~/gf-work'
scp -q -i "$KEY" server/deploy/gf_0*.sh "$HOST:gf-work/"
ssh -i "$KEY" "$HOST" 'chmod +x ~/gf-work/*.sh'
rm -rf "$TMP"

if [ "$STEP" != "none" ]; then
  echo "----- $STEP を実行する（ログは ~/gf-work/${STEP%.sh}.log） -----"
  ssh -i "$KEY" "$HOST" "cd ~/gf-work && ./$STEP 2>&1 | tee ${STEP%.sh}.log"
fi
