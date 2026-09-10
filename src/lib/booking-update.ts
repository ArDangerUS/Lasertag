import { prisma } from "./prisma";
import { audit } from "./audit";
import { deleteKeycrmCard } from "./keycrm";
import type { SessionUser } from "./auth";
import { isStatus } from "./constants";
import { minToHHMM } from "./pricing";
import { computeItemPrice } from "./item-price";
import { z } from "zod";

export const updateBookingSchema = z.object({
  status: z.string().optional(),
  customerName: z.string().max(120).optional(),
  customerPhone: z.string().max(40).optional(),
  comment: z.string().max(1000).optional(),
  people: z.number().int().min(1).max(200).optional(),
  prepaidAmount: z.number().int().min(0).optional(),
  totalPrice: z.number().int().min(0).optional(),
  // Per-item price / time / room edits
  items: z
    .array(
      z.object({
        id: z.string(),
        price: z.number().int().min(0).optional(),
        startMin: z.number().int().min(0).max(1440).optional(),
        durationMin: z.number().int().min(10).max(600).optional(),
        people: z.number().int().min(1).max(200).optional(),
        // specific room; null = зняти призначення (авто при потребі)
        roomId: z.string().nullable().optional(),
        // сценарій розваги (квести); null = «не обрано»
        variantId: z.string().nullable().optional(),
      })
    )
    .optional(),
  // Прибрати позиції з броні (не можна лишити бронь зовсім без розваг).
  removeItemIds: z.array(z.string()).max(50).optional(),
  // Дописати нові розваги в наявну бронь — з тими самими перевірками
  // зайнятості, що й при створенні.
  addItems: z
    .array(
      z.object({
        activityId: z.string(),
        startMin: z.number().int().min(0).max(1440),
        durationMin: z.number().int().min(10).max(600),
        people: z.number().int().min(1).max(200),
        price: z.number().int().min(0).optional(),
        roomId: z.string().optional(),
        variantId: z.string().optional(),
      })
    )
    .max(20)
    .optional(),
});

export type UpdateBookingInput = z.infer<typeof updateBookingSchema>;

