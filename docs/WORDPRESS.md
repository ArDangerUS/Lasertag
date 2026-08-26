# Інтеграція з WordPress (lasertag.in.ua)

Сторінка бронювання вбудована в основний сайт як iframe:
`https://lasertag.in.ua/book` → `https://book.lasertag.in.ua/?embed=1`.

## 1. Сніпет сторінки /book (iframe + автовисота + мова)

Блок «HTML» в Elementor на сторінці /book:

```html
<iframe id="g75-booking"
  src="https://book.lasertag.in.ua/?embed=1"
  style="width:100%;min-height:100vh;border:0;display:block;"
  allow="clipboard-write"
  title="Онлайн бронювання G-75"></iframe>
<script>
(function () {
  var f = document.getElementById("g75-booking");

  // Мова сторінки → мова форми. Спершу дивимось на адресу (/ru/, /en/) —
  // Polylang завжди її ставить; якщо префікса немає, беремо атрибут lang
  // (деякі теми виставляють його неправильно, тому він другим).
  function detectLang() {
    var m = location.pathname.toLowerCase().match(/^\/(uk|ru|en)(\/|$)/);
    if (m) return m[1];
    var l = (document.documentElement.lang || "").slice(0, 2).toLowerCase();
    return (l === "ru" || l === "en" || l === "uk") ? l : "uk";
  }

  var lang = detectLang();
  // для української src уже правильний — не перезавантажуємо iframe
  if (lang !== "uk") f.src = "https://book.lasertag.in.ua/?embed=1&lang=" + lang;

  // висота: сторінка бронювання сама повідомляє свій розмір
  window.addEventListener("message", function (e) {
    if (e.origin !== "https://book.lasertag.in.ua") return;
    if (e.data && e.data.type === "g75-embed-height" && e.data.height) {
      f.style.height = e.data.height + "px";
    }
  });
})();
</script>
```

`allow="clipboard-write"` потрібен, щоб у формі працювала дія
«Скопіювати номер».

**Важливо:** у Polylang кожна мовна версія сторінки — окрема сторінка, і
вміст між перекладами НЕ копіюється. Цей блок треба вставити на кожній:
`/book`, `/ru/book`, `/en/book`. Інакше російська сторінка відкриє
українську форму.

Важливо: у `<iframe>` **не має бути атрибута `sandbox`** — інакше посилання
«← На основний сайт» усередині форми не зможе вийти з iframe.

## 2. Плаваючі кнопки саме на сторінці /book

На решті сайту працює плагін клієнта **Floating Contact Button for MAX and
Telegram**. Ми його не чіпаємо — це рішення клієнта. Але на сторінці
бронювання він зайвий: там має бути тільки наша Telegram-кнопка.

Плаваюча кнопка не може жити всередині iframe: висота iframe дорівнює
висоті всього вмісту, тому `position: fixed` прив'язується не до екрана.
Тому кнопку малюємо на боці WordPress.

**Консоль → Snippets → Add New**, тип **PHP**, режим **Run everywhere**,
вставити і зберегти з активацією:

```php
add_action( 'wp_footer', function () {
	// тільки сторінка бронювання (і її переклади: /book, /en/book, /ru/book)
	$path = trim( (string) parse_url( $_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH ), '/' );
	if ( substr( $path, -4 ) !== 'book' ) {
		return;
	}
	?>
	<style>
		/* сховати плаваючий віджет плагіна ЛИШЕ на цій сторінці.
		   Плагін «Floating Contact Button for MAX and Telegram» малює
		   свої елементи з класами max-button-column / -bubble / -item /
		   -mother-wrapper — маска ловить усі. */
		body [class*="max-button"] { display: none !important; }

		/* наша Telegram-кнопка */
		.g75-tg-fab {
			position: fixed;
			right: 16px;
			bottom: calc(20px + env(safe-area-inset-bottom));
			z-index: 9999;
			width: 56px;
			height: 56px;
			display: flex;
			align-items: center;
			justify-content: center;
			border-radius: 50%;
			background: #229ED9;
			color: #fff;
			box-shadow: 0 6px 20px rgba(34, 158, 217, .45);
			transition: transform .15s ease;
		}
		.g75-tg-fab:hover { transform: scale(1.05); }
		.g75-tg-fab:active { transform: scale(.95); }
		.g75-tg-fab svg { width: 26px; height: 26px; margin: 2px 0 0 -2px; }
	</style>

	<a class="g75-tg-fab" href="https://t.me/Lasertag_G75" target="_blank"
	   rel="noopener" aria-label="Telegram">
		<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M23.91 3.79 20.3 20.84c-.25 1.21-.98 1.5-2 .94l-5.5-4.07-2.66 2.57c-.3.3-.55.56-1.1.56-.72 0-.6-.27-.84-.95L6.3 13.7l-5.45-1.7c-1.18-.35-1.19-1.16.26-1.75l21.26-8.2c.97-.43 1.9.24 1.53 1.73ZM7.03 13.16l11.85-7.29c.52-.32 1-.15.61.2l-9.86 8.9-.34 3.64-2.26-5.45Z"/></svg>
	</a>
	<?php
}, 100 );
```

Плагін клієнта на всіх інших сторінках продовжує працювати як раніше.

### Якщо чужа кнопка не сховалась

Маска вище розрахована на поточну версію плагіна (1.2.0). Якщо після
оновлення плагіна класи зміняться — кнопка знову з'явиться.

**Варіант А (надійніший).** Дізнатись точний клас:

1. На сторінці /book правий клік по кнопці → **Перевірити (Inspect)**.
2. Стрілкою ↑ піднятись до найзовнішнього `<div>` кнопки (підсвітка має
   охопити кнопку разом із тінню) і скопіювати його `class` або `id`.
3. Дописати в блок `<style>` окремим рядком:
   `body .СКОПІЙОВАНИЙ-КЛАС { display: none !important; }`

**Варіант Б (без пошуку класу).** Додати в сніпет замість CSS-масок:

```html
<script>
(function () {
	function hideForeignFabs() {
		var mine = document.querySelector('.g75-tg-fab');
		Array.prototype.slice.call(document.body.children).forEach(function (el) {
			if (el === mine || el.id === 'wpadminbar') return;
			if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') return;
			if (getComputedStyle(el).position !== 'fixed') return;
			var r = el.getBoundingClientRect();
			// тільки невеликі елементи в нижній частині екрана — щоб не
			// зачепити шапку, банер згоди тощо
			if (r.width > 420 || r.height > 420) return;
			if (r.top < window.innerHeight * 0.35) return;
			el.style.setProperty('display', 'none', 'important');
		});
	}
	document.addEventListener('DOMContentLoaded', hideForeignFabs);
	window.addEventListener('load', hideForeignFabs);
	var n = 0, t = setInterval(function () {      // віджет може домальовуватись
		hideForeignFabs();
		if (++n > 20) clearInterval(t);
	}, 500);
})();
</script>
```

### Кеш

На сайті стоїть **LiteSpeed Cache**, але хостинг не на LiteSpeed-сервері —
плагін сам пише, що кешування недоступне, тож чистити нічого. Якщо зміни
не видно — це кеш браузера: **Ctrl+F5**.

## 3. Кнопка «Забронювати» в шапці

**Elementor → Шаблони → Theme Builder → Header** → у рядок із меню додати
віджет «Кнопка», текст «Забронювати», посилання `/book`.
