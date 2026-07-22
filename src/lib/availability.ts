import { prisma } from "./prisma";
import { SLOT_STEP_MIN } from "./constants";

// Capacity per activity at a location. Banquet rooms run in parallel; a single
// arena runs one session at a time. This is intentionally simple and can be
// tuned per business rule later.
function capacityFor(activity: { category: string }, location: { banquetRooms: number }): number {
  if (activity.category === "room") return Math.max(1, location.banquetRooms);
  return 1;
}

export type BusyMap = Record<string, Set<number>>; // activityId -> set of busy start-minutes

// Compute, for a given location+date, which 30-min start slots are busy for each
// activity, taking existing (non-cancelled) bookings and their cleanup buffer
// into account. A slot i is "busy" for an activity if starting a new session at
// i would exceed capacity at any overlapping minute.
export async function computeBusy(locationId: string, date: string): Promise<{
  busyByActivity: Record<string, number[]>;
}> {
  const location = await prisma.location.findUnique({ where: { id: locationId } });
  if (!location) return { busyByActivity: {} };

  const acts = await prisma.locationActivity.findMany({
    where: { locationId, active: true },
    include: { activity: true },
  });

  const bookings = await prisma.booking.findMany({
    where: { locationId, date, status: { not: "CANCELLED" } },
    include: { items: true },
  });

  const open = location.openMin;
  const close = location.closeMin;
  const step = SLOT_STEP_MIN;

  const busyByActivity: Record<string, number[]> = {};

  for (const la of acts) {
    const activity = la.activity;
    const cap = capacityFor(activity, location);
    const cleanup = activity.cleanupMin;

    // Build an occupancy count per minute-slot from existing items of this activity.
    // occupied[minute] = number of concurrent sessions
    const occ: Record<number, number> = {};
    for (const b of bookings) {
      for (const it of b.items) {
        if (it.activityId !== activity.id) continue;
        const from = it.startMin;
        const to = it.startMin + it.durationMin + cleanup;
        for (let m = from; m < to; m += step) occ[m] = (occ[m] ?? 0) + 1;
      }
    }

    const busy: number[] = [];
    for (let i = open; i + activity.durationMin <= close; i += step) {
      // would a new session at i overflow capacity anywhere in its span?
      let overflow = false;
      for (let m = i; m < i + activity.durationMin; m += step) {
        if ((occ[m] ?? 0) >= cap) {
          overflow = true;
          break;
        }
      }
      if (overflow) busy.push(i);
    }
    busyByActivity[activity.id] = busy;
  }

  return { busyByActivity };
}
