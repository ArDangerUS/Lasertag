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
  sortOrder: z.number().int().min(0).max(999).optional(),
  // повна заміна переліку локацій, де сценарій доступний
  locationIds: z.array(z.string()).optional(),
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
  const d = parsed.data;

  const before = await prisma.activityVariant.findUnique({
    where: { id: params.id },
    include: { locations: true },
  });
  if (!before) return NextResponse.json({ error: "Не знайдено" }, { status: 404 });

  if (d.locationIds) {
    await prisma.activityVariantLocation.deleteMany({ where: { variantId: params.id } });
    if (d.locationIds.length) {
      await prisma.activityVariantLocation.createMany({
        data: d.locationIds.map((locationId) => ({ variantId: params.id, locationId })),
      });
    }
  }

  const updated = await prisma.activityVariant.update({
    where: { id: params.id },
    data: {
      active: d.active ?? undefined,
      nameUk: d.nameUk ?? undefined,
      nameRu: d.nameRu ?? undefined,
      nameEn: d.nameEn ?? undefined,
      sortOrder: d.sortOrder ?? undefined,
    },
  });

  const changes: string[] = [];
  if (d.nameUk != null && d.nameUk !== before.nameUk)
    changes.push(`назва: «${before.nameUk}» → «${d.nameUk}»`);
  if (d.locationIds) changes.push(`локації: ${before.locations.length} → ${d.locationIds.length}`);
  if (d.active != null && d.active !== before.active)
    changes.push(d.active ? "показано" : "приховано");

  await audit({
    actor: user,
    action: "UPDATE",
    entity: "Сценарій",
    entityId: updated.id,
    summary: changes.length
      ? `«${before.nameUk}»: ${changes.join("; ")}`
      : `оновив(-ла) сценарій «${before.nameUk}»`,
  });

  return NextResponse.json({ ok: true });
}

// Видалення сценарію. Броні не блокують: у позиції лишається знімок назви,
// а зв'язок обнуляється (onDelete: SetNull).
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user || !can(user.role, "editCatalog")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const variant = await prisma.activityVariant.findUnique({ where: { id: params.id } });
  if (!variant) return NextResponse.json({ error: "Не знайдено" }, { status: 404 });

  await prisma.activityVariant.delete({ where: { id: params.id } });
  await audit({
    actor: user,
    action: "DELETE",
    entity: "Сценарій",
    entityId: variant.id,
    summary: `видалив(-ла) сценарій «${variant.nameUk}»`,
  });

  return NextResponse.json({ ok: true });
}
