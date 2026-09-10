import {
  resolvePrice,
  tieredBlockPrice,
  lasertagMorningDiscount,
  extraPeopleFee,
} from "./pricing";

// Скільки коштує одна позиція броні. Винесено окремо, бо рахувати треба і
// при створенні броні, і коли менеджер дописує розвагу в наявну — інакше та
// сама позиція коштувала б по-різному залежно від того, як її додали.

export type PricedActivity = {
  key: string;
  perPerson: boolean;
  durationOptions: string; // JSON-масив; порожньо = фіксована тривалість
  maxPeople: number;
  extraPersonFee: number;
  prices: {
    locationId: string | null;
    durationMin: number | null;
    priceWeekday: number;
    priceWeekend: number;
  }[];
};

export function computeItemPrice(opts: {
  act: PricedActivity;
  locationId: string;
  locationSlug: string;
  date: string;
  startMin: number;
  durationMin: number;
  people: number;
}): number {
  const { act, locationId, locationSlug, date, startMin, durationMin, people } = opts;
  const rows = act.prices.map((p) => ({
    locationId: p.locationId,
    durationMin: p.durationMin,
    priceWeekday: p.priceWeekday,
    priceWeekend: p.priceWeekend,
  }));
  const factor = lasertagMorningDiscount({
    activityKey: act.key,
    locationSlug,
    date,
    startMin,
    durationMin,
  });

  let unit: number;
  if (act.durationOptions) {
    // Розвага з 30-хвилинними слотами: злитий блок = години + залишок.
    if (factor < 1 && durationMin > 60) {
      // Знижка діє тільки на першу годину (10:00–11:00), решта за тарифом.
      const firstHour = tieredBlockPrice(rows, { locationId, date, durationMin: 60 });
      const rest = tieredBlockPrice(rows, { locationId, date, durationMin: durationMin - 60 });
      unit = Math.round(firstHour * factor) + rest;
    } else {
      unit = Math.round(tieredBlockPrice(rows, { locationId, date, durationMin }) * factor);
    }
  } else {
    const base = resolvePrice(rows, { locationId, durationMin: null, date }) ?? 0;
    unit = Math.round(base * factor);
  }

  return (
    (act.perPerson ? unit * people : unit) +
    extraPeopleFee({ people, maxPeople: act.maxPeople, extraPersonFee: act.extraPersonFee })
  );
}
