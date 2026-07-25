"use client";

import { useEffect, useMemo, useState } from "react";
import { fmtMoney } from "@/lib/pricing";
import { toISO, mondayOf, addDays, weekRangeLabel, longDate, weekdayFull } from "@/lib/dates";

type Period = "day" | "week" | "month";

type Stats = {
  revenue: number;
  bookings: number;
  participants: number;
  avgCheck: number;
  byLocation: { name: string; revenue: number; count: number }[];
  byActivity: { name: string; icon: string; revenue: number; count: number }[];
  addons: { revenue: number; count: number };
  byDay: { date: string; revenue: number; count: number }[];
};

const MONTHS_UK = [
  "Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень",
  "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень",
];

function todayISO() {
  return toISO(new Date());
}

function monthRange(anchor: string): { from: string; to: string } {
  const [y, m] = anchor.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  const mm = String(m).padStart(2, "0");
  return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(last).padStart(2, "0")}` };
}

export default function StatsClient() {
  const [period, setPeriod] = useState<Period>("week");
  const [anchor, setAnchor] = useState(todayISO());
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);

  const range = useMemo(() => {
    if (period === "day") return { from: anchor, to: anchor };
    if (period === "week") {
      const mon = mondayOf(anchor);
      return { from: mon, to: addDays(mon, 6) };
    }
    return monthRange(anchor);
  }, [period, anchor]);

  const label = useMemo(() => {
    if (period === "day") return `${weekdayFull(anchor)}, ${longDate(anchor)}`;
    if (period === "week") return weekRangeLabel(mondayOf(anchor));
    const [y, m] = anchor.split("-").map(Number);
    return `${MONTHS_UK[m - 1]} ${y}`;
  }, [period, anchor]);

  function navigate(dir: number) {
    if (period === "day") setAnchor((a) => addDays(a, dir));
    else if (period === "week") setAnchor((a) => addDays(mondayOf(a), dir * 7));
    else {
      const [y, m] = anchor.split("-").map(Number);
      const d = new Date(y, m - 1 + dir, 15);
      setAnchor(toISO(d));
    }
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/crm/stats?from=${range.from}&to=${range.to}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setStats(d);
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [range.from, range.to]);

  const maxDay = Math.max(1, ...(stats?.byDay ?? []).map((d) => d.revenue));
  const maxLoc = Math.max(1, ...(stats?.byLocation ?? []).map((l) => l.revenue));
  const maxAct = Math.max(
    1,
    ...(stats?.byActivity ?? []).map((a) => a.revenue),
    stats?.addons.revenue ?? 0
  );

  return (
    <div className="flex flex-col gap-4">
      {/* header + period switch */}
      <div className="flex flex-wrap items-center gap-3 rounded-card bg-[#161616] px-5 py-4">
        <div>
          <div className="text-[18px] font-extrabold">Статистика</div>
          <div className="text-[12px] text-[#888]">виручка без скасованих броней</div>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <div className="flex items-center rounded-full bg-[#0e0e0e] p-1">
            {(
              [
                ["day", "День"],
                ["week", "Тиждень"],
                ["month", "Місяць"],
              ] as [Period, string][]
            ).map(([p, t]) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`rounded-full px-4 py-1.5 text-[13px] font-bold ${
                  period === p ? "bg-[#56EF02] text-[#1A1A1A]" : "text-[#999]"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate(-1)}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0e0e0e] text-[#bbb] hover:text-white"
            >
              ‹
            </button>
            <div className="min-w-[160px] text-center text-[14px] font-bold">{label}</div>
            <button
              onClick={() => navigate(1)}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0e0e0e] text-[#bbb] hover:text-white"
            >
              ›
            </button>
            {loading && <span className="text-[11px] text-[#666]">…</span>}
          </div>
        </div>
      </div>

      {/* totals */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Виручка" value={`${fmtMoney(stats?.revenue ?? 0)} грн`} accent="#56EF02" />
        <Tile label="Броней" value={String(stats?.bookings ?? 0)} />
        <Tile label="Учасників" value={String(stats?.participants ?? 0)} />
        <Tile label="Середній чек" value={`${fmtMoney(stats?.avgCheck ?? 0)} грн`} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* by location */}
        <section className="rounded-card bg-[#161616] p-5">
          <h3 className="mb-3 text-[15px] font-extrabold">По локаціях</h3>
          <div className="flex flex-col gap-2.5">
            {(stats?.byLocation ?? []).map((l) => (
              <BarRow
                key={l.name}
                label={l.name}
                sub={`${l.count} броней`}
                value={l.revenue}
                max={maxLoc}
              />
            ))}
            {!stats?.byLocation.length && <Empty />}
          </div>
        </section>

        {/* by activity */}
        <section className="rounded-card bg-[#161616] p-5">
          <h3 className="mb-3 text-[15px] font-extrabold">По категоріях</h3>
          <div className="flex flex-col gap-2.5">
            {(stats?.byActivity ?? []).map((a) => (
              <BarRow
                key={a.name}
                label={`${a.icon} ${a.name}`}
                sub={`${a.count} сеансів`}
                value={a.revenue}
                max={maxAct}
              />
            ))}
            {(stats?.addons.count ?? 0) > 0 && (
              <BarRow
                label="🛍 Додаткові послуги"
                sub={`${stats!.addons.count} позицій`}
                value={stats!.addons.revenue}
                max={maxAct}
              />
            )}
            {!stats?.byActivity.length && !(stats?.addons.count ?? 0) && <Empty />}
          </div>
        </section>
      </div>

      {/* by day */}
      {period !== "day" && (
        <section className="rounded-card bg-[#161616] p-5">
          <h3 className="mb-3 text-[15px] font-extrabold">Динаміка по днях</h3>
          <div className="flex flex-col gap-1.5">
            {(stats?.byDay ?? []).map((d) => (
              <div key={d.date} className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-[12px] text-[#999]">{d.date.slice(5)}</span>
                <div className="h-5 flex-1 overflow-hidden rounded bg-[#0e0e0e]">
                  <div
                    className="flex h-full items-center rounded bg-[#2f7a0b] pl-2 text-[10px] font-bold text-white"
                    style={{ width: `${Math.max(3, (d.revenue / maxDay) * 100)}%` }}
                  >
                    {d.revenue > 0 ? fmtMoney(d.revenue) : ""}
                  </div>
                </div>
                <span className="w-16 shrink-0 text-right text-[12px] text-[#888]">
                  {d.count} бр.
                </span>
              </div>
            ))}
            {!stats?.byDay.length && <Empty />}
          </div>
        </section>
      )}
    </div>
  );
}

function Tile({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-card bg-[#161616] px-5 py-4">
      <div className="text-[12px] text-[#888]">{label}</div>
      <div className="mt-1 text-[22px] font-extrabold" style={{ color: accent ?? "#fff" }}>
        {value}
      </div>
    </div>
  );
}

function BarRow({ label, sub, value, max }: { label: string; sub: string; value: number; max: number }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="truncate text-[13px] font-semibold">{label}</span>
        <span className="shrink-0 text-[13px] font-bold text-[#56EF02]">{fmtMoney(value)} грн</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="h-2 flex-1 overflow-hidden rounded bg-[#0e0e0e]">
          <div className="h-full rounded bg-[#56EF02]" style={{ width: `${(value / max) * 100}%` }} />
        </div>
        <span className="w-20 shrink-0 text-right text-[11px] text-[#777]">{sub}</span>
      </div>
    </div>
  );
}

function Empty() {
  return <div className="py-4 text-center text-[13px] text-[#666]">Немає даних за період</div>;
}
