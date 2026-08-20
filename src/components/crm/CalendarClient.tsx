"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CrmCatalog, CrmBooking } from "@/lib/crm-data";
import { STATUS_META, BOOKING_STATUSES, type BookingStatus } from "@/lib/constants";
import { fmtMoney, minToHHMM } from "@/lib/pricing";
import {
  toISO,
  fromISO,
  mondayOf,
  weekDays,
  addDays,
  weekdayShort,
  dayMonth,
  weekRangeLabel,
  longDate,
  weekdayFull,
  isWeekendISO,
  MONTHS_NOM_UK,
} from "@/lib/dates";
import BookingEditor from "./BookingEditor";
import BookingCreate from "./BookingCreate";

type View = "week" | "day";

function todayISO() {
  const d = new Date();
  return toISO(d);
}

const HOURS = Array.from({ length: 12 }, (_, i) => 10 + i); // 10:00–21:00

export default function CalendarClient({
  catalog,
  canWrite,
  isAdmin = false,
}: {
  catalog: CrmCatalog;
  canWrite: boolean;
  isAdmin?: boolean;
}) {
  const [view, setView] = useState<View>("week");
  const [anchor, setAnchor] = useState<string>(todayISO());
  const [locationFilter, setLocationFilter] = useState<string>("all");
  const [serviceFilter, setServiceFilter] = useState<string>("all");
  const [bookings, setBookings] = useState<CrmBooking[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<CrmBooking | null>(null);
  const [creating, setCreating] = useState<null | { date: string; locationId?: string; startMin?: number }>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  // Незбережені перенесення часу (drag-and-drop у денному виді, лише адмін):
  // itemId -> новий startMin. Застосовуються кнопкою «Зберегти зміни часу».
  const [timeMoves, setTimeMoves] = useState<Record<string, number>>({});
  const [savingMoves, setSavingMoves] = useState(false);

  useEffect(() => {
    // зміна дня/виду скидає незбережені перенесення
    setTimeMoves({});
  }, [anchor, view]);

  async function saveMoves() {
    const moves = Object.entries(timeMoves).map(([itemId, startMin]) => ({ itemId, startMin }));
    if (!moves.length) return;
    setSavingMoves(true);
    try {
      const res = await fetch("/api/crm/bookings/reschedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moves }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Помилка");
      setTimeMoves({});
      refetch();
    } catch (e: any) {
      alert(e?.message || "Помилка збереження");
    } finally {
      setSavingMoves(false);
    }
  }

  const monday = useMemo(() => mondayOf(anchor), [anchor]);
  const range = useMemo(() => {
    if (view === "week") {
      const days = weekDays(monday);
      return { from: days[0], to: days[6] };
    }
    return { from: anchor, to: anchor };
  }, [view, monday, anchor]);

  const refetch = useCallback(() => {
    setLoading(true);
    fetch(`/api/crm/bookings?from=${range.from}&to=${range.to}`)
      .then((r) => r.json())
      .then((d) => setBookings(d.bookings ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [range.from, range.to]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const filtered = useMemo(
    () =>
      bookings.filter((b) => {
        if (locationFilter !== "all" && b.locationId !== locationFilter) return false;
        if (serviceFilter !== "all" && !b.items.some((i) => i.activityId === serviceFilter)) return false;
        return true;
      }),
    [bookings, locationFilter, serviceFilter]
  );

  function navigate(dir: number) {
    if (view === "week") setAnchor((a) => addDays(mondayOf(a), dir * 7));
    else setAnchor((a) => addDays(a, dir));
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-card bg-[#161616] px-5 py-4">
        <div>
          <div className="text-[18px] font-extrabold">Календар бронювань</div>
          <div className="text-[12px] text-[#888]">
            {view === "week" ? "тижневий огляд" : "погодинний огляд"}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center rounded-full bg-[#0e0e0e] p-1">
            <ToggleBtn on={view === "week"} onClick={() => setView("week")}>
              Тиждень
            </ToggleBtn>
            <ToggleBtn on={view === "day"} onClick={() => setView("day")}>
              День
            </ToggleBtn>
          </div>
          {canWrite && (
            <button
              onClick={() => setCreating({ date: view === "day" ? anchor : todayISO() })}
              className="rounded-full bg-[#56EF02] px-5 py-2.5 text-[14px] font-bold text-[#1A1A1A]"
            >
              + Нова бронь
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 rounded-card bg-[#161616] px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <LocTab on={locationFilter === "all"} onClick={() => setLocationFilter("all")}>
            Всі локації
          </LocTab>
          {catalog.locations.map((l) => (
            <LocTab
              key={l.id}
              on={locationFilter === l.id}
              onClick={() => setLocationFilter(l.id)}
            >
              {l.name}
            </LocTab>
          ))}
          <select
            value={serviceFilter}
            onChange={(e) => setServiceFilter(e.target.value)}
            className="ml-auto rounded-full border border-[#333] bg-[#0e0e0e] px-4 py-2 text-[13px] text-white"
          >
            <option value="all">Всі послуги</option>
            {catalog.activities.map((a) => (
              <option key={a.id} value={a.id}>
                {a.icon} {a.name}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-3">
            {BOOKING_STATUSES.map((s) => (
              <span key={s} className="flex items-center gap-1.5 text-[12px] text-[#aaa]">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ background: STATUS_META[s].dot }}
                />
                {STATUS_META[s].uk}
              </span>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0e0e0e] text-[#bbb] hover:text-white"
            >
              ‹
            </button>
            <div className="relative">
              <button
                onClick={() => setPickerOpen((o) => !o)}
                className="min-w-[150px] rounded-full px-3 py-1 text-center text-[15px] font-bold transition hover:bg-[#0e0e0e] hover:text-[#56EF02]"
                title="Відкрити календар"
              >
                {view === "week" ? weekRangeLabel(monday) : `${weekdayFull(anchor)}, ${longDate(anchor)}`}
                <span className="ml-1.5 text-[11px] text-[#777]">▾</span>
              </button>
              {pickerOpen && (
                <MonthPicker
                  anchor={anchor}
                  view={view}
                  onPick={(iso) => {
                    setAnchor(iso);
                    setPickerOpen(false);
                  }}
                  onClose={() => setPickerOpen(false)}
                />
              )}
            </div>
            <button
              onClick={() => navigate(1)}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0e0e0e] text-[#bbb] hover:text-white"
            >
              ›
            </button>
            {loading && <span className="text-[11px] text-[#666]">оновлення…</span>}
          </div>
        </div>
      </div>

      {view === "week" ? (
        <WeekView
          monday={monday}
          bookings={filtered}
          onOpen={setEditing}
        />
      ) : (
        <DayView
          date={anchor}
          catalog={catalog}
          bookings={filtered}
          locationFilter={locationFilter}
          canWrite={canWrite}
          isAdmin={isAdmin}
          timeMoves={timeMoves}
          onMove={(itemId, startMin) => setTimeMoves((m) => ({ ...m, [itemId]: startMin }))}
          onOpen={setEditing}
          onCreate={(locationId, startMin) => setCreating({ date: anchor, locationId, startMin })}
        />
      )}

      {/* панель незбережених перенесень (drag-and-drop) */}
      {Object.keys(timeMoves).length > 0 && (
        <div className="fixed bottom-5 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-full bg-[#111] px-5 py-3 shadow-[0_10px_40px_rgba(0,0,0,0.5)] ring-1 ring-[#333]">
          <span className="text-[13px] text-[#ddd]">
            Перенесено позицій: <b>{Object.keys(timeMoves).length}</b>
          </span>
          <button
            onClick={saveMoves}
            disabled={savingMoves}
            className="rounded-full bg-[#56EF02] px-4 py-2 text-[13px] font-bold text-[#1A1A1A] disabled:opacity-60"
          >
            {savingMoves ? "Перевірка…" : "Зберегти зміни часу"}
          </button>
          <button
            onClick={() => setTimeMoves({})}
            className="rounded-full border border-[#333] px-3.5 py-2 text-[13px] text-[#bbb]"
          >
            Скасувати
          </button>
        </div>
      )}

      {editing && (
        <BookingEditor
          booking={editing}
          catalog={catalog}
          canWrite={canWrite}
          isAdmin={isAdmin}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refetch();
          }}
        />
      )}
      {creating && (
        <BookingCreate
          catalog={catalog}
          initial={creating}
          onClose={() => setCreating(null)}
          onSaved={() => {
            setCreating(null);
            refetch();
          }}
        />
      )}
    </div>
  );
}

/* ---------------- Week view ---------------- */

function WeekView({
  monday,
  bookings,
  onOpen,
}: {
  monday: string;
  bookings: CrmBooking[];
  onOpen: (b: CrmBooking) => void;
}) {
  const days = weekDays(monday);
  // group bookings by date + hour
  const byCell = useMemo(() => {
    const m: Record<string, CrmBooking[]> = {};
    for (const b of bookings) {
      const start = b.items[0]?.startMin ?? 600;
      const hour = Math.floor(start / 60);
      const key = `${b.date}|${hour}`;
      (m[key] ??= []).push(b);
    }
    return m;
  }, [bookings]);

  return (
    <div className="overflow-x-auto rounded-card bg-white thin-scroll">
      <div style={{ minWidth: 900 }}>
        {/* header */}
        <div className="grid" style={{ gridTemplateColumns: "56px repeat(7, minmax(0, 1fr))" }}>
          <div />
          {days.map((d) => {
            const we = isWeekendISO(d);
            return (
              <div key={d} className="p-2 text-center">
                <div
                  className={`rounded-xl px-2 py-2 ${
                    d === todayISO() ? "bg-[#111] text-white" : "bg-[#f4f4f4] text-[#111]"
                  }`}
                >
                  <div className={`text-[13px] font-bold ${we ? "text-[#e0791b]" : ""}`}>
                    {weekdayShort(d)}
                  </div>
                  <div className={`text-[12px] ${d === todayISO() ? "text-[#56EF02]" : "text-[#888]"}`}>
                    {dayMonth(d)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {/* rows */}
        {HOURS.map((h) => (
          <div
            key={h}
            className="grid border-t border-[#f0f0f0]"
            style={{ gridTemplateColumns: "56px repeat(7, minmax(0, 1fr))", minHeight: 64 }}
          >
            <div className="flex items-start justify-end pr-2 pt-2 text-[12px] font-semibold text-[#999]">
              {h}:00
            </div>
            {days.map((d) => {
              const items = byCell[`${d}|${h}`] ?? [];
              return (
                <div key={d} className="min-w-0 overflow-hidden border-l border-[#f4f4f4] p-1.5">
                  <div className="flex min-w-0 flex-col gap-1.5">
                    {items.map((b) => (
                      <BookingChip key={b.id} b={b} onClick={() => onOpen(b)} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function BookingChip({ b, onClick }: { b: CrmBooking; onClick: () => void }) {
  const meta = STATUS_META[b.status as BookingStatus] ?? STATUS_META.NEW;
  const cancelled = b.status === "CANCELLED";
  const act = b.items[0];
  const bg = cancelled ? "#f3f3f3" : tint(meta.color);
  return (
    <button
      onClick={onClick}
      className="w-full min-w-0 overflow-hidden rounded-lg px-2 py-1.5 text-left"
      style={{ background: bg, borderLeft: `3px solid ${meta.color}` }}
    >
      <div
        className={`truncate text-[12px] font-bold ${cancelled ? "text-[#999] line-through" : "text-[#111]"}`}
      >
        {b.customerName || b.customerPhone}
      </div>
      <div className={`truncate text-[11px] ${cancelled ? "text-[#bbb]" : "text-[#666]"}`}>
        {act
          ? `${act.title}${act.variantName ? ` «${act.variantName}»` : ""} · ${b.people} ос`
          : `${b.people} ос`}
      </div>
    </button>
  );
}

/* ---------------- Day view ---------------- */

function DayView({
  date,
  catalog,
  bookings,
  locationFilter,
  canWrite,
  isAdmin = false,
  timeMoves = {},
  onMove,
  onOpen,
  onCreate,
}: {
  date: string;
  catalog: CrmCatalog;
  bookings: CrmBooking[];
  locationFilter: string;
  canWrite: boolean;
  isAdmin?: boolean;
  timeMoves?: Record<string, number>;
  onMove?: (itemId: string, startMin: number) => void;
  onOpen: (b: CrmBooking) => void;
  onCreate: (locationId: string, startMin: number) => void;
}) {
  const locations =
    locationFilter === "all"
      ? catalog.locations
      : catalog.locations.filter((l) => l.id === locationFilter);

  const weekend = isWeekendISO(date);
  const totalBookings = bookings.length;
  const participants = bookings.reduce((s, b) => s + b.people, 0);
  const revenue = bookings
    .filter((b) => b.status !== "CANCELLED")
    .reduce((s, b) => s + b.totalPrice, 0);
  const unconfirmed = bookings.filter((b) => b.status === "NEW").length;

  const byCell = useMemo(() => {
    const m: Record<string, CrmBooking[]> = {};
    for (const b of bookings) {
      const start = b.items[0]?.startMin ?? 600;
      const hour = Math.floor(start / 60);
      (m[`${b.locationId}|${hour}`] ??= []).push(b);
    }
    return m;
  }, [bookings]);

  const countByLoc = useMemo(() => {
    const m: Record<string, number> = {};
    bookings.forEach((b) => (m[b.locationId] = (m[b.locationId] ?? 0) + 1));
    return m;
  }, [bookings]);

  return (
    <div className="flex flex-col gap-4">
      {/* tariff line */}
      <div className="text-[13px] font-bold text-[#56EF02]">
        {weekend ? "Вихідний / святковий тариф" : "Будній тариф"}
      </div>

      {/* stat tiles */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Бронювань сьогодні" value={String(totalBookings)} />
        <Stat label="Учасників" value={String(participants)} />
        <Stat label="Очікувана виручка" value={`${fmtMoney(revenue)} грн`} />
        <Stat label="Нові / непідтверджені" value={String(unconfirmed)} accent="#f5a623" />
      </div>

      {/* Single location selected → columns per activity with free-room counts */}
      {locations.length === 1 ? (
        <ActivityDayGrid
          location={locations[0]}
          catalog={catalog}
          bookings={bookings.filter((b) => b.locationId === locations[0].id)}
          canWrite={canWrite}
          isAdmin={isAdmin}
          timeMoves={timeMoves}
          onMove={onMove}
          onOpen={onOpen}
          onCreate={onCreate}
        />
      ) : (
      <div className="overflow-x-auto rounded-card bg-white thin-scroll">
        <div style={{ minWidth: Math.max(700, 64 + locations.length * 220) }}>
          <div
            className="grid"
            style={{ gridTemplateColumns: `64px repeat(${locations.length}, minmax(0, 1fr))` }}
          >
            <div />
            {locations.map((l) => (
              <div key={l.id} className="p-2 text-center">
                <div className="rounded-xl bg-[#111] px-3 py-2 text-white">
                  <div className="text-[13px] font-bold">{l.name}</div>
                  <div className="text-[11px] text-[#888]">{countByLoc[l.id] ?? 0} броні</div>
                </div>
              </div>
            ))}
          </div>
          {HOURS.map((h) => (
            <div
              key={h}
              className="grid border-t border-[#f0f0f0]"
              style={{ gridTemplateColumns: `64px repeat(${locations.length}, minmax(0, 1fr))`, minHeight: 68 }}
            >
              <div className="flex items-start justify-end pr-2 pt-2 text-[12px] font-semibold text-[#999]">
                {h}:00
              </div>
              {locations.map((l) => {
                const items = byCell[`${l.id}|${h}`] ?? [];
                return (
                  <div key={l.id} className="min-w-0 overflow-hidden border-l border-[#f4f4f4] p-1.5">
                    {items.length === 0 && canWrite ? (
                      <button
                        onClick={() => onCreate(l.id, h * 60)}
                        className="flex h-full min-h-[52px] w-full items-center justify-center rounded-lg bg-[#fafafa] text-[#ccc] hover:bg-[#f0fbe8] hover:text-[#56b800]"
                      >
                        +
                      </button>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        {items.map((b) => (
                          <DayChip key={b.id} b={b} onClick={() => onOpen(b)} />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      )}
    </div>
  );
}

/* Occupancy grid for ONE location: columns = its activities, each cell shows
   the bookings of that activity in that hour + how many rooms remain free. */
function ActivityDayGrid({
  location,
  catalog,
  bookings,
  canWrite,
  isAdmin = false,
  timeMoves = {},
  onMove,
  onOpen,
  onCreate,
}: {
  location: CrmCatalog["locations"][number];
  catalog: CrmCatalog;
  bookings: CrmBooking[];
  canWrite: boolean;
  isAdmin?: boolean;
  timeMoves?: Record<string, number>;
  onMove?: (itemId: string, startMin: number) => void;
  onOpen: (b: CrmBooking) => void;
  onCreate: (locationId: string, startMin: number) => void;
}) {
  const acts = useMemo(
    () => catalog.activities.filter((a) => a.locationIds.includes(location.id)),
    [catalog.activities, location.id]
  );

  // Що зараз тягнуть (dataTransfer не читається під час dragover, тому ref)
  const dragRef = useRef<{ itemId: string; activityId: string } | null>(null);

  // Every booking item paired with its booking (a booking may span activities).
  // Незбережені перенесення застосовуються одразу для показу.
  const entries = useMemo(() => {
    const list: { b: CrmBooking; it: CrmBooking["items"][number]; moved: boolean }[] = [];
    bookings.forEach((b) =>
      b.items.forEach((it) => {
        const newStart = timeMoves[it.id];
        list.push(
          newStart != null
            ? { b, it: { ...it, startMin: newStart }, moved: true }
            : { b, it, moved: false }
        );
      })
    );
    return list;
  }, [bookings, timeMoves]);

  return (
    <div className="overflow-x-auto rounded-card bg-white thin-scroll">
      <div style={{ minWidth: Math.max(700, 64 + acts.length * 170) }}>
        <div
          className="grid"
          style={{ gridTemplateColumns: `64px repeat(${acts.length}, minmax(0, 1fr))` }}
        >
          <div />
          {acts.map((a) => {
            const cap = a.capacityByLocation[location.id] ?? 1;
            return (
              <div key={a.id} className="min-w-0 p-2 text-center">
                <div className="rounded-xl bg-[#111] px-2 py-2 text-white">
                  <div className="truncate text-[12px] font-bold" title={a.name}>
                    {a.icon} {a.name}
                  </div>
                  <div className="text-[11px] text-[#888]">
                    {cap > 1 ? `${cap} кімнат/арен` : "1 кімната"}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {HOURS.map((h) => (
          <div
            key={h}
            className="grid border-t border-[#f0f0f0]"
            style={{ gridTemplateColumns: `64px repeat(${acts.length}, minmax(0, 1fr))`, minHeight: 64 }}
          >
            <div className="flex items-start justify-end pr-2 pt-2 text-[12px] font-semibold text-[#999]">
              {h}:00
            </div>
            {acts.map((a) => {
              const cap = a.capacityByLocation[location.id] ?? 1;
              const mappedRooms = new Set(a.roomIdsByLocation[location.id] ?? []);
              // chips are rendered in the hour they START in
              const startingHere = entries.filter(
                (e) => e.it.activityId === a.id && Math.floor(e.it.startMin / 60) === h && e.b.status !== "CANCELLED"
              );
              const cancelledHere = entries.filter(
                (e) => e.it.activityId === a.id && Math.floor(e.it.startMin / 60) === h && e.b.status === "CANCELLED"
              );
              // occupancy = rooms taken at minute m: items of ANY activity that
              // sit in one of this activity's rooms (спільна арена лазертаг/
              // сценарний) + roomless items of this activity (legacy)
              const busyAt = (m: number) => {
                const overlapping = entries.filter(
                  (e) =>
                    e.b.status !== "CANCELLED" &&
                    e.it.startMin <= m &&
                    e.it.startMin + e.it.durationMin > m
                );
                const takenRooms = new Set(
                  overlapping
                    .filter((e) => e.it.roomId && mappedRooms.has(e.it.roomId))
                    .map((e) => e.it.roomId as string)
                );
                const roomless = overlapping.filter(
                  (e) => !e.it.roomId && e.it.activityId === a.id
                ).length;
                return takenRooms.size + roomless;
              };
              const maxBusy = Math.max(busyAt(h * 60), busyAt(h * 60 + 30));
              const free = Math.max(0, cap - maxBusy);
              return (
                <DropCell
                  key={a.id}
                  hour={h}
                  canAccept={() => isAdmin && dragRef.current?.activityId === a.id}
                  onDropAt={(startMin) => {
                    const drag = dragRef.current;
                    if (drag && onMove) onMove(drag.itemId, startMin);
                    dragRef.current = null;
                  }}
                >
                  <div className="flex h-full flex-col gap-1.5">
                    {[...startingHere, ...cancelledHere].map(({ b, it, moved }) => (
                      <ItemChip
                        key={it.id}
                        b={b}
                        it={it}
                        moved={moved}
                        draggable={isAdmin && b.status !== "CANCELLED"}
                        onDragStart={() => {
                          dragRef.current = { itemId: it.id, activityId: it.activityId };
                        }}
                        onDragEnd={() => {
                          dragRef.current = null;
                        }}
                        onClick={() => onOpen(b)}
                      />
                    ))}
                    {free > 0 && canWrite && (
                      <button
                        onClick={() => onCreate(location.id, h * 60)}
                        className={`flex w-full flex-1 items-center justify-center gap-1 rounded-lg text-[11px] font-semibold ${
                          maxBusy > 0
                            ? "min-h-[24px] bg-[#f0fbe8] text-[#56b800]"
                            : "min-h-[52px] bg-[#fafafa] text-[#ccc] hover:bg-[#f0fbe8] hover:text-[#56b800]"
                        }`}
                        title="Додати бронь"
                      >
                        {maxBusy > 0 ? `+ вільно ${free}/${cap}` : cap > 1 ? `+ · ${cap} вільно` : "+"}
                      </button>
                    )}
                    {free === 0 && (
                      <div className="rounded-lg bg-[#fdecec] px-2 py-1 text-center text-[10px] font-bold text-[#c05252]">
                        зайнято {maxBusy}/{cap}
                      </div>
                    )}
                  </div>
                </DropCell>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/* Drop-зона однієї клітинки (розвага × година): під час перетягування
   підсвічує половину, куди впаде позиція — :00 (верх) або :30 (низ),
   з великою підказкою часу. */
function DropCell({
  hour,
  canAccept,
  onDropAt,
  children,
}: {
  hour: number;
  canAccept: () => boolean;
  onDropAt: (startMin: number) => void;
  children: React.ReactNode;
}) {
  const [hoverHalf, setHoverHalf] = useState<0 | 30 | null>(null);

  const halfFromEvent = (e: React.DragEvent<HTMLDivElement>): 0 | 30 => {
    const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    return e.clientY - r.top > r.height / 2 ? 30 : 0;
  };

  return (
    <div
      className="relative min-w-0 overflow-hidden border-l border-[#f4f4f4] p-1.5"
      onDragOver={(e) => {
        if (!canAccept()) return;
        e.preventDefault();
        setHoverHalf(halfFromEvent(e));
      }}
      onDragLeave={() => setHoverHalf(null)}
      onDrop={(e) => {
        if (!canAccept()) return;
        e.preventDefault();
        const half = halfFromEvent(e);
        setHoverHalf(null);
        onDropAt(hour * 60 + half);
      }}
    >
      {children}
      {hoverHalf != null && (
        <div
          className="pointer-events-none absolute inset-x-1 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-[#56b800] bg-[#f0fbe8]/90 text-[13px] font-extrabold text-[#3c6b0c]"
          style={hoverHalf === 0 ? { top: 2, bottom: "50%" } : { top: "50%", bottom: 2 }}
        >
          → {hour}:{hoverHalf === 0 ? "00" : "30"}
        </div>
      )}
    </div>
  );
}

/* Chip for a single booking ITEM (used in the per-activity grid). */
function ItemChip({
  b,
  it,
  moved = false,
  draggable = false,
  onDragStart,
  onDragEnd,
  onClick,
}: {
  b: CrmBooking;
  it: CrmBooking["items"][number];
  moved?: boolean;
  draggable?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onClick: () => void;
}) {
  const meta = STATUS_META[b.status as BookingStatus] ?? STATUS_META.NEW;
  const cancelled = b.status === "CANCELLED";
  return (
    <button
      onClick={onClick}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      title={draggable ? "Перетягніть, щоб змінити час (у межах колонки)" : undefined}
      className={`w-full min-w-0 overflow-hidden rounded-lg px-2 py-1.5 text-left ${
        draggable ? "cursor-grab active:cursor-grabbing" : ""
      }`}
      style={{
        background: cancelled ? "#f3f3f3" : tint(meta.color),
        borderLeft: `3px solid ${meta.color}`,
        // незбережене перенесення — пунктирна янтарна рамка
        outline: moved ? "2px dashed #f5a623" : undefined,
        outlineOffset: moved ? -2 : undefined,
      }}
    >
      <div className={`truncate text-[12px] font-bold ${cancelled ? "text-[#999] line-through" : "text-[#111]"}`}>
        {b.customerName || b.customerPhone}
      </div>
      <div className={`truncate text-[11px] ${cancelled ? "text-[#bbb]" : "text-[#666]"}`}>
        {minToHHMM(it.startMin)}–{minToHHMM(it.startMin + it.durationMin)} · {it.people} ос
        {it.roomName ? ` · ${it.roomName}` : ""}
      </div>
    </button>
  );
}

function DayChip({ b, onClick }: { b: CrmBooking; onClick: () => void }) {
  const meta = STATUS_META[b.status as BookingStatus] ?? STATUS_META.NEW;
  const cancelled = b.status === "CANCELLED";
  const act = b.items[0];
  return (
    <button
      onClick={onClick}
      className="w-full min-w-0 overflow-hidden rounded-lg px-2.5 py-2 text-left"
      style={{ background: cancelled ? "#f3f3f3" : tint(meta.color), borderLeft: `3px solid ${meta.color}` }}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={`truncate text-[12px] font-bold ${cancelled ? "text-[#999] line-through" : "text-[#111]"}`}
        >
          {b.customerName || "—"}
        </span>
        <span className={`text-[12px] font-bold ${cancelled ? "text-[#bbb] line-through" : "text-[#111]"}`}>
          {fmtMoney(b.totalPrice)}
        </span>
      </div>
      <div className={`truncate text-[11px] ${cancelled ? "text-[#bbb]" : "text-[#666]"}`}>
        {act
          ? `${act.title}${act.variantName ? ` «${act.variantName}»` : ""} · ${b.people} ос · ${b.customerPhone}`
          : b.customerPhone}
      </div>
    </button>
  );
}

/* ---------------- bits ---------------- */

// Попап-календар: клік по назві періоду відкриває місяць; клік по дню
// переносить на нього (у тижневому режимі — на його тиждень).
function MonthPicker({
  anchor,
  view,
  onPick,
  onClose,
}: {
  anchor: string;
  view: View;
  onPick: (iso: string) => void;
  onClose: () => void;
}) {
  const [ym, setYm] = useState(() => {
    const d = fromISO(anchor);
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const firstISO = toISO(new Date(ym.y, ym.m, 1, 12));
  const gridStart = mondayOf(firstISO);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const today = todayISO();
  const selWeekMon = mondayOf(anchor);

  function shift(dir: number) {
    setYm(({ y, m }) => {
      const d = new Date(y, m + dir, 1, 12);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  }

  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div className="absolute left-1/2 top-full z-40 mt-2 w-[292px] -translate-x-1/2 rounded-2xl border border-[#2a2a2a] bg-[#0e0e0e] p-3 shadow-[0_10px_40px_rgba(0,0,0,0.6)]">
        <div className="mb-2 flex items-center justify-between">
          <button
            onClick={() => shift(-1)}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-[#161616] text-[#bbb] hover:text-white"
          >
            ‹
          </button>
          <div className="text-[13px] font-bold">
            {MONTHS_NOM_UK[ym.m]} {ym.y}
          </div>
          <button
            onClick={() => shift(1)}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-[#161616] text-[#bbb] hover:text-white"
          >
            ›
          </button>
        </div>
        <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-[#666]">
          {["ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ", "НД"].map((w) => (
            <span key={w}>{w}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((iso) => {
            const d = fromISO(iso);
            const inMonth = d.getMonth() === ym.m;
            const isToday = iso === today;
            const selected = view === "week" ? mondayOf(iso) === selWeekMon : iso === anchor;
            return (
              <button
                key={iso}
                onClick={() => onPick(iso)}
                className={`flex h-8 items-center justify-center rounded-lg text-[12px] transition ${
                  selected
                    ? "bg-[#56EF02] font-bold text-[#111]"
                    : isToday
                      ? "bg-[#161616] font-bold text-[#56EF02] ring-1 ring-[#56EF02]"
                      : inMonth
                        ? "text-[#ddd] hover:bg-[#1f1f1f]"
                        : "text-[#555] hover:bg-[#1a1a1a]"
                }`}
              >
                {d.getDate()}
              </button>
            );
          })}
        </div>
        <div className="mt-2 flex justify-between">
          <button
            onClick={() => onPick(today)}
            className="rounded-full px-3 py-1 text-[11px] font-bold text-[#56EF02] hover:bg-[#161616]"
          >
            Сьогодні
          </button>
          <button onClick={onClose} className="rounded-full px-3 py-1 text-[11px] text-[#888] hover:bg-[#161616]">
            Закрити
          </button>
        </div>
      </div>
    </>
  );
}

function ToggleBtn({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-4 py-1.5 text-[13px] font-bold ${
        on ? "bg-[#56EF02] text-[#1A1A1A]" : "text-[#999]"
      }`}
    >
      {children}
    </button>
  );
}

function LocTab({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-[13px] font-semibold ${
        on ? "bg-[#56EF02] text-[#1A1A1A]" : "border border-[#333] text-[#bbb] hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-card bg-white px-5 py-4">
      <div className="text-[12px] text-[#888]">{label}</div>
      <div className="mt-1 text-[24px] font-extrabold" style={{ color: accent ?? "#111" }}>
        {value}
      </div>
    </div>
  );
}

// Light tint of a status color for card backgrounds.
function tint(hex: string): string {
  const map: Record<string, string> = {
    "#f5a623": "#fdf1dd",
    "#3cba54": "#e7f8ea",
    "#3b82f6": "#e6efff",
    "#9ca3af": "#f1f2f4",
  };
  return map[hex] ?? "#f4f4f4";
}
