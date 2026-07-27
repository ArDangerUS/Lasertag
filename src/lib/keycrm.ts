import { prisma } from "./prisma";
import { minToHHMM } from "./pricing";

// ── KeyCRM integration (https://docs.keycrm.app) ────────────────────────────
// Нове бронювання → картка у воронці KeyCRM (POST /pipelines/cards).
// Видалення бронювання → спроба видалити картку. Інтеграція вмикається
// наявністю KEYCRM_API_TOKEN; без токена всі функції мовчки виходять.
//
// Змінні середовища:
//   KEYCRM_API_TOKEN   — API-ключ (KeyCRM → Налаштування → API)
//   KEYCRM_PIPELINE_ID — id воронки, куди падають заявки (число)
//   KEYCRM_SOURCE_ID   — id джерела (необовʼязково)
//   KEYCRM_API_URL     — база API (за замовчуванням https://openapi.keycrm.app/v1)

const apiBase = () => (process.env.KEYCRM_API_URL || "https://openapi.keycrm.app/v1").replace(/\/$/, "");
const apiToken = () => process.env.KEYCRM_API_TOKEN || "";

export function keycrmEnabled(): boolean {
  return !!apiToken();
}

async function keycrmFetch(path: string, init: RequestInit): Promise<Response> {
  return fetch(`${apiBase()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiToken()}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers || {}),
    },
  });
}

// Створює картку заявки у KeyCRM і зберігає її id у бронюванні.
// Ніколи не кидає помилку в потік бронювання — тільки логи.
export async function pushBookingToKeycrm(bookingId: string): Promise<void> {
  if (!keycrmEnabled()) return;
  try {
    const b = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { location: true, items: true, addons: true },
    });
    if (!b) return;

    const lines = b.items.map(
      (i) =>
        `• ${i.title} ${minToHHMM(i.startMin)}–${minToHHMM(i.startMin + i.durationMin)} · ${i.people} ос · ${i.price} грн`
    );
    const addonLines = b.addons.map((a) => `• ${a.title} ×${a.qty} · ${a.price} грн`);
    const comment =
      `Заявка з сайту бронювання G-75\n` +
      `Локація: ${b.location.name}\nДата: ${b.date}\nУчасників: ${b.people}\n\n` +
      lines.join("\n") +
      (addonLines.length ? `\n\nДодатково:\n${addonLines.join("\n")}` : "") +
      `\n\nРазом: ${b.totalPrice} грн` +
      (b.prepaidAmount ? ` (аванс ${b.prepaidAmount} грн)` : "");

    const pipelineId = Number(process.env.KEYCRM_PIPELINE_ID) || undefined;
    const sourceId = Number(process.env.KEYCRM_SOURCE_ID) || undefined;

    const base: Record<string, unknown> = {
      title: `${b.code} · ${b.location.name} · ${b.date}`,
      ...(pipelineId ? { pipeline_id: pipelineId } : {}),
      ...(sourceId ? { source_id: sourceId } : {}),
      contact: {
        full_name: b.customerName || "Клієнт із сайту",
        phone: b.customerPhone,
      },
    };

    // Перша спроба — з коментарем (деталі свята). Якщо API суворо валідує
    // поля і відповідає 4xx — повторюємо мінімальним набором.
    let res = await keycrmFetch("/pipelines/cards", {
      method: "POST",
      body: JSON.stringify({ ...base, manager_comment: comment }),
    });
    if (!res.ok && res.status >= 400 && res.status < 500) {
      const errText = await res.text().catch(() => "");
      console.warn(`keycrm: full payload rejected (${res.status}) ${errText.slice(0, 300)} — retrying minimal`);
      res = await keycrmFetch("/pipelines/cards", { method: "POST", body: JSON.stringify(base) });
    }
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error(`keycrm: create card failed (${res.status}) ${errText.slice(0, 300)}`);
      return;
    }

    const data = (await res.json().catch(() => null)) as { id?: number | string } | null;
    const cardId = data?.id != null ? String(data.id) : "";
    if (cardId) {
      await prisma.booking.update({ where: { id: b.id }, data: { keycrmCardId: cardId } });
      console.log(`keycrm: card ${cardId} created for ${b.code}`);
    }
  } catch (e) {
    console.error("keycrm: push failed", e);
  }
}

// Спроба прибрати картку при видаленні бронювання. Якщо API не підтримує
// видалення карток — помилка просто залогується, бронювання це не блокує.
export async function deleteKeycrmCard(cardId: string): Promise<void> {
  if (!keycrmEnabled() || !cardId) return;
  try {
    const res = await keycrmFetch(`/pipelines/cards/${cardId}`, { method: "DELETE" });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.warn(`keycrm: delete card ${cardId} failed (${res.status}) ${errText.slice(0, 200)}`);
    }
  } catch (e) {
    console.error("keycrm: delete failed", e);
  }
}
