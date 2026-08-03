import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { randomUUID } from "crypto";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({
  nameUk: z.string().min(1).max(160),
  nameRu: z.string().max(160).default(""),
  nameEn: z.string().max(160).default(""),
  locationIds: z.array(z.string().min(1)).min(1).max(10),
  maxPeople: z.number().int().min(1).max(999),
  // 0 = стандартне правило 10% від ціни комплексу
  extraPersonFee: z.number().int().min(0).max(100_000).default(0),
  fixedPriceWeekday: z.number().int().min(0).max(1_000_000),
  fixedPriceWeekend: z.number().int().min(0).max(1_000_000),
});

// Створення комплексу. Склад розваг додається в картці після створення.
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

  const locs = await prisma.location.findMany({ where: { id: { in: parsed.data.locationIds } } });
  if (locs.length !== parsed.data.locationIds.length) {
    return NextResponse.json({ error: "Локацію не знайдено" }, { status: 400 });
  }

  const last = await prisma.package.findFirst({ orderBy: { sortOrder: "desc" } });
  const pkg = await prisma.package.create({
    data: {
      key: `custom-${randomUUID().slice(0, 8)}`,
      nameUk: parsed.data.nameUk,
      nameRu: parsed.data.nameRu,
      nameEn: parsed.data.nameEn,
      locations: { create: parsed.data.locationIds.map((locationId) => ({ locationId })) },
      maxPeople: parsed.data.maxPeople,
      extraPersonFee: parsed.data.extraPersonFee,
      fixedPriceWeekday: parsed.data.fixedPriceWeekday,
      fixedPriceWeekend: parsed.data.fixedPriceWeekend,
      sortOrder: (last?.sortOrder ?? 0) + 1,
    },
  });

  await audit({
    actor: user,
    action: "CREATE",
    entity: "Комплекс",
    entityId: pkg.id,
    summary: `створив(-ла) комплекс «${pkg.nameUk}» (${locs.map((l) => l.name).join(", ")}, ${pkg.fixedPriceWeekday}/${pkg.fixedPriceWeekend} грн)`,
  });

  return NextResponse.json({ ok: true, id: pkg.id });
}
