import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({ ids: z.array(z.string()).min(1).max(200) });

// Порядок розваг: у цьому порядку вони йдуть колонками в денному календарі
// і плитками на сайті. Нові розваги дописуються в кінець, тож після
// створення їх треба мати змогу переставити.
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
  if (!parsed.success) return NextResponse.json({ error: "Перевірте дані" }, { status: 400 });
  const ids = parsed.data.ids;

  const found = await prisma.activity.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });
  if (found.length !== ids.length) {
    return NextResponse.json({ error: "Розвагу не знайдено — оновіть сторінку" }, { status: 404 });
  }

  await prisma.$transaction(
    ids.map((id, i) => prisma.activity.update({ where: { id }, data: { sortOrder: i + 1 } }))
  );

  await audit({
    actor: user,
    action: "UPDATE",
    entity: "Activity",
    entityId: "order",
    summary: `Змінено порядок розваг (${ids.length})`,
  });

  return NextResponse.json({ ok: true });
}
