import { prisma } from "./prisma";
import { audit } from "./audit";
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
  // Per-item price / time edits
  items: z
    .array(
      z.object({
        id: z.string(),
        price: z.number().int().min(0).optional(),
        startMin: z.number().int().min(0).max(1440).optional(),
        durationMin: z.number().int().min(10).max(600).optional(),
        people: z.number().int().min(1).max(200).optional(),
      })
    )
    .optional(),
});

export type UpdateBookingInput = z.infer<typeof updateBookingSchema>;

export async function updateBooking(id: string, input: UpdateBookingInput, actor: SessionUser) {
  const before = await prisma.booking.findUnique({ where: { id }, include: { items: true } });
  if (!before) throw new Error("Бронь не знайдено");

  if (input.status && !isStatus(input.status)) throw new Error("Невірний статус");

  // Apply item edits first.
  if (input.items?.length) {
    for (const it of input.items) {
      const data: Record<string, number> = {};
      if (it.price != null) data.price = it.price;
      if (it.startMin != null) data.startMin = it.startMin;
      if (it.durationMin != null) data.durationMin = it.durationMin;
      if (it.people != null) data.people = it.people;
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
    summary: statusChanged
      ? `Статус ${before.status} → ${updated.status} · ${updated.code}`
      : `Змінено бронь ${updated.code} (сума ${updated.totalPrice} грн)`,
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
}
