import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user || !can(user.role, "write")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  await prisma.lead.deleteMany({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
