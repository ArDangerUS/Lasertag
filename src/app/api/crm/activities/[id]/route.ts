import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({
  active: z.boolean().optional(),
  nameUk: z.string().min(1).max(160).optional(),
  nameRu: z.string().max(160).optional(),
  nameEn: z.string().max(160).optional(),
  minPeople: z.number().int().min(1).max(999).optional(),
  maxPeople: z.number().int().min(1).max(999).optional(), // 999 = без обмежень
  cleanupMin: z.number().int().min(0).max(120).optional(),
  // Full replacement list of locations where the activity is offered, with
  // rooms/arenas count (capacity = parallel groups at that location).
  locations: z
    .array(z.object({ locationId: z.string(), capacity: z.number().int().min(1).max(50).default(1) }))
    .optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user || !can(user.role, "editCatalog")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Перевірте поля" }, { status: 400 });

  const before = await prisma.activity.findUnique({
    where: { id: params.id },
    include: { locations: { include: { location: true } } },
  });
  if (!before) return NextResponse.json({ error: "Не знайдено" }, { status: 404 });

  const updated = await prisma.activity.update({
    where: { id: params.id },
    data: {
      active: parsed.data.active ?? undefined,
      nameUk: parsed.data.nameUk ?? undefined,
      nameRu: parsed.data.nameRu ?? undefined,
      nameEn: parsed.data.nameEn ?? undefined,
      minPeople: parsed.data.minPeople ?? undefined,
      maxPeople: parsed.data.maxPeople ?? undefined,
      cleanupMin: parsed.data.cleanupMin ?? undefined,
    },
  });

  // Build a human-readable list of what actually changed.
  const fmtMax = (n: number) => (n >= 999 ? "∞" : String(n));
  const changes: string[] = [];
  if (parsed.data.nameUk != null && parsed.data.nameUk !== before.nameUk)
    changes.push(`назва (uk): «${before.nameUk}» → «${parsed.data.nameUk}»`);
  if (parsed.data.nameRu != null && parsed.data.nameRu !== before.nameRu)
    changes.push(`назва (ru): «${before.nameRu}» → «${parsed.data.nameRu}»`);
  if (parsed.data.nameEn != null && parsed.data.nameEn !== before.nameEn)
    changes.push(`назва (en): «${before.nameEn}» → «${parsed.data.nameEn}»`);
  if (parsed.data.minPeople != null && parsed.data.minPeople !== before.minPeople)
    changes.push(`мін. учасників: ${before.minPeople} → ${parsed.data.minPeople}`);
  if (parsed.data.maxPeople != null && parsed.data.maxPeople !== before.maxPeople)
    changes.push(`макс. учасників: ${fmtMax(before.maxPeople)} → ${fmtMax(parsed.data.maxPeople)}`);
  if (parsed.data.cleanupMin != null && parsed.data.cleanupMin !== before.cleanupMin)
    changes.push(`перегрузка: ${before.cleanupMin} → ${parsed.data.cleanupMin} хв`);
  if (parsed.data.active != null && parsed.data.active !== before.active)
    changes.push(parsed.data.active ? "увімкнено" : "вимкнено");

  // Replace location links if a list was provided; report added/removed/capacity.
  if (parsed.data.locations) {
    const wanted = parsed.data.locations;
    const valid = await prisma.location.findMany({
      where: { id: { in: wanted.map((w) => w.locationId) } },
      select: { id: true, name: true },
    });
    const validIds = new Set(valid.map((l) => l.id));
    const nameOf = new Map(valid.map((l) => [l.id, l.name]));
    const beforeCap = new Map(before.locations.map((l) => [l.locationId, l.capacity]));
    const afterCap = new Map(
      wanted.filter((w) => validIds.has(w.locationId)).map((w) => [w.locationId, w.capacity])
    );

    const added = [...afterCap.keys()].filter((id) => !beforeCap.has(id));
    const removed = [...beforeCap.keys()].filter((id) => !afterCap.has(id));
    const capChanged = [...afterCap.keys()].filter(
      (id) => beforeCap.has(id) && beforeCap.get(id) !== afterCap.get(id)
    );

    if (added.length || removed.length || capChanged.length) {
      await prisma.locationActivity.deleteMany({ where: { activityId: params.id } });
      for (const [locationId, capacity] of afterCap) {
        await prisma.locationActivity.create({
          data: { activityId: params.id, locationId, capacity },
        });
      }
      if (added.length)
        changes.push(`додано локації: ${added.map((id) => nameOf.get(id)).join(", ")}`);
      if (removed.length)
        changes.push(
          `прибрано локації: ${removed
            .map((id) => before.locations.find((l) => l.locationId === id)?.location.name)
            .join(", ")}`
        );
      for (const id of capChanged) {
        changes.push(
          `кімнат у «${nameOf.get(id)}»: ${beforeCap.get(id)} → ${afterCap.get(id)}`
        );
      }
    }
  }

  // No audit noise when nothing actually changed.
  if (changes.length) {
    await audit({
      actor: user,
      action: "UPDATE",
      entity: "Activity",
      entityId: updated.id,
      summary: `«${updated.nameUk}»: ${changes.join("; ")}`,
      before: {
        nameUk: before.nameUk,
        minPeople: before.minPeople,
        maxPeople: before.maxPeople,
        cleanupMin: before.cleanupMin,
        active: before.active,
      },
      after: {
        nameUk: updated.nameUk,
        minPeople: updated.minPeople,
        maxPeople: updated.maxPeople,
        cleanupMin: updated.cleanupMin,
        active: updated.active,
      },
    });
  }

  return NextResponse.json({ ok: true, changed: changes.length });
}

// Delete an activity. Blocked if bookings or packages reference it — then the
// right move is to hide it (active=false) so history stays intact.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user || !can(user.role, "editCatalog")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const act = await prisma.activity.findUnique({
    where: { id: params.id },
    include: { _count: { select: { bookingItems: true, packageItems: true } } },
  });
  if (!act) return NextResponse.json({ error: "Не знайдено" }, { status: 404 });

  if (act._count.bookingItems > 0) {
    return NextResponse.json(
      { error: `«${act.nameUk}» має ${act._count.bookingItems} броней — вимкніть її (Прихована) замість видалення, щоб не втратити історію.` },
      { status: 400 }
    );
  }
  if (act._count.packageItems > 0) {
    return NextResponse.json(
      { error: `«${act.nameUk}» входить до комплексних пропозицій — спершу приберіть її з комплексів.` },
      { status: 400 }
    );
  }

  await prisma.activityPrice.deleteMany({ where: { activityId: params.id } });
  await prisma.locationActivity.deleteMany({ where: { activityId: params.id } });
  await prisma.activity.delete({ where: { id: params.id } });

  await audit({
    actor: user,
    action: "DELETE",
    entity: "Activity",
    entityId: params.id,
    summary: `Видалено розвагу «${act.nameUk}»`,
    before: { nameUk: act.nameUk, key: act.key },
  });

  return NextResponse.json({ ok: true });
}
