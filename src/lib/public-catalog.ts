import { prisma } from "./prisma";
import { localizedName, localizedDesc, localizedSub } from "./i18n";
import type { Locale } from "./constants";

export type PubPrice = {
  locationId: string | null;
  durationMin: number | null;
  weekday: number;
  weekend: number;
};

export type PubActivity = {
  id: string;
  key: string;
  category: string;
  name: string;
  desc: string;
  icon: string;
  photo: string;
  perPerson: boolean;
  durationMin: number;
  durationOptions: number[];
  cleanupMin: number;
  minPeople: number;
  maxPeople: number;
  sortOrder: number;
  locationIds: string[];
  prices: PubPrice[];
};

export type PubLocation = {
  id: string;
  slug: string;
  name: string;
  address: string;
  openMin: number;
  closeMin: number;
  isMobile: boolean;
  banquetRooms: number;
  sortOrder: number;
};

export type PubAddon = { id: string; name: string; sub: string; price: number };

export type PubPackage = {
  id: string;
  name: string;
  desc: string;
  icon: string;
  fixedWeekday: number;
  fixedWeekend: number;
  itemActivityIds: string[];
};

export type PublicCatalog = {
  locations: PubLocation[];
  activities: PubActivity[];
  addons: PubAddon[];
  packages: PubPackage[];
};

export async function loadPublicCatalog(locale: Locale): Promise<PublicCatalog> {
  const [locations, activities, addons, packages] = await Promise.all([
    prisma.location.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    prisma.activity.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
      include: { locations: { where: { active: true } }, prices: true },
    }),
    prisma.addon.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    prisma.package.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
      include: { items: { orderBy: { order: "asc" } } },
    }),
  ]);

  return {
    locations: locations.map((l) => ({
      id: l.id,
      slug: l.slug,
      name: l.name,
      address: l.address,
      openMin: l.openMin,
      closeMin: l.closeMin,
      isMobile: l.isMobile,
      banquetRooms: l.banquetRooms,
      sortOrder: l.sortOrder,
    })),
    activities: activities.map((a) => ({
      id: a.id,
      key: a.key,
      category: a.category,
      name: localizedName(a, locale),
      desc: localizedDesc(a, locale),
      icon: a.icon,
      photo: a.photo,
      perPerson: a.perPerson,
      durationMin: a.durationMin,
      durationOptions: a.durationOptions ? (JSON.parse(a.durationOptions) as number[]) : [],
      cleanupMin: a.cleanupMin,
      minPeople: a.minPeople,
      maxPeople: a.maxPeople,
      sortOrder: a.sortOrder,
      locationIds: a.locations.map((x) => x.locationId),
      prices: a.prices.map((p) => ({
        locationId: p.locationId,
        durationMin: p.durationMin,
        weekday: p.priceWeekday,
        weekend: p.priceWeekend,
      })),
    })),
    addons: addons.map((a) => ({
      id: a.id,
      name: localizedName(a, locale),
      sub: localizedSub(a, locale),
      price: a.price,
    })),
    packages: packages.map((p) => ({
      id: p.id,
      name: localizedName(p, locale),
      desc: localizedDesc(p, locale),
      icon: p.icon,
      fixedWeekday: p.fixedPriceWeekday,
      fixedWeekend: p.fixedPriceWeekend,
      itemActivityIds: p.items.map((i) => i.activityId),
    })),
  };
}
