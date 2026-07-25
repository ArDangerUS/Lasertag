import { prisma } from "./prisma";
import { SLOT_STEP_MIN } from "./constants";

// Room-based availability. An activity's sessions occupy one of its mapped
// rooms (ActivityRoom); activities that share a room (лазертаг + сценарний на
// одній арені, квест на арені Дріму) automatically block one another.
// Activities without mapped rooms fall back to LocationActivity.capacity.

export type BusyMap = Record<string, Set<number>>;

export async function computeBusy(locationId: string, date: string): Promise<{
  busyByActivity: Record<string, number[]>;
  occupiedByActivity: Record<string, number[]>;
}> {
  const location = await prisma.location.findUnique({ where: { id: locationId } });
  if (!location) return { busyByActivity: {}, occupiedByActivity: {} };

  const acts = await prisma.locationActivity.findMany({
    where: { locationId, active: true },
    include: {
      activity: {
        include: { rooms: { include: { room: true } } },
      },
    },
  });

  const bookings = await prisma.booking.findMany({
    where: { locationId, date, status: { not: "CANCELLED" } },
    include: { items: true },
  });
  const allItems = bookings.flatMap((b) => b.items);

  // cleanup buffer of the occupying item's activity
  const cleanupByActivity = new Map<string, number>();
  acts.forEach((la) => cleanupByActivity.set(la.activityId, la.activity.cleanupMin));

  const open = location.openMin;
  const close = location.closeMin;
  const step = SLOT_STEP_MIN;

  // Per-room occupancy count per slot (items that carry a roomId).
  const roomOcc: Record<string, Set<number>> = {}; // roomId -> occupied slots
  for (const it of allItems) {
    if (!it.roomId) continue;
    const cleanup = cleanupByActivity.get(it.activityId) ?? 0;
    const set = (roomOcc[it.roomId] ??= new Set<number>());
    for (let m = it.startMin; m < it.startMin + it.durationMin + cleanup; m += step) set.add(m);
  }

  const busyByActivity: Record<string, number[]> = {};
  const occupiedByActivity: Record<string, number[]> = {};

  for (const la of acts) {
    const activity = la.activity;
    const mappedRooms = activity.rooms
      .filter((r) => r.room.locationId === locationId && r.room.active)
      .map((r) => r.room.id);

    // Legacy/roomless items of THIS activity still consume one abstract slot.
    const roomlessOcc: Record<number, number> = {};
    for (const it of allItems) {
      if (it.roomId || it.activityId !== activity.id) continue;
      const cleanup = activity.cleanupMin;
      for (let m = it.startMin; m < it.startMin + it.durationMin + cleanup; m += step)
        roomlessOcc[m] = (roomlessOcc[m] ?? 0) + 1;
    }

    const cap = mappedRooms.length || Math.max(1, la.capacity);

    // A slot is fully occupied when every room (or capacity unit) is taken.
    const occupiedAt = (m: number): boolean => {
      if (mappedRooms.length) {
        const taken =
          mappedRooms.filter((r) => roomOcc[r]?.has(m)).length + (roomlessOcc[m] ?? 0);
        return taken >= cap;
      }
      // capacity fallback: count this activity's items only
      let count = roomlessOcc[m] ?? 0;
      for (const it of allItems) {
        if (!it.roomId || it.activityId !== activity.id) continue;
        const cleanup = activity.cleanupMin;
        if (m >= it.startMin && m < it.startMin + it.durationMin + cleanup) count++;
      }
      return count >= cap;
    };

    const occupied: number[] = [];
    for (let m = open; m < close; m += step) {
      if (occupiedAt(m)) occupied.push(m);
    }
    occupiedByActivity[activity.id] = occupied;

    const occupiedSet = new Set(occupied);
    const busy: number[] = [];
    for (let i = open; i + activity.durationMin <= close; i += step) {
      let overflow = false;
      for (let m = i; m < i + activity.durationMin; m += step) {
        if (occupiedSet.has(m)) {
          overflow = true;
          break;
        }
      }
      if (overflow) busy.push(i);
    }
    busyByActivity[activity.id] = busy;
  }

  return { busyByActivity, occupiedByActivity };
}
