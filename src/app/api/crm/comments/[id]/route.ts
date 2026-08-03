import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// Видалення коментаря — ТІЛЬКИ адміністратор.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Видаляти коментарі може лише адміністратор" }, { status: 403 });
  }
  const c = await prisma.bookingComment.findUnique({
    where: { id: params.id },
    include: { booking: { select: { code: true } } },
  });
  if (!c) return NextResponse.json({ error: "Не знайдено" }, { status: 404 });

  await prisma.bookingComment.delete({ where: { id: params.id } });
  await audit({
    actor: user,
    action: "DELETE",
    entity: "Коментар",
    entityId: c.id,
    bookingId: c.bookingId,
    summary: `видалив(-ла) коментар ${c.authorName} до броні ${c.booking.code}`,
    before: { text: c.text.slice(0, 500) },
  });
  return NextResponse.json({ ok: true });
}
