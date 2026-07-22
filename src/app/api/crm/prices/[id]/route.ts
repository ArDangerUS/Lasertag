import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({
  priceWeekday: z.number().int().min(0).max(1000000).optional(),
  priceWeekend: z.number().int().min(0).max(1000000).optional(),
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
  if (!parsed.success) return NextResponse.json({ error: "Перевірте ціни" }, { status: 400 });

  const before = await prisma.activityPrice.findUnique({
    where: { id: params.id },
    include: { activity: true },
  });
  if (!before) return NextResponse.json({ error: "Не знайдено" }, { status: 404 });

  const updated = await prisma.activityPrice.update({
    where: { id: params.id },
    data: {
      priceWeekday: parsed.data.priceWeekday ?? undefined,
      priceWeekend: parsed.data.priceWeekend ?? undefined,
    },
  });

  await audit({
    actor: user,
    action: "PRICE",
    entity: "ActivityPrice",
    entityId: updated.id,
    summary: `Ціна «${before.activity.nameUk}»${
      before.durationMin ? ` (${before.durationMin} хв)` : ""
    }: будні ${before.priceWeekday}→${updated.priceWeekday}, вихідні ${before.priceWeekend}→${updated.priceWeekend} грн`,
    before: { weekday: before.priceWeekday, weekend: before.priceWeekend },
    after: { weekday: updated.priceWeekday, weekend: updated.priceWeekend },
  });

  return NextResponse.json({ ok: true });
}
