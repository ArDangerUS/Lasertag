# Переїзд на Хостинг Україна (ukraine.com.ua)

Передумова: тариф акаунта — **«Бізнес 2G» або вище** (Node.js приймає
зовнішній трафік лише на бізнес-тарифах). 2 ГБ RAM вистачає і для роботи
(~400 МБ), і для збірки (~1–1.5 ГБ).

Офіційна довідка провайдера: https://www.ukraine.com.ua/wiki/hosting/nodejs/overview/

## Крок 1. Тариф

Хостинг-акаунти → акаунт → «Зміна тарифу» → **Бізнес 2G** → Перейти.

## Крок 2. Піддомен

«Мої сайти» → «Додати сайт» → `book.lasertag.in.ua`.
Оскільки основний домен обслуговується тут же, DNS-запис створиться
автоматично. SSL (Let's Encrypt) вмикається в налаштуваннях сайту.

## Крок 3. Node.js для сайту

Налаштування сайту `book.lasertag.in.ua` → розділ **Node.js** →
увімкнути, версія **Node 20**. Панель покаже, що застосунок отримує
`PORT` і `HOST` через змінні середовища — наш start-скрипт
(`npm run start:ukraine`) уже їх читає.

## Крок 4. База PostgreSQL

Панель → «Бази даних» → **PostgreSQL** → створити базу і користувача.
Зберегти: хост, порт, назву бази, логін, пароль. Рядок підключення:

```
postgresql://USER:PASSWORD@HOST:5432/DBNAME
```

## Крок 5. Код на сервер (по SSH)

SSH-доступ вмикається в панелі (розділ «SSH»). Далі:

```bash
ssh LOGIN@SERVER
cd ~/book.lasertag.in.ua   # каталог сайту (точну назву покаже панель)
git clone https://github.com/ArDangerUS/Lasertag.git .
npm install
```

## Крок 6. Змінні середовища

Створити файл `.env` у каталозі застосунку:

```
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DBNAME"
AUTH_SECRET="довгий випадковий рядок 40+ символів"
SEED_DEMO="false"
SEED_ADMIN_EMAIL="admin@g75.local"
SEED_ADMIN_PASSWORD="свій-надійний-пароль"
NEXT_PUBLIC_PHONE="+380963940288"
NEXT_PUBLIC_VIBER_URL="viber://chat?number=%2B380963940288"
NEXT_PUBLIC_TELEGRAM_URL="https://t.me/g75lasertag_bot"
# опційно: TELEGRAM_BOT_TOKEN, TELEGRAM_MANAGER_CHAT_ID, KEYCRM_API_TOKEN,
# KEYCRM_PIPELINE_ID, KEYCRM_CANCEL_STATUS_ID
```

(Ті самі значення можна задати і через розділ змінних середовища в
панелі, якщо він є для Node-сайтів — тоді .env не потрібен.)

## Крок 7. Збірка і запуск

```bash
npm run build
```

Стартова команда для Supervisor (у налаштуваннях Node.js сайту):
**`npm run start:ukraine`** — вона сама створює таблиці в базі,
сідить каталог (без демо-бронювань, якщо SEED_DEMO=false) і запускає
сервер на PORT/HOST від панелі.

Якщо `npm run build` впаде через памʼять — збираємо локально і заливаємо
папку `.next` по SFTP (або тимчасово підняти тариф на місяць збірки).

## Крок 8. Перенесення даних з Heroku (якщо там уже є реальні броні)

```bash
# на Heroku (локально, з Heroku CLI):
heroku pg:backups:capture -a НАЗВА_ЗАСТОСУНКУ
heroku pg:backups:download -a НАЗВА_ЗАСТОСУНКУ   # отримаєте latest.dump

# на новому сервері:
pg_restore --no-owner --no-acl -d "postgresql://USER:PASSWORD@HOST:5432/DBNAME" latest.dump
```

Якщо реальних даних ще немає — пропустити: база засідиться сама при
першому старті.

## Крок 9. WordPress

У блоці iframe на сторінці /book замінити адресу (у ДВОХ місцях —
`src` і перевірка `e.origin`):

```
https://book.lasertag.in.ua/
```

## Крок 10. Вимкнути Heroku

Коли все перевірено: Heroku → Resources → вимкнути dyno (повзунок на 0)
і видалити аддон Postgres — щоб не йшла оплата. Застосунок можна не
видаляти — раптом захочете повернутись.

## Оновлення надалі

```bash
ssh LOGIN@SERVER
cd ~/book.lasertag.in.ua
git pull
npm install
npm run build
# у панелі: Restart для Node-застосунку
```
