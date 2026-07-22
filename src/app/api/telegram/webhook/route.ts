import { NextRequest, NextResponse } from "next/server";
import { handleTelegramUpdate } from "@/lib/telegram";

export const dynamic = "force-dynamic";

// Telegram sends updates here. Protect with a secret path token that matches
// TELEGRAM_WEBHOOK_SECRET (set the webhook URL to include ?secret=... ).
export async function POST(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET || "";
  if (expected && secret !== expected) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  let update: unknown;
  try {
    update = await req.json();
  } catch {
    return NextResponse.json({ ok: true });
  }
  try {
    const result = await handleTelegramUpdate(update);
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ ok: true });
  }
}
