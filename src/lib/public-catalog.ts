import { prisma } from "./prisma";
import { localizedName, localizedDesc, localizedSub } from "./i18n";
import { publicFilePhoto } from "./photo-files";
import type { Locale } from "./constants";

function perksFor(
  p: { perksUk: string; perksRu: string; perksEn: string },
  locale: Locale
): string {
  if (locale === "ru") return p.perksRu || p.perksUk;
  if (locale === "en") return p.perksEn || p.perksUk;
  return p.perksUk;
}

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

export type PubAddon = {
  id: string;
  key: string; // machine key ("arena" has special behaviour)
  name: string;
  sub: string;
  price: number; // 0 => "ціна уточнюється"
  tiers: Record<string, number> | null; // qty -> price (photographer hours)
  photo: string; // uploaded via CRM ("" = none; tile renders without photo)
};

export type PubPackageItem = { activityId: string; durationMin: number; order: number; parallel: boolean };
export type PubPackage = {
  id: string;
  locationId: string | null;
  name: string;
  perks: string[];
  icon: string;
  maxPeople: number;
  extraPersonFee: number; // грн/особу понад maxPeople; 0 = 10% від ціни комплексу
  fixedWeekday: number;
  fixedWeekend: number;
  items: PubPackageItem[];
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
      include: {
        locations: { where: { active: true } },
        prices: true,
        // only the timestamp — the bytes are served by /api/photos/[id]
        photoBlob: { select: { updatedAt: true } },
      },
    }),
    prisma.addon.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
      include: { photoBlob: { select: { updatedAt: true } } },
    }),
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
      photo: a.photoBlob ? `/api/photos/${a.id}?v=${a.photoBlob.updatedAt.getTime()}` : a.photo,
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
      key: a.key,
      name: localizedName(a, locale),
      sub: localizedSub(a, locale),
      price: a.price,
      tiers: a.tiers ? (JSON.parse(a.tiers) as Record<string, number>) : null,
      photo: a.photoBlob
        ? `/api/addon-photos/${a.id}?v=${a.photoBlob.updatedAt.getTime()}`
        : publicFilePhoto("addons", a.key),
    })),
    packages: packages.map((p) => ({
      id: p.id,
      locationId: p.locationId,
      name: localizedName(p, locale),
      perks: perksFor(p, locale)
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      icon: p.icon,
      maxPeople: p.maxPeople,
      extraPersonFee: p.extraPersonFee,
      fixedWeekday: p.fixedPriceWeekday,
      fixedWeekend: p.fixedPriceWeekend,
      items: p.items.map((i) => ({
        activityId: i.activityId,
        durationMin: i.durationMin,
        order: i.order,
        parallel: i.parallel,
      })),
    })),
  };
}
