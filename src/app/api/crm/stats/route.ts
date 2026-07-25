import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Revenue statistics for a date range: totals, by location, by activity
// (category), by day. Cancelled bookings are excluded everywhere.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  if (!from || !to) return NextResponse.json({ error: "from and to required" }, { status: 400 });

  const bookings = await prisma.booking.findMany({
    where: { date: { gte: from, lte: to }, status: { not: "CANCELLED" } },
    include: { location: true, items: { include: { activity: true } }, addons: true },
  });

  let revenue = 0;
  let participants = 0;
  const byLocation = new Map<string, { name: string; revenue: number; count: number }>();
  const byActivity = new Map<string, { name: string; icon: string; revenue: number; count: number }>();
  const byDay = new Map<string, { revenue: number; count: number }>();
  let addonsRevenue = 0;
  let addonsCount = 0;

  for (const b of bookings) {
    revenue += b.totalPrice;
    participants += b.people;

    const loc = byLocation.get(b.locationId) ?? { name: b.location.name, revenue: 0, count: 0 };
    loc.revenue += b.totalPrice;
    loc.count += 1;
    byLocation.set(b.locationId, loc);

    const day = byDay.get(b.date) ?? { revenue: 0, count: 0 };
    day.revenue += b.totalPrice;
    day.count += 1;
    byDay.set(b.date, day);

    for (const it of b.items) {
      const a = byActivity.get(it.activityId) ?? {
        name: it.activity.nameUk,
        icon: it.activity.icon,
        revenue: 0,
        count: 0,
      };
      a.revenue += it.price;
      a.count += 1;
      byActivity.set(it.activityId, a);
    }
    for (const ad of b.addons) {
      addonsRevenue += ad.price;
      addonsCount += 1;
    }
  }

  return NextResponse.json({
    from,
    to,
    revenue,
    bookings: bookings.length,
    participants,
    avgCheck: bookings.length ? Math.round(revenue / bookings.length) : 0,
    byLocation: [...byLocation.values()].sort((a, b) => b.revenue - a.revenue),
    byActivity: [...byActivity.values()].sort((a, b) => b.revenue - a.revenue),
    addons: { revenue: addonsRevenue, count: addonsCount },
    byDay: [...byDay.entries()]
      .map(([date, v]) => ({ date, ...v }))
      .sort((a, b) => (a.date < b.date ? -1 : 1)),
  });
}
