#!/bin/bash
# Развёртывание экосистемы УДХБ на Debian без Docker
set -eu

APP_ROOT="/opt/ecosys"
DB_NAME="ecosys"
DB_USER="ecosys"

echo "=== ecosys deploy (native) ==="

if [ ! -f "$APP_ROOT/.env" ]; then
  DB_PASS=$(openssl rand -hex 16)
  JWT=$(openssl rand -hex 32)
  cat > "$APP_ROOT/.env" <<EOF
DATABASE_URL=postgresql://${DB_USER}:${DB_PASS}@127.0.0.1:5432/${DB_NAME}
JWT_SECRET=${JWT}
INIT_ADMIN_PASSWORD=EcosysAdmin47!
UPLOAD_DIR=${APP_ROOT}/uploads
PORT=3000
DEBUG=1
LDAP_URL=ldap://10.37.1.230
LDAP_URL_FAILOVER=ldap://10.37.1.231
LDAP_BIND_DN=ecosys@udhb.local
LDAP_BIND_PASSWORD=
LDAP_BASE=DC=udhb,DC=local
SMTP_HOST=
SMTP_PORT=25
SMTP_USER=
SMTP_PASS=
SMTP_FROM=ecosys@udhb.local
EOF
  echo "Создан $APP_ROOT/.env"
fi

DB_PASS=$(grep DATABASE_URL "$APP_ROOT/.env" | sed -n 's/.*:\/\/[^:]*:\([^@]*\)@.*/\1/p')

runuser -u postgres -- psql -tc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1 || \
  runuser -u postgres -- psql -c "CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASS}';"
runuser -u postgres -- psql -tc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1 || \
  runuser -u postgres -- psql -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};"

mkdir -p "$APP_ROOT/uploads"
chmod 755 "$APP_ROOT/uploads"

# Подгружаем переменные окружения для Prisma и API
set -a
# shellcheck disable=SC1090
. "$APP_ROOT/.env"
set +a

cd "$APP_ROOT/apps/api"
npm install --omit=dev
npx prisma generate
npx prisma migrate deploy
npm run seed

cp "$APP_ROOT/deploy/ecosys-api.service" /etc/systemd/system/ecosys-api.service
cp "$APP_ROOT/deploy/nginx-ecosys.conf" /etc/nginx/sites-available/ecosys
ln -sf /etc/nginx/sites-available/ecosys /etc/nginx/sites-enabled/ecosys
rm -f /etc/nginx/sites-enabled/default

systemctl daemon-reload
systemctl enable postgresql nginx ecosys-api
systemctl restart postgresql
systemctl restart ecosys-api
nginx -t && systemctl restart nginx

echo "=== готово ==="
systemctl is-active ecosys-api nginx postgresql
curl -s http://127.0.0.1/api/health || true
