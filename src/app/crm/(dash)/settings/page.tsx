import { redirect } from "next/navigation";
import { getCurrentUser, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import SettingsClient from "@/components/crm/SettingsClient";
import { publicFilePhoto } from "@/lib/photo-files";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user || !can(user.role, "editCatalog")) redirect("/crm");

  const [activities, locations, addons, packages] = await Promise.all([
    prisma.activity.findMany({
      orderBy: { sortOrder: "asc" },
      include: { prices: true, locations: true, photoBlob: { select: { updatedAt: true } } },
    }),
    prisma.location.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.addon.findMany({
      orderBy: { sortOrder: "asc" },
      include: { photoBlob: { select: { updatedAt: true } } },
    }),
    prisma.package.findMany({
      orderBy: { sortOrder: "asc" },
      include: { items: { orderBy: { order: "asc" } } },
    }),
  ]);

  const locName = new Map(locations.map((l) => [l.id, l.name]));

  return (
    <SettingsClient
      locations={locations.map((l) => ({ id: l.id, name: l.name }))}
      activities={activities.map((a) => ({
        id: a.id,
        key: a.key,
        nameUk: a.nameUk,
        nameRu: a.nameRu,
        nameEn: a.nameEn,
        icon: a.icon,
        active: a.active,
        photoUrl: a.photoBlob ? `/api/photos/${a.id}?v=${a.photoBlob.updatedAt.getTime()}` : "",
        perPerson: a.perPerson,
        minPeople: a.minPeople,
        maxPeople: a.maxPeople,
        cleanupMin: a.cleanupMin,
        locations: a.locations.map((x) => ({ locationId: x.locationId, capacity: x.capacity })),
        prices: a.prices.map((p) => ({
          id: p.id,
          locationName: p.locationId ? locName.get(p.locationId) ?? "—" : "Базова (усі локації)",
          durationMin: p.durationMin,
          priceWeekday: p.priceWeekday,
          priceWeekend: p.priceWeekend,
        })),
      }))}
      addons={addons.map((a) => ({
        id: a.id,
        key: a.key,
        nameUk: a.nameUk,
        nameRu: a.nameRu,
        nameEn: a.nameEn,
        subUk: a.subUk,
        active: a.active,
        price: a.price,
        tiers: a.tiers ? (JSON.parse(a.tiers) as Record<string, number>) : null,
        photoUrl: a.photoBlob ? `/api/addon-photos/${a.id}?v=${a.photoBlob.updatedAt.getTime()}` : "",
        filePhoto: publicFilePhoto("addons", a.key),
      }))}
      packages={packages.map((p) => ({
        id: p.id,
        nameUk: p.nameUk,
        nameRu: p.nameRu,
        nameEn: p.nameEn,
        icon: p.icon,
        active: p.active,
        locationId: p.locationId ?? "",
        maxPeople: p.maxPeople,
        extraPersonFee: p.extraPersonFee,
        fixedPriceWeekday: p.fixedPriceWeekday,
        fixedPriceWeekend: p.fixedPriceWeekend,
        perksUk: p.perksUk,
        perksRu: p.perksRu,
        perksEn: p.perksEn,
        items: p.items.map((i) => ({
          activityId: i.activityId,
          durationMin: i.durationMin,
          parallel: i.parallel,
        })),
      }))}
      activityOptions={activities.map((a) => ({
        id: a.id,
        name: a.nameUk,
        icon: a.icon,
        locationIds: a.locations.map((x) => x.locationId),
        durationMin: a.durationMin,
      }))}
    />
  );
}
