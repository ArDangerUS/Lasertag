"use client";

import { useState } from "react";

type Price = {
  id: string;
  locationName: string;
  durationMin: number | null;
  priceWeekday: number;
  priceWeekend: number;
};
type Loc = { id: string; name: string };

type Act = {
  id: string;
  key: string;
  nameUk: string;
  nameRu: string;
  nameEn: string;
  icon: string;
  active: boolean;
  perPerson: boolean;
  minPeople: number;
  maxPeople: number;
  cleanupMin: number;
  locationIds: string[];
  prices: Price[];
};

const UNLIMITED = 999; // maxPeople 999 = без обмежень

export default function SettingsClient({
  activities,
  locations,
}: {
  activities: Act[];
  locations: Loc[];
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-card bg-[#161616] p-6">
        <h2 className="text-[18px] font-extrabold">Розваги і ціни</h2>
        <p className="text-[13px] text-[#888]">
          Редагуйте ціни (будні / вихідні), назви трьома мовами, доступність, локації та розмір
          груп. Максимум «∞» = без обмежень. Кожна зміна фіксується в журналі.
        </p>
      </div>
      {activities.map((a) => (
        <ActivityCard key={a.id} act={a} locations={locations} />
      ))}
    </div>
  );
}

function ActivityCard({ act, locations }: { act: Act; locations: Loc[] }) {
  const [active, setActive] = useState(act.active);
  const [names, setNames] = useState({ uk: act.nameUk, ru: act.nameRu, en: act.nameEn });
  // Numeric fields are kept as strings so the user can clear them completely
  // while typing; an empty field falls back to the last saved value.
  const [saved, setSaved] = useState({ min: act.minPeople, max: act.maxPeople, cleanup: act.cleanupMin });
  const [group, setGroup] = useState({
    min: String(act.minPeople),
    max: String(act.maxPeople),
    cleanup: String(act.cleanupMin),
  });
  const [locIds, setLocIds] = useState<string[]>(act.locationIds);
  const [prices, setPrices] = useState(
    act.prices.map((p) => ({ ...p, wdStr: String(p.priceWeekday), weStr: String(p.priceWeekend) }))
  );
  const [savedFlash, setSavedFlash] = useState("");
  const [busy, setBusy] = useState(false);

  function flash(msg: string) {
    setSavedFlash(msg);
    setTimeout(() => setSavedFlash(""), 1800);
  }

  const parseOr = (s: string, fallback: number) => {
    const n = parseInt(s, 10);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  };

  async function savePrice(idx: number) {
    const p = prices[idx];
    const weekday = parseOr(p.wdStr, p.priceWeekday);
    const weekend = parseOr(p.weStr, p.priceWeekend);
    setBusy(true);
    try {
      const res = await fetch(`/api/crm/prices/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceWeekday: weekday, priceWeekend: weekend }),
      });
      if (!res.ok) throw new Error();
      setPrices((ps) =>
        ps.map((x, i) =>
          i === idx
            ? { ...x, priceWeekday: weekday, priceWeekend: weekend, wdStr: String(weekday), weStr: String(weekend) }
            : x
        )
      );
      flash("Ціну збережено ✓");
    } catch {
      flash("Помилка");
    } finally {
      setBusy(false);
    }
  }

  async function saveActivity() {
    const min = Math.max(1, parseOr(group.min, saved.min));
    const max = Math.max(1, parseOr(group.max, saved.max));
    const cleanup = parseOr(group.cleanup, saved.cleanup);
    setBusy(true);
    try {
      const res = await fetch(`/api/crm/activities/${act.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          active,
          nameUk: names.uk,
          nameRu: names.ru,
          nameEn: names.en,
          minPeople: min,
          maxPeople: max,
          cleanupMin: cleanup,
          locationIds: locIds,
        }),
      });
      if (!res.ok) throw new Error();
      setSaved({ min, max, cleanup });
      setGroup({ min: String(min), max: String(max), cleanup: String(cleanup) });
      flash("Збережено ✓");
    } catch {
      flash("Помилка");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-card bg-[#161616] p-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="text-2xl">{act.icon}</span>
        <span className="text-[16px] font-extrabold">{names.uk}</span>
        <span className="rounded-full bg-[#0e0e0e] px-2.5 py-1 text-[11px] text-[#888]">
          {act.perPerson ? "за людину" : "за компанію"}
        </span>
        <label className="ml-auto flex cursor-pointer items-center gap-2 text-[13px]">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          <span className={active ? "text-[#3cba54]" : "text-[#888]"}>
            {active ? "Доступна" : "Прихована"}
          </span>
        </label>
        {savedFlash && <span className="text-[12px] text-[#56EF02]">{savedFlash}</span>}
      </div>

      {/* names */}
      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        {(["uk", "ru", "en"] as const).map((lng) => (
          <div key={lng}>
            <div className="mb-1 text-[11px] font-bold uppercase text-[#777]">Назва {lng}</div>
            <input
              value={names[lng]}
              onChange={(e) => setNames((n) => ({ ...n, [lng]: e.target.value }))}
              className="w-full rounded-lg border border-[#333] bg-[#0e0e0e] px-3 py-2 text-[14px] text-white"
            />
          </div>
        ))}
      </div>

      {/* locations */}
      <div className="mb-4">
        <div className="mb-1.5 text-[11px] font-bold uppercase text-[#777]">Локації</div>
        <div className="flex flex-wrap gap-2">
          {locations.map((l) => {
            const on = locIds.includes(l.id);
            return (
              <button
                key={l.id}
                onClick={() =>
                  setLocIds((ids) => (on ? ids.filter((x) => x !== l.id) : [...ids, l.id]))
                }
                className="rounded-full px-3.5 py-1.5 text-[12px] font-semibold"
                style={{
                  background: on ? "#56EF02" : "#0e0e0e",
                  color: on ? "#111" : "#bbb",
                  border: `1px solid ${on ? "#56EF02" : "#333"}`,
                }}
              >
                {l.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* group / cleanup */}
      <div className="mb-4 grid grid-cols-3 gap-3">
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase text-[#777]">Мін. учасників</span>
            <button
              onClick={() => setGroup((g) => ({ ...g, min: "1" }))}
              className="rounded-lg bg-[#0e0e0e] px-2.5 py-1 text-[12px] font-bold text-[#56EF02] hover:bg-[#1c1c1c]"
              title="Без мінімуму"
            >
              min
            </button>
          </div>
          <input
            type="number"
            value={group.min}
            onChange={(e) => setGroup((g) => ({ ...g, min: e.target.value }))}
            onBlur={() => setGroup((g) => (g.min.trim() === "" ? { ...g, min: String(saved.min) } : g))}
            className="w-full rounded-lg border border-[#333] bg-[#0e0e0e] px-3 py-2 text-[14px] text-white"
          />
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase text-[#777]">Макс. учасників</span>
            <button
              onClick={() => setGroup((g) => ({ ...g, max: String(UNLIMITED) }))}
              className="rounded-lg bg-[#0e0e0e] px-2.5 py-1 text-[13px] font-bold text-[#56EF02] hover:bg-[#1c1c1c]"
              title="Без обмежень"
            >
              ∞ max
            </button>
          </div>
          <div className="relative">
            <input
              type="number"
              value={group.max}
              onChange={(e) => setGroup((g) => ({ ...g, max: e.target.value }))}
              onBlur={() => setGroup((g) => (g.max.trim() === "" ? { ...g, max: String(saved.max) } : g))}
              className="w-full rounded-lg border border-[#333] bg-[#0e0e0e] px-3 py-2 pr-20 text-[14px] text-white"
            />
            {parseInt(group.max, 10) >= UNLIMITED && (
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[15px] font-extrabold text-[#56EF02]">
                ∞ max
              </span>
            )}
          </div>
        </div>
        <div>
          <div className="mb-1 text-[11px] font-bold uppercase text-[#777]">Перегрузка, хв</div>
          <input
            type="number"
            value={group.cleanup}
            onChange={(e) => setGroup((g) => ({ ...g, cleanup: e.target.value }))}
            onBlur={() =>
              setGroup((g) => (g.cleanup.trim() === "" ? { ...g, cleanup: String(saved.cleanup) } : g))
            }
            className="w-full rounded-lg border border-[#333] bg-[#0e0e0e] px-3 py-2 text-[14px] text-white"
          />
        </div>
      </div>

      {/* prices */}
      <div className="overflow-x-auto thin-scroll">
        <table className="w-full min-w-[560px] border-collapse text-[13px]">
          <thead>
            <tr className="text-left text-[11px] uppercase text-[#777]">
              <th className="pb-2 pr-4 font-semibold">Локація</th>
              <th className="pb-2 pr-4 font-semibold">Тривалість</th>
              <th className="pb-2 pr-4 font-semibold">Будній, грн</th>
              <th className="pb-2 pr-4 font-semibold">Вихідний, грн</th>
              <th className="pb-2 font-semibold"></th>
            </tr>
          </thead>
          <tbody>
            {prices.map((p, idx) => (
              <tr key={p.id} className="border-t border-[#242424]">
                <td className="py-2 pr-4 text-[#ccc]">{p.locationName}</td>
                <td className="py-2 pr-4 text-[#aaa]">{p.durationMin ? `${p.durationMin} хв` : "—"}</td>
                <td className="py-2 pr-4">
                  <input
                    type="number"
                    value={p.wdStr}
                    onChange={(e) =>
                      setPrices((ps) => ps.map((x, i) => (i === idx ? { ...x, wdStr: e.target.value } : x)))
                    }
                    onBlur={() =>
                      setPrices((ps) =>
                        ps.map((x, i) =>
                          i === idx && x.wdStr.trim() === "" ? { ...x, wdStr: String(x.priceWeekday) } : x
                        )
                      )
                    }
                    className="w-24 rounded-lg border border-[#333] bg-[#0e0e0e] px-2 py-1.5 text-right text-white"
                  />
                </td>
                <td className="py-2 pr-4">
                  <input
                    type="number"
                    value={p.weStr}
                    onChange={(e) =>
                      setPrices((ps) => ps.map((x, i) => (i === idx ? { ...x, weStr: e.target.value } : x)))
                    }
                    onBlur={() =>
                      setPrices((ps) =>
                        ps.map((x, i) =>
                          i === idx && x.weStr.trim() === "" ? { ...x, weStr: String(x.priceWeekend) } : x
                        )
                      )
                    }
                    className="w-24 rounded-lg border border-[#333] bg-[#0e0e0e] px-2 py-1.5 text-right text-white"
                  />
                </td>
                <td className="py-2">
                  <button
                    onClick={() => savePrice(idx)}
                    disabled={busy}
                    className="rounded-full bg-[#0e0e0e] px-3 py-1.5 text-[12px] font-bold text-[#56EF02]"
                  >
                    Зберегти
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex justify-end">
        <button
          onClick={saveActivity}
          disabled={busy}
          className="rounded-full bg-[#56EF02] px-5 py-2.5 text-[13px] font-bold text-[#1A1A1A]"
        >
          Зберегти розвагу
        </button>
      </div>
    </div>
  );
}
