import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const dynamic = "force-dynamic";

const PHONE_RE = /^\+?[\d\s()\-]{9,19}$/;

const schema = z.object({
  sessionKey: z.string().min(8).max(64),
  phone: z.string().trim().regex(PHONE_RE, "bad phone"),
  name: z.string().trim().max(120).default(""),
  locationName: z.string().trim().max(120).default(""),
  date: z.string().trim().max(10).default(""),
  people: z.number().int().min(0).max(500).default(0),
});

// Публічний: сайт тихо зберігає телефон, щойно відвідувач його ввів,
// навіть якщо бронювання так і не відправлено. Upsert за sessionKey —
// редагування номера не плодить дублікати.
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const d = parsed.data;

  // Мінімум 9 цифр — інакше це ще не номер
  if (d.phone.replace(/\D/g, "").length < 9) {
    return NextResponse.json({ error: "short" }, { status: 400 });
  }

  await prisma.lead.upsert({
    where: { sessionKey: d.sessionKey },
    create: {
      sessionKey: d.sessionKey,
      phone: d.phone,
      name: d.name,
      locationName: d.locationName,
      date: d.date,
      people: d.people,
    },
    update: {
      phone: d.phone,
      name: d.name,
      locationName: d.locationName,
      date: d.date,
      people: d.people,
    },
  });
  return NextResponse.json({ ok: true });
}

// Публічний: після успішного бронювання лід цієї сесії прибирається
// (ключ знає лише той браузер, який його створив).
export async function DELETE(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key") || "";
  if (key.length >= 8) {
    await prisma.lead.deleteMany({ where: { sessionKey: key } });
  }
  return NextResponse.json({ ok: true });
}
