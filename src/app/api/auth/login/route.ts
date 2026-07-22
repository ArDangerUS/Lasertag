import { NextRequest, NextResponse } from "next/server";
import { authenticate, createSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({ email: z.string().email(), password: z.string().min(1) });

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Введіть email та пароль" }, { status: 400 });
  }
  const user = await authenticate(parsed.data.email, parsed.data.password);
  if (!user) {
    return NextResponse.json({ error: "Невірний email або пароль" }, { status: 401 });
  }
  await createSession(user);
  await audit({ actor: user, action: "LOGIN", entity: "User", entityId: user.id, summary: `Вхід: ${user.email}` });
  return NextResponse.json({ ok: true, role: user.role });
}
