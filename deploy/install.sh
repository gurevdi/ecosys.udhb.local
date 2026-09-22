#!/bin/bash
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y postgresql postgresql-contrib nginx curl ca-certificates gnupg
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
systemctl enable --now postgresql nginx
install -d -m 755 /opt/ecosys/uploads
cd /opt/ecosys/apps/api
npm install --omit=dev
npx prisma generate
npx prisma migrate deploy
npx tsx prisma/seed.ts
cd /opt/ecosys/apps/web
npm install
npm run build
cp /opt/ecosys/deploy/ecosys-api.service /etc/systemd/system/ecosys-api.service
systemctl daemon-reload
systemctl enable --now ecosys-api
rm -f /etc/nginx/sites-enabled/default
cp /opt/ecosys/deploy/nginx-ecosys.conf /etc/nginx/sites-available/ecosys
ln -sfn /etc/nginx/sites-available/ecosys /etc/nginx/sites-enabled/ecosys
nginx -t
systemctl reload nginx
systemctl --no-pager --full status ecosys-api | head -n 20
echo DEPLOY_OK
