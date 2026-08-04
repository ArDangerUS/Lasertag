"use client";

import { useEffect, useState } from "react";
import type { CrmBooking, CrmCatalog } from "@/lib/crm-data";
import { STATUS_META, BOOKING_STATUSES, type BookingStatus } from "@/lib/constants";
import { fmtMoney, minToHHMM } from "@/lib/pricing";
import Modal from "./Modal";
import PhoneMenu from "@/components/PhoneMenu";

type Comment = { id: string; authorName: string; text: string; createdAt: string };

export default function BookingEditor({
  booking,
  catalog,
  canWrite,
  isAdmin = false,
  onClose,
  onSaved,
}: {
  booking: CrmBooking;
  catalog: CrmCatalog;
  canWrite: boolean;
  isAdmin?: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [status, setStatus] = useState<BookingStatus>(booking.status as BookingStatus);
  const [name, setName] = useState(booking.customerName);
  const [phone, setPhone] = useState(booking.customerPhone);
  const [people, setPeople] = useState(booking.people);
  const [prepaid, setPrepaid] = useState(booking.prepaidAmount);
  const [itemPrices, setItemPrices] = useState<Record<string, number>>(
    Object.fromEntries(booking.items.map((i) => [i.id, i.price]))
  );
  const [itemRooms, setItemRooms] = useState<Record<string, string>>(
    Object.fromEntries(booking.items.map((i) => [i.id, i.roomId ?? ""]))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // Внутрішні коментарі менеджерів (окремо від короткого коментаря клієнта)
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [commentBusy, setCommentBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/crm/bookings/${booking.id}/comments`)
      .then((r) => r.json())
      .then((d) => setComments(d.comments ?? []))
      .catch(() => {});
  }, [booking.id]);

  async function addComment() {
    const text = newComment.trim();
    if (!text) return;
    setCommentBusy(true);
    try {
      const res = await fetch(`/api/crm/bookings/${booking.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Помилка");
      setComments((cs) => [...cs, data.comment]);
      setNewComment("");
    } catch (e: any) {
      alert(e?.message || "Помилка");
    } finally {
      setCommentBusy(false);
    }
  }

  async function deleteComment(id: string) {
    if (!confirm("Видалити коментар? Цю дію не можна буде скасувати.")) return;
    try {
      const res = await fetch(`/api/crm/comments/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Помилка");
      setComments((cs) => cs.filter((c) => c.id !== id));
    } catch (e: any) {
      alert(e?.message || "Помилка");
    }
  }

  // Rooms selectable for an item = rooms mapped to its activity at this location.
  const roomOptions = (activityId: string) => {
    const act = catalog.activities.find((a) => a.id === activityId);
    const ids = act?.roomIdsByLocation[booking.locationId] ?? [];
    return ids
      .map((id) => catalog.rooms.find((r) => r.id === id))
      .filter(Boolean) as { id: string; name: string }[];
  };

  const total =
    Object.values(itemPrices).reduce((s, v) => s + (Number(v) || 0), 0) +
    booking.addons.reduce((s, a) => s + a.price, 0);

  async function save() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/crm/bookings/${booking.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          customerName: name,
          customerPhone: phone,
          people,
          prepaidAmount: Number(prepaid) || 0,
          totalPrice: total,
          items: booking.items.map((i) => ({
            id: i.id,
            price: Number(itemPrices[i.id]) || 0,
            // send only when the manager changed it (null = зняти кімнату)
            ...(itemRooms[i.id] !== (i.roomId ?? "")
              ? { roomId: itemRooms[i.id] || null }
              : {}),
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Помилка");
      onSaved();
    } catch (e: any) {
      setError(e?.message || "Помилка");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm(`Видалити бронь ${booking.code}? Цю дію не можна буде скасувати.`)) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/crm/bookings/${booking.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Помилка");
      onSaved();
    } catch (e: any) {
      setError(e?.message || "Помилка");
      setSaving(false);
    }
  }

  return (
    <Modal onClose={onClose} title={`Бронь ${booking.code}`}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-[#aaa]">
          <span className="rounded-full bg-[#0e0e0e] px-3 py-1">{booking.locationName}</span>
          <span className="rounded-full bg-[#0e0e0e] px-3 py-1">{booking.date}</span>
          <span className="rounded-full bg-[#0e0e0e] px-3 py-1">
            {booking.source === "SITE" ? "з сайту" : "створено вручну"}
          </span>
          {booking.createdByName && (
            <span className="rounded-full bg-[#0e0e0e] px-3 py-1">автор: {booking.createdByName}</span>
          )}
          {/* службова примітка з сайту (наприклад, назва комплексу) */}
          {booking.comment && (
            <span className="rounded-full bg-[#0e0e0e] px-3 py-1 text-[#56EF02]">{booking.comment}</span>
          )}
        </div>

        {/* status */}
        <div>
          <Label>Статус</Label>
          <div className="flex flex-wrap gap-2">
            {BOOKING_STATUSES.map((s) => (
              <button
                key={s}
                disabled={!canWrite}
                onClick={() => setStatus(s)}
                className="rounded-full px-3.5 py-2 text-[13px] font-bold"
                style={{
                  background: status === s ? STATUS_META[s].color : "#0e0e0e",
                  color: status === s ? "#111" : "#bbb",
                  border: `1px solid ${status === s ? STATUS_META[s].color : "#333"}`,
                }}
              >
                {STATUS_META[s].uk}
              </button>
            ))}
          </div>
        </div>

        {/* customer */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Ім'я</Label>
            <Input value={name} onChange={setName} disabled={!canWrite} />
          </div>
          <div>
            <Label>Телефон</Label>
            <div className="flex items-center gap-2">
              <Input value={phone} onChange={setPhone} disabled={!canWrite} />
              {/* дзвінок / у контакти (vCard з ім'ям клієнта) / копіювати */}
              <PhoneMenu
                phone={phone}
                contactName={name ? `${name} (G-75)` : "Клієнт G-75"}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0e0e0e] text-[16px] ring-1 ring-[#333] hover:ring-[#56EF02]"
              >
                📞
              </PhoneMenu>
            </div>
          </div>
          <div>
            <Label>Учасників</Label>
            <Input
              type="number"
              value={String(people)}
              onChange={(v) => setPeople(Math.max(1, Number(v) || 1))}
              disabled={!canWrite}
            />
          </div>
          <div>
            <Label>Аванс, грн</Label>
            <Input
              type="number"
              value={String(prepaid)}
              onChange={(v) => setPrepaid(Number(v) || 0)}
              disabled={!canWrite}
            />
          </div>
        </div>

        {/* items with editable prices */}
        <div>
          <Label>Розваги та ціни</Label>
          <div className="flex flex-col gap-2">
            {booking.items.map((i) => {
              const rooms = roomOptions(i.activityId);
              return (
                <div key={i.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-[#0e0e0e] px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold">{i.title}</div>
                    <div className="text-[11px] text-[#888]">
                      {minToHHMM(i.startMin)}–{minToHHMM(i.startMin + i.durationMin)} · {i.people} ос
                      {!rooms.length && i.roomName ? ` · ${i.roomName}` : ""}
                    </div>
                  </div>
                  {/* Manager can pin a specific room (validated server-side) */}
                  {rooms.length > 0 && (
                    <select
                      value={itemRooms[i.id] ?? ""}
                      disabled={!canWrite}
                      onChange={(e) => setItemRooms((m) => ({ ...m, [i.id]: e.target.value }))}
                      className="max-w-[190px] rounded-lg border border-[#333] bg-[#161616] px-2 py-1.5 text-[12px] text-white"
                      title="Кімната"
                    >
                      <option value="">кімната: авто</option>
                      {rooms.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  )}
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={itemPrices[i.id]}
                      disabled={!canWrite}
                      onChange={(e) =>
                        setItemPrices((p) => ({ ...p, [i.id]: Number(e.target.value) || 0 }))
                      }
                      className="w-24 rounded-lg border border-[#333] bg-[#161616] px-2 py-1.5 text-right text-[13px] text-white"
                    />
                    <span className="text-[12px] text-[#888]">грн</span>
                  </div>
                </div>
              );
            })}
            {booking.addons.map((a) => (
              <div key={a.id} className="flex items-center justify-between rounded-xl bg-[#0e0e0e] px-3 py-2 text-[13px]">
                <span className="text-[#ccc]">
                  {a.title} ×{a.qty}
                </span>
                <span className="font-semibold">{fmtMoney(a.price)} грн</span>
              </div>
            ))}
          </div>
        </div>

        {/* Внутрішні коментарі менеджерів */}
        <div>
          <Label>Коментарі менеджерів</Label>
          <div className="flex flex-col gap-2">
            {comments.map((c) => (
              <div key={c.id} className="rounded-xl bg-[#0e0e0e] px-3 py-2.5">
                <div className="flex items-center gap-2 text-[11px] text-[#888]">
                  <span className="font-bold text-[#bbb]">{c.authorName || "—"}</span>
                  <span>
                    {new Date(c.createdAt).toLocaleString("uk-UA", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  {isAdmin && (
                    <button
                      onClick={() => deleteComment(c.id)}
                      className="ml-auto rounded-full px-2 py-0.5 text-[11px] text-[#ff7a7a] hover:bg-[#2a1414]"
                      title="Видалити (лише адміністратор)"
                    >
                      Видалити
                    </button>
                  )}
                </div>
                <div className="mt-1 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-[#ddd]">
                  {c.text}
                </div>
              </div>
            ))}
            {comments.length === 0 && (
              <div className="rounded-xl border border-dashed border-[#333] px-3 py-3 text-center text-[12px] text-[#777]">
                Коментарів поки немає
              </div>
            )}
            {canWrite && (
              <div className="flex flex-col gap-2">
                <textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  rows={3}
                  placeholder="Напишіть коментар — довжина не обмежена…"
                  className="w-full rounded-xl border border-[#333] bg-[#0e0e0e] px-3 py-2 text-[14px] text-white"
                />
                <button
                  onClick={addComment}
                  disabled={commentBusy || !newComment.trim()}
                  className="self-end rounded-full bg-[#0e0e0e] px-4 py-2 text-[12px] font-bold text-[#56EF02] ring-1 ring-[#333] transition hover:ring-[#56EF02] disabled:opacity-50"
                >
                  {commentBusy ? "Додавання…" : "+ Додати коментар"}
                </button>
              </div>
            )}
          </div>
        </div>

        {booking.telegramUsername && (
          <div className="text-[12px] text-[#888]">Telegram клієнта: {booking.telegramUsername}</div>
        )}

        <div className="flex items-center justify-between border-t border-[#2a2a2a] pt-3">
          <span className="text-[14px] text-[#aaa]">Разом</span>
          <span className="text-[22px] font-extrabold text-[#56EF02]">{fmtMoney(total)} грн</span>
        </div>

        {error && <div className="text-center text-[13px] text-[#ff8a5c]">{error}</div>}

        <div className="flex items-center gap-2">
          {/* видалення — лише адміністратор; менеджер скасовує статусом */}
          {isAdmin && (
            <button
              onClick={remove}
              disabled={saving}
              className="rounded-full border border-[#5a2222] px-4 py-2.5 text-[13px] font-bold text-[#ff7a7a] hover:bg-[#2a1414]"
            >
              Видалити
            </button>
          )}
          <div className="ml-auto flex gap-2">
            <button
              onClick={onClose}
              className="rounded-full border border-[#333] px-4 py-2.5 text-[13px] font-semibold text-[#bbb]"
            >
              Закрити
            </button>
            {canWrite && (
              <button
                onClick={save}
                disabled={saving}
                className="rounded-full bg-[#56EF02] px-5 py-2.5 text-[14px] font-bold text-[#1A1A1A] disabled:opacity-60"
              >
                {saving ? "Збереження…" : "Зберегти"}
              </button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="mb-1.5 text-[12px] font-bold tracking-wide text-[#888]">{children}</div>;
}

function Input({
  value,
  onChange,
  type = "text",
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-xl border border-[#333] bg-[#0e0e0e] px-3 py-2.5 text-[14px] text-white disabled:opacity-60"
    />
  );
}
