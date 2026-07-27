import { prisma } from "./prisma";
import { resolvePrice, tieredBlockPrice, makeCode, lasertagMorningDiscount } from "./pricing";
import { audit } from "./audit";
import { pushBookingToKeycrm } from "./keycrm";
import type { SessionUser } from "./auth";
import { z } from "zod";

export const bookingItemSchema = z.object({
  activityId: z.string(),
  startMin: z.number().int().min(0).max(24 * 60),
  durationMin: z.number().int().min(10).max(600),
  people: z.number().int().min(1).max(200),
  // optional explicit price override (CRM). If absent, computed from catalog.
  price: z.number().int().min(0).optional(),
  // optional specific room (CRM manager's choice); absent = auto-assign
  roomId: z.string().optional(),
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
    include: { prices: true, rooms: { include: { room: true } } },
  });
  const actById = new Map(activities.map((a) => [a.id, a]));

  // ---- room auto-assignment ----------------------------------------------
  // Each item takes one of its activity's mapped rooms at this location.
  // Existing bookings + earlier items of THIS booking both count as occupied.
  const mappedRoomIdsAll = activities.flatMap((a) =>
    a.rooms.filter((r) => r.room.locationId === input.locationId && r.room.active).map((r) => r.room.id)
  );
  const existingItems = mappedRoomIdsAll.length
    ? await prisma.bookingItem.findMany({
        where: {
          roomId: { in: mappedRoomIdsAll },
          booking: { date: input.date, locationId: input.locationId, status: { not: "CANCELLED" } },
        },
        include: { activity: { select: { cleanupMin: true } } },
      })
    : [];
  // roomId -> occupied intervals [start, end+cleanup)
  const roomBusy = new Map<string, [number, number][]>();
  for (const it of existingItems) {
    if (!it.roomId) continue;
    const arr = roomBusy.get(it.roomId) ?? [];
    arr.push([it.startMin, it.startMin + it.durationMin + (it.activity?.cleanupMin ?? 0)]);
    roomBusy.set(it.roomId, arr);
  }
  const pickRoom = (
    activityId: string,
    startMin: number,
    durationMin: number,
    preferredRoomId?: string
  ): string | null => {
    const act = actById.get(activityId);
    if (!act) return null;
    const rooms = act.rooms
      .filter((r) => r.room.locationId === input.locationId && r.room.active)
      .sort((a, b) => a.room.sortOrder - b.room.sortOrder);
    if (!rooms.length) return null; // activity without mapped rooms → capacity model
    const end = startMin + durationMin + act.cleanupMin;
    const isFree = (roomId: string) =>
      (roomBusy.get(roomId) ?? []).every(([a, b]) => end <= a || b <= startMin);
    const occupy = (roomId: string) => {
      const busy = roomBusy.get(roomId) ?? [];
      busy.push([startMin, end]);
      roomBusy.set(roomId, busy);
      return roomId;
    };
    // Manager explicitly chose a room — honour it or fail with a clear reason.
    if (preferredRoomId) {
      const r = rooms.find((x) => x.room.id === preferredRoomId);
      if (!r) throw new Error(`«${act.nameUk}»: обрана кімната не підходить для цієї розваги`);
      if (!isFree(preferredRoomId)) {
        throw new Error(`Кімната «${r.room.name}» вже зайнята на цей час`);
      }
      return occupy(preferredRoomId);
    }
    for (const r of rooms) {
      if (isFree(r.room.id)) return occupy(r.room.id);
    }
    throw new Error(`«${act.nameUk}»: немає вільної кімнати на цей час — оберіть інший час`);
  };

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
      const factor = lasertagMorningDiscount({
        activityKey: act.key,
        locationSlug: location.slug,
        date: input.date,
        startMin: it.startMin,
        durationMin: it.durationMin,
      });
      if (act.durationOptions) {
        // Flexible 30-min-slot activity: merged blocks price as hours + half.
        if (factor < 1 && it.durationMin > 60) {
          // Discount covers only the first hour (10:00–11:00); the remainder
          // is priced normally.
          const firstHour = tieredBlockPrice(rows, {
            locationId: input.locationId,
            date: input.date,
            durationMin: 60,
          });
          const rest = tieredBlockPrice(rows, {
            locationId: input.locationId,
            date: input.date,
            durationMin: it.durationMin - 60,
          });
          unit = Math.round(firstHour * factor) + rest;
        } else {
          const base = tieredBlockPrice(rows, {
            locationId: input.locationId,
            date: input.date,
            durationMin: it.durationMin,
          });
          unit = Math.round(base * factor);
        }
      } else {
        const base =
          resolvePrice(rows, {
            locationId: input.locationId,
            durationMin: null,
            date: input.date,
          }) ?? 0;
        unit = Math.round(base * factor);
      }
    }
    const price = it.price != null ? it.price : act.perPerson ? unit * it.people : unit;
    return {
      activityId: act.id,
      title: act.nameUk,
      startMin: it.startMin,
      durationMin: it.durationMin,
      people: it.people,
      price,
      roomId: pickRoom(act.id, it.startMin, it.durationMin, it.roomId),
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

  // KeyCRM: заявка падає в воронку у фоні (не блокує відповідь клієнту)
  pushBookingToKeycrm(booking.id).catch(() => {});

  return booking;
}
