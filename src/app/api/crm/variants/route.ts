import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getCurrentUser, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({
  activityId: z.string(),
  nameUk: z.string().min(1).max(160),
  nameRu: z.string().max(160).default(""),
  nameEn: z.string().max(160).default(""),
  locationIds: z.array(z.string()).default([]),
});

// Створити сценарій розваги (наприклад, ще один квест).
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

  const last = await prisma.activityVariant.findFirst({
    where: { activityId: d.activityId },
    orderBy: { sortOrder: "desc" },
  });
  const variant = await prisma.activityVariant.create({
    data: {
      key: `custom-${randomUUID().slice(0, 8)}`,
      activityId: d.activityId,
      nameUk: d.nameUk,
      nameRu: d.nameRu,
      nameEn: d.nameEn,
      sortOrder: (last?.sortOrder ?? 0) + 1,
      locations: { create: d.locationIds.map((locationId) => ({ locationId })) },
    },
  });

  await audit({
    actor: user,
    action: "CREATE",
    entity: "Сценарій",
    entityId: variant.id,
    summary: `додав(-ла) сценарій «${variant.nameUk}» до «${activity.nameUk}»`,
  });

  return NextResponse.json({ ok: true, id: variant.id });
}
