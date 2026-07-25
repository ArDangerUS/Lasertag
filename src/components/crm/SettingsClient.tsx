"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Price = {
  id: string;
  locationName: string;
  durationMin: number | null;
  priceWeekday: number;
  priceWeekend: number;
};
type Loc = { id: string; name: string };
type LocLink = { locationId: string; capacity: number };

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
  locations: LocLink[];
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
  const [showCreate, setShowCreate] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-card bg-[#161616] p-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1">
            <h2 className="text-[18px] font-extrabold">Розваги і ціни</h2>
            <p className="text-[13px] text-[#888]">
              Ціни (будні / вихідні), назви 3 мовами, локації та кількість кімнат/арен на кожній
              (скільки груп паралельно), розмір груп. «∞» = без обмежень. Кожна зміна — у журналі.
            </p>
          </div>
          <button
            onClick={() => setShowCreate((s) => !s)}
            className="rounded-full bg-[#56EF02] px-4 py-2.5 text-[13px] font-bold text-[#1A1A1A]"
          >
            {showCreate ? "Скасувати" : "+ Нова розвага"}
          </button>
        </div>
        {showCreate && <CreateActivityForm locations={locations} onDone={() => setShowCreate(false)} />}
      </div>
      {activities.map((a) => (
        <ActivityCard key={a.id} act={a} locations={locations} />
      ))}
    </div>
  );
}

/* ---------------- create form ---------------- */

