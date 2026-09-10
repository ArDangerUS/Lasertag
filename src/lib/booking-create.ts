import { prisma } from "./prisma";
import { makeCode, usesWeekendRate } from "./pricing";
import { computeItemPrice } from "./item-price";
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
  // обраний сценарій розваги (квести); не впливає на ціну й зайнятість
  variantId: z.string().optional(),
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
  // Бронь як комплекс: ціна фіксована, позиції — його склад.
  packageId: z.string().optional(),
  // ручна ціна комплексу (знижка постійному клієнту); за замовчуванням
  // рахується за тарифом комплексу
  packagePrice: z.number().int().min(0).optional(),
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

  // ---- package (fixed price) ---------------------------------------------
  // Комплекс продається за фіксованою ціною (будні/вихідні) незалежно від
  // кількості учасників — доки їх не більше, ніж включено. За кожного понад
  // включену кількість — доплата: власна ставка комплексу («Сталкер» 1500)
  // або 10% від ціни комплексу.
  const pkg = input.packageId
    ? await prisma.package.findUnique({ where: { id: input.packageId } })
    : null;
  if (input.packageId && !pkg) throw new Error("Комплекс не знайдено");
  let packagePrice = 0;
  if (pkg) {
    if (input.packagePrice != null) {
      packagePrice = input.packagePrice;
    } else {
      const base = usesWeekendRate(input.date) ? pkg.fixedPriceWeekend : pkg.fixedPriceWeekday;
      const extraCount = Math.max(0, input.people - pkg.maxPeople);
      const extraFee = pkg.extraPersonFee > 0 ? pkg.extraPersonFee : Math.round(base * 0.1);
      packagePrice = base + extraCount * extraFee;
    }
  }

  // ---- activity variants (сценарії квестів) ------------------------------
  const variantIds = Array.from(
    new Set(input.items.map((i) => i.variantId).filter(Boolean) as string[])
  );
  const variants = variantIds.length
    ? await prisma.activityVariant.findMany({
        where: { id: { in: variantIds } },
        include: { rooms: { include: { room: true } } },
      })
    : [];
  const varById = new Map(variants.map((v) => [v.id, v]));

  // ---- room auto-assignment ----------------------------------------------
  // Each item takes one of its activity's mapped rooms at this location.
  // Existing bookings + earlier items of THIS booking both count as occupied.
  const mappedRoomIdsAll = [
    ...activities.flatMap((a) =>
      a.rooms
        .filter((r) => r.room.locationId === input.locationId && r.room.active)
        .map((r) => r.room.id)
    ),
    // кімнати сценаріїв («Хованки» на арені) теж треба врахувати як зайняті
    ...variants.flatMap((v) =>
      v.rooms.filter((r) => r.room.locationId === input.locationId && r.room.active).map((r) => r.room.id)
    ),
  ];
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
  // Кімнати, які тримає САМА ця бронь під банкет. Своя банкетна кімната не
  // може заважати власному ж майстер-класу, який у ній і проходить.
  const ownRoomBusy = new Map<string, [number, number][]>();

  // Кімнати позиції: у сценарію можуть бути власні («Хованки» — це квест,
  // але проводиться на лазертаг-арені), інакше беремо кімнати розваги.
  const roomsFor = (act: (typeof activities)[number], variantId?: string) => {
    const v = variantId ? varById.get(variantId) : null;
    const own = (v?.rooms ?? [])
      .map((x) => x.room)
      .filter((r) => r.locationId === input.locationId && r.active);
    const list = own.length
      ? own
      : act.rooms
          .map((r) => r.room)
          .filter((r) => r.locationId === input.locationId && r.active);
    return [...list].sort((a, b) => a.sortOrder - b.sortOrder);
  };

  const pickRoom = (
    activityId: string,
    startMin: number,
    durationMin: number,
    preferredRoomId?: string,
    variantId?: string
  ): string | null => {
    const act = actById.get(activityId);
    if (!act) return null;
    const rooms = roomsFor(act, variantId);
    if (!rooms.length) return null; // activity without mapped rooms → capacity model
    const isRoomItem = act.category === "room";
    const end = startMin + durationMin + act.cleanupMin;
    const overlapsAny = (arr: [number, number][] | undefined) =>
      (arr ?? []).some(([a, b]) => startMin < b && a < end);
    const isFree = (roomId: string) =>
      !overlapsAny(roomBusy.get(roomId)) &&
      // банкет не може стати в кімнату, яку ця ж бронь уже тримає
      (!isRoomItem || !overlapsAny(ownRoomBusy.get(roomId)));
    const occupy = (roomId: string) => {
      const map = isRoomItem ? ownRoomBusy : roomBusy;
      const busy = map.get(roomId) ?? [];
      busy.push([startMin, end]);
      map.set(roomId, busy);
      return roomId;
    };
    // Manager explicitly chose a room — honour it or fail with a clear reason.
    if (preferredRoomId) {
      const r = rooms.find((x) => x.id === preferredRoomId);
      if (!r) throw new Error(`«${act.nameUk}»: обрана кімната не підходить для цієї розваги`);
      if (!isFree(preferredRoomId)) {
        throw new Error(`Кімната «${r.name}» вже зайнята на цей час`);
      }
      return occupy(preferredRoomId);
    }
    // Спершу кімната, яку ця бронь уже тримає під банкет: майстер-клас чи шоу
    // логічно проводити саме в ній.
    const held = rooms.find(
      (r) => !isRoomItem && overlapsAny(ownRoomBusy.get(r.id)) && isFree(r.id)
    );
    if (held) return occupy(held.id);
    for (const r of rooms) {
      if (isFree(r.id)) return occupy(r.id);
    }
    throw new Error(
      `«${act.nameUk}»: немає вільної кімнати на цей час` +
        (act.cleanupMin > 0
          ? ` — після попереднього сеансу потрібно ${act.cleanupMin} хв на перезавантаження`
          : " — оберіть інший час")
    );
  };

  // Банкетні кімнати розставляємо першими, щоб решта позицій могла стати в
  // ту саму кімнату, яку свято вже займає.
  const roomByIndex = new Map<number, string | null>();
  const order = input.items
    .map((_, i) => i)
    .sort((a, b) => {
      const ra = actById.get(input.items[a].activityId)?.category === "room" ? 0 : 1;
      const rb = actById.get(input.items[b].activityId)?.category === "room" ? 0 : 1;
      return ra - rb;
    });
  for (const i of order) {
    const it = input.items[i];
    roomByIndex.set(
      i,
      pickRoom(it.activityId, it.startMin, it.durationMin, it.roomId, it.variantId)
    );
  }

  // Build item rows with snapshot titles + resolved prices.
  const itemData = input.items.map((it, idx) => {
    const act = actById.get(it.activityId);
    if (!act) throw new Error("Розвагу не знайдено");
    // Понад ліміт пускаємо лише тих, у кого задана доплата за учасника
    // (квест: 10 у кімнаті, кожен наступний +500).
    if (it.people > act.maxPeople && act.extraPersonFee <= 0) {
      throw new Error(`«${act.nameUk}»: максимум ${act.maxPeople} учасників`);
    }
    const price =
      it.price != null
        ? it.price
        : computeItemPrice({
            act,
            locationId: input.locationId,
            locationSlug: location.slug,
            date: input.date,
            startMin: it.startMin,
            durationMin: it.durationMin,
            people: it.people,
          });
    const variant = it.variantId ? varById.get(it.variantId) : null;
    if (variant && variant.activityId !== act.id) {
      throw new Error(`«${act.nameUk}»: обраний сценарій належить іншій розвазі`);
    }
    return {
      activityId: act.id,
      title: act.nameUk,
      startMin: it.startMin,
      durationMin: it.durationMin,
      people: it.people,
      price,
      roomId: roomByIndex.get(idx) ?? null,
      variantId: variant?.id ?? null,
      variantName: variant?.nameUk ?? "",
    };
  });

  // Ціна комплексу лягає на першу позицію, решта — 0. Так сума позицій завжди
  // дорівнює оголошеній ціні комплексу, скільки б розваг у ньому не було.
  if (pkg) {
    itemData.forEach((row, idx) => {
      row.price = idx === 0 ? packagePrice : 0;
    });
  }

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
      packageId: pkg?.id ?? null,
      packageName: pkg?.nameUk ?? "",
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
    summary: `Створено бронь ${booking.code} · ${location.name} · ${input.date}${
      pkg ? ` · комплекс «${pkg.nameUk}»` : ""
    } · ${total} грн`,
    after: { code: booking.code, total, items: itemData.length },
  });

  // KeyCRM: заявка падає в воронку у фоні (не блокує відповідь клієнту)
  pushBookingToKeycrm(booking.id).catch(() => {});

  // Ліди з цим номером більше не потрібні — бронь уже є (порівнюємо хвіст,
  // щоб «066...» і «+38066...» вважались одним номером)
  const phoneDigits = input.customerPhone.replace(/\D/g, "");
  if (phoneDigits.length >= 9) {
    prisma.lead.deleteMany({ where: { phoneKey: phoneDigits.slice(-9) } }).catch(() => {});
  }

  return booking;
}
