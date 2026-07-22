import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, can } from "@/lib/auth";
import { createBooking, createBookingSchema } from "@/lib/booking-create";
import { loadCrmBookings } from "@/lib/crm-data";

export const dynamic = "force-dynamic";

// List bookings in a date range for the calendar.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  if (!from || !to) return NextResponse.json({ error: "from and to required" }, { status: 400 });
  const bookings = await loadCrmBookings(from, to);
  return NextResponse.json({ bookings });
}

// Create a booking from the CRM.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "write")) return NextResponse.json({ error: "Немає прав" }, { status: 403 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = createBookingSchema.safeParse({ ...(body as object), source: "CRM" });
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const b = await createBooking(parsed.data, user);
    return NextResponse.json({ ok: true, id: b.id, code: b.code, total: b.totalPrice });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Помилка" }, { status: 400 });
  }
}
