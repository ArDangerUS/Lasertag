#!/bin/bash
# Автодеплой для Хостингу Україна. Запускається кроном раз на 10 хвилин.
#
# Що робить:
#   1. дивиться, чи зʼявився новий коміт у гілці деплою;
#   2. перевіряє, що GitHub уже зібрав саме цей коміт (гілка prebuilt) —
#      на сервері нічого не збираємо, памʼяті на це не вистачає;
#   3. підтягує код, за потреби доставляє залежності, кладе готову .next;
#   4. просить застосунок перезапуститись і чекає, поки сайт відповість.
#
# Нічого не змінилось — виходить за пів секунди, без жодних дій.
#
# Cron у панелі (кожні 10 хвилин):
#   */10 * * * * /bin/bash /home/USER/lasertag.in.ua/book/scripts/deploy.sh \
#       >> /home/USER/deploy.log 2>&1

set -u

APP_DIR="${APP_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
BRANCH="${DEPLOY_BRANCH:-main}"
PORT="${PORT:-3000}"
# cron дає мінімальний PATH — Node тут лежить окремо
export PATH="/usr/local/node22/bin:$PATH"

cd "$APP_DIR" || exit 1
mkdir -p tmp

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

# Захист від накладання запусків: якщо попередній деплой ще йде — виходимо.
# mkdir атомарний, тому це надійніше за перевірку існування файлу.
LOCK="$APP_DIR/tmp/deploy.lock"
if ! mkdir "$LOCK" 2>/dev/null; then
  exit 0
fi
trap 'rmdir "$LOCK" 2>/dev/null' EXIT

git fetch -q origin "$BRANCH" prebuilt || { log "git fetch не вдався"; exit 1; }

# Орієнтуємось не на стан git, а на те, що реально викочено: інакше
# достатньо було б комусь зробити `git pull` руками — і скрипт вирішив би,
# що все свіже, хоча .next лишилась стара й сайт крутить попередню версію.
# Щоб примусово перевикотити: rm tmp/deployed.sha
DEPLOYED_FILE="$APP_DIR/tmp/deployed.sha"
DEPLOYED=$(cat "$DEPLOYED_FILE" 2>/dev/null || echo "")
REMOTE=$(git rev-parse "origin/$BRANCH")
[ "$DEPLOYED" = "$REMOTE" ] && exit 0

# Гілку prebuilt наповнює GitHub Actions, і в повідомленні коміту стоїть
# хеш вихідного коду. Якщо він не збігається — збірка ще йде (або впала),
# і викочувати новий код зі старою .next не можна.
SHORT=$(git rev-parse --short=7 "origin/$BRANCH")
PREBUILT_MSG=$(git log -1 --format=%s origin/prebuilt 2>/dev/null || echo "")
case "$PREBUILT_MSG" in
  *"$SHORT"*) ;;
  *)
    log "є новий коміт $SHORT, але зібрано інше ($PREBUILT_MSG) — чекаємо збірку"
    exit 0
    ;;
esac

log "деплой ${DEPLOYED:0:7}${DEPLOYED:+ }→ $SHORT"

git merge --ff-only "origin/$BRANCH" -q || {
  log "merge не вдався — на сервері є локальні зміни, розберіться вручну"
  exit 1
}

# Залежності доставляємо лише коли реально змінився package-lock.json між
# викоченою і новою версією. При першому запуску (deployed.sha ще немає)
# пропускаємо: node_modules ставили руками разом із кодом.
if [ -n "$DEPLOYED" ]; then
  LOCK_BEFORE=$(git rev-parse "$DEPLOYED:package-lock.json" 2>/dev/null || echo "")
  LOCK_AFTER=$(git rev-parse "$REMOTE:package-lock.json" 2>/dev/null || echo "")
  if [ "$LOCK_BEFORE" != "$LOCK_AFTER" ]; then
    log "змінилися залежності — npm ci"
    npm ci --no-audit --no-fund || { log "npm ci впав"; exit 1; }
  fi
fi

# Стару .next прибираємо цілком: інакше лишаються шматки попередніх збірок.
rm -rf .next
git checkout "origin/prebuilt" -- .next || { log "не вдалося взяти .next"; exit 1; }
git reset -q # .next у .gitignore — знімаємо його з індексу після checkout

date > tmp/restart.txt
log "запит на перезапуск відправлено"

for _ in $(seq 1 30); do
  sleep 2
  code=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:$PORT/" || true)
  if [ "$code" = "200" ]; then
    echo "$REMOTE" > "$DEPLOYED_FILE"
    log "сайт піднявся, версія $SHORT"
    exit 0
  fi
done

log "УВАГА: сайт не відповів за хвилину — зайдіть у панель і натисніть «Перезапустити»"
exit 1
