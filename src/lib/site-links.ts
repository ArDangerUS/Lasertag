import { type Locale } from "./constants";

// Адреса основного сайту (куди веде логотип / кнопка «На сайт»).
//
// Мовні версії WordPress живуть на окремих адресах (найчастіше з префіксом:
// /ru/, /en/). Якщо для мови адреса не задана — ведемо на базову: краще
// головна українською, ніж 404 на неіснуючому префіксі.
//
// Значення читаються під час роботи (а не «запікаються» у збірку), тож
// змінити їх можна правкою .env і перезапуском, без npm run build.
const ENV_BY_LOCALE: Record<Locale, string> = {
  uk: "HOME_URL_UK",
  ru: "HOME_URL_RU",
  en: "HOME_URL_EN",
};

export function homeUrlFor(locale: Locale): string {
  const base = process.env.HOME_URL || "https://lasertag.in.ua";
  const localized = process.env[ENV_BY_LOCALE[locale]];
  return `${(localized || base).replace(/\/+$/, "")}/`;
}
