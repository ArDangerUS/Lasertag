import BookingClient from "@/components/BookingClient";
import { loadPublicCatalog } from "@/lib/public-catalog";
import { getDict } from "@/lib/i18n";
import { DEFAULT_LOCALE, LOCALES, type Locale } from "@/lib/constants";

export const dynamic = "force-dynamic";

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

// Адреси мовних версій сторінки-обгортки приходять параметрами alt_uk /
// alt_ru / alt_en. Значення потрапляє в href, тому пускаємо лише звичайні
// http(s)-адреси й відносні шляхи — інакше через параметр можна було б
// підсунути javascript:.
function safeUrl(raw?: string): string {
  const s = (raw || "").trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith("/") && !s.startsWith("//")) return s;
  return "";
}

export default async function BookingPage({
  searchParams,
}: {
  searchParams: {
    lang?: string;
    embed?: string;
    alt_uk?: string;
    alt_ru?: string;
    alt_en?: string;
  };
}) {
  const langParam = (searchParams.lang || "").toLowerCase();
  // ?embed=1 — сторінку вбудовано в iframe на WordPress: свою шапку і
  // плаваючий Telegram ховаємо (вони вже є на сайті-обгортці)
  const embed = searchParams.embed === "1";
  const locale: Locale = (LOCALES as readonly string[]).includes(langParam)
    ? (langParam as Locale)
    : DEFAULT_LOCALE;

  const altUrls = {
    uk: safeUrl(searchParams.alt_uk),
    ru: safeUrl(searchParams.alt_ru),
    en: safeUrl(searchParams.alt_en),
  };
  const hasAltUrls = Object.values(altUrls).some(Boolean);

  const catalog = await loadPublicCatalog(locale);
  const dict = getDict(locale);

  return (
    <BookingClient
      catalog={catalog}
      dict={dict}
      locale={locale}
      today={todayISO()}
      phone={process.env.NEXT_PUBLIC_PHONE || "+380963940288"}
      viberUrl={process.env.NEXT_PUBLIC_VIBER_URL || "viber://chat?number=%2B380963940288"}
      telegramUrl={process.env.NEXT_PUBLIC_TELEGRAM_URL || "https://t.me/g75lasertag_bot"}
      embed={embed}
      homeUrl={process.env.HOME_URL || "https://lasertag.in.ua"}
      altUrls={hasAltUrls ? altUrls : undefined}
    />
  );
}
