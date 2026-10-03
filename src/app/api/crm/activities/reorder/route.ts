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
    select: { id: true, nameUk: true },
    orderBy: { sortOrder: "asc" },
  });
  if (found.length !== ids.length) {
    return NextResponse.json({ error: "Розвагу не знайдено — оновіть сторінку" }, { status: 404 });
  }

  // Нічого не переставили — не засмічуємо журнал порожнім записом.
  const wasOrder = found.map((a) => a.id);
  if (wasOrder.length === ids.length && wasOrder.every((id, i) => id === ids[i])) {
    return NextResponse.json({ ok: true, unchanged: true });
  }

  await prisma.$transaction(
    ids.map((id, i) => prisma.activity.update({ where: { id }, data: { sortOrder: i + 1 } }))
  );

  // Пишемо, що саме змінилось: лише ті розваги, які реально переїхали.
  const nameOf = new Map(found.map((a) => [a.id, a.nameUk]));
  const wasAt = new Map(wasOrder.map((id, i) => [id, i]));
  const movedNames = ids
    .map((id, i) => ({ id, from: wasAt.get(id) ?? i, to: i }))
    .filter((x) => x.from !== x.to)
    .map((x) => `«${nameOf.get(x.id)}» ${x.from + 1}→${x.to + 1}`);
  await audit({
    actor: user,
    action: "UPDATE",
    entity: "Activity",
    entityId: "order",
    summary:
      `Змінено порядок розваг: ` +
      movedNames.slice(0, 6).join(", ") +
      (movedNames.length > 6 ? ` та ще ${movedNames.length - 6}` : ""),
  });

  return NextResponse.json({ ok: true });
}
