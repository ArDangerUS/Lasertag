import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({
  activityId: z.string(),
  // null = базова ціна для всіх локацій
  locationId: z.string().nullable().default(null),
  // null = розвага з фіксованою тривалістю
  durationMin: z.number().int().min(10).max(600).nullable().default(null),
  priceWeekday: z.number().int().min(0).max(1_000_000),
  priceWeekend: z.number().int().min(0).max(1_000_000),
});

// Окрема ціна для локації: лазертаг коштує по-різному на Нивках і в Городку.
// Рядок із locationId перекриває базовий для цієї локації.
export async function POST(req: NextRequest) {
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

  const activity = await prisma.activity.findUnique({ where: { id: d.activityId } });
  if (!activity) return NextResponse.json({ error: "Розвагу не знайдено" }, { status: 404 });

  if (d.locationId) {
    const offered = await prisma.locationActivity.findFirst({
      where: { activityId: d.activityId, locationId: d.locationId },
    });
    if (!offered) {
      return NextResponse.json({ error: "Ця розвага не проводиться на обраній локації" }, { status: 400 });
    }
  }

  const dup = await prisma.activityPrice.findFirst({
    where: { activityId: d.activityId, locationId: d.locationId, durationMin: d.durationMin },
  });
  if (dup) {
    return NextResponse.json(
      { error: "Така ціна вже є — відредагуйте наявний рядок" },
      { status: 409 }
    );
  }

  const row = await prisma.activityPrice.create({
    data: {
      activityId: d.activityId,
      locationId: d.locationId,
      durationMin: d.durationMin,
      priceWeekday: d.priceWeekday,
      priceWeekend: d.priceWeekend,
    },
  });

  const locName = d.locationId
    ? (await prisma.location.findUnique({ where: { id: d.locationId } }))?.name ?? "локація"
    : "усі локації";
  await audit({
    actor: user,
    action: "PRICE",
    entity: "ActivityPrice",
    entityId: row.id,
    summary: `Додано ціну «${activity.nameUk}» для «${locName}»${
      d.durationMin ? ` (${d.durationMin} хв)` : ""
    }: будні ${d.priceWeekday}, вихідні ${d.priceWeekend} грн`,
  });

  return NextResponse.json({ ok: true, id: row.id });
}
