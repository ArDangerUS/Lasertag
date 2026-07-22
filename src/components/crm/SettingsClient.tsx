"use client";

import { useState } from "react";

type Price = {
  id: string;
  locationName: string;
  durationMin: number | null;
  priceWeekday: number;
  priceWeekend: number;
};
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
  prices: Price[];
};

export default function SettingsClient({ activities }: { activities: Act[] }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-card bg-[#161616] p-6">
        <h2 className="text-[18px] font-extrabold">Розваги і ціни</h2>
        <p className="text-[13px] text-[#888]">
          Редагуйте ціни (будні / вихідні), назви трьома мовами, доступність та розмір груп. Кожна
          зміна фіксується в журналі.
        </p>
      </div>
      {activities.map((a) => (
        <ActivityCard key={a.id} act={a} />
      ))}
    </div>
  );
}

function ActivityCard({ act }: { act: Act }) {
  const [active, setActive] = useState(act.active);
  const [names, setNames] = useState({ uk: act.nameUk, ru: act.nameRu, en: act.nameEn });
  const [group, setGroup] = useState({ min: act.minPeople, max: act.maxPeople, cleanup: act.cleanupMin });
  const [prices, setPrices] = useState(act.prices);
  const [savedFlash, setSavedFlash] = useState("");
  const [busy, setBusy] = useState(false);

  function flash(msg: string) {
    setSavedFlash(msg);
    setTimeout(() => setSavedFlash(""), 1800);
  }

  async function savePrice(p: Price) {
    setBusy(true);
    try {
      const res = await fetch(`/api/crm/prices/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceWeekday: p.priceWeekday, priceWeekend: p.priceWeekend }),
      });
      if (!res.ok) throw new Error();
      flash("Ціну збережено ✓");
    } catch {
      flash("Помилка");
    } finally {
      setBusy(false);
    }
  }

  async function saveActivity() {
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
          minPeople: group.min,
          maxPeople: group.max,
          cleanupMin: group.cleanup,
        }),
      });
      if (!res.ok) throw new Error();
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

      {/* group / cleanup */}
      <div className="mb-4 grid grid-cols-3 gap-3">
        <NumField label="Мін. учасників" value={group.min} onChange={(v) => setGroup((g) => ({ ...g, min: v }))} />
        <NumField label="Макс. учасників" value={group.max} onChange={(v) => setGroup((g) => ({ ...g, max: v }))} />
        <NumField label="Перегрузка, хв" value={group.cleanup} onChange={(v) => setGroup((g) => ({ ...g, cleanup: v }))} />
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
                    value={p.priceWeekday}
                    onChange={(e) =>
                      setPrices((ps) =>
                        ps.map((x, i) => (i === idx ? { ...x, priceWeekday: Number(e.target.value) || 0 } : x))
                      )
                    }
                    className="w-24 rounded-lg border border-[#333] bg-[#0e0e0e] px-2 py-1.5 text-right text-white"
                  />
                </td>
                <td className="py-2 pr-4">
                  <input
                    type="number"
                    value={p.priceWeekend}
                    onChange={(e) =>
                      setPrices((ps) =>
                        ps.map((x, i) => (i === idx ? { ...x, priceWeekend: Number(e.target.value) || 0 } : x))
                      )
                    }
                    className="w-24 rounded-lg border border-[#333] bg-[#0e0e0e] px-2 py-1.5 text-right text-white"
                  />
                </td>
                <td className="py-2">
                  <button
                    onClick={() => savePrice(p)}
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

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-bold uppercase text-[#777]">{label}</div>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="w-full rounded-lg border border-[#333] bg-[#0e0e0e] px-3 py-2 text-[14px] text-white"
      />
    </div>
  );
}
