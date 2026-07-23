import { prisma } from "./prisma";
import { resolvePrice, tieredBlockPrice, makeCode, lasertagMorningDiscount } from "./pricing";
import { audit } from "./audit";
import type { SessionUser } from "./auth";
import { z } from "zod";

export const bookingItemSchema = z.object({
  activityId: z.string(),
  startMin: z.number().int().min(0).max(24 * 60),
  durationMin: z.number().int().min(10).max(600),
  people: z.number().int().min(1).max(200),
  // optional explicit price override (CRM). If absent, computed from catalog.
  price: z.number().int().min(0).optional(),
});

export const bookingAddonSchema = z.object({
  addonId: z.string(),
  qty: z.number().int().min(1).max(50).default(1),
});

export const createBookingSchema = z.object({
  locationId: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  people: z.number().int().min(1).max(200),
  customerName: z.string().max(120).default(""),
  customerPhone: z.string().min(5).max(40),
  comment: z.string().max(1000).default(""),
  lang: z.string().default("uk"),
  items: z.array(bookingItemSchema).min(1),
  addons: z.array(bookingAddonSchema).default([]),
  source: z.enum(["SITE", "CRM"]).default("SITE"),
  status: z.enum(["NEW", "CONFIRMED", "PREPAID", "CANCELLED"]).optional(),
  prepaidAmount: z.number().int().min(0).optional(),
});

export type CreateBookingInput = z.infer<typeof createBookingSchema>;

// Deterministic-enough random for codes (Date.now allowed at request time).
function rng(): () => number {
  let s = (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

export async function createBooking(input: CreateBookingInput, actor?: SessionUser | null) {
  const location = await prisma.location.findUnique({ where: { id: input.locationId } });
  if (!location) throw new Error("Локацію не знайдено");

  const activityIds = Array.from(new Set(input.items.map((i) => i.activityId)));
  const activities = await prisma.activity.findMany({
    where: { id: { in: activityIds } },
    include: { prices: true },
  });
  const actById = new Map(activities.map((a) => [a.id, a]));

  // Build item rows with snapshot titles + resolved prices.
  const itemData = input.items.map((it) => {
    const act = actById.get(it.activityId);
    if (!act) throw new Error("Розвагу не знайдено");
    if (it.people > act.maxPeople) {
      throw new Error(`«${act.nameUk}»: максимум ${act.maxPeople} учасників`);
    }
    let unit = it.price;
    if (unit == null) {
      const rows = act.prices.map((p) => ({
        locationId: p.locationId,
        durationMin: p.durationMin,
        priceWeekday: p.priceWeekday,
        priceWeekend: p.priceWeekend,
      }));
      if (act.durationOptions) {
        // Flexible 30-min-slot activity: merged blocks price as hours + half.
        unit = tieredBlockPrice(rows, {
          locationId: input.locationId,
          date: input.date,
          durationMin: it.durationMin,
        });
      } else {
        unit =
          resolvePrice(rows, {
            locationId: input.locationId,
            durationMin: null,
            date: input.date,
          }) ?? 0;
      }
      // Weekday-morning lasertag discount (mirrors the client).
      const factor = lasertagMorningDiscount({
        activityKey: act.key,
        locationSlug: location.slug,
        date: input.date,
        startMin: it.startMin,
      });
      unit = Math.round(unit * factor);
    }
    const price = it.price != null ? it.price : act.perPerson ? unit * it.people : unit;
    return {
      activityId: act.id,
      title: act.nameUk,
      startMin: it.startMin,
      durationMin: it.durationMin,
      people: it.people,
      price,
    };
  });

  const addonRows = input.addons.length
    ? await prisma.addon.findMany({ where: { id: { in: input.addons.map((a) => a.addonId) } } })
    : [];
  const addonById = new Map(addonRows.map((a) => [a.id, a]));
  const addonData = input.addons.map((a) => {
    const ad = addonById.get(a.addonId);
    if (!ad) throw new Error("Додаток не знайдено");
    // Tiered addons (photographer hours): price comes from the tier table.
    let price = ad.price * a.qty;
    if (ad.tiers) {
      try {
        const tiers = JSON.parse(ad.tiers) as Record<string, number>;
        price = tiers[String(a.qty)] ?? ad.price * a.qty;
      } catch {
        /* fall back to flat */
      }
    }
    return { addonId: ad.id, title: ad.nameUk, qty: a.qty, price };
  });

  const total =
    itemData.reduce((s, i) => s + i.price, 0) + addonData.reduce((s, a) => s + a.price, 0);

  const rand = rng();
  let code = makeCode(rand);
  // Ensure uniqueness (rare collision retry).
  for (let attempt = 0; attempt < 5; attempt++) {
    const exists = await prisma.booking.findUnique({ where: { code } });
    if (!exists) break;
    code = makeCode(rand);
  }

  const booking = await prisma.booking.create({
    data: {
      code,
      locationId: input.locationId,
      date: input.date,
      status: input.status ?? "NEW",
      source: input.source,
      lang: input.lang,
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      comment: input.comment,
      people: input.people,
      totalPrice: total,
      prepaidAmount: input.prepaidAmount ?? 0,
      createdById: actor?.id ?? null,
      items: { create: itemData },
      addons: { create: addonData },
    },
    include: { items: true, addons: true, location: true },
  });

  await audit({
    actor,
    action: "CREATE",
    entity: "Booking",
    entityId: booking.id,
    bookingId: booking.id,
    summary: `Створено бронь ${booking.code} · ${location.name} · ${input.date} · ${total} грн`,
    after: { code: booking.code, total, items: itemData.length },
  });

  return booking;
}
