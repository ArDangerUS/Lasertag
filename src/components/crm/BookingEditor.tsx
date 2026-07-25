"use client";

import { useState } from "react";
import type { CrmBooking, CrmCatalog } from "@/lib/crm-data";
import { STATUS_META, BOOKING_STATUSES, type BookingStatus } from "@/lib/constants";
import { fmtMoney, minToHHMM } from "@/lib/pricing";
import Modal from "./Modal";

export default function BookingEditor({
  booking,
  catalog,
  canWrite,
  onClose,
  onSaved,
}: {
  booking: CrmBooking;
  catalog: CrmCatalog;
  canWrite: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [status, setStatus] = useState<BookingStatus>(booking.status as BookingStatus);
  const [name, setName] = useState(booking.customerName);
  const [phone, setPhone] = useState(booking.customerPhone);
  const [comment, setComment] = useState(booking.comment);
  const [people, setPeople] = useState(booking.people);
  const [prepaid, setPrepaid] = useState(booking.prepaidAmount);
  const [itemPrices, setItemPrices] = useState<Record<string, number>>(
    Object.fromEntries(booking.items.map((i) => [i.id, i.price]))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

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
          comment,
          people,
          prepaidAmount: Number(prepaid) || 0,
          totalPrice: total,
          items: booking.items.map((i) => ({ id: i.id, price: Number(itemPrices[i.id]) || 0 })),
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
            <Input value={phone} onChange={setPhone} disabled={!canWrite} />
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
            {booking.items.map((i) => (
              <div key={i.id} className="flex items-center gap-3 rounded-xl bg-[#0e0e0e] px-3 py-2.5">
                <div className="flex-1">
                  <div className="text-[13px] font-semibold">{i.title}</div>
                  <div className="text-[11px] text-[#888]">
                    {minToHHMM(i.startMin)}–{minToHHMM(i.startMin + i.durationMin)} · {i.people} ос
                  </div>
                </div>
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
            ))}
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

        <div>
          <Label>Коментар</Label>
          <textarea
            value={comment}
            disabled={!canWrite}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            className="w-full rounded-xl border border-[#333] bg-[#0e0e0e] px-3 py-2 text-[14px] text-white"
          />
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
          {canWrite && (
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
