import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const dynamic = "force-dynamic";

// Список коментарів до броні (усі ролі CRM).
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const comments = await prisma.bookingComment.findMany({
    where: { bookingId: params.id },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({
    comments: comments.map((c) => ({
      id: c.id,
      authorName: c.authorName,
      text: c.text,
      createdAt: c.createdAt.toISOString(),
    })),
  });
}

// Текст практично без обмежень («пишуть прям супер багато») — стеля лише
// технічна, щоб не приймати мегабайти.
const schema = z.object({ text: z.string().trim().min(1).max(50_000) });

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user || !can(user.role, "write")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Порожній коментар" }, { status: 400 });

  const booking = await prisma.booking.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!booking) return NextResponse.json({ error: "Бронь не знайдено" }, { status: 404 });

  const c = await prisma.bookingComment.create({
    data: {
      bookingId: booking.id,
      authorId: user.id,
      authorName: user.name,
      text: parsed.data.text,
    },
  });
  return NextResponse.json({
    ok: true,
    comment: { id: c.id, authorName: c.authorName, text: c.text, createdAt: c.createdAt.toISOString() },
  });
}