export async function updateBooking(id: string, input: UpdateBookingInput, actor: SessionUser) {
  const before = await prisma.booking.findUnique({
    where: { id },
    include: { items: { include: { room: true } } },
  });
  if (!before) throw new Error("Бронь не знайдено");

  if (input.status && !isStatus(input.status)) throw new Error("Невірний статус");

  const roomChanges: string[] = [];
  const structureChanges: string[] = [];

  const removeIds = new Set(input.removeItemIds ?? []);
  for (const rid of removeIds) {
    if (!before.items.some((i) => i.id === rid)) {
      throw new Error("Позицію не знайдено — оновіть сторінку");
    }
  }
  const addItems = input.addItems ?? [];
  const keptCount = before.items.length - removeIds.size + addItems.length;
  if (keptCount < 1) throw new Error("Бронь не може лишитись без розваг");

  // Спершу тільки збираємо зміни. Записуємо в базу в самому кінці, коли всі
  // перевірки пройшли: інакше відхилена правка встигала б зберегтись.
  const pending = new Map<string, Record<string, number | string | null>>();
  const toCreate: Record<string, number | string | null>[] = [];

  if (input.items?.length) {
    for (const it of input.items) {
      if (removeIds.has(it.id)) continue; // позицію все одно приберемо
      const beforeItem = before.items.find((x) => x.id === it.id);
      if (!beforeItem) continue;
      const data: Record<string, number | string | null> = {};
      if (it.price != null) data.price = it.price;
      if (it.startMin != null) data.startMin = it.startMin;
      if (it.durationMin != null) data.durationMin = it.durationMin;
      if (it.people != null) data.people = it.people;

      // Сценарій розваги (квест): зберігаємо і зв'язок, і знімок назви.
      if (it.variantId !== undefined && it.variantId !== beforeItem.variantId) {
        if (it.variantId) {
          const v = await prisma.activityVariant.findUnique({ where: { id: it.variantId } });
          if (!v || v.activityId !== beforeItem.activityId) {
            throw new Error("Цей сценарій не належить цій розвазі");
          }
          data.variantId = v.id;
          data.variantName = v.nameUk;
        } else {
          data.variantId = null;
          data.variantName = "";
        }
      }

      if (it.roomId !== undefined && it.roomId !== beforeItem.roomId) {
        data.roomId = it.roomId; // кімнату перевіряє розстановка нижче
        roomChanges.push(
          it.roomId
            ? `${beforeItem.title}: кімната ${beforeItem.room?.name ?? "авто"} → обрана вручну`
            : `${beforeItem.title}: кімнату знято (${beforeItem.room?.name ?? "—"})`
        );
      }
      if (
        (it.startMin != null && it.startMin !== beforeItem.startMin) ||
        (it.durationMin != null && it.durationMin !== beforeItem.durationMin)
      ) {
        const ns = it.startMin ?? beforeItem.startMin;
        const nd = it.durationMin ?? beforeItem.durationMin;
        structureChanges.push(
          `${beforeItem.title}: ${minToHHMM(beforeItem.startMin)}–${minToHHMM(
            beforeItem.startMin + beforeItem.durationMin
          )} → ${minToHHMM(ns)}–${minToHHMM(ns + nd)}`
        );
      }

      if (Object.keys(data).length) pending.set(it.id, data);
    }
  }

  // ---- розстановка: час, кімнати, місткість -------------------------------
  // Перевіряємо лише те, що менеджер справді змінив або додав. Позиції, яких
  // не торкались, просто вважаються зайнятими — інакше давня бронь із
  // накладкою блокувала б навіть правку ціни.
  const patchById = new Map((input.items ?? []).map((i) => [i.id, i]));
  const movedIds = new Set(
    (input.items ?? [])
      .filter(
        (i) =>
          !removeIds.has(i.id) &&
          (i.startMin != null || i.durationMin != null || i.roomId !== undefined)
      )
      .map((i) => i.id)
  );

  if (movedIds.size || addItems.length || removeIds.size) {
    const location = await prisma.location.findUnique({ where: { id: before.locationId } });
    if (!location) throw new Error("Локацію не знайдено");

    const actIds = Array.from(
      new Set([...before.items.map((i) => i.activityId), ...addItems.map((a) => a.activityId)])
    );
    const activities = await prisma.activity.findMany({
      where: { id: { in: actIds } },
      include: { prices: true, rooms: { include: { room: true } }, locations: true },
    });
    const actById = new Map(activities.map((a) => [a.id, a]));

    type Interval = [number, number];
    const overlaps = (a: Interval, b: Interval) => a[0] < b[1] && b[0] < a[1];
    const roomBusy = new Map<string, Interval[]>();
    const actBusy = new Map<string, Interval[]>();
    const push = (m: Map<string, Interval[]>, k: string, iv: Interval) => {
      const arr = m.get(k) ?? [];
      arr.push(iv);
      m.set(k, arr);
    };

    // чужа зайнятість цього дня
    const others = await prisma.bookingItem.findMany({
      where: {
        bookingId: { not: id },
        booking: { locationId: before.locationId, date: before.date, status: { not: "CANCELLED" } },
      },
      include: { activity: { select: { cleanupMin: true } } },
    });
    for (const o of others) {
      const iv: Interval = [o.startMin, o.startMin + o.durationMin + (o.activity.cleanupMin || 0)];
      if (o.roomId) push(roomBusy, o.roomId, iv);
      else push(actBusy, o.activityId, iv);
    }

    // позиції цієї ж броні, яких не чіпали, теж займають місце
    const untouched = before.items.filter((i) => !removeIds.has(i.id) && !movedIds.has(i.id));
    for (const u of untouched) {
      const cleanup = actById.get(u.activityId)?.cleanupMin ?? 0;
      const iv: Interval = [u.startMin, u.startMin + u.durationMin + cleanup];
      if (u.roomId) push(roomBusy, u.roomId, iv);
      else push(actBusy, u.activityId, iv);
    }

    // Одна бронь — один клієнт: її розваги не можуть іти одночасно. Кімнати
    // (банкетна) — виняток, вони навмисно тримаються паралельно зі святом.
    const finalItems = [
      ...before.items
        .filter((i) => !removeIds.has(i.id))
        .map((i) => {
          const p = patchById.get(i.id);
          return {
            title: i.title,
            activityId: i.activityId,
            startMin: p?.startMin ?? i.startMin,
            durationMin: p?.durationMin ?? i.durationMin,
          };
        }),
      ...addItems.map((a) => ({
        title: actById.get(a.activityId)?.nameUk ?? "",
        activityId: a.activityId,
        startMin: a.startMin,
        durationMin: a.durationMin,
      })),
    ].filter((i) => actById.get(i.activityId)?.category !== "room");
    for (let i = 0; i < finalItems.length; i++) {
      for (let j = i + 1; j < finalItems.length; j++) {
        const A = finalItems[i];
        const B = finalItems[j];
        if (
          A.startMin < B.startMin + B.durationMin &&
          B.startMin < A.startMin + A.durationMin
        ) {
          throw new Error(
            `«${A.title}» (${minToHHMM(A.startMin)}–${minToHHMM(
              A.startMin + A.durationMin
            )}) і «${B.title}» (${minToHHMM(B.startMin)}–${minToHHMM(
              B.startMin + B.durationMin
            )}) перетинаються — клієнт не може бути у двох розвагах одночасно`
          );
        }
      }
    }

    // Ставимо змінені й нові позиції: кожна або займає одну зі своїх кімнат,
    // або вписується в місткість розваги на локації.
    const place = (opts: {
      activityId: string;
      title: string;
      startMin: number;
      durationMin: number;
      preferredRoomId: string | null;
    }): string | null => {
      const act = actById.get(opts.activityId);
      if (!act) throw new Error("Розвагу не знайдено");
      const label = `${opts.title} ${minToHHMM(opts.startMin)}–${minToHHMM(
        opts.startMin + opts.durationMin
      )}`;
      if (
        opts.startMin < location.openMin ||
        opts.startMin + opts.durationMin > location.closeMin
      ) {
        throw new Error(`${label}: поза годинами роботи локації`);
      }
      const iv: Interval = [
        opts.startMin,
        opts.startMin + opts.durationMin + (act.cleanupMin || 0),
      ];
      const rooms = act.rooms
        .map((r) => r.room)
        .filter((r) => r.locationId === before.locationId && r.active)
        .sort((a, b) => a.sortOrder - b.sortOrder);

      if (rooms.length) {
        const ordered = opts.preferredRoomId
          ? [
              ...rooms.filter((r) => r.id === opts.preferredRoomId),
              ...rooms.filter((r) => r.id !== opts.preferredRoomId),
            ]
          : rooms;
        if (opts.preferredRoomId && !rooms.some((r) => r.id === opts.preferredRoomId)) {
          throw new Error(`${label}: обрана кімната не підходить для цієї розваги`);
        }
        const free = ordered.find((r) => !(roomBusy.get(r.id) ?? []).some((b) => overlaps(b, iv)));
        if (!free) throw new Error(`${label}: усі кімнати/арени зайняті на цей час`);
        push(roomBusy, free.id, iv);
        return free.id;
      }

      const cap = act.locations.find((x) => x.locationId === before.locationId)?.capacity ?? 1;
      const busy = (actBusy.get(opts.activityId) ?? []).filter((b) => overlaps(b, iv)).length;
      if (busy >= cap) throw new Error(`${label}: усі місця зайняті (місткість ${cap})`);
      push(actBusy, opts.activityId, iv);
      return null;
    };

    for (const mid of movedIds) {
      const bi = before.items.find((x) => x.id === mid)!;
      const p = patchById.get(mid);
      const roomId = place({
        activityId: bi.activityId,
        title: bi.title,
        startMin: p?.startMin ?? bi.startMin,
        durationMin: p?.durationMin ?? bi.durationMin,
        preferredRoomId: p?.roomId !== undefined ? p.roomId : bi.roomId,
      });
      pending.set(mid, { ...(pending.get(mid) ?? {}), roomId });
    }

    for (const a of addItems) {
      const act = actById.get(a.activityId);
      if (!act) throw new Error("Розвагу не знайдено");
      if (a.people > act.maxPeople && act.extraPersonFee <= 0) {
        throw new Error(`«${act.nameUk}»: максимум ${act.maxPeople} учасників`);
      }
      let variantId: string | null = null;
      let variantName = "";
      if (a.variantId) {
        const v = await prisma.activityVariant.findUnique({ where: { id: a.variantId } });
        if (!v || v.activityId !== act.id) throw new Error("Цей сценарій не належить цій розвазі");
        variantId = v.id;
        variantName = v.nameUk;
      }
      const roomId = place({
        activityId: a.activityId,
        title: act.nameUk,
        startMin: a.startMin,
        durationMin: a.durationMin,
        preferredRoomId: a.roomId ?? null,
      });
      const price =
        a.price != null
          ? a.price
          : computeItemPrice({
              act,
              locationId: before.locationId,
              locationSlug: location.slug,
              date: before.date,
              startMin: a.startMin,
              durationMin: a.durationMin,
              people: a.people,
            });
      toCreate.push({
        bookingId: id,
        activityId: act.id,
        title: act.nameUk,
        startMin: a.startMin,
        durationMin: a.durationMin,
        people: a.people,
        price,
        roomId,
        variantId,
        variantName,
      });
      structureChanges.push(
        `додано «${act.nameUk}» ${minToHHMM(a.startMin)}–${minToHHMM(a.startMin + a.durationMin)}`
      );
    }

    for (const rid of removeIds) {
      const bi = before.items.find((x) => x.id === rid)!;
      structureChanges.push(`прибрано «${bi.title}» ${minToHHMM(bi.startMin)}`);
    }
  }

  // ---- усі перевірки пройшли: тепер записуємо ------------------------------
  await prisma.$transaction([
    ...[...pending.entries()].map(([itemId, data]) =>
      prisma.bookingItem.update({ where: { id: itemId }, data })
    ),
    ...toCreate.map((data) => prisma.bookingItem.create({ data: data as never })),
    ...(removeIds.size
      ? [prisma.bookingItem.deleteMany({ where: { id: { in: [...removeIds] }, bookingId: id } })]
      : []),
  ]);

  // Recompute total if items changed and no explicit total given.
  let total = input.totalPrice;
  if (total == null && (pending.size || toCreate.length || removeIds.size)) {
    const items = await prisma.bookingItem.findMany({ where: { bookingId: id } });
    const addons = await prisma.bookingAddon.findMany({ where: { bookingId: id } });
    total = items.reduce((s, i) => s + i.price, 0) + addons.reduce((s, a) => s + a.price, 0);
  }

  const updated = await prisma.booking.update({
    where: { id },
    data: {
      status: input.status ?? undefined,
      customerName: input.customerName ?? undefined,
      customerPhone: input.customerPhone ?? undefined,
      comment: input.comment ?? undefined,
      people: input.people ?? undefined,
      prepaidAmount: input.prepaidAmount ?? undefined,
      totalPrice: total ?? undefined,
    },
    include: { items: true, location: true },
  });

  const statusChanged = input.status && input.status !== before.status;
  await audit({
    actor,
    action: statusChanged ? "STATUS" : "UPDATE",
    entity: "Booking",
    entityId: id,
    bookingId: id,
    summary:
      (statusChanged
        ? `Статус ${before.status} → ${updated.status} · ${updated.code}`
        : `Змінено бронь ${updated.code} (сума ${updated.totalPrice} грн)`) +
      (structureChanges.length ? `; ${structureChanges.join("; ")}` : "") +
      (roomChanges.length ? `; ${roomChanges.join("; ")}` : ""),
    before: {
      status: before.status,
      total: before.totalPrice,
      items: before.items.map((i) => ({ id: i.id, price: i.price, startMin: i.startMin })),
    },
    after: {
      status: updated.status,
      total: updated.totalPrice,
      items: updated.items.map((i) => ({ id: i.id, price: i.price, startMin: i.startMin })),
    },
  });

  return updated;
}

export async function deleteBooking(id: string, actor: SessionUser) {
  const b = await prisma.booking.findUnique({ where: { id } });
  if (!b) throw new Error("Бронь не знайдено");
  // Keep an audit trail of the deletion (who removed it).
  await audit({
    actor,
    action: "DELETE",
    entity: "Booking",
    entityId: id,
    summary: `Видалено бронь ${b.code} · ${b.date} · ${b.totalPrice} грн`,
    before: { code: b.code, date: b.date, total: b.totalPrice, status: b.status, phone: b.customerPhone },
  });
  await prisma.booking.delete({ where: { id } });
  // KeyCRM: прибираємо повʼязану картку у фоні (якщо інтеграцію ввімкнено)
  deleteKeycrmCard(b.keycrmCardId).catch(() => {});
}
