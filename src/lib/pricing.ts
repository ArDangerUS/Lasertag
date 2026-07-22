import { HOLIDAY_MMDD } from "./catalog";

// A "date" is an ISO local day string "YYYY-MM-DD".

export function isWeekendDate(iso: string): boolean {
  // Parse as local noon to avoid timezone edge cases.
  const d = new Date(iso + "T12:00:00");
  const day = d.getDay();
  return day === 0 || day === 6;
}

export function isHolidayDate(iso: string): boolean {
  const mmdd = iso.slice(5); // "MM-DD"
  return HOLIDAY_MMDD.includes(mmdd);
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
