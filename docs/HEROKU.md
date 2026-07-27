# Деплой на Heroku (тестова версія)

## Варіант без термінала (через сайт Heroku)

1. Зареєструйтесь / увійдіть на [dashboard.heroku.com](https://dashboard.heroku.com).
   Знадобиться підписка Eco ($5/міс за всі eco-дини) або Basic — безплатного
   тарифу в Heroku більше немає.
2. **New → Create new app** → назва (наприклад `g75-booking-test`), регіон Europe.
3. Вкладка **Deploy** → Deployment method: **GitHub** → Connect to GitHub →
   авторизуйте акаунт → знайдіть репозиторій `Lasertag` → **Connect**.
4. Вкладка **Settings** → **Reveal Config Vars** → додайте по черзі:

   | KEY | VALUE |
   | --- | --- |
   | `DATABASE_URL` | `file:./dev.db` |
   | `AUTH_SECRET` | довільний довгий випадковий рядок (40+ символів) |
   | `NPM_CONFIG_PRODUCTION` | `false` |
   | `NEXT_PUBLIC_PHONE` | `+380963940288` |
   | `NEXT_PUBLIC_VIBER_URL` | `viber://chat?number=%2B380963940288` |
   | `NEXT_PUBLIC_TELEGRAM_URL` | `https://t.me/g75lasertag_bot` |

   Необовʼязково — інтеграція з KeyCRM (нове бронювання → картка у воронці):

   | KEY | VALUE |
   | --- | --- |
   | `KEYCRM_API_TOKEN` | API-ключ із KeyCRM → Налаштування → API |
   | `KEYCRM_PIPELINE_ID` | id воронки для заявок (число) |
   | `KEYCRM_SOURCE_ID` | id джерела (можна не задавати) |

5. Назад у **Deploy** → розділ Manual deploy → оберіть гілку `main` →
   **Deploy Branch**. Дочекайтесь «Your app was successfully deployed».
   Тут же можна ввімкнути **Enable Automatic Deploys** — тоді кожен push
   у `main` деплоїтиметься сам.
6. **Open app** зверху праворуч — це публічний сайт. CRM:
   `https://<назва>.herokuapp.com/crm` (admin@g75.local / admin12345).
7. Логи без термінала: **More → View logs** (кнопка зверху праворуч).

Далі — той самий процес через термінал (альтернатива).

Тестовий режим = SQLite прямо на дині (dyno). **Увага:** файлова система
Heroku тимчасова — база скидається до демо-стану при кожному рестарті
дини (деплой, `heroku restart`, автоматичний рестарт раз на добу). Для
тесту це якраз зручно; для бойової версії треба Heroku Postgres (розділ
внизу).

## Крок за кроком

1. Встановіть [Heroku CLI](https://devcenter.heroku.com/articles/heroku-cli) і залогіньтеся:

   ```bash
   heroku login
   ```

2. У папці проєкту створіть застосунок:

   ```bash
   heroku create g75-booking-test
   ```

3. Налаштуйте змінні середовища:

   ```bash
   heroku config:set \
     DATABASE_URL="file:./dev.db" \
     AUTH_SECRET="$(openssl rand -base64 48)" \
     NPM_CONFIG_PRODUCTION=false \
     NEXT_PUBLIC_PHONE="+380963940288" \
     NEXT_PUBLIC_VIBER_URL="viber://chat?number=%2B380963940288" \
     NEXT_PUBLIC_TELEGRAM_URL="https://t.me/g75lasertag_bot"
   ```

   - `NPM_CONFIG_PRODUCTION=false` обовʼязково: на старті дини потрібні
     `prisma` і `tsx` (вони в devDependencies).
   - `AUTH_SECRET` — довільний довгий секрет для підпису сесій CRM.

4. Задеплойте гілку:

   ```bash
   git push heroku main
   # або, якщо деплоїте робочу гілку:
   git push heroku claude/lasertag-booking-crm-8otxos:main
   ```

5. Відкрийте сайт:

   ```bash
   heroku open          # публічний сайт бронювання
   heroku logs --tail   # якщо щось пішло не так
   ```

   CRM: `https://<app>.herokuapp.com/crm`
   (admin@g75.local / admin12345 — з демо-сіда, змініть після входу).

## Що відбувається на старті

`Procfile` запускає `npm run start:heroku`:

1. `prisma db push` — створює таблиці в SQLite;
2. `tsx prisma/ensure-seed.ts` — сідить демо-дані **тільки якщо база
   порожня**;
3. `next start` — вебсервер (порт Heroku підхоплюється автоматично).

## Перехід на справжню базу (коли будете готові)

1. Додайте Postgres: `heroku addons:create heroku-postgresql:essential-0`
   (Heroku сам задасть `DATABASE_URL`).
2. У `prisma/schema.prisma` змініть `provider = "sqlite"` на
   `provider = "postgresql"`.
3. Задеплойте ще раз. Дані більше не зникатимуть після рестартів,
   а фото, завантажені через CRM, зберігатимуться постійно (вони
   лежать у базі, не на диску).
