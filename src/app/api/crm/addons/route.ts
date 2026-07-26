import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getCurrentUser, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({
  nameUk: z.string().min(1).max(160),
  nameRu: z.string().max(160).default(""),
  nameEn: z.string().max(160).default(""),
  subUk: z.string().max(300).default(""),
  // 0 = «ціна уточнюється»
  price: z.number().int().min(0).max(1_000_000),
});

// Create a new addon («Додайте до свята» tile).
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

  const last = await prisma.addon.findFirst({ orderBy: { sortOrder: "desc" } });
  const addon = await prisma.addon.create({
    data: {
      key: `custom-${randomUUID().slice(0, 8)}`,
      nameUk: parsed.data.nameUk,
      nameRu: parsed.data.nameRu,
      nameEn: parsed.data.nameEn,
      subUk: parsed.data.subUk,
      price: parsed.data.price,
      sortOrder: (last?.sortOrder ?? 0) + 1,
    },
  });

  await audit({
    actor: user,
    action: "CREATE",
    entity: "Додаткова послуга",
    entityId: addon.id,
    summary: `створив(-ла) послугу «${addon.nameUk}» (${addon.price} грн)`,
  });

  return NextResponse.json({ ok: true, id: addon.id });
}
