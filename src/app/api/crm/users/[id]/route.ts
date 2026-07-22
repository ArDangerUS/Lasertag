import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, can, hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { isRole } from "@/lib/constants";
import { z } from "zod";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  role: z.string().optional(),
  active: z.boolean().optional(),
  password: z.string().min(8).max(200).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user || !can(user.role, "manageUsers")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Перевірте поля" }, { status: 400 });
  if (parsed.data.role && !isRole(parsed.data.role)) {
    return NextResponse.json({ error: "Невірна роль" }, { status: 400 });
  }

  // Prevent locking yourself out of admin.
  if (params.id === user.id && (parsed.data.active === false || (parsed.data.role && parsed.data.role !== "ADMIN"))) {
    return NextResponse.json({ error: "Не можна змінити власний доступ адміністратора" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (parsed.data.name) data.name = parsed.data.name;
  if (parsed.data.role) data.role = parsed.data.role;
  if (parsed.data.active != null) data.active = parsed.data.active;
  if (parsed.data.password) data.passwordHash = await hashPassword(parsed.data.password);

  const updated = await prisma.user.update({ where: { id: params.id }, data });
  await audit({
    actor: user,
    action: "UPDATE",
    entity: "User",
    entityId: updated.id,
    summary: `Оновлено користувача ${updated.email}${
      parsed.data.password ? " (змінено пароль)" : ""
    }${parsed.data.active === false ? " (деактивовано)" : ""}`,
  });
  return NextResponse.json({ ok: true });
}
