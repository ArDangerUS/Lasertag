import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { z } from "zod";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  nameUk: z.string().min(1).max(160),
  nameRu: z.string().max(160).default(""),
  nameEn: z.string().max(160).default(""),
  descUk: z.string().max(1000).default(""),
  icon: z.string().max(8).default("🎈"),
  category: z.enum(["game", "show", "room"]).default("game"),
  perPerson: z.boolean().default(false),
  // flexible=true → 30-хв слоти з обʼєднанням (потрібні ціни за 30 і 60 хв)
  flexible: z.boolean().default(false),
  durationMin: z.number().int().min(10).max(600).default(60),
  cleanupMin: z.number().int().min(0).max(120).default(0),
  minPeople: z.number().int().min(1).max(999).default(1),
  maxPeople: z.number().int().min(1).max(999).default(999),
  priceWeekday: z.number().int().min(0),
  priceWeekend: z.number().int().min(0),
  price30Weekday: z.number().int().min(0).optional(),
  price30Weekend: z.number().int().min(0).optional(),
  locations: z
    .array(z.object({ locationId: z.string(), capacity: z.number().int().min(1).max(50).default(1) }))
    .min(1),
});

// Create a new activity from the CRM (admin only).
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
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Перевірте поля форми" }, { status: 400 });
  }
  const d = parsed.data;

  // unique machine key from the name
  const base =
    d.nameUk
      .toLowerCase()
      .replace(/[^a-zа-яіїєґ0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "activity";
  let key = base;
  for (let n = 2; await prisma.activity.findUnique({ where: { key } }); n++) {
    key = `${base}-${n}`;
  }

  const maxSort = await prisma.activity.aggregate({ _max: { sortOrder: true } });

  const act = await prisma.activity.create({
    data: {
      key,
      category: d.category,
      nameUk: d.nameUk,
      nameRu: d.nameRu,
      nameEn: d.nameEn,
      descUk: d.descUk,
      icon: d.icon,
      perPerson: d.perPerson,
      durationMin: d.flexible ? 30 : d.durationMin,
      durationOptions: d.flexible ? JSON.stringify([30, 60]) : "",
      cleanupMin: d.cleanupMin,
      minPeople: d.minPeople,
      maxPeople: d.maxPeople,
      sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
    },
  });

  // Prices: flexible → 30- and 60-min rows; fixed → a single base row.
  if (d.flexible) {
    await prisma.activityPrice.create({
      data: {
        activityId: act.id,
        durationMin: 30,
        priceWeekday: d.price30Weekday ?? Math.round(d.priceWeekday / 2),
        priceWeekend: d.price30Weekend ?? Math.round(d.priceWeekend / 2),
      },
    });
    await prisma.activityPrice.create({
      data: {
        activityId: act.id,
        durationMin: 60,
        priceWeekday: d.priceWeekday,
        priceWeekend: d.priceWeekend,
      },
    });
  } else {
    await prisma.activityPrice.create({
      data: { activityId: act.id, priceWeekday: d.priceWeekday, priceWeekend: d.priceWeekend },
    });
  }

  const validLocs = await prisma.location.findMany({
    where: { id: { in: d.locations.map((l) => l.locationId) } },
    select: { id: true, name: true },
  });
  const capOf = new Map(d.locations.map((l) => [l.locationId, l.capacity]));
  for (const loc of validLocs) {
    await prisma.locationActivity.create({
      data: { activityId: act.id, locationId: loc.id, capacity: capOf.get(loc.id) ?? 1 },
    });
  }

  await audit({
    actor: user,
    action: "CREATE",
    entity: "Activity",
    entityId: act.id,
    summary: `Створено розвагу «${act.nameUk}» (${d.flexible ? "30/60 хв" : `${d.durationMin} хв`}, ${
      d.perPerson ? "за людину" : "за компанію"
    }) · локації: ${validLocs.map((l) => l.name).join(", ")}`,
    after: { nameUk: act.nameUk, key: act.key },
  });

  return NextResponse.json({ ok: true, id: act.id });
}
