import { HOLIDAY_MMDD } from "./catalog";

// A "date" is an ISO local day string "YYYY-MM-DD".

export function isWeekendDate(iso: string): boolean {
  // Weekend tariff runs Fri–Sun (ПТ, СБ, НД) per the club's pricing.
  const d = new Date(iso + "T12:00:00");
  const day = d.getDay();
  return day === 5 || day === 6 || day === 0;
}

// Orthodox (Julian-calendar) Easter converted to the Gregorian date, valid for
// 1900–2099. Meeus algorithm + 13-day Julian→Gregorian offset.
export function orthodoxEasterISO(year: number): string {
  const a = year % 4;
  const b = year % 7;
  const c = year % 19;
  const d = (19 * c + 15) % 30;
  const e = (2 * a + 4 * b - d + 34) % 7;
  const month = Math.floor((d + e + 114) / 31); // Julian month
  const day = ((d + e + 114) % 31) + 1; // Julian day
  const dt = new Date(year, month - 1, day + 13, 12); // +13 днів → григоріанська
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(
    dt.getDate()
  ).padStart(2, "0")}`;
}

export function isHolidayDate(iso: string): boolean {
  const mmdd = iso.slice(5); // "MM-DD"
  if (HOLIDAY_MMDD.includes(mmdd)) return true;
  // Пасха — рухома дата
  const year = Number(iso.slice(0, 4));
  return iso === orthodoxEasterISO(year);
}

// Holidays are charged at the weekend (higher) rate.
export function usesWeekendRate(iso: string): boolean {
  return isWeekendDate(iso) || isHolidayDate(iso);
}

export type PriceRow = {
  locationId: string | null;
  durationMin: number | null;
  priceWeekday: number;
  priceWeekend: number;
};

// Pick the most specific matching price row for an activity at a location and
// (optional) duration, then return weekday or weekend amount for the date.
export function resolvePrice(
  rows: PriceRow[],
  opts: { locationId: string; durationMin?: number | null; date: string }
): number | null {
  const weekend = usesWeekendRate(opts.date);
  const dur = opts.durationMin ?? null;

  const candidates = rows.filter(
    (r) =>
      (r.durationMin === dur || (r.durationMin == null && dur == null)) ||
      (dur != null && r.durationMin === dur)
  );

  // Prefer location-specific, matching-duration rows.
  const score = (r: PriceRow) => {
    let s = 0;
    if (r.locationId === opts.locationId) s += 2;
    else if (r.locationId == null) s += 1;
    else s -= 10; // wrong location
    if (dur != null) {
      if (r.durationMin === dur) s += 2;
      else if (r.durationMin == null) s += 0;
      else s -= 10; // wrong duration
    } else if (r.durationMin == null) s += 1;
    return s;
  };

  const best = candidates
    .map((r) => ({ r, s: score(r) }))
    .filter((x) => x.s > -5)
    .sort((a, b) => b.s - a.s)[0];

  if (!best) return null;
  return weekend ? best.r.priceWeekend : best.r.priceWeekday;
}

// Price for a merged block of a duration-flexible activity (30-min slots that
// the customer stacked). Decomposes into hours + a leftover half-hour:
//   60 → price60; 90 → price60 + price30; 120 → 2×price60; 30 → price30.
export function tieredBlockPrice(
  rows: PriceRow[],
  opts: { locationId: string; date: string; durationMin: number }
): number {
  const p30 = resolvePrice(rows, { locationId: opts.locationId, durationMin: 30, date: opts.date });
  const p60 = resolvePrice(rows, { locationId: opts.locationId, durationMin: 60, date: opts.date });
  const hour = p60 ?? (p30 != null ? p30 * 2 : 0);
  const half = p30 ?? Math.round(hour / 2);
  const halves = Math.max(1, Math.round(opts.durationMin / 30));
  return Math.floor(halves / 2) * hour + (halves % 2) * half;
}

// −40% on lasertag Mon–Thu at every location except Gorodok — ONLY for the
// full 10:00–11:00 hour (client: «виключно на годину»). 30-min bookings in
// that window are not discounted. Returns a multiplier (0.6 or 1).
export function lasertagMorningDiscount(opts: {
  activityKey: string;
  locationSlug: string;
  date: string;
  startMin: number;
  durationMin: number;
}): number {
  if (opts.activityKey !== "laser") return 1;
  if (opts.locationSlug === "gorodok") return 1;
  const day = new Date(opts.date + "T12:00:00").getDay(); // 1..4 = Mon..Thu
  if (day < 1 || day > 4) return 1;
  if (opts.startMin === 600 && opts.durationMin >= 60) return 0.6; // рівно з 10:00, від години
  return 1;
}

export function fmtMoney(n: number): string {
  return Math.round(n).toLocaleString("uk-UA").replace(/ /g, " ");
}

export function minToHHMM(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}:${m === 0 ? "00" : String(m).padStart(2, "0")}`;
}

export function slotRange(startMin: number, durationMin: number): string {
  return `${minToHHMM(startMin)}–${minToHHMM(startMin + durationMin)}`;
}

// Short public booking code, e.g. G75-7K3QD (deterministic randomness caller-provided).
export function makeCode(rand: () => number): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 5; i++) s += chars[Math.floor(rand() * chars.length)];
  return `G75-${s}`;
}
