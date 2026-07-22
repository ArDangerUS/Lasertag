import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, can, hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { isRole } from "@/lib/constants";
import { z } from "zod";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(120),
  password: z.string().min(8).max(200),
  role: z.string(),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !can(user.role, "manageUsers")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" } });
  return NextResponse.json({
    users: users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      active: u.active,
    })),
  });
}

export async function POST(req: NextRequest) {
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
  const parsed = createSchema.safeParse(body);
  if (!parsed.success || !isRole(parsed.data.role)) {
    return NextResponse.json({ error: "Перевірте поля (пароль ≥ 8 символів)" }, { status: 400 });
  }
  const email = parsed.data.email.toLowerCase().trim();
  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) return NextResponse.json({ error: "Такий email вже існує" }, { status: 400 });

  const created = await prisma.user.create({
    data: {
      email,
      name: parsed.data.name,
      role: parsed.data.role,
      passwordHash: await hashPassword(parsed.data.password),
    },
  });
  await audit({
    actor: user,
    action: "CREATE",
    entity: "User",
    entityId: created.id,
    summary: `Створено користувача ${created.email} (${created.role})`,
  });
  return NextResponse.json({ ok: true, id: created.id });
}
