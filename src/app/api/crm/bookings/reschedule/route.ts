import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { minToHHMM } from "@/lib/pricing";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({
  moves: z
    .array(z.object({ itemId: z.string().min(1), startMin: z.number().int().min(0).max(1440) }))
    .min(1)
    .max(50),
});

// Пакетне перенесення часу позицій (drag-and-drop у денному календарі).
// Лише адміністратор. Всі перевірки конфліктів — з урахуванням того, що
// переміщені позиції звільняють свої старі слоти (тому «поміняти місцями»
// теж працює).
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Переносити час може лише адміністратор" }, { status: 403 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Перевірте дані" }, { status: 400 });
  const moves = parsed.data.moves;
  const movedIds = new Set(moves.map((m) => m.itemId));

  const items = await prisma.bookingItem.findMany({
    where: { id: { in: [...movedIds] } },
    include: {
      booking: { include: { location: true } },
      activity: { include: { rooms: { include: { room: true } }, locations: true } },
    },
  });
  if (items.length !== movedIds.size) {
    return NextResponse.json({ error: "Позицію не знайдено — оновіть сторінку" }, { status: 404 });
  }

  // Все в межах однієї локації і дати (переносимо в межах одного дня).
  const locId = items[0].booking.locationId;
  const date = items[0].booking.date;
  if (!items.every((i) => i.booking.locationId === locId && i.booking.date === date)) {
    return NextResponse.json({ error: "Всі зміни мають бути в межах одного дня і локації" }, { status: 400 });
  }
  const location = items[0].booking.location;

  // Позиції ОДНІЄЇ броні не можуть перетинатися в часі — це той самий клієнт
  // (квест 12:30–13:30 поверх лазертагу 13:00–14:00 фізично неможливий).
  const movesMap = new Map(moves.map((m) => [m.itemId, m.startMin]));
  const affectedBookings = await prisma.booking.findMany({
    where: { id: { in: [...new Set(items.map((i) => i.bookingId))] } },
    include: { items: { include: { activity: true } } },
  });
  for (const b of affectedBookings) {
    // Кімнати (банкетна) навмисно йдуть паралельно зі святом — їх не рахуємо.
    const ivs = b.items
      .filter((it) => it.activity.category !== "room")
      .map((it) => {
        const s = movesMap.get(it.id) ?? it.startMin;
        return { title: it.title, s, e: s + it.durationMin };
      });
    for (let i = 0; i < ivs.length; i++) {
      for (let j = i + 1; j < ivs.length; j++) {
        if (ivs[i].s < ivs[j].e && ivs[j].s < ivs[i].e) {
          return NextResponse.json(
            {
              error: `Бронь ${b.code}: «${ivs[i].title}» (${minToHHMM(ivs[i].s)}–${minToHHMM(ivs[i].e)}) і «${ivs[j].title}» (${minToHHMM(ivs[j].s)}–${minToHHMM(ivs[j].e)}) перетинаються — клієнт не може бути у двох розвагах одночасно`,
            },
            { status: 400 }
          );
        }
      }
    }
  }

  // Чужа зайнятість: всі позиції цієї локації в цю дату, КРІМ переміщуваних.
  const others = await prisma.bookingItem.findMany({
    where: {
      id: { notIn: [...movedIds] },
      booking: { locationId: locId, date, status: { not: "CANCELLED" } },
    },
    include: { activity: true },
  });

  type Interval = [number, number];
  const overlaps = (a: Interval, b: Interval) => a[0] < b[1] && b[0] < a[1];

  // Зайнятість кімнат і «безкімнатних» розваг (модель місткості).
  const roomBusy = new Map<string, Interval[]>();
  const actBusy = new Map<string, Interval[]>(); // roomless items per activity
  const push = (map: Map<string, Interval[]>, key: string, iv: Interval) => {
    const arr = map.get(key) ?? [];
    arr.push(iv);
    map.set(key, arr);
  };
  for (const it of others) {
    const iv: Interval = [it.startMin, it.startMin + it.durationMin + (it.activity.cleanupMin || 0)];
    if (it.roomId) push(roomBusy, it.roomId, iv);
    else push(actBusy, it.activityId, iv);
  }

  const updates: { id: string; startMin: number; roomId: string | null; label: string; oldStart: number; code: string; bookingId: string }[] = [];

  // Переміщувані позиції обробляємо по черзі, додаючи їх у зайнятість,
  // щоб вони не наклались і одна на одну.
  for (const mv of moves) {
    const it = items.find((x) => x.id === mv.itemId)!;
    const cleanup = it.activity.cleanupMin || 0;
    const iv: Interval = [mv.startMin, mv.startMin + it.durationMin + cleanup];
    const label = `${it.title} ${minToHHMM(mv.startMin)}–${minToHHMM(mv.startMin + it.durationMin)}`;

    if (mv.startMin < location.openMin || mv.startMin + it.durationMin > location.closeMin) {
      return NextResponse.json({ error: `${label}: поза годинами роботи локації` }, { status: 400 });
    }

    const mappedRooms = it.activity.rooms
      .map((r) => r.room)
      .filter((r) => r.locationId === locId && r.active);

    if (mappedRooms.length > 0) {
      // кімнатна модель: закріплена кімната або будь-яка вільна
      const tryRooms = it.roomId
        ? mappedRooms.filter((r) => r.id === it.roomId).concat(mappedRooms.filter((r) => r.id !== it.roomId))
        : mappedRooms;
      const freeRoom = tryRooms.find((r) => !(roomBusy.get(r.id) ?? []).some((b) => overlaps(b, iv)));
      if (!freeRoom) {
        return NextResponse.json({ error: `${label}: всі кімнати/арени зайняті на цей час` }, { status: 400 });
      }
      push(roomBusy, freeRoom.id, iv);
      updates.push({ id: it.id, startMin: mv.startMin, roomId: freeRoom.id, label, oldStart: it.startMin, code: it.booking.code, bookingId: it.bookingId });
    } else {
      // модель місткості
      const cap = it.activity.locations.find((x) => x.locationId === locId)?.capacity ?? 1;
      const busyCount = (actBusy.get(it.activityId) ?? []).filter((b) => overlaps(b, iv)).length;
      if (busyCount >= cap) {
        return NextResponse.json({ error: `${label}: усі місця зайняті (місткість ${cap})` }, { status: 400 });
      }
      push(actBusy, it.activityId, iv);
      updates.push({ id: it.id, startMin: mv.startMin, roomId: it.roomId, label, oldStart: it.startMin, code: it.booking.code, bookingId: it.bookingId });
    }
  }

  await prisma.$transaction(
    updates.map((u) =>
      prisma.bookingItem.update({ where: { id: u.id }, data: { startMin: u.startMin, roomId: u.roomId } })
    )
  );

  for (const u of updates) {
    await audit({
      actor: user,
      action: "UPDATE",
      entity: "Booking",
      entityId: u.bookingId,
      bookingId: u.bookingId,
      summary: `переніс(-ла) позицію броні ${u.code}: ${minToHHMM(u.oldStart)} → ${minToHHMM(u.startMin)} (${u.label})`,
    });
  }

  return NextResponse.json({ ok: true, moved: updates.length });
}
