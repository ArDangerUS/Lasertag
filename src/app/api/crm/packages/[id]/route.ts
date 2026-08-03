import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { z } from "zod";

export const dynamic = "force-dynamic";

const itemSchema = z.object({
  activityId: z.string().min(1),
  durationMin: z.number().int().min(15).max(600),
  parallel: z.boolean().default(false),
});

const schema = z.object({
  active: z.boolean().optional(),
  nameUk: z.string().min(1).max(160).optional(),
  nameRu: z.string().max(160).optional(),
  nameEn: z.string().max(160).optional(),
  locationId: z.string().min(1).optional(),
  maxPeople: z.number().int().min(1).max(999).optional(),
  extraPersonFee: z.number().int().min(0).max(100_000).optional(),
  fixedPriceWeekday: z.number().int().min(0).max(1_000_000).optional(),
  fixedPriceWeekend: z.number().int().min(0).max(1_000_000).optional(),
  perksUk: z.string().max(4000).optional(),
  perksRu: z.string().max(4000).optional(),
  perksEn: z.string().max(4000).optional(),
  // Повна заміна складу; порядок = порядок у масиві (паралельні — поза чергою)
  items: z.array(itemSchema).max(20).optional(),
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

  const before = await prisma.package.findUnique({
    where: { id: params.id },
    include: { items: { orderBy: { order: "asc" }, include: { activity: true } }, location: true },
  });
  if (!before) return NextResponse.json({ error: "Не знайдено" }, { status: 404 });

  if (d.locationId) {
    const loc = await prisma.location.findUnique({ where: { id: d.locationId } });
    if (!loc) return NextResponse.json({ error: "Локацію не знайдено" }, { status: 400 });
  }
  if (d.items) {
    const ids = Array.from(new Set(d.items.map((i) => i.activityId)));
    const count = await prisma.activity.count({ where: { id: { in: ids } } });
    if (count !== ids.length) {
      return NextResponse.json({ error: "Одна з розваг не існує" }, { status: 400 });
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.package.update({
      where: { id: params.id },
      data: {
        active: d.active ?? undefined,
        nameUk: d.nameUk ?? undefined,
        nameRu: d.nameRu ?? undefined,
        nameEn: d.nameEn ?? undefined,
        locationId: d.locationId ?? undefined,
        maxPeople: d.maxPeople ?? undefined,
        extraPersonFee: d.extraPersonFee ?? undefined,
        fixedPriceWeekday: d.fixedPriceWeekday ?? undefined,
        fixedPriceWeekend: d.fixedPriceWeekend ?? undefined,
        perksUk: d.perksUk ?? undefined,
        perksRu: d.perksRu ?? undefined,
        perksEn: d.perksEn ?? undefined,
      },
    });
    if (d.items) {
      await tx.packageItem.deleteMany({ where: { packageId: params.id } });
      let order = 10;
      for (const it of d.items) {
        await tx.packageItem.create({
          data: {
            packageId: params.id,
            activityId: it.activityId,
            durationMin: it.durationMin,
            // паралельні (банкет на весь час) завжди в кінці черги
            order: it.parallel ? 99 : order,
            parallel: it.parallel,
          },
        });
        if (!it.parallel) order += 10;
      }
    }
    return u;
  });

  const changes: string[] = [];
  if (d.nameUk != null && d.nameUk !== before.nameUk)
    changes.push(`назва: «${before.nameUk}» → «${d.nameUk}»`);
  if (d.fixedPriceWeekday != null && d.fixedPriceWeekday !== before.fixedPriceWeekday)
    changes.push(`будні: ${before.fixedPriceWeekday} → ${d.fixedPriceWeekday} грн`);
  if (d.fixedPriceWeekend != null && d.fixedPriceWeekend !== before.fixedPriceWeekend)
    changes.push(`вихідні: ${before.fixedPriceWeekend} → ${d.fixedPriceWeekend} грн`);
  if (d.maxPeople != null && d.maxPeople !== before.maxPeople)
    changes.push(`включено учасників: ${before.maxPeople} → ${d.maxPeople}`);
  if (d.extraPersonFee != null && d.extraPersonFee !== before.extraPersonFee)
    changes.push(`доплата за додаткового: ${before.extraPersonFee || "10%"} → ${d.extraPersonFee || "10%"}`);
  if (d.locationId && d.locationId !== before.locationId)
    changes.push("змінено локацію");
  if (d.items) {
    const oldList = before.items.map((i) => `${i.activity.nameUk} ${i.durationMin}хв`).join(", ");
    changes.push(`склад: [${oldList}] → ${d.items.length} позицій`);
  }
  if (d.active != null && d.active !== before.active)
    changes.push(d.active ? "показано на сайті" : "приховано з сайту");

  await audit({
    actor: user,
    action: "UPDATE",
    entity: "Комплекс",
    entityId: updated.id,
    summary: changes.length
      ? `«${before.nameUk}»: ${changes.join("; ")}`
      : `оновив(-ла) «${before.nameUk}»`,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user || !can(user.role, "editCatalog")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const pkg = await prisma.package.findUnique({ where: { id: params.id } });
  if (!pkg) return NextResponse.json({ error: "Не знайдено" }, { status: 404 });

  await prisma.packageItem.deleteMany({ where: { packageId: pkg.id } });
  await prisma.package.delete({ where: { id: pkg.id } });
  await audit({
    actor: user,
    action: "DELETE",
    entity: "Комплекс",
    entityId: pkg.id,
    summary: `видалив(-ла) комплекс «${pkg.nameUk}»`,
  });
  return NextResponse.json({ ok: true });
}
