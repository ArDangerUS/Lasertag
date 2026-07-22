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
  minPeople: z.number().int().min(1).max(200).optional(),
  maxPeople: z.number().int().min(1).max(200).optional(),
  cleanupMin: z.number().int().min(0).max(120).optional(),
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

  const before = await prisma.activity.findUnique({ where: { id: params.id } });
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

  await audit({
    actor: user,
    action: "UPDATE",
    entity: "Activity",
    entityId: updated.id,
    summary: `Оновлено розвагу «${updated.nameUk}»${
      parsed.data.active != null ? (parsed.data.active ? " (увімкнено)" : " (вимкнено)") : ""
    }`,
    before: { active: before.active, nameUk: before.nameUk },
    after: { active: updated.active, nameUk: updated.nameUk },
  });

  return NextResponse.json({ ok: true });
}