function CreateActivityForm({ locations, onDone }: { locations: Loc[]; onDone: () => void }) {
  const router = useRouter();
  const [nameUk, setNameUk] = useState("");
  const [nameRu, setNameRu] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [icon, setIcon] = useState("🎈");
  const [category, setCategory] = useState<"game" | "show" | "room">("game");
  const [perPerson, setPerPerson] = useState(false);
  const [flexible, setFlexible] = useState(false);
  const [durationMin, setDurationMin] = useState("60");
  const [priceWeekday, setPriceWeekday] = useState("");
  const [priceWeekend, setPriceWeekend] = useState("");
  const [price30Weekday, setPrice30Weekday] = useState("");
  const [price30Weekend, setPrice30Weekend] = useState("");
  const [locs, setLocs] = useState<Record<string, number>>({}); // locationId -> capacity
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function create() {
    setError("");
    const wd = parseInt(priceWeekday, 10);
    const we = parseInt(priceWeekend, 10);
    if (!nameUk.trim()) return setError("Вкажіть назву (укр)");
    if (!Number.isFinite(wd) || !Number.isFinite(we)) return setError("Вкажіть ціни (будні та вихідні)");
    const chosen = Object.entries(locs);
    if (!chosen.length) return setError("Оберіть хоча б одну локацію");
    setBusy(true);
    try {
      const res = await fetch("/api/crm/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nameUk,
          nameRu,
          nameEn,
          icon: icon || "🎈",
          category,
          perPerson,
          flexible,
          durationMin: parseInt(durationMin, 10) || 60,
          priceWeekday: wd,
          priceWeekend: we,
          ...(flexible && price30Weekday !== "" ? { price30Weekday: parseInt(price30Weekday, 10) || 0 } : {}),
          ...(flexible && price30Weekend !== "" ? { price30Weekend: parseInt(price30Weekend, 10) || 0 } : {}),
          locations: chosen.map(([locationId, capacity]) => ({ locationId, capacity })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Помилка");
      onDone();
      router.refresh();
    } catch (e: any) {
      setError(e?.message || "Помилка");
    } finally {
      setBusy(false);
    }
  }

  const inputCls = "w-full rounded-lg border border-[#333] bg-[#0e0e0e] px-3 py-2 text-[14px] text-white";

  return (
    <div className="mt-4 rounded-xl border border-[#2a2a2a] bg-[#0e0e0e] p-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <input placeholder="Назва (укр) *" value={nameUk} onChange={(e) => setNameUk(e.target.value)} className={inputCls} />
        <input placeholder="Назва (рос)" value={nameRu} onChange={(e) => setNameRu(e.target.value)} className={inputCls} />
        <input placeholder="Назва (англ)" value={nameEn} onChange={(e) => setNameEn(e.target.value)} className={inputCls} />
        <div className="flex gap-2">
          <input placeholder="🎈" value={icon} onChange={(e) => setIcon(e.target.value)} className={`${inputCls} w-16 text-center`} title="Іконка (емодзі)" />
          <select value={category} onChange={(e) => setCategory(e.target.value as any)} className={inputCls}>
            <option value="game">Розвага</option>
            <option value="show">Шоу</option>
            <option value="room">Кімната</option>
          </select>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4 text-[13px] text-[#ccc]">
        <label className="flex cursor-pointer items-center gap-2">
          <input type="checkbox" checked={perPerson} onChange={(e) => setPerPerson(e.target.checked)} />
          ціна за людину (інакше — за компанію)
        </label>
        <label className="flex cursor-pointer items-center gap-2">
          <input type="checkbox" checked={flexible} onChange={(e) => setFlexible(e.target.checked)} />
          гнучка тривалість 30/60 хв (слоти з обʼєднанням)
        </label>
        {!flexible && (
          <span className="flex items-center gap-2">
            тривалість, хв:
            <input type="number" value={durationMin} onChange={(e) => setDurationMin(e.target.value)} className={`${inputCls} w-20`} />
          </span>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div>
          <div className="mb-1 text-[11px] font-bold uppercase text-[#777]">{flexible ? "60 хв · будні" : "Ціна · будні"}</div>
          <input type="number" value={priceWeekday} onChange={(e) => setPriceWeekday(e.target.value)} className={inputCls} />
        </div>
        <div>
          <div className="mb-1 text-[11px] font-bold uppercase text-[#777]">{flexible ? "60 хв · вихідні" : "Ціна · вихідні"}</div>
          <input type="number" value={priceWeekend} onChange={(e) => setPriceWeekend(e.target.value)} className={inputCls} />
        </div>
        {flexible && (
          <>
            <div>
              <div className="mb-1 text-[11px] font-bold uppercase text-[#777]">30 хв · будні</div>
              <input type="number" value={price30Weekday} onChange={(e) => setPrice30Weekday(e.target.value)} placeholder="½ від години" className={inputCls} />
            </div>
            <div>
              <div className="mb-1 text-[11px] font-bold uppercase text-[#777]">30 хв · вихідні</div>
              <input type="number" value={price30Weekend} onChange={(e) => setPrice30Weekend(e.target.value)} placeholder="½ від години" className={inputCls} />
            </div>
          </>
        )}
      </div>

      <div className="mt-3">
        <div className="mb-1.5 text-[11px] font-bold uppercase text-[#777]">Локації та кількість кімнат</div>
        <div className="flex flex-wrap gap-2">
          {locations.map((l) => {
            const on = l.id in locs;
            return (
              <span key={l.id} className="flex items-center gap-1">
                <button
                  onClick={() =>
                    setLocs((m) => {
                      const next = { ...m };
                      if (on) delete next[l.id];
                      else next[l.id] = 1;
                      return next;
                    })
                  }
                  className="rounded-full px-3.5 py-1.5 text-[12px] font-semibold"
                  style={{
                    background: on ? "#56EF02" : "#161616",
                    color: on ? "#111" : "#bbb",
                    border: `1px solid ${on ? "#56EF02" : "#333"}`,
                  }}
                >
                  {l.name}
                </button>
                {on && (
                  <input
                    type="number"
                    min={1}
                    value={locs[l.id]}
                    onChange={(e) =>
                      setLocs((m) => ({ ...m, [l.id]: Math.max(1, Number(e.target.value) || 1) }))
                    }
                    title="Кімнат/арен (паралельних груп)"
                    className="w-14 rounded-lg border border-[#333] bg-[#161616] px-2 py-1 text-center text-[12px] text-white"
                  />
                )}
              </span>
            );
          })}
        </div>
      </div>

      {error && <div className="mt-3 text-[13px] text-[#ff8a5c]">{error}</div>}
      <div className="mt-3 flex justify-end">
        <button
          onClick={create}
          disabled={busy}
          className="rounded-full bg-[#56EF02] px-5 py-2.5 text-[13px] font-bold text-[#1A1A1A] disabled:opacity-60"
        >
          {busy ? "Створення…" : "Створити розвагу"}
        </button>
      </div>
    </div>
  );
}

function ActivityCard({ act, locations }: { act: Act; locations: Loc[] }) {
  const router = useRouter();
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
  // locationId -> capacity (rooms/arenas at that location)
  const [locCaps, setLocCaps] = useState<Record<string, number>>(
    Object.fromEntries(act.locations.map((l) => [l.locationId, l.capacity]))
  );
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
          locations: Object.entries(locCaps).map(([locationId, capacity]) => ({
            locationId,
            capacity,
          })),
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

  async function removeActivity() {
    if (!confirm(`Видалити розвагу «${act.nameUk}»? Цю дію не можна буде скасувати.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/crm/activities/${act.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Помилка");
      router.refresh();
    } catch (e: any) {
      alert(e?.message || "Помилка");
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

      {/* locations + rooms count */}
      <div className="mb-4">
        <div className="mb-1.5 text-[11px] font-bold uppercase text-[#777]">
          Локації · кімнат/арен (груп паралельно)
        </div>
        <div className="flex flex-wrap gap-2">
          {locations.map((l) => {
            const on = l.id in locCaps;
            return (
              <span key={l.id} className="flex items-center gap-1">
                <button
                  onClick={() =>
                    setLocCaps((m) => {
                      const next = { ...m };
                      if (on) delete next[l.id];
                      else next[l.id] = 1;
                      return next;
                    })
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
                {on && (
                  <input
                    type="number"
                    min={1}
                    value={locCaps[l.id]}
                    onChange={(e) =>
                      setLocCaps((m) => ({ ...m, [l.id]: Math.max(1, Number(e.target.value) || 1) }))
                    }
                    title="Кімнат/арен на цій локації"
                    className="w-14 rounded-lg border border-[#333] bg-[#0e0e0e] px-2 py-1 text-center text-[12px] text-white"
                  />
                )}
              </span>
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

      <div className="mt-4 flex items-center justify-between">
        <button
          onClick={removeActivity}
          disabled={busy}
          className="rounded-full border border-[#5a2222] px-4 py-2.5 text-[13px] font-bold text-[#ff7a7a] hover:bg-[#2a1414]"
        >
          Видалити
        </button>
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
