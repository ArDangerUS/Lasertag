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
  subUk: z.string().max(300).optional(),
  subRu: z.string().max(300).optional(),
  subEn: z.string().max(300).optional(),
  // 0 = «ціна уточнюється» (торт, мерч)
  price: z.number().int().min(0).max(1_000_000).optional(),
  // qty -> price (години фотографа); повна заміна
  tiers: z.record(z.string(), z.number().int().min(0).max(1_000_000)).optional(),
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

  const before = await prisma.addon.findUnique({ where: { id: params.id } });
  if (!before) return NextResponse.json({ error: "Не знайдено" }, { status: 404 });

  const d = parsed.data;
  const updated = await prisma.addon.update({
    where: { id: params.id },
    data: {
      active: d.active ?? undefined,
      nameUk: d.nameUk ?? undefined,
      nameRu: d.nameRu ?? undefined,
      nameEn: d.nameEn ?? undefined,
      subUk: d.subUk ?? undefined,
      subRu: d.subRu ?? undefined,
      subEn: d.subEn ?? undefined,
      price: d.price ?? undefined,
      tiers: d.tiers !== undefined ? JSON.stringify(d.tiers) : undefined,
    },
  });

  const changes: string[] = [];
  if (d.nameUk != null && d.nameUk !== before.nameUk)
    changes.push(`назва: «${before.nameUk}» → «${d.nameUk}»`);
  if (d.price != null && d.price !== before.price)
    changes.push(`ціна: ${before.price} → ${d.price} грн`);
  if (d.tiers !== undefined && JSON.stringify(d.tiers) !== (before.tiers || "{}")) {
    const fmt = (s: string) =>
      Object.entries(JSON.parse(s || "{}") as Record<string, number>)
        .map(([q, p]) => `${q} год – ${p}`)
        .join(", ");
    changes.push(`тарифи: ${fmt(before.tiers)} → ${fmt(JSON.stringify(d.tiers))}`);
  }
  if (d.active != null && d.active !== before.active)
    changes.push(d.active ? "показано на сайті" : "приховано з сайту");

  await audit({
    actor: user,
    action: "UPDATE",
    entity: "Додаткова послуга",
    entityId: updated.id,
    summary: changes.length
      ? `«${before.nameUk}»: ${changes.join("; ")}`
      : `оновив(-ла) «${before.nameUk}»`,
    before: { price: before.price, active: before.active, tiers: before.tiers },
    after: { price: updated.price, active: updated.active, tiers: updated.tiers },
  });

  return NextResponse.json({ ok: true });
}
