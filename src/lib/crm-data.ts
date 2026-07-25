import { prisma } from "./prisma";

export type CrmBookingItem = {
  id: string;
  activityId: string;
  title: string;
  startMin: number;
  durationMin: number;
  people: number;
  price: number;
  roomId: string | null;
  roomName: string; // "Банкетна «Майнкрафт»" — порожньо, якщо кімнату не призначено
};

export type CrmBooking = {
  id: string;
  code: string;
  locationId: string;
  locationName: string;
  date: string;
  status: string;
  source: string;
  customerName: string;
  customerPhone: string;
  comment: string;
  people: number;
  totalPrice: number;
  prepaidAmount: number;
  telegramUsername: string;
  createdByName: string;
  items: CrmBookingItem[];
  addons: { id: string; title: string; qty: number; price: number }[];
};

export async function loadCrmBookings(fromISO: string, toISO: string): Promise<CrmBooking[]> {
  const rows = await prisma.booking.findMany({
    where: { date: { gte: fromISO, lte: toISO } },
    include: {
      location: true,
      items: { orderBy: { startMin: "asc" }, include: { room: true } },
      addons: true,
      createdBy: true,
    },
    orderBy: [{ date: "asc" }],
  });
  return rows.map((b) => ({
    id: b.id,
    code: b.code,
    locationId: b.locationId,
    locationName: b.location.name,
    date: b.date,
    status: b.status,
    source: b.source,
    customerName: b.customerName,
    customerPhone: b.customerPhone,
    comment: b.comment,
    people: b.people,
    totalPrice: b.totalPrice,
    prepaidAmount: b.prepaidAmount,
    telegramUsername: b.telegramUsername,
    createdByName: b.createdBy?.name ?? "",
    items: b.items.map((i) => ({
      id: i.id,
      activityId: i.activityId,
      title: i.title,
      startMin: i.startMin,
      durationMin: i.durationMin,
      people: i.people,
      price: i.price,
      roomId: i.roomId,
      roomName: i.room?.name ?? "",
    })),
    addons: b.addons.map((a) => ({ id: a.id, title: a.title, qty: a.qty, price: a.price })),
  }));
}

export type CrmCatalog = {
  locations: { id: string; name: string; slug: string; openMin: number; closeMin: number; isMobile: boolean }[];
  activities: {
    id: string;
    key: string;
    name: string;
    icon: string;
    perPerson: boolean;
    durationMin: number;
    durationOptions: number[];
    locationIds: string[];
    // rooms/arenas per location (parallel groups)
    capacityByLocation: Record<string, number>;
    // mapped physical room ids per location (empty = capacity model)
    roomIdsByLocation: Record<string, string[]>;
  }[];
  addons: { id: string; name: string; price: number }[];
};

export async function loadCrmCatalog(): Promise<CrmCatalog> {
  const [locations, activities, addons] = await Promise.all([
    prisma.location.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    prisma.activity.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
      include: {
        locations: { where: { active: true } },
        rooms: { include: { room: true } },
      },
    }),
    prisma.addon.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
  ]);
  return {
    locations: locations.map((l) => ({
      id: l.id,
      name: l.name,
      slug: l.slug,
      openMin: l.openMin,
      closeMin: l.closeMin,
      isMobile: l.isMobile,
    })),
    activities: activities.map((a) => ({
      id: a.id,
      key: a.key,
      name: a.nameUk,
      icon: a.icon,
      perPerson: a.perPerson,
      durationMin: a.durationMin,
      durationOptions: a.durationOptions ? (JSON.parse(a.durationOptions) as number[]) : [],
      locationIds: a.locations.map((x) => x.locationId),
      capacityByLocation: Object.fromEntries(
        a.locations.map((x) => {
          const mapped = a.rooms.filter((r) => r.room.locationId === x.locationId && r.room.active);
          return [x.locationId, mapped.length || x.capacity];
        })
      ),
      roomIdsByLocation: Object.fromEntries(
        a.locations.map((x) => [
          x.locationId,
          a.rooms.filter((r) => r.room.locationId === x.locationId && r.room.active).map((r) => r.room.id),
        ])
      ),
    })),
    addons: addons.map((a) => ({ id: a.id, name: a.nameUk, price: a.price })),
  };
}
