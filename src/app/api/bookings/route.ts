import { NextRequest, NextResponse } from "next/server";
import { createBooking, createBookingSchema } from "@/lib/booking-create";
import { notifyManagersNewBooking } from "@/lib/telegram";

export const dynamic = "force-dynamic";

// Public endpoint: booking submitted from the website.
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createBookingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // Force site source; site cannot self-confirm or set prepaid.
  const input = { ...parsed.data, source: "SITE" as const, status: "NEW" as const, prepaidAmount: 0 };

  try {
    const booking = await createBooking(input, null);
    // Fire-and-forget manager notification.
    notifyManagersNewBooking(booking.id).catch(() => {});
    return NextResponse.json({
      ok: true,
      code: booking.code,
      id: booking.id,
      total: booking.totalPrice,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Помилка створення" }, { status: 400 });
  }
}
