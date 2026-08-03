import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// Позначити лід опрацьованим / повернути в нові.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user || !can(user.role, "write")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  let status = "DONE";
  try {
    const body = await req.json();
    if (body?.status === "NEW") status = "NEW";
  } catch {
    // без тіла = DONE
  }
  const lead = await prisma.lead.findUnique({ where: { id: params.id } });
  if (!lead) return NextResponse.json({ error: "Не знайдено" }, { status: 404 });
  await prisma.lead.update({ where: { id: params.id }, data: { status } });
  await audit({
    actor: user,
    action: "UPDATE",
    entity: "Лід",
    entityId: lead.id,
    summary:
      status === "DONE"
        ? `позначив(-ла) лід ${lead.phone} опрацьованим`
        : `повернув(-ла) лід ${lead.phone} у нові`,
  });
  return NextResponse.json({ ok: true });
}

// Видалення ліда — лише адміністратор (менеджери позначають «Опрацьовано»).
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Видаляти ліди може лише адміністратор" }, { status: 403 });
  }
  const lead = await prisma.lead.findUnique({ where: { id: params.id } });
  if (!lead) return NextResponse.json({ error: "Не знайдено" }, { status: 404 });
  await prisma.lead.delete({ where: { id: params.id } });
  await audit({
    actor: user,
    action: "DELETE",
    entity: "Лід",
    entityId: lead.id,
    summary: `видалив(-ла) лід ${lead.phone}${lead.name ? ` (${lead.name})` : ""}`,
    before: { phone: lead.phone, name: lead.name, locationName: lead.locationName, date: lead.date },
  });
  return NextResponse.json({ ok: true });
}
