"use client";

import { useMemo, useState } from "react";
import type { CrmCatalog } from "@/lib/crm-data";
import { minToHHMM } from "@/lib/pricing";
import Modal from "./Modal";

type Line = { activityId: string; startMin: number; durationMin: number; people: number; price?: number; roomId?: string };

export default function BookingCreate({
  catalog,
  initial,
  onClose,
  onSaved,
}: {
  catalog: CrmCatalog;
  initial: { date: string; locationId?: string; startMin?: number };
  onClose: () => void;
  onSaved: () => void;
}) {
  const [date, setDate] = useState(initial.date);
  const [locationId, setLocationId] = useState(initial.locationId || catalog.locations[0]?.id || "");
  const [people, setPeople] = useState(10);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [comment, setComment] = useState("");
  // Коментар менеджера: після створення броні падає у стрічку коментарів
  const [managerComment, setManagerComment] = useState("");
  const [status, setStatus] = useState("CONFIRMED");
  const [lines, setLines] = useState<Line[]>([]);
  const [addonIds, setAddonIds] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const locActivities = useMemo(
    () => catalog.activities.filter((a) => a.locationIds.includes(locationId)),
    [catalog.activities, locationId]
  );

  // Rooms available for an activity at the chosen location (manager may pin one).
  const roomOptions = (activityId: string) => {
    const act = catalog.activities.find((a) => a.id === activityId);
    const ids = act?.roomIdsByLocation[locationId] ?? [];
    return ids
      .map((id) => catalog.rooms.find((r) => r.id === id))
      .filter(Boolean) as { id: string; name: string }[];
  };

  function addLineFor(activityId: string) {
    const a = locActivities.find((x) => x.id === activityId);
    if (!a) return;
    const close = catalog.locations.find((l) => l.id === locationId)?.closeMin ?? 1260;
    setLines((ls) => {
      // нова лінія стартує після кінця попередньої, щоб зручно набирати програму
      const start = ls.length
        ? ls[ls.length - 1].startMin + ls[ls.length - 1].durationMin
        : initial.startMin ?? 600;
      return [
        ...ls,
        {
          activityId: a.id,
          startMin: Math.min(start, close - 30),
          durationMin: a.durationOptions[0] ?? a.durationMin,
          people,
        },
      ];
    });
  }

  function updateLine(i: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  async function save() {
    setError("");
    if (!phone.trim()) return setError("Вкажіть телефон");
    if (lines.length === 0) return setError("Додайте хоча б одну розвагу");
    setSaving(true);
    try {
      const res = await fetch("/api/crm/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locationId,
          date,
          people,
          customerName: name,
          customerPhone: phone,
          comment,
          status,
          items: lines.map((l) => ({
            activityId: l.activityId,
            startMin: l.startMin,
            durationMin: l.durationMin,
            people: l.people,
            ...(l.price != null && l.price !== undefined && !Number.isNaN(l.price)
              ? { price: l.price }
              : {}),
            ...(l.roomId ? { roomId: l.roomId } : {}),
          })),
          addons: Object.entries(addonIds)
            .filter(([, q]) => q > 0)
            .map(([addonId, qty]) => ({ addonId, qty })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Помилка");
      // Коментар менеджера — одразу в стрічку коментарів нової броні.
      // Помилка тут не критична: бронь уже створена.
      if (managerComment.trim() && data.id) {
        await fetch(`/api/crm/bookings/${data.id}/comments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: managerComment.trim() }),
        }).catch(() => {});
      }
      onSaved();
    } catch (e: any) {
      setError(e?.message || "Помилка");
    } finally {
      setSaving(false);
    }
  }

  const startOptions = useMemo(() => {
    const loc = catalog.locations.find((l) => l.id === locationId);
    const open = loc?.openMin ?? 600;
    const close = loc?.closeMin ?? 1260;
    const arr: number[] = [];
    for (let m = open; m <= close; m += 30) arr.push(m);
    return arr;
  }, [catalog.locations, locationId]);

  return (
    <Modal onClose={onClose} title="Нова бронь">
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Дата</Label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              // клік у будь-якому місці поля відкриває календар (не лише іконка)
              onClick={(e) => (e.currentTarget as HTMLInputElement).showPicker?.()}
              className="w-full cursor-pointer rounded-xl border border-[#333] bg-[#0e0e0e] px-3 py-2.5 text-[14px] text-white"
            />
          </div>
          <div>
            <Label>Локація</Label>
            <select
              value={locationId}
              onChange={(e) => {
                setLocationId(e.target.value);
                setLines([]);
              }}
              className="w-full rounded-xl border border-[#333] bg-[#0e0e0e] px-3 py-2.5 text-[14px] text-white"
            >
              {catalog.locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Ім'я клієнта</Label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-[#333] bg-[#0e0e0e] px-3 py-2.5 text-[14px] text-white"
            />
          </div>
          <div>
            <Label>Телефон</Label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+38 (0__) ___ __ __"
              className="w-full rounded-xl border border-[#333] bg-[#0e0e0e] px-3 py-2.5 text-[14px] text-white"
            />
          </div>
          <div>
            <Label>Учасників</Label>
            <input
              type="number"
              min={1}
              value={people}
              onChange={(e) => setPeople(Math.max(1, Number(e.target.value) || 1))}
              className="w-full rounded-xl border border-[#333] bg-[#0e0e0e] px-3 py-2.5 text-[14px] text-white"
            />
          </div>
          <div>
            <Label>Статус</Label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full rounded-xl border border-[#333] bg-[#0e0e0e] px-3 py-2.5 text-[14px] text-white"
            >
              <option value="NEW">Нова</option>
              <option value="CONFIRMED">Підтверджена</option>
              <option value="PREPAID">Аванс</option>
            </select>
          </div>
        </div>

        {/* activity lines */}
        <div>
          <Label>Розваги</Label>
          {/* Кнопки як у додатків: клік = додати лінію з цією розвагою */}
          <div className="mb-2 flex flex-wrap gap-2">
            {locActivities.map((a) => (
              <button
                key={a.id}
                onClick={() => addLineFor(a.id)}
                className="rounded-full border border-[#333] bg-[#0e0e0e] px-3 py-1.5 text-[12px] font-semibold text-[#bbb] transition hover:border-[#56EF02] hover:text-white"
              >
                {a.icon} {a.name} +
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-2">
            {lines.map((l, i) => {
              const act = catalog.activities.find((a) => a.id === l.activityId);
              const durOptions = act?.durationOptions.length ? act.durationOptions : [act?.durationMin ?? 60];
              return (
                <div key={i} className="flex flex-wrap items-center gap-2 rounded-xl bg-[#0e0e0e] px-3 py-2.5">
                  <select
                    value={l.activityId}
                    onChange={(e) => {
                      const a = catalog.activities.find((x) => x.id === e.target.value);
                      updateLine(i, {
                        activityId: e.target.value,
                        durationMin: a?.durationOptions[0] ?? a?.durationMin ?? 60,
                        roomId: undefined,
                      });
                    }}
                    className="flex-1 rounded-lg border border-[#333] bg-[#161616] px-2 py-1.5 text-[13px] text-white"
                  >
                    {locActivities.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.icon} {a.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={l.startMin}
                    onChange={(e) => updateLine(i, { startMin: Number(e.target.value) })}
                    className="rounded-lg border border-[#333] bg-[#161616] px-2 py-1.5 text-[13px] text-white"
                  >
                    {startOptions.map((m) => (
                      <option key={m} value={m}>
                        {minToHHMM(m)}
                      </option>
                    ))}
                  </select>
                  <select
                    value={l.durationMin}
                    onChange={(e) => updateLine(i, { durationMin: Number(e.target.value) })}
                    className="rounded-lg border border-[#333] bg-[#161616] px-2 py-1.5 text-[13px] text-white"
                  >
                    {durOptions.map((d) => (
                      <option key={d} value={d}>
                        {d} хв
                      </option>
                    ))}
                  </select>
                  {roomOptions(l.activityId).length > 0 && (
                    <select
                      value={l.roomId ?? ""}
                      onChange={(e) => updateLine(i, { roomId: e.target.value || undefined })}
                      className="max-w-[170px] rounded-lg border border-[#333] bg-[#161616] px-2 py-1.5 text-[13px] text-white"
                      title="Кімната (авто = система обере вільну)"
                    >
                      <option value="">кімната: авто</option>
                      {roomOptions(l.activityId).map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  )}
                  <input
                    type="number"
                    value={l.people}
                    min={1}
                    onChange={(e) => updateLine(i, { people: Math.max(1, Number(e.target.value) || 1) })}
                    className="w-16 rounded-lg border border-[#333] bg-[#161616] px-2 py-1.5 text-[13px] text-white"
                    title="учасників"
                  />
                  <input
                    type="number"
                    value={l.price ?? ""}
                    placeholder="авто"
                    onChange={(e) =>
                      updateLine(i, { price: e.target.value === "" ? undefined : Number(e.target.value) })
                    }
                    className="w-24 rounded-lg border border-[#333] bg-[#161616] px-2 py-1.5 text-right text-[13px] text-white"
                    title="ціна (порожньо = розрахує система)"
                  />
                  <button
                    onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}
                    className="h-7 w-7 rounded-full bg-[#2a2a2a] text-[#bbb]"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
            {lines.length === 0 && (
              <div className="rounded-xl border border-dashed border-[#333] px-3 py-4 text-center text-[13px] text-[#777]">
                Додайте розваги до броні
              </div>
            )}
          </div>
          <p className="mt-2 text-[11px] text-[#777]">
            Порожнє поле ціни = система порахує за тарифом (будній/вихідний). Ціну можна змінити після
            створення.
          </p>
        </div>

        {/* addons */}
        {catalog.addons.length > 0 && (
          <div>
            <Label>Додатки</Label>
            <div className="flex flex-wrap gap-2">
              {catalog.addons.map((ad) => {
                const on = (addonIds[ad.id] ?? 0) > 0;
                return (
                  <button
                    key={ad.id}
                    onClick={() => setAddonIds((q) => ({ ...q, [ad.id]: on ? 0 : 1 }))}
                    className="rounded-full px-3 py-1.5 text-[12px] font-semibold"
                    style={{
                      background: on ? "#56EF02" : "#0e0e0e",
                      color: on ? "#111" : "#bbb",
                      border: `1px solid ${on ? "#56EF02" : "#333"}`,
                    }}
                  >
                    {ad.name} · {ad.price}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* comment thread starter */}
        <div>
          <Label>Коментар менеджера (необовʼязково)</Label>
          <textarea
            value={managerComment}
            onChange={(e) => setManagerComment(e.target.value)}
            rows={3}
            placeholder="Побажання клієнта, деталі свята — довжина не обмежена…"
            className="w-full rounded-xl border border-[#333] bg-[#0e0e0e] px-3 py-2 text-[14px] text-white"
          />
        </div>

        {error && <div className="text-center text-[13px] text-[#ff8a5c]">{error}</div>}

        <div className="flex justify-end gap-2 border-t border-[#2a2a2a] pt-3">
          <button
            onClick={onClose}
            className="rounded-full border border-[#333] px-4 py-2.5 text-[13px] font-semibold text-[#bbb]"
          >
            Скасувати
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="rounded-full bg-[#56EF02] px-5 py-2.5 text-[14px] font-bold text-[#1A1A1A] disabled:opacity-60"
          >
            {saving ? "Створення…" : "Створити бронь"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="mb-1.5 text-[12px] font-bold tracking-wide text-[#888]">{children}</div>;
}
