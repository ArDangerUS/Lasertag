import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, can } from "@/lib/auth";
import { updateBooking, updateBookingSchema, deleteBooking } from "@/lib/booking-update";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "write")) return NextResponse.json({ error: "Немає прав" }, { status: 403 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = updateBookingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const b = await updateBooking(params.id, parsed.data, user);
    return NextResponse.json({ ok: true, id: b.id, total: b.totalPrice, status: b.status });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Помилка" }, { status: 400 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "write")) return NextResponse.json({ error: "Немає прав" }, { status: 403 });
  try {
    await deleteBooking(params.id, user);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Помилка" }, { status: 400 });
  }
}
