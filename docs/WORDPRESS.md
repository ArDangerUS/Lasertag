# Звʼязка з основним сайтом (WordPress)

Застосунок бронювання живе на `book.lasertag.in.ua`, а користувач бачить
його на сторінці `lasertag.in.ua/book` — вбудованим в `iframe`. Через це
частина роботи робиться в коді застосунку, а частина — у WordPress.
Тут зібрано все, що треба вставити на боці WordPress.

Адреси в прикладах: основний сайт `https://lasertag.in.ua`, застосунок
`https://book.lasertag.in.ua`. Мовні версії — з префіксом (`/ru/`, `/en/`);
якщо на сайті вони інші, поправте їх у трьох місцях, позначених коментарем.

## 1. Сторінка /book — блок з рамкою

Замінити наявний блок «Custom HTML» на сторінці `/book` на цей. Порівняно
з попереднім тут додано: передавання мови в застосунок і перемикання мови
всієї сторінки, коли її змінюють усередині рамки.

```html
<iframe
  id="g75-book"
  src="https://book.lasertag.in.ua/?embed=1"
  title="Онлайн бронювання G-75"
  scrolling="no"
  style="display:block;width:100%;height:1400px;border:0"
></iframe>

<script>
(function () {
  var APP = "https://book.lasertag.in.ua";
  var frame = document.getElementById("g75-book");

  // Мовні версії сторінки /book — поправте, якщо адреси інші
  var BOOK_URL = { uk: "/book/", ru: "/ru/book/", en: "/en/book/" };

  // Поточна мова: Polylang / WPML / TranslatePress проставляють її
  // в <html lang="...">; запасний варіант — префікс в адресі.
  function currentLang() {
    var l = (document.documentElement.lang || "").slice(0, 2).toLowerCase();
    if (l === "uk" || l === "ru" || l === "en") return l;
    var m = location.pathname.match(/^\/(uk|ru|en)(\/|$)/);
    return m ? m[1] : "uk";
  }

  // Українська вже стоїть в src — не перезавантажуємо рамку дарма
  var lang = currentLang();
  if (lang !== "uk") frame.src = APP + "/?embed=1&lang=" + lang;

  window.addEventListener("message", function (e) {
    if (e.origin !== APP) return; // приймаємо лише від свого застосунку
    var d = e.data || {};

    // висота вмісту — щоб не було подвійного скролу
    if (d.type === "g75-embed-height" && d.height > 0) {
      frame.style.height = d.height + "px";
    }

    // мову перемкнули всередині рамки — переводимо всю сторінку
    if (d.type === "g75-lang" && BOOK_URL[d.lang]) {
      if (location.pathname.replace(/\/+$/, "") !== BOOK_URL[d.lang].replace(/\/+$/, "")) {
        location.href = BOOK_URL[d.lang];
      }
    }
  });
})();
</script>
```

Що це дає:

- користувач на англійській версії сайту одразу бачить бронювання
  англійською — мова передається в рамку параметром `?lang=`;
- перемикач мови всередині рамки більше не «розсинхронізовує» сторінку:
  застосунок надсилає `g75-lang`, і WordPress веде на свою мовну версію;
- логотип і «← На сайт» у рамці повертають на основний сайт **тієї ж мови**
  (за це відповідають змінні `HOME_URL_*`, див. розділ 4).

## 2. Кнопка «Забронювати» в меню

«Зовнішній вигляд» → «Меню» → обрати меню шапки → **«Довільні посилання»**:

- URL: `/book/`
- Текст: `Забронювати`

Додати в меню і перетягнути в потрібне місце ряду. Якщо мовних меню
кілька (Polylang створює окреме меню на мову) — додати в кожне зі своєю
адресою: `/ru/book/`, `/en/book/`.

## 3. Плаваючі кнопки (телефон · бронювання · Telegram)

Ставиться один раз на весь сайт: «Зовнішній вигляд» → «Віджети» → у підвал
додати блок «Довільний HTML» (або через плагін Code Snippets, тип HTML).

На сторінці бронювання центральна кнопка ховається сама — там вона зайва.

```html
<style>
.g75-fab{position:fixed;bottom:20px;z-index:9999;display:flex;align-items:center;
  justify-content:center;height:56px;border-radius:999px;text-decoration:none;
  box-shadow:0 6px 20px rgba(0,0,0,.25);transition:transform .15s}
.g75-fab:hover{transform:scale(1.05)}
.g75-fab--phone{left:16px;width:56px;background:#56EF02;color:#0b0b0b}
.g75-fab--tg{right:16px;width:56px;background:#229ED9;color:#fff}
.g75-fab--book{left:50%;transform:translateX(-50%);padding:0 22px;background:#56EF02;
  color:#0b0b0b;font-weight:800;font-size:15px;white-space:nowrap}
.g75-fab--book:hover{transform:translateX(-50%) scale(1.05)}
@media (max-width:420px){.g75-fab--book{padding:0 16px;font-size:14px}}
</style>

<a class="g75-fab g75-fab--phone" href="tel:+380963940288" aria-label="Подзвонити">
  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.2.4 2.4.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.4 0 .8-.2 1l-2.3 2.2Z"/>
  </svg>
</a>

<a class="g75-fab g75-fab--book" id="g75-fab-book" href="/book/">Забронювати</a>

<a class="g75-fab g75-fab--tg" href="https://t.me/Lasertag_G75" target="_blank"
   rel="noreferrer" aria-label="Telegram">
  <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"
       style="margin-left:-2px;margin-top:2px">
    <path d="M23.91 3.79 20.3 20.84c-.25 1.21-.98 1.5-2 .94l-5.5-4.07-2.66 2.57c-.3.3-.55.56-1.1.56-.72 0-.6-.27-.84-.95L6.3 13.7l-5.45-1.7c-1.18-.35-1.19-1.16.26-1.75l21.26-8.2c.97-.43 1.9.24 1.53 1.73Z"/>
  </svg>
</a>

<script>
(function () {
  // Мовні версії сторінки /book — ті самі, що в розділі 1
  var BOOK_URL = { uk: "/book/", ru: "/ru/book/", en: "/en/book/" };
  var btn = document.getElementById("g75-fab-book");
  var path = location.pathname.replace(/\/+$/, "");

  // вже на бронюванні — лишаємо тільки телефон і Telegram
  var onBooking = Object.keys(BOOK_URL).some(function (l) {
    return path === BOOK_URL[l].replace(/\/+$/, "");
  });
  if (onBooking) { btn.remove(); return; }

  var l = (document.documentElement.lang || "").slice(0, 2).toLowerCase();
  if (BOOK_URL[l]) btn.href = BOOK_URL[l];
})();
</script>
```

Якщо тема вже має свою плаваючу кнопку чату в правому куті — або
вимкніть її, або посуньте нашу: `.g75-fab--tg{right:16px}` → `right:84px`.

## 4. Змінні середовища застосунку

Щоб «На сайт» вело на потрібну мовну версію, у `.env` застосунку
(`/home/if479641/lasertag.in.ua/book/.env`) додати:

```
HOME_URL="https://lasertag.in.ua"
HOME_URL_RU="https://lasertag.in.ua/ru"
HOME_URL_EN="https://lasertag.in.ua/en"
```

`HOME_URL_RU` / `HOME_URL_EN` — необовʼязкові: якщо мовної версії сайту
немає, не задавайте їх, і посилання поведе на головну.

Ці змінні читаються під час роботи, тому після правки `.env` достатньо
перезапустити застосунок у панелі — `npm run build` не потрібен.
