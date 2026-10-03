"use client";

import { useEffect, useState } from "react";
import type { CrmBooking, CrmCatalog } from "@/lib/crm-data";
import { STATUS_META, BOOKING_STATUSES, type BookingStatus } from "@/lib/constants";
import { fmtMoney, minToHHMM } from "@/lib/pricing";
import { SLOT_STEP_MIN } from "@/lib/constants";
import Modal from "./Modal";
import PhoneMenu from "@/components/PhoneMenu";

type Comment = { id: string; authorName: string; text: string; createdAt: string };

// Розвага, дописана в наявну бронь. Ціни тут немає навмисно — її рахує
// сервер за тарифом, як при створенні броні.
type NewItem = {
  key: string;
  activityId: string;
  startMin: number;
  durationMin: number;
  people: number;
  roomId?: string;
  variantId?: string;
  // задається лише при ✂ розділенні залу: другий відрізок коштує 0,
  // щоб сума броні не змінилась
  price?: number;
};

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
  // рядок для поля «Учасників»: можна повністю стерти, на blur відновлюється
  const [peopleStr, setPeopleStr] = useState(String(booking.people));
  const [prepaid, setPrepaid] = useState(booking.prepaidAmount);
  // Перенесення свята на інший день: програма їде цілком, з перевіркою
  // зайнятості на новій даті.
  const [date, setDate] = useState(booking.date);
  // Переїзд на іншу локацію: кімнати підбираються там заново.
  const [locationId, setLocationId] = useState(booking.locationId);
  const [itemPrices, setItemPrices] = useState<Record<string, number>>(
    Object.fromEntries(booking.items.map((i) => [i.id, i.price]))
  );
  const [itemRooms, setItemRooms] = useState<Record<string, string>>(
    Object.fromEntries(booking.items.map((i) => [i.id, i.roomId ?? ""]))
  );
  // обраний сценарій розваги (квести)
  const [itemVariants, setItemVariants] = useState<Record<string, string>>(
    Object.fromEntries(booking.items.map((i) => [i.id, i.variantId ?? ""]))
  );
  // час і тривалість кожної позиції — редагуються прямо тут, без календаря
  const [itemTimes, setItemTimes] = useState<Record<string, { startMin: number; durationMin: number }>>(
    Object.fromEntries(booking.items.map((i) => [i.id, { startMin: i.startMin, durationMin: i.durationMin }]))
  );
  const [itemPeople, setItemPeople] = useState<Record<string, number>>(
    Object.fromEntries(booking.items.map((i) => [i.id, i.people]))
  );
  // позиції, помічені на видалення (зникнуть після «Зберегти»)
  const [removed, setRemoved] = useState<string[]>([]);
  // дописані розваги — ціну рахує сервер за тарифом
  const [added, setAdded] = useState<NewItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // Зайнятість дня — щоб зайняті години було видно одразу в списку часу.
  const [busy, setBusy] = useState<Record<string, number[]>>({});

  useEffect(() => {
    fetch(`/api/availability?locationId=${locationId}&date=${date}`)
      .then((r) => r.json())
      .then((d) => setBusy(d.busyByActivity ?? {}))
      .catch(() => {});
  }, [locationId, date]);
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
    const ids = act?.roomIdsByLocation[locationId] ?? [];
    return ids
      .map((id) => catalog.rooms.find((r) => r.id === id))
      .filter(Boolean) as { id: string; name: string }[];
  };

  const locActivities = catalog.activities.filter((a) => a.locationIds.includes(locationId));
  const actById = new Map(catalog.activities.map((a) => [a.id, a]));
  const loc = catalog.locations.find((l) => l.id === locationId);
  // Для коротких сеансів (10/20 хв) потрібен дрібніший крок початку —
  // інакше два підряд у ту саму півгодину не поставити.
  const startOptionsFor = (durationMin: number) => {
    const open = loc?.openMin ?? 600;
    const close = loc?.closeMin ?? 1260;
    const step = durationMin % 30 === 0 ? 30 : 10;
    const arr: number[] = [];
    for (let m = open; m <= close; m += step) arr.push(m);
    return arr;
  };
  const durationsFor = (activityId: string, current?: number) => {
    const a = actById.get(activityId);
    // короткі сеанси 10/20 хв існують лише в CRM — на сайті їх не видно
    const base = (
      a?.durationOptions.length
        ? [...a.durationOptions, ...(a.crmDurationOptions ?? [])]
        : [a?.durationMin ?? 60]
    ).sort((x, y) => x - y);
    return current != null && !base.includes(current)
      ? [...base, current].sort((x, y) => x - y)
      : base;
  };
  const variantsFor = (activityId: string) =>
    (actById.get(activityId)?.variants ?? []).filter((v) =>
      v.locationIds.includes(locationId)
    );

  // Чи зайнята розвага на цей проміжок. Слоти, які тримає САМА ця бронь,
  // не рахуємо — інакше кожна її позиція показувала б сама себе зайнятою.
  const ownSlots = (activityId: string) => {
    const out = new Set<number>();
    booking.items
      .filter((i) => i.activityId === activityId && !removed.includes(i.id))
      .forEach((i) => {
        for (let m = i.startMin; m < i.startMin + i.durationMin; m += SLOT_STEP_MIN) out.add(m);
      });
    return out;
  };
  const slotBusy = (activityId: string, startMin: number, durationMin: number) => {
    const taken = busy[activityId];
    if (!taken?.length) return false;
    const mine = ownSlots(activityId);
    const set = new Set(taken.filter((m) => !mine.has(m)));
    for (let m = startMin; m < startMin + durationMin; m += SLOT_STEP_MIN) {
      if (set.has(m)) return true;
    }
    return false;
  };

  function addActivity(activityId: string) {
    const a = actById.get(activityId);
    if (!a) return;
    // нова позиція стартує після кінця останньої, щоб не лізти в чужий час
    const ends = [
      ...booking.items.filter((i) => !removed.includes(i.id)).map((i) => {
        const t = itemTimes[i.id];
        return (t?.startMin ?? i.startMin) + (t?.durationMin ?? i.durationMin);
      }),
      ...added.map((n) => n.startMin + n.durationMin),
    ];
    const close = loc?.closeMin ?? 1260;
    const start = ends.length ? Math.max(...ends) : loc?.openMin ?? 600;
    setAdded((xs) => [
      ...xs,
      {
        key: `${Date.now()}-${xs.length}`,
        activityId,
        startMin: Math.min(start, close - 30),
        durationMin: a.durationOptions[0] ?? a.durationMin,
        people: booking.people,
      },
    ]);
  }

  // Велика програма: зал потрібен на початку (поїли) і в кінці (торт), а
  // посередині всі на арені. Ріжемо наявний відрізок навпіл — другий шматок
  // іде новою позицією з ціною 0, щоб сума броні не змінилась.
  function splitRoomItem(itemId: string) {
    const it = booking.items.find((x) => x.id === itemId);
    if (!it) return;
    const t = itemTimes[itemId] ?? { startMin: it.startMin, durationMin: it.durationMin };
    if (t.durationMin < 60) {
      setError("Відрізок замалий, щоб його ділити — мінімум 60 хв");
      return;
    }
    const half = Math.max(30, Math.round(t.durationMin / 2 / 30) * 30);
    const tail = Math.max(30, t.durationMin - half);
    setItemTimes((m) => ({ ...m, [itemId]: { ...t, durationMin: half } }));
    setAdded((xs) => [
      ...xs,
      {
        key: `split-${itemId}-${Date.now()}`,
        activityId: it.activityId,
        startMin: t.startMin + t.durationMin - tail,
        durationMin: tail,
        people: itemPeople[itemId] ?? it.people,
        // та сама кімната, що й у першого відрізка (порожньо = підбере сам)
        roomId: itemRooms[itemId] || undefined,
        // розділення не змінює суму — другий відрізок безкоштовний
        price: 0,
      },
    ]);
    setError("");
  }

  // Сума показує лише те, що вже пораховано: ціну дописаних розваг рахує
  // сервер за тарифом, тож до збереження вона невідома.
  const total =
    booking.items
      .filter((i) => !removed.includes(i.id))
      .reduce((s, i) => s + (Number(itemPrices[i.id]) || 0), 0) +
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
          ...(date !== booking.date ? { date } : {}),
          ...(locationId !== booking.locationId ? { locationId } : {}),
          customerName: name,
          customerPhone: phone,
          people,
          prepaidAmount: Number(prepaid) || 0,
          // totalPrice не шлемо: сервер перерахує суму з позицій і додатків,
          // інакше ціна дописаних розваг у неї не потрапила б
          items: booking.items
            .filter((i) => !removed.includes(i.id))
            .map((i) => ({
              id: i.id,
              price: Number(itemPrices[i.id]) || 0,
              people: itemPeople[i.id] ?? i.people,
              // send only when the manager changed it (null = зняти кімнату)
              ...(itemRooms[i.id] !== (i.roomId ?? "")
                ? { roomId: itemRooms[i.id] || null }
                : {}),
              ...(itemVariants[i.id] !== (i.variantId ?? "")
                ? { variantId: itemVariants[i.id] || null }
                : {}),
              ...(itemTimes[i.id]?.startMin !== i.startMin
                ? { startMin: itemTimes[i.id].startMin }
                : {}),
              ...(itemTimes[i.id]?.durationMin !== i.durationMin
                ? { durationMin: itemTimes[i.id].durationMin }
                : {}),
            })),
          ...(removed.length ? { removeItemIds: removed } : {}),
          ...(added.length
            ? {
                addItems: added.map((n) => ({
                  activityId: n.activityId,
                  startMin: n.startMin,
                  durationMin: n.durationMin,
                  people: n.people,
                  ...(n.roomId ? { roomId: n.roomId } : {}),
                  ...(n.variantId ? { variantId: n.variantId } : {}),
                  ...(n.price != null ? { price: n.price } : {}),
                })),
              }
            : {}),
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
          {/* бронь продана як комплекс — ціна фіксована, не сума позицій */}
          {booking.packageName && (
            <span className="rounded-full bg-[#56EF02]/15 px-3 py-1 font-bold text-[#56EF02]">
              🎁 Комплекс «{booking.packageName}»
            </span>
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
            <input
              type="text"
              inputMode="numeric"
              value={peopleStr}
              disabled={!canWrite}
              onChange={(e) => {
                const raw = e.target.value.replace(/\D/g, "");
                setPeopleStr(raw);
                const n = parseInt(raw, 10);
                if (Number.isFinite(n) && n >= 1) setPeople(n);
              }}
              onBlur={() => {
                const n = Math.max(1, parseInt(peopleStr, 10) || people);
                setPeople(n);
                setPeopleStr(String(n));
              }}
              className="w-full rounded-xl border border-[#333] bg-[#0e0e0e] px-3 py-2.5 text-[14px] text-white disabled:opacity-60"
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
          <div>
            <Label>Дата свята</Label>
            <input
              type="date"
              value={date}
              disabled={!canWrite}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-xl border border-[#333] bg-[#0e0e0e] px-3 py-2.5 text-[14px] text-white disabled:opacity-60"
              title="Клієнт переніс святкування — програма переїде на цей день цілком"
            />
          </div>
          <div>
            <Label>Локація</Label>
            <select
              value={locationId}
              disabled={!canWrite}
              onChange={(e) => {
                setLocationId(e.target.value);
                // кімнати старої локації на новій не існують — хай підбере сам
                setItemRooms(Object.fromEntries(booking.items.map((i) => [i.id, ""])));
              }}
              className="w-full rounded-xl border border-[#333] bg-[#0e0e0e] px-3 py-2.5 text-[14px] text-white disabled:opacity-60"
              title="Переїзд свята на інший клуб — кімнати підберуться там заново"
            >
              {catalog.locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
          {(date !== booking.date || locationId !== booking.locationId) && (
            <p className="text-[11px] text-[#f5a623] sm:col-span-2">
              Перенесення
              {date !== booking.date ? ` з ${booking.date}` : ""}
              {locationId !== booking.locationId
                ? ` до «${catalog.locations.find((l) => l.id === locationId)?.name ?? ""}»`
                : ""}
              . Години розваг лишаються ті самі — якщо на новому місці щось зайняте або розвага там
              не проводиться, збереження не пройде і стара бронь залишиться як була. Ціни не
              перераховуються — за потреби змініть вручну.
            </p>
          )}
        </div>

        {/* Розваги: час, тривалість, кімната, сценарій, ціна — усе тут */}
        <div>
          <Label>Розваги та ціни</Label>

          {canWrite && (
            <div className="mb-2 flex flex-wrap gap-2">
              {locActivities.map((a) => (
                <button
                  key={a.id}
                  onClick={() => addActivity(a.id)}
                  className="rounded-full border border-[#333] bg-[#0e0e0e] px-3 py-1.5 text-[12px] font-semibold text-[#bbb] transition hover:border-[#56EF02] hover:text-white"
                >
                  {a.icon} {a.name} +
                </button>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-2">
            {booking.items.map((i) => {
              const rooms = roomOptions(i.activityId);
              const variants = variantsFor(i.activityId);
              const gone = removed.includes(i.id);
              const t = itemTimes[i.id] ?? { startMin: i.startMin, durationMin: i.durationMin };
              return (
                <div
                  key={i.id}
                  className={`flex flex-wrap items-center gap-2 rounded-xl bg-[#0e0e0e] px-3 py-2.5 ${
                    gone ? "opacity-40" : ""
                  }`}
                >
                  <div className="min-w-[130px] flex-1">
                    <div className={`text-[13px] font-semibold ${gone ? "line-through" : ""}`}>
                      {i.title}
                      {i.variantName && (
                        <span className="ml-1.5 font-normal text-[#56EF02]">«{i.variantName}»</span>
                      )}
                    </div>
                    {!rooms.length && i.roomName && (
                      <div className="text-[11px] text-[#888]">{i.roomName}</div>
                    )}
                  </div>

                  <select
                    value={t.startMin}
                    disabled={!canWrite || gone}
                    onChange={(e) =>
                      setItemTimes((m) => ({
                        ...m,
                        [i.id]: { ...t, startMin: Number(e.target.value) },
                      }))
                    }
                    className={`rounded-lg border bg-[#161616] px-2 py-1.5 text-[13px] text-white disabled:opacity-50 ${
                      slotBusy(i.activityId, t.startMin, t.durationMin)
                        ? "border-[#a33] text-[#ff9b9b]"
                        : "border-[#333]"
                    }`}
                    title="Час початку"
                  >
                    {startOptionsFor(t.durationMin).map((m) => (
                      <option key={m} value={m}>
                        {minToHHMM(m)}
                        {slotBusy(i.activityId, m, t.durationMin) ? " · зайнято" : ""}
                      </option>
                    ))}
                  </select>

                  <select
                    value={t.durationMin}
                    disabled={!canWrite || gone}
                    onChange={(e) =>
                      setItemTimes((m) => ({
                        ...m,
                        [i.id]: { ...t, durationMin: Number(e.target.value) },
                      }))
                    }
                    className="rounded-lg border border-[#333] bg-[#161616] px-2 py-1.5 text-[13px] text-white disabled:opacity-50"
                    title="Тривалість"
                  >
                    {durationsFor(i.activityId, t.durationMin).map((d) => (
                      <option key={d} value={d}>
                        {d >= 60 ? `${d / 60} год` : `${d} хв`}
                      </option>
                    ))}
                  </select>

                  {variants.length > 0 && (
                    <select
                      value={itemVariants[i.id] ?? ""}
                      disabled={!canWrite || gone}
                      onChange={(e) => setItemVariants((m) => ({ ...m, [i.id]: e.target.value }))}
                      className="max-w-[170px] rounded-lg border border-[#333] bg-[#161616] px-2 py-1.5 text-[12px] text-white disabled:opacity-50"
                      title="Сценарій"
                    >
                      <option value="">сценарій: не обрано</option>
                      {variants.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name}
                        </option>
                      ))}
                    </select>
                  )}

                  {rooms.length > 0 && (
                    <select
                      value={itemRooms[i.id] ?? ""}
                      disabled={!canWrite || gone}
                      onChange={(e) => setItemRooms((m) => ({ ...m, [i.id]: e.target.value }))}
                      className="max-w-[170px] rounded-lg border border-[#333] bg-[#161616] px-2 py-1.5 text-[12px] text-white disabled:opacity-50"
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

                  <input
                    type="number"
                    min={1}
                    value={itemPeople[i.id] ?? i.people}
                    disabled={!canWrite || gone}
                    onChange={(e) =>
                      setItemPeople((m) => ({ ...m, [i.id]: Math.max(1, Number(e.target.value) || 1) }))
                    }
                    className="w-16 rounded-lg border border-[#333] bg-[#161616] px-2 py-1.5 text-[13px] text-white disabled:opacity-50"
                    title="учасників"
                  />

                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={itemPrices[i.id]}
                      disabled={!canWrite || gone}
                      onChange={(e) =>
                        setItemPrices((p) => ({ ...p, [i.id]: Number(e.target.value) || 0 }))
                      }
                      className="w-24 rounded-lg border border-[#333] bg-[#161616] px-2 py-1.5 text-right text-[13px] text-white disabled:opacity-50"
                      title="ціна"
                    />
                    <span className="text-[12px] text-[#888]">грн</span>
                  </div>

                  {canWrite && !gone && actById.get(i.activityId)?.category === "room" && (
                    <button
                      onClick={() => splitRoomItem(i.id)}
                      className="rounded-lg border border-[#333] px-2 py-1 text-[12px] text-[#bbb] hover:border-[#56EF02] hover:text-white"
                      title="Розбити зал на два відрізки — між ними він вільний для інших"
                    >
                      ✂ розділити
                    </button>
                  )}

                  {canWrite && (
                    <button
                      onClick={() =>
                        setRemoved((r) => (gone ? r.filter((x) => x !== i.id) : [...r, i.id]))
                      }
                      className="h-7 w-7 rounded-full bg-[#2a2a2a] text-[#bbb]"
                      title={gone ? "Повернути" : "Прибрати розвагу"}
                    >
                      {gone ? "↺" : "✕"}
                    </button>
                  )}
                </div>
              );
            })}

            {/* дописані розваги — ціну порахує сервер після збереження */}
            {added.map((n, idx) => {
              const rooms = roomOptions(n.activityId);
              const variants = variantsFor(n.activityId);
              const patch = (p: Partial<NewItem>) =>
                setAdded((xs) => xs.map((x, k) => (k === idx ? { ...x, ...p } : x)));
              return (
                <div
                  key={n.key}
                  className="flex flex-wrap items-center gap-2 rounded-xl border border-[#56EF02]/40 bg-[#56EF02]/10 px-3 py-2.5"
                >
                  <select
                    value={n.activityId}
                    onChange={(e) => {
                      const a = actById.get(e.target.value);
                      patch({
                        activityId: e.target.value,
                        durationMin: a?.durationOptions[0] ?? a?.durationMin ?? 60,
                        roomId: undefined,
                        variantId: undefined,
                      });
                    }}
                    className="min-w-[130px] flex-1 rounded-lg border border-[#333] bg-[#161616] px-2 py-1.5 text-[13px] text-white"
                  >
                    {locActivities.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.icon} {a.name}
                      </option>
                    ))}
                  </select>

                  <select
                    value={n.startMin}
                    onChange={(e) => patch({ startMin: Number(e.target.value) })}
                    className={`rounded-lg border bg-[#161616] px-2 py-1.5 text-[13px] text-white ${
                      slotBusy(n.activityId, n.startMin, n.durationMin)
                        ? "border-[#a33] text-[#ff9b9b]"
                        : "border-[#333]"
                    }`}
                  >
                    {startOptionsFor(n.durationMin).map((m) => (
                      <option key={m} value={m}>
                        {minToHHMM(m)}
                        {slotBusy(n.activityId, m, n.durationMin) ? " · зайнято" : ""}
                      </option>
                    ))}
                  </select>

                  <select
                    value={n.durationMin}
                    onChange={(e) => patch({ durationMin: Number(e.target.value) })}
                    className="rounded-lg border border-[#333] bg-[#161616] px-2 py-1.5 text-[13px] text-white"
                  >
                    {durationsFor(n.activityId, n.durationMin).map((d) => (
                      <option key={d} value={d}>
                        {d >= 60 ? `${d / 60} год` : `${d} хв`}
                      </option>
                    ))}
                  </select>

                  {variants.length > 0 && (
                    <select
                      value={n.variantId ?? ""}
                      onChange={(e) => patch({ variantId: e.target.value || undefined })}
                      className="max-w-[170px] rounded-lg border border-[#333] bg-[#161616] px-2 py-1.5 text-[12px] text-white"
                    >
                      <option value="">сценарій: не обрано</option>
                      {variants.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name}
                        </option>
                      ))}
                    </select>
                  )}

                  {rooms.length > 0 && (
                    <select
                      value={n.roomId ?? ""}
                      onChange={(e) => patch({ roomId: e.target.value || undefined })}
                      className="max-w-[170px] rounded-lg border border-[#333] bg-[#161616] px-2 py-1.5 text-[12px] text-white"
                    >
                      <option value="">кімната: авто</option>
                      {rooms.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  )}

                  <input
                    type="number"
                    min={1}
                    value={n.people}
                    onChange={(e) => patch({ people: Math.max(1, Number(e.target.value) || 1) })}
                    className="w-16 rounded-lg border border-[#333] bg-[#161616] px-2 py-1.5 text-[13px] text-white"
                    title="учасників"
                  />
                  <span className="text-[12px] text-[#888]">
                    {n.price === 0 ? "другий відрізок залу · 0 грн" : "ціна: авто"}
                  </span>

                  <button
                    onClick={() => setAdded((xs) => xs.filter((_, k) => k !== idx))}
                    className="h-7 w-7 rounded-full bg-[#2a2a2a] text-[#bbb]"
                    title="Прибрати"
                  >
                    ✕
                  </button>
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

          {(added.length > 0 || removed.length > 0) && (
            <p className="mt-2 text-[11px] text-[#b6791b]">
              Зміни застосуються після «Зберегти». Сума перерахується автоматично.
            </p>
          )}
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
          <span className="text-[14px] text-[#aaa]">
            Разом
            {added.length > 0 && (
              <span className="ml-2 text-[12px] text-[#b6791b]">
                + {added.length} нов{added.length === 1 ? "а" : "і"} за тарифом
              </span>
            )}
          </span>
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
