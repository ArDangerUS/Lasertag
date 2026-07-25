"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CrmCatalog, CrmBooking } from "@/lib/crm-data";
import { STATUS_META, BOOKING_STATUSES, type BookingStatus } from "@/lib/constants";
import { fmtMoney, minToHHMM } from "@/lib/pricing";
import {
  toISO,
  mondayOf,
  weekDays,
  addDays,
  weekdayShort,
  dayMonth,
  weekRangeLabel,
  longDate,
  weekdayFull,
  isWeekendISO,
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
}: {
  catalog: CrmCatalog;
  canWrite: boolean;
}) {
  const [view, setView] = useState<View>("week");
  const [anchor, setAnchor] = useState<string>(todayISO());
  const [locationFilter, setLocationFilter] = useState<string>("all");
  const [serviceFilter, setServiceFilter] = useState<string>("all");
  const [bookings, setBookings] = useState<CrmBooking[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<CrmBooking | null>(null);
  const [creating, setCreating] = useState<null | { date: string; locationId?: string; startMin?: number }>(null);

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
            <div className="min-w-[150px] text-center text-[15px] font-bold">
              {view === "week" ? weekRangeLabel(monday) : `${weekdayFull(anchor)}, ${longDate(anchor)}`}
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
          onOpen={setEditing}
          onCreate={(locationId, startMin) => setCreating({ date: anchor, locationId, startMin })}
        />
      )}

      {editing && (
        <BookingEditor
          booking={editing}
          catalog={catalog}
          canWrite={canWrite}
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
        {act ? `${act.title} · ${b.people} ос` : `${b.people} ос`}
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
  onOpen,
  onCreate,
}: {
  date: string;
  catalog: CrmCatalog;
  bookings: CrmBooking[];
  locationFilter: string;
  canWrite: boolean;
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

      {/* grid */}
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
    </div>
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
        {act ? `${act.title} · ${b.people} ос · ${b.customerPhone}` : b.customerPhone}
      </div>
    </button>
  );
}

/* ---------------- bits ---------------- */

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
