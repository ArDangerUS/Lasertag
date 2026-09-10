// Boot helper for hosting with an ephemeral filesystem (Heroku dynos):
// creates the schema and seeds ONLY when the database is empty, so a
// restart doesn't wipe data that already exists in a persistent DB.
//
// Для вже наповненої бази робиться «доливка» (topUp): нові довідникові
// записи, яких раніше не існувало, додаються без чіпання броней і цін.
import { execSync } from "child_process";
import { PrismaClient } from "@prisma/client";
import { ACTIVITIES, ACTIVITY_ROOMS, ACTIVITY_VARIANTS } from "../src/lib/catalog";

const prisma = new PrismaClient();

// Ідемпотентні доповнення каталогу для баз, які сідились до появи фічі.
async function topUp() {
  // 1. Сценарії квестів (ActivityVariant з'явився пізніше за решту каталогу).
  const haveVariants = await prisma.activityVariant.count();
  if (haveVariants === 0) {
    const activities = await prisma.activity.findMany({ select: { id: true, key: true } });
    const actByKey = Object.fromEntries(activities.map((a) => [a.key, a.id]));
    const locations = await prisma.location.findMany({ select: { id: true, slug: true } });
    const locBySlug = Object.fromEntries(locations.map((l) => [l.slug, l.id]));
    let added = 0;
    for (const v of ACTIVITY_VARIANTS) {
      if (!actByKey[v.activityKey]) continue;
      await prisma.activityVariant.create({
        data: {
          id: `var-${v.key}`,
          key: v.key,
          activityId: actByKey[v.activityKey],
          nameUk: v.nameUk,
          nameRu: v.nameRu,
          nameEn: v.nameEn,
          sortOrder: v.sortOrder,
          locations: {
            create: v.locationSlugs
              .filter((slug) => locBySlug[slug])
              .map((slug) => ({ locationId: locBySlug[slug] })),
          },
        },
      });
      added++;
    }
    if (added) console.log(`Top-up: added ${added} activity variants.`);
  }

  // 2. Банкетну кімнату тепер можна брати на весь час свята. Розширюємо
  //    список тривалостей, лише якщо його не міняли руками в налаштуваннях.
  const banquet = await prisma.activity.findUnique({ where: { key: "banquet" } });
  if (banquet && banquet.durationOptions.replace(/\s/g, "") === "[30,60]") {
    await prisma.activity.update({
      where: { id: banquet.id },
      data: {
        durationOptions: JSON.stringify([30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330, 360]),
      },
    });
    console.log("Top-up: banquet duration options widened to 6 hours.");
  }

  // 3. Доплата за учасників понад ліміт розваги (квест: +500 за кожного).
  //    Застосовуємо один раз: якщо в жодної розваги ставки ще немає.
  const withFee = await prisma.activity.count({ where: { extraPersonFee: { gt: 0 } } });
  if (withFee === 0) {
    for (const a of ACTIVITIES) {
      if (!a.extraPersonFee) continue;
      const updated = await prisma.activity.updateMany({
        where: { key: a.key },
        data: { extraPersonFee: a.extraPersonFee },
      });
      if (updated.count) console.log(`Top-up: ${a.key} extra person fee = ${a.extraPersonFee}`);
    }
  }

  // 4. Нові розваги з каталогу, яких у базі ще немає (шоу-програми,
  //    майстер-класи). Наявні не чіпаємо — їх могли редагувати в CRM.
  const known = new Set((await prisma.activity.findMany({ select: { key: true } })).map((a) => a.key));
  const missing = ACTIVITIES.filter((a) => !known.has(a.key));
  if (missing.length) {
    const locs = await prisma.location.findMany({ select: { id: true, slug: true } });
    const locBySlug = Object.fromEntries(locs.map((l) => [l.slug, l.id]));
    const rooms = await prisma.room.findMany({ select: { id: true, key: true, locationId: true } });
    const roomByRef = Object.fromEntries(
      rooms.map((r) => {
        const slug = locs.find((l) => l.id === r.locationId)?.slug ?? "";
        return [`${slug}:${r.key}`, r.id];
      })
    );
    for (const a of missing) {
      const act = await prisma.activity.create({
        data: {
          id: `act-${a.key}`,
          key: a.key,
          category: a.category,
          nameUk: a.nameUk,
          nameRu: a.nameRu,
          nameEn: a.nameEn,
          descUk: a.descUk,
          descRu: a.descRu,
          descEn: a.descEn,
          icon: a.icon,
          perPerson: a.perPerson,
          durationMin: a.durationMin,
          durationOptions: a.durationOptions ? JSON.stringify(a.durationOptions) : "",
          cleanupMin: a.cleanupMin ?? 0,
          minPeople: a.minPeople,
          maxPeople: a.maxPeople,
          extraPersonFee: a.extraPersonFee ?? 0,
          crmOnly: a.crmOnly ?? false,
          sortOrder: a.sortOrder,
          active: !a.hidden,
          locations: {
            create: a.locations
              .filter((slug) => locBySlug[slug])
              .map((slug) => ({
                locationId: locBySlug[slug],
                capacity: a.capacities?.[slug] ?? 1,
              })),
          },
          prices: {
            create: a.prices.map((p) => ({
              locationId: p.locationSlug ? locBySlug[p.locationSlug] : null,
              durationMin: p.durationMin ?? null,
              priceWeekday: p.weekday,
              priceWeekend: p.weekend,
            })),
          },
          rooms: {
            create: (ACTIVITY_ROOMS[a.key] ?? [])
              .filter((ref) => roomByRef[ref])
              .map((ref) => ({ roomId: roomByRef[ref] })),
          },
        },
      });
      console.log(`Top-up: added activity ${act.key}`);
    }
  }

  // 5. Кімнати сценаріїв: «Хованки» проводяться на лазертаг-арені, а не в
  //    квест-кімнаті, тож займають саме арену.
  const variantRooms = await prisma.activityVariantRoom.count();
  if (variantRooms === 0) {
    const locs2 = await prisma.location.findMany({ select: { id: true, slug: true } });
    const rooms2 = await prisma.room.findMany({ select: { id: true, key: true, locationId: true } });
    const refOf = (r: { key: string; locationId: string }) =>
      `${locs2.find((l) => l.id === r.locationId)?.slug ?? ""}:${r.key}`;
    let links = 0;
    for (const v of ACTIVITY_VARIANTS) {
      if (!v.roomRefs?.length) continue;
      const variant = await prisma.activityVariant.findUnique({ where: { key: v.key } });
      if (!variant) continue;
      for (const ref of v.roomRefs) {
        const room = rooms2.find((r) => refOf(r) === ref);
        if (!room) continue;
        await prisma.activityVariantRoom.create({
          data: { variantId: variant.id, roomId: room.id },
        });
        links++;
      }
    }
    if (links) console.log(`Top-up: ${links} variant-room links (Хованки → арена).`);
  }

  // 6. DREAM Yellow: квест більше не ділить арену з лазертагом — окрема
  //    кімната, тож обидві розваги можуть іти одночасно.
  const dream = await prisma.location.findUnique({ where: { slug: "dream-yellow" } });
  const quest = await prisma.activity.findUnique({ where: { key: "quest" } });
  if (dream && quest) {
    const existing = await prisma.room.findUnique({
      where: { locationId_key: { locationId: dream.id, key: "quest" } },
    });
    if (!existing) {
      const last = await prisma.room.findFirst({
        where: { locationId: dream.id },
        orderBy: { sortOrder: "desc" },
      });
      const questRoom = await prisma.room.create({
        data: {
          locationId: dream.id,
          key: "quest",
          name: "Квест-кімната",
          sortOrder: (last?.sortOrder ?? 0) + 1,
        },
      });
      const arena = await prisma.room.findUnique({
        where: { locationId_key: { locationId: dream.id, key: "arena" } },
      });
      if (arena) {
        // наявні квест-броні переїжджають у нову кімнату, інакше вони й далі
        // блокували б лазертаг
        const moved = await prisma.bookingItem.updateMany({
          where: { activityId: quest.id, roomId: arena.id },
          data: { roomId: questRoom.id },
        });
        await prisma.activityRoom.deleteMany({
          where: { activityId: quest.id, roomId: arena.id },
        });
        await prisma.room.update({
          where: { id: arena.id },
          data: { name: "Лазертаг-арена", note: "" },
        });
        console.log(`Top-up: DREAM quest room split off (${moved.count} items moved).`);
      }
      await prisma.activityRoom.create({
        data: { activityId: quest.id, roomId: questRoom.id },
      });
    }
  }
}

async function main() {
  let users = 0;
  try {
    users = await prisma.user.count();
  } catch {
    // table doesn't exist yet — treat as empty
  }
  if (users > 0) {
    console.log("DB already has data — skipping seed.");
    await topUp();
    return;
  }
  console.log("Empty database — running seed…");
  execSync("npx tsx prisma/seed.ts", { stdio: "inherit" });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
