import { redirect } from "next/navigation";
import { getCurrentUser, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import SettingsClient from "@/components/crm/SettingsClient";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user || !can(user.role, "editCatalog")) redirect("/crm");

  const [activities, locations] = await Promise.all([
    prisma.activity.findMany({
      orderBy: { sortOrder: "asc" },
      include: { prices: true },
    }),
    prisma.location.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);

  const locName = new Map(locations.map((l) => [l.id, l.name]));

  return (
    <SettingsClient
      activities={activities.map((a) => ({
        id: a.id,
        key: a.key,
        nameUk: a.nameUk,
        nameRu: a.nameRu,
        nameEn: a.nameEn,
        icon: a.icon,
        active: a.active,
        perPerson: a.perPerson,
        minPeople: a.minPeople,
        maxPeople: a.maxPeople,
        cleanupMin: a.cleanupMin,
        prices: a.prices.map((p) => ({
          id: p.id,
          locationName: p.locationId ? locName.get(p.locationId) ?? "—" : "Базова (усі локації)",
          durationMin: p.durationMin,
          priceWeekday: p.priceWeekday,
          priceWeekend: p.priceWeekend,
        })),
      }))}
    />
  );
}
