import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import {
  ACTIVITIES,
  ADDONS,
  LOCATIONS,
  PACKAGES,
} from "../src/lib/catalog";
import { resolvePrice, usesWeekendRate, makeCode } from "../src/lib/pricing";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding G-75 database…");

  // ---- wipe (dev only) ----
  await prisma.auditLog.deleteMany();
  await prisma.bookingAddon.deleteMany();
  await prisma.bookingItem.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.packageItem.deleteMany();
  await prisma.package.deleteMany();
  await prisma.activityPrice.deleteMany();
  await prisma.locationActivity.deleteMany();
  await prisma.addon.deleteMany();
  await prisma.activity.deleteMany();
  await prisma.location.deleteMany();
  await prisma.user.deleteMany();

  // ---- locations ----
  const locBySlug: Record<string, string> = {};
  for (const l of LOCATIONS) {
    const loc = await prisma.location.create({
      data: {
        slug: l.slug,
        name: l.name,
        address: l.address,
        openMin: l.openMin,
        closeMin: l.closeMin,
        isMobile: l.isMobile,
        banquetRooms: l.banquetRooms,
        hasShowRoom: l.hasShowRoom,
        sortOrder: l.sortOrder,
      },
    });
    locBySlug[l.slug] = loc.id;
  }
  console.log(`  ${LOCATIONS.length} locations`);

  // ---- activities + prices + location links ----
  const actByKey: Record<string, string> = {};
  for (const a of ACTIVITIES) {
    const act = await prisma.activity.create({
      data: {
        key: a.key,
        category: a.category,
        nameUk: a.nameUk,
        nameRu: a.nameRu,
        nameEn: a.nameEn,
        descUk: a.descUk,
        descRu: a.descRu,
        descEn: a.descEn,
        icon: a.icon,
        photo: a.photo ?? "",
        perPerson: a.perPerson,
        durationMin: a.durationMin,
        durationOptions: a.durationOptions ? JSON.stringify(a.durationOptions) : "",
        cleanupMin: a.cleanupMin ?? 0,
        minPeople: a.minPeople,
        maxPeople: a.maxPeople,
        sortOrder: a.sortOrder,
      },
    });
    actByKey[a.key] = act.id;

    for (const slug of a.locations) {
      await prisma.locationActivity.create({
        data: {
          locationId: locBySlug[slug],
          activityId: act.id,
          capacity: a.capacities?.[slug] ?? 1,
        },
      });
    }
    for (const p of a.prices) {
      await prisma.activityPrice.create({
        data: {
          activityId: act.id,
          locationId: p.locationSlug ? locBySlug[p.locationSlug] : null,
          durationMin: p.durationMin ?? null,
          priceWeekday: p.weekday,
          priceWeekend: p.weekend,
        },
      });
    }
  }
  console.log(`  ${ACTIVITIES.length} activities`);

  // ---- addons ----
  for (const ad of ADDONS) {
    const { tiers, ...rest } = ad as typeof ad & { tiers?: Record<number, number> };
    await prisma.addon.create({
      data: { ...rest, tiers: tiers ? JSON.stringify(tiers) : "" },
    });
  }
  console.log(`  ${ADDONS.length} addons`);

  // ---- packages (location-specific) ----
  for (const p of PACKAGES) {
    const pkg = await prisma.package.create({
      data: {
        key: p.key,
        locationId: locBySlug[p.locationSlug],
        nameUk: p.nameUk,
        nameRu: p.nameRu,
        nameEn: p.nameEn,
        perksUk: p.perksUk,
        icon: p.icon,
        maxPeople: p.maxPeople,
        fixedPriceWeekday: p.weekday,
        fixedPriceWeekend: p.weekend,
        sortOrder: p.sortOrder,
      },
    });
    for (const it of p.items) {
      await prisma.packageItem.create({
        data: {
          packageId: pkg.id,
          activityId: actByKey[it.key],
          durationMin: it.durationMin,
          order: it.order,
          parallel: it.parallel ?? false,
        },
      });
    }
  }
  console.log(`  ${PACKAGES.length} packages`);

  // ---- users ----
  const adminEmail = process.env.SEED_ADMIN_EMAIL || "admin@g75.local";
  const adminPass = process.env.SEED_ADMIN_PASSWORD || "admin12345";
  const admin = await prisma.user.create({
    data: {
      email: adminEmail,
      name: "Адміністратор",
      passwordHash: await bcrypt.hash(adminPass, 10),
      role: "ADMIN",
    },
  });
  const manager = await prisma.user.create({
    data: {
      email: "manager@g75.local",
      name: "Менеджер Оля",
      passwordHash: await bcrypt.hash("manager12345", 10),
      role: "MANAGER",
    },
  });
  await prisma.user.create({
    data: {
      email: "viewer@g75.local",
      name: "Перегляд",
      passwordHash: await bcrypt.hash("viewer12345", 10),
      role: "VIEWER",
    },
  });
  console.log(`  3 users (admin: ${adminEmail} / ${adminPass})`);

  // ---- demo bookings (current week) so the CRM calendar isn't empty ----
  // Deterministic PRNG (Date.now not available in seed on some runners anyway).
  let s = 20260711;
  const rand = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };

  const priceRowsByAct: Record<string, any[]> = {};
  for (const a of ACTIVITIES) {
    const rows = await prisma.activityPrice.findMany({ where: { activityId: actByKey[a.key] } });
    priceRowsByAct[a.key] = rows.map((r) => ({
      locationId: r.locationId,
      durationMin: r.durationMin,
      priceWeekday: r.priceWeekday,
      priceWeekend: r.priceWeekend,
    }));
  }

  // Anchor demo bookings to the Monday of the current week so the calendar
  // looks populated immediately after seeding.
  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const demoNames = [
    "Оксана Петренко", "Марина Шевчук", "Світлана Бондар", "Володимир Гнатюк",
    "Андрій Коваль", "Олег Савченко", "Катерина Лисенко", "Роман Дяченко",
    "Наталія Кравець", "Ігор Ткаченко", "Тетяна Руденко", "Аліна Захарчук",
    "Денис Романюк", "ТОВ «Промресурс»", "Юлія Мельник",
  ];
  const phones = [
    "+380672451830", "+380503319012", "+380687742009", "+380639172540",
    "+380935127741", "+380961184255", "+380442907100", "+380974826114",
  ];
  const statuses = ["NEW", "CONFIRMED", "PREPAID", "CONFIRMED", "CONFIRMED", "CANCELLED"];
  const demoActs = ["laser", "scenario", "quest", "papershow", "banquet", "maze"];
  const locSlugs = ["nyvky", "gorodok", "new-way", "dream-yellow"];

  let created = 0;
  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const date = new Date(monday);
    date.setDate(monday.getDate() + dayOffset);
    const iso = date.toISOString().slice(0, 10);
    const perDay = 2 + Math.floor(rand() * 3);
    for (let k = 0; k < perDay; k++) {
      const slug = locSlugs[Math.floor(rand() * locSlugs.length)];
      const actKey = demoActs[Math.floor(rand() * demoActs.length)];
      const act = ACTIVITIES.find((a) => a.key === actKey)!;
      if (!act.locations.includes(slug)) continue;
      const people = 8 + Math.floor(rand() * 14);
      const dur = act.durationOptions ? (rand() > 0.5 ? 60 : 30) : act.durationMin;
      const startMin = (10 + Math.floor(rand() * 8)) * 60; // 10:00–18:00
      const unit = resolvePrice(priceRowsByAct[actKey], {
        locationId: locBySlug[slug],
        durationMin: act.durationOptions ? dur : null,
        date: iso,
      }) ?? 0;
      const price = act.perPerson ? unit * people : unit;
      const status = statuses[Math.floor(rand() * statuses.length)];
      const name = demoNames[Math.floor(rand() * demoNames.length)];

      await prisma.booking.create({
        data: {
          code: makeCode(rand),
          locationId: locBySlug[slug],
          date: iso,
          status,
          source: "CRM",
          customerName: name,
          customerPhone: phones[Math.floor(rand() * phones.length)],
          people,
          totalPrice: price,
          prepaidAmount: status === "PREPAID" ? 1000 : 0,
          createdById: rand() > 0.5 ? admin.id : manager.id,
          items: {
            create: [
              {
                activityId: actByKey[actKey],
                title: act.nameUk,
                startMin,
                durationMin: dur,
                people,
                price,
              },
            ],
          },
        },
      });
      created++;
    }
  }
  console.log(`  ${created} demo bookings (week of ${monday.toISOString().slice(0, 10)})`);
  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
