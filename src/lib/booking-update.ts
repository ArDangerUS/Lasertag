import { prisma } from "./prisma";
import { audit } from "./audit";
import { deleteKeycrmCard } from "./keycrm";
import type { SessionUser } from "./auth";
import { isStatus } from "./constants";
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

  // Apply item edits first.
  if (input.items?.length) {
    for (const it of input.items) {
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

      // Manager picked a specific room for this item.
      if (it.roomId !== undefined && it.roomId !== beforeItem.roomId) {
        if (it.roomId) {
          const mapped = await prisma.activityRoom.findFirst({
            where: {
              activityId: beforeItem.activityId,
              roomId: it.roomId,
              room: { locationId: before.locationId, active: true },
            },
            include: { room: true },
          });
          if (!mapped) throw new Error("Ця кімната не підходить для цієї розваги");
          // conflict check against other items in the same room that day
          const start = it.startMin ?? beforeItem.startMin;
          const dur = it.durationMin ?? beforeItem.durationMin;
          const candidates = await prisma.bookingItem.findMany({
            where: {
              roomId: it.roomId,
              id: { not: it.id },
              booking: { date: before.date, locationId: before.locationId, status: { not: "CANCELLED" } },
            },
          });
          const clash = candidates.find(
            (c) => c.startMin < start + dur && c.startMin + c.durationMin > start
          );
          if (clash) {
            throw new Error(`Кімната «${mapped.room.name}» вже зайнята о ${Math.floor(clash.startMin / 60)}:${String(clash.startMin % 60).padStart(2, "0")}`);
          }
          roomChanges.push(
            `${beforeItem.title}: кімната ${beforeItem.room?.name ?? "авто"} → ${mapped.room.name}`
          );
        } else {
          roomChanges.push(`${beforeItem.title}: кімнату знято (${beforeItem.room?.name ?? "—"})`);
        }
        data.roomId = it.roomId;
      }

      if (Object.keys(data).length) {
        await prisma.bookingItem.update({ where: { id: it.id }, data });
      }
    }
  }

  // Recompute total if items changed and no explicit total given.
  let total = input.totalPrice;
  if (total == null && input.items?.length) {
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
