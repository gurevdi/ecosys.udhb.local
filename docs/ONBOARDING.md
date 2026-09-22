# Ecosys — подключение для соавторов

Документ для разработчиков проекта **ecosys.udhb.local** (подсистемы «Договоры», «СЭД», кабинет УДХБ).

> **Не храните в git и не пересылайте в открытых чатах:** содержимое `.env`, пароли, приватные SSH-ключи, `JWT_SECRET`, строки подключения к БД, пароли SED/LDAP/SMTP.

---

## Приложение (прод)

| | |
|---|---|
| URL | http://ecosys.udhb.local (внутренняя сеть) |
| Альт. IP | http://10.192.1.10 |
| API health | `curl http://ecosys.udhb.local/api/health` → `{"ok":true,...}` |
| Часовой пояс сервера | Asia/Omsk (UTC+6) |

Если домен не резолвится — добавьте в `hosts`:

```
10.192.1.10 ecosys.udhb.local
```

или открывайте сайт по IP.

---

## Git

| | |
|---|---|
| Репозиторий | https://github.com/ravavilov/ecosys.udhb.local |
| Основная ветка | `master` |
| Рабочая ветка (исторически) | `slave` |

```bash
git clone https://github.com/ravavilov/ecosys.udhb.local.git
cd ecosys.udhb.local
git checkout master
git pull
```

---

## SSH на сервер

| | |
|---|---|
| Хост | `94.137.47.86` |
| Порт | `35222` (не стандартный 22) |
| Пользователь | `root` |
| Каталог проекта | `/opt/ecosys` |
| SSH alias (рекомендуется) | `ecosys` |

### Пример `~/.ssh/config`

```
Host ecosys
    HostName 94.137.47.86
    Port 35222
    User root
    IdentityFile ~/.ssh/id_ed25519
```

### Проверка подключения

```bash
ssh ecosys "uname -a && ls /opt/ecosys"
```

### Доступ новому соавтору

1. Сгенерировать пару ключей (если нет): `ssh-keygen -t ed25519`
2. Передать администратору **только публичный** ключ (`~/.ssh/id_ed25519.pub`)
3. Администратор добавляет ключ в `/root/.ssh/authorized_keys` на сервере

Приватный ключ никому не передаётся.

---

## Стек на сервере

| Компонент | Детали |
|---|---|
| API | Node.js, systemd `ecosys-api`, порт **3000** (внутренний) |
| Frontend | `/opt/ecosys/apps/web/dist`, nginx :80 |
| БД | PostgreSQL, база `ecosys`, миграции Prisma |
| Конфиг | `/opt/ecosys/.env` (только на сервере) |
| Nginx | `/etc/nginx/...`, конфиг-образец: `deploy/nginx-ecosys.conf` |

### Полезные команды на сервере

```bash
# статус API
systemctl status ecosys-api

# логи API
journalctl -u ecosys-api -f

# health
curl -s http://127.0.0.1/api/health

# список миграций на сервере
ls /opt/ecosys/apps/api/prisma/migrations/
```

---

## Локальная разработка

**Требования:** Node.js 22+, npm, Git.

```powershell
# Windows
git clone https://github.com/ravavilov/ecosys.udhb.local.git
cd ecosys.udhb.local

# API
cd apps\api
npm install
# нужен локальный .env — запросить шаблон у администратора
npm run dev

# Web (отдельный терминал)
cd apps\web
npm install
npm run dev
```

Файл `.env` для API **не в репозитории**. Администратор передаёт шаблон отдельно (`DATABASE_URL`, `JWT_SECRET`, `INIT_ADMIN_PASSWORD` и др.).

---

## Деплой на сервер

Из **корня репозитория**, после изменений в `apps/api/**` или `apps/web/**`:

```powershell
powershell -ExecutionPolicy Bypass -File deploy/sync-server.ps1
```

Скрипт `deploy/sync-server.ps1`:

1. Собирает frontend (`npm run build`)
2. Заливает API и `dist` на сервер (`scp` → `ecosys:/opt/ecosys`)
3. На сервере: `npm install`, `prisma migrate deploy`, `seed`, `systemctl restart ecosys-api`
4. Проверяет `GET /api/health`

### Перед деплоем — сверка миграций

```bash
# на сервере
ssh ecosys "ls /opt/ecosys/apps/api/prisma/migrations/"

# локально
dir apps\api\prisma\migrations
```

| Ситуация | Действие |
|---|---|
| Локаль новее сервера | деплой (`sync-server.ps1`) |
| Сервер новее локали | сначала подтянуть код/миграции с сервера, потом правки и деплой |
| Расхождение без согласования | **не затирать** локаль или сервер |

---

## Первый вход в приложение

| | |
|---|---|
| Логин | `admin` |
| Пароль | `INIT_ADMIN_PASSWORD` в `/opt/ecosys/.env` на сервере |

Остальных пользователей создают в **Настройки → Пользователи** или через интеграцию Active Directory.

---

## Структура репозитория (кратко)

```
apps/api/          — Fastify API, Prisma, миграции
apps/web/          — React + Vite frontend
deploy/            — nginx, systemd, sync-server.ps1
docs/              — документация для команды
history_step       — журнал состояния проекта (обновлять после задач)
.cursor/rules/     — правила для Cursor (деплой, history_step)
```

---

## Журнал проекта

Файл **`history_step`** в корне репозитория — актуальное состояние: миграции, последний деплой, ключевые файлы, заметки для следующей сессии. Читать при подключении к проекту после перерыва.

---

## Эскалация

| Вопрос | К кому |
|---|---|
| SSH / root на сервере | администратор `94.137.47.86:35222` |
| Доступ к GitHub | invite в `ravavilov/ecosys.udhb.local` |
| `.env`, пароли, SED/LDAP | администратор проекта (отдельный защищённый канал) |
