# Быстрый деплой изменений на ecosys.udhb.local (без полной переустановки)
$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Remote = "ecosys:/opt/ecosys"

Write-Host "=== ecosys sync ===" -ForegroundColor Cyan
Write-Host "Root: $Root"

Write-Host "`n[1/4] Build frontend..." -ForegroundColor Yellow
Push-Location "$Root\apps\web"
npm run build
if ($LASTEXITCODE -ne 0) { throw "vite build failed" }
Pop-Location

Write-Host "`n[2/4] Upload API + web..." -ForegroundColor Yellow
scp -r "$Root\apps\api\prisma" "$Root\apps\api\src" "${Remote}/apps/api/"
if ($LASTEXITCODE -ne 0) { throw "scp api failed" }
scp "$Root\apps\api\package.json" "$Root\apps\api\package-lock.json" "${Remote}/apps/api/"
if ($LASTEXITCODE -ne 0) { throw "scp api package failed" }
scp "$Root\deploy\ecosys-api.service" "${Remote}/deploy/"
if ($LASTEXITCODE -ne 0) { throw "scp service failed" }
scp -r "$Root\apps\web\dist" "${Remote}/apps/web/"
if ($LASTEXITCODE -ne 0) { throw "scp web failed" }

Write-Host "`n[3/4] Migrate + restart on server..." -ForegroundColor Yellow
# scp с Windows часто оставляет dist как 700 — nginx (www-data) тогда отдаёт 403
$remoteCmd = "chown -R root:www-data /opt/ecosys/apps/web/dist && find /opt/ecosys/apps/web/dist -type d -exec chmod 755 {} \; && find /opt/ecosys/apps/web/dist -type f -exec chmod 644 {} \; && cp /opt/ecosys/deploy/ecosys-api.service /etc/systemd/system/ecosys-api.service && systemctl daemon-reload && set -a && . /opt/ecosys/.env && set +a && cd /opt/ecosys/apps/api && npm install --omit=dev && npx prisma generate && npx prisma migrate deploy && npm run seed && systemctl restart ecosys-api && sleep 2"
ssh ecosys $remoteCmd
if ($LASTEXITCODE -ne 0) { throw "remote deploy failed" }

Write-Host "`n[4/4] Health check..." -ForegroundColor Yellow
ssh ecosys "curl -sf http://127.0.0.1/api/health"
if ($LASTEXITCODE -ne 0) { throw "health check failed" }

Write-Host "`n=== deploy ok ===" -ForegroundColor Green
