import { NextRequest, NextResponse } from "next/server";
import { computeBusy } from "@/lib/availability";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const locationId = req.nextUrl.searchParams.get("locationId");
  const date = req.nextUrl.searchParams.get("date");
  if (!locationId || !date) {
    return NextResponse.json({ error: "locationId and date required" }, { status: 400 });
  }
  const { busyByActivity } = await computeBusy(locationId, date);
  return NextResponse.json({ busyByActivity });
}
