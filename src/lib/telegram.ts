import { prisma } from "./prisma";
import { minToHHMM } from "./pricing";

const API = (token: string, method: string) => `https://api.telegram.org/bot${token}/${method}`;

export function botToken(): string {
  return process.env.TELEGRAM_BOT_TOKEN || "";
}

// Deep link the client taps after submitting: opens the bot with /start <code>,
// so the CLIENT starts the conversation (required to message them later) and we
// can link the chat to the booking in the webhook.
export function confirmDeepLink(code: string): string {
  const base = process.env.NEXT_PUBLIC_TELEGRAM_URL || "https://t.me/g75lasertag_bot";
  // t.me/<bot>?start=<code>
  const url = base.includes("?") ? `${base}&start=${code}` : `${base}?start=${code}`;
  return url;
}

async function send(chatId: string, text: string): Promise<void> {
  const token = botToken();
  if (!token || !chatId) return;
  try {
    await fetch(API(token, "sendMessage"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
    });
  } catch (e) {
    console.error("telegram send failed", e);
  }
}

export async function notifyManagersNewBooking(bookingId: string): Promise<void> {
  const chat = process.env.TELEGRAM_MANAGER_CHAT_ID || "";
  if (!chat) return;
  const b = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { location: true, items: true, addons: true },
  });
  if (!b) return;

  const items = b.items
    .map((i) => `• ${i.title} ${minToHHMM(i.startMin)}–${minToHHMM(i.startMin + i.durationMin)} · ${i.people} ос · ${i.price} грн`)
    .join("\n");
  const addons = b.addons.map((a) => `• ${a.title} ×${a.qty} · ${a.price} грн`).join("\n");

  const text =
    `🆕 <b>Нова заявка ${b.code}</b>\n` +
    `📍 ${b.location.name}\n` +
    `📅 ${b.date}\n` +
    `👤 ${b.customerName || "—"} · ${b.customerPhone}\n` +
    `👥 ${b.people} осіб\n\n` +
    `${items}\n` +
    (addons ? `\nДодатки:\n${addons}\n` : "") +
    `\n💰 <b>${b.totalPrice} грн</b>`;

  await send(chat, text);
}

// Webhook processing: the bot receives /start <code> from a client. We link the
// chat to the booking and greet them. Returns a description of what happened.
export async function handleTelegramUpdate(update: any): Promise<string> {
  const msg = update?.message;
  const text: string = msg?.text || "";
  const chatId = String(msg?.chat?.id || "");
  const username = msg?.from?.username ? `@${msg.from.username}` : "";
  if (!text.startsWith("/start")) return "ignored";

  const parts = text.split(/\s+/);
  const code = (parts[1] || "").trim().toUpperCase();
  if (!code) {
    await send(chatId, "Вітаємо! Надішліть номер вашого бронювання, щоб ми підтвердили заявку.");
    return "no-code";
  }

  const booking = await prisma.booking.findUnique({ where: { code }, include: { location: true } });
  if (!booking) {
    await send(chatId, `Бронювання ${code} не знайдено. Перевірте номер, будь ласка.`);
    return "not-found";
  }

  await prisma.booking.update({
    where: { id: booking.id },
    data: { telegramChatId: chatId, telegramUsername: username },
  });

  await send(
    chatId,
    `Дякуємо! Ми отримали ваше бронювання <b>${booking.code}</b> у локації <b>${booking.location.name}</b> на ${booking.date}.\n\n` +
      `Менеджер незабаром напише вам сюди для підтвердження деталей та авансу (1000 грн на картку ФОП). 💚`
  );

  return `linked:${booking.code}`;
}
