import { prisma } from "./prisma";
import { SLOT_STEP_MIN } from "./constants";

// Capacity comes from LocationActivity.capacity — how many rooms/arenas the
// activity has at that location (Городок: 2 лазертаг-арени, 7 банкетних
// кімнат; Нивки: 2 банкетні зали; …). Editable in the CRM.

export type BusyMap = Record<string, Set<number>>; // activityId -> set of busy start-minutes

// Compute, for a given location+date, which 30-min start slots are busy for each
// activity, taking existing (non-cancelled) bookings and their cleanup buffer
// into account. A slot i is "busy" for an activity if starting a new session at
// i would exceed capacity at any overlapping minute.
// Also returns `occupiedByActivity`: the 30-min slots already at capacity — used
// to test arbitrary spans (e.g. package sequences and the banquet room).
export async function computeBusy(locationId: string, date: string): Promise<{
  busyByActivity: Record<string, number[]>;
  occupiedByActivity: Record<string, number[]>;
}> {
  const location = await prisma.location.findUnique({ where: { id: locationId } });
  if (!location) return { busyByActivity: {}, occupiedByActivity: {} };

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
  const occupiedByActivity: Record<string, number[]> = {};

  for (const la of acts) {
    const activity = la.activity;
    const cap = Math.max(1, la.capacity);
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

    // Slots at/over capacity (a new session cannot use these minutes).
    const occupied: number[] = [];
    for (let m = open; m < close; m += step) {
      if ((occ[m] ?? 0) >= cap) occupied.push(m);
    }
    occupiedByActivity[activity.id] = occupied;

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

  return { busyByActivity, occupiedByActivity };
}
