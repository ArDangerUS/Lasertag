// Client-safe helpers (no server imports). See telegram.ts for the bot logic.

// Deep link opening the bot with /start <code>, so the client starts the chat.
export function confirmDeepLink(baseUrl: string, code: string): string {
  const base = baseUrl || "https://t.me/g75lasertag_bot";
  return base.includes("?") ? `${base}&start=${code}` : `${base}?start=${code}`;
}
