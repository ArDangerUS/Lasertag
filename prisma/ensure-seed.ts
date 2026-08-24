// Boot helper for hosting with an ephemeral filesystem (Heroku dynos):
// creates the schema and seeds ONLY when the database is empty, so a
// restart doesn't wipe data that already exists in a persistent DB.
//
// Для вже наповненої бази робиться «доливка» (topUp): нові довідникові
// записи, яких раніше не існувало, додаються без чіпання броней і цін.
import { execSync } from "child_process";
import { PrismaClient } from "@prisma/client";
import { ACTIVITY_VARIANTS } from "../src/lib/catalog";

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

  // 3. DREAM Yellow: квест більше не ділить арену з лазертагом — окрема
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
