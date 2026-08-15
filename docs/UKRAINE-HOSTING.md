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
# зовнішня адреса сайту — щоб редиректи CRM вели на домен, а не на localhost
PUBLIC_ORIGIN="https://book.lasertag.in.ua"
# куди веде логотип / «На сайт» — по одній адресі на мовну версію сайту
HOME_URL="https://lasertag.in.ua"
HOME_URL_RU="https://lasertag.in.ua/ru"
HOME_URL_EN="https://lasertag.in.ua/en"
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

Готові блоки для вставки — кнопка «Забронювати» в меню, плаваючі
телефон/бронювання/Telegram і рамка з передаванням мови — у
[WORDPRESS.md](WORDPRESS.md).

## Крок 10. Вимкнути Heroku

Коли все перевірено: Heroku → Resources → вимкнути dyno (повзунок на 0)
і видалити аддон Postgres — щоб не йшла оплата. Застосунок можна не
видаляти — раптом захочете повернутись.

## Оновлення надалі

```bash
ssh if479641@business-69
cd /home/if479641/lasertag.in.ua/book
git pull
npm install            # лише якщо змінювалися залежності
npm run build:lowmem   # лише якщо змінювався код (не потрібно для правок скриптів)
```

Далі в панелі — **Перезапустити**. Логи мають показати один блок
`Starting Next on … / ✓ Ready` і замовкнути.

### Два запускачі в панелі

Панель уміє стартувати застосунок із двох різних місць, і кожне має свій
лог:

| Розділ панелі | Лог | Роль |
|---|---|---|
| «Статус застосунка» (Node.js для сайту) | `~/.system/nodejs/logs/book.lasertag.in.ua.log` | **робочий**, сюди йде трафік сайту |
| «Налаштування запуску застосунку» | `~/.system/webapp/book.lasertag.in.ua.log` | має бути **зупинений** |

Обидва вказують на ту саму теку і той самий порт 3000, тож коли працюють
одночасно — другий не може зайняти порт, виходить, і наглядач піднімає
його знову кожні ~10 секунд. Керувати застосунком (Перезапустити /
Зупинити) треба **тільки** через «Статус застосунка».

Логи пишуться через `tee -a` і ніколи не очищуються, тому старі блоки
«Port 3000 …» лишаються у файлі назавжди. Перш ніж робити висновок за
логом, дивіться на його кінець (`tail -n 20 …`), а не на середину.

Якщо цикл «Port 3000 …» справді триває **зараз** — лишився процес поза
наглядом панелі. Разово почистити:

```bash
pkill -9 -u if479641 -f "npm"
pkill -9 -u if479641 -f "next-server"
sleep 3
ps -ef | grep -E "npm|next-server" | grep -v grep   # має бути порожньо
```

і знову «Перезапустити». Здоровий стан — один ланцюжок:
`lve_suwrapper → bash → npm run start → next-server`.

## Бекап бази

`~/backup-db.sh` копіює `prisma/prod.db` у `~/backups` і лишає 14 останніх
копій. У панелі (розділ Cron) поставити щоденний запуск о 04:00:
`/home/if479641/backup-db.sh`
