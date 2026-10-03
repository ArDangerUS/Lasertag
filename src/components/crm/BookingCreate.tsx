"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CrmCatalog } from "@/lib/crm-data";
import { fmtMoney, minToHHMM, usesWeekendRate } from "@/lib/pricing";
import { computeItemPrice } from "@/lib/item-price";
import { SLOT_STEP_MIN } from "@/lib/constants";
import Modal from "./Modal";

type Line = {
  activityId: string;
  startMin: number;
  durationMin: number;
  people: number;
  price?: number;
  roomId?: string;
  // обраний сценарій (квести)
  variantId?: string;
  // позиція комплексу, зарезервована на весь період свята (банкетна) — не бере
  // участі в послідовному вишиковуванні
  parallel?: boolean;
  // «на весь час свята»: початок і тривалість рахуються з решти позицій
  fullEvent?: boolean;
  // позиція зі складу комплексу — її покриває фіксована ціна комплексу
  fromPackage?: boolean;
  // час виставлено вручну (розділена банкетна зала) — ▲▼ його не чіпають
  manualTime?: boolean;
};

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
  // рядок для поля: можна повністю стерти, на blur повертається значення
  const [peopleStr, setPeopleStr] = useState("10");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  // Коментар менеджера: після створення броні падає у стрічку коментарів
  const [managerComment, setManagerComment] = useState("");
  const [status, setStatus] = useState("CONFIRMED");
  // Аванс одразу при створенні — щоб не шукати бронь удруге.
  const [prepaidStr, setPrepaidStr] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [addonIds, setAddonIds] = useState<Record<string, number>>({});
  // Обраний комплекс: ціна фіксована, склад підставляється цілком.
  const [pkgId, setPkgId] = useState("");
  const [pkgStart, setPkgStart] = useState(initial.startMin ?? 600);
  // ручна ціна комплексу (знижка); порожньо = за тарифом
  const [pkgPriceStr, setPkgPriceStr] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // Зайнятість на обрану дату: щоб зайняті години було видно одразу в списку,
  // а не тільки після натискання «Створити».
  const [busy, setBusy] = useState<Record<string, number[]>>({});

  useEffect(() => {
    if (!locationId || !date) return;
    let alive = true;
    fetch(`/api/availability?locationId=${locationId}&date=${date}`)
      .then((r) => r.json())
      .then((d) => {
        if (alive) setBusy(d.busyByActivity ?? {});
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [locationId, date]);

  const locActivities = useMemo(
    () => catalog.activities.filter((a) => a.locationIds.includes(locationId)),
    [catalog.activities, locationId]
  );
  const locPackages = useMemo(
    () => catalog.packages.filter((p) => p.locationIds.includes(locationId)),
    [catalog.packages, locationId]
  );
  const pkg = useMemo(() => locPackages.find((p) => p.id === pkgId) ?? null, [locPackages, pkgId]);
  const weekend = usesWeekendRate(date);

  const actById = useMemo(
    () => new Map(catalog.activities.map((a) => [a.id, a])),
    [catalog.activities]
  );

  // Ціна комплексу: тариф дня + доплата за учасників понад включену кількість
  // (власна ставка комплексу або 10% від ціни за кожного) — так само, як на сайті.
  const pkgAuto = useMemo(() => {
    if (!pkg) return null;
    const base = weekend ? pkg.fixedWeekend : pkg.fixedWeekday;
    const extraCount = Math.max(0, people - pkg.maxPeople);
    const extraFee = pkg.extraPersonFee > 0 ? pkg.extraPersonFee : Math.round(base * 0.1);
    return { base, extraCount, extraFee, total: base + extraCount * extraFee };
  }, [pkg, weekend, people]);

  // Rooms available for an activity at the chosen location (manager may pin one).
  const roomOptions = (activityId: string) => {
    const act = actById.get(activityId);
    const ids = act?.roomIdsByLocation[locationId] ?? [];
    return ids
      .map((id) => catalog.rooms.find((r) => r.id === id))
      .filter(Boolean) as { id: string; name: string }[];
  };

  // Сценарії розваги, доступні на цій локації (квести).
  const variantOptions = (activityId: string) =>
    (actById.get(activityId)?.variants ?? []).filter((v) => v.locationIds.includes(locationId));

  // Чи вільна розвага на цей проміжок. Банкетні кімнати й інші «кімнатні»
  // позиції так само конкурують за кімнату, тож перевіряємо всіх однаково.
  const slotBusy = (activityId: string, startMin: number, durationMin: number) => {
    const taken = busy[activityId];
    if (!taken?.length) return false;
    const set = new Set(taken);
    for (let m = startMin; m < startMin + durationMin; m += SLOT_STEP_MIN) {
      if (set.has(m)) return true;
    }
    return false;
  };

  // Ціна позиції за тарифом — та сама формула, що й на сервері, щоб менеджер
  // бачив суму ще до створення броні.
  const autoPrice = (l: Line) => {
    const a = actById.get(l.activityId);
    const loc = catalog.locations.find((x) => x.id === locationId);
    if (!a || !loc) return 0;
    return computeItemPrice({
      act: {
        key: a.key,
        perPerson: a.perPerson,
        durationOptions: a.durationOptions.length ? JSON.stringify(a.durationOptions) : "",
        maxPeople: a.maxPeople,
        extraPersonFee: a.extraPersonFee,
        prices: a.prices.map((p) => ({
          locationId: p.locationId,
          durationMin: p.durationMin,
          priceWeekday: p.weekday,
          priceWeekend: p.weekend,
        })),
      },
      locationId,
      locationSlug: loc.slug,
      date,
      startMin: l.startMin,
      durationMin: l.durationMin,
      people: l.people,
    });
  };

  // Позиції «на весь час свята» розтягуються від початку першої розваги до
  // кінця останньої. Рахуємо на льоту, щоб значення завжди були актуальні.
  const effectiveLines = useMemo(() => {
    const anchors = lines.filter((l) => !l.fullEvent);
    if (!anchors.length) return lines;
    const from = Math.min(...anchors.map((l) => l.startMin));
    const to = Math.max(...anchors.map((l) => l.startMin + l.durationMin));
    return lines.map((l) =>
      l.fullEvent ? { ...l, startMin: from, durationMin: Math.max(30, to - from) } : l
    );
  }, [lines]);

  // Послідовне вишиковування: звичайні позиції одна за одною від `from`,
  // паралельні (банкетна на весь період) лишаються на старті.
  function restack(ls: Line[], from: number): Line[] {
    let cursor = from;
    return ls.map((l) => {
      // відрізок, якому менеджер сам виставив час (розділена банкетна)
      if (l.manualTime) return l;
      if (l.parallel || l.fullEvent) return { ...l, startMin: from };
      const next = { ...l, startMin: cursor };
      cursor += l.durationMin;
      return next;
    });
  }

  // Чи стає весь комплекс від цієї години: складові йдуть одна за одною,
  // паралельні (банкетна на весь період) — від самого старту.
  const packageFitsAt = (p: CrmCatalog["packages"][number], startMin: number) => {
    const sorted = [...p.items].sort((a, b) => a.order - b.order);
    let cursor = startMin;
    for (const it of sorted.filter((x) => !x.parallel)) {
      if (slotBusy(it.activityId, cursor, it.durationMin)) return false;
      cursor += it.durationMin;
    }
    for (const it of sorted.filter((x) => x.parallel)) {
      if (slotBusy(it.activityId, startMin, it.durationMin)) return false;
    }
    return true;
  };

  function applyPackage(p: CrmCatalog["packages"][number], startMin: number) {
    const sorted = [...p.items].sort((a, b) => a.order - b.order);
    const seq = sorted.filter((i) => !i.parallel);
    const par = sorted.filter((i) => i.parallel);
    const mk = (it: (typeof sorted)[number], at: number): Line => ({
      activityId: it.activityId,
      startMin: at,
      durationMin: it.durationMin,
      // кількість по кожній складовій обрізається до її фізичного ліміту
      // (квест-кімната до 10) — доплата вже врахована в ціні комплексу
      people: Math.min(people, actById.get(it.activityId)?.maxPeople ?? people),
      parallel: it.parallel,
      fromPackage: true,
    });
    const out: Line[] = [];
    let cursor = startMin;
    for (const it of seq) {
      out.push(mk(it, cursor));
      cursor += it.durationMin;
    }
    for (const it of par) out.push(mk(it, startMin));
    setPkgId(p.id);
    setPkgStart(startMin);
    setPkgPriceStr("");
    setLines(out);
  }

  function clearPackage() {
    setPkgId("");
    setPkgPriceStr("");
    setLines([]);
  }

  // Велика програма: банкетну залу часто беруть не суцільним блоком, а двома
  // відрізками (посиділи — пішли грати — повернулись). Обидва лишаються в
  // складі комплексу, тож ціна не змінюється; між ними зал вільний.
  function splitRoomLine(i: number) {
    setLines((ls) => {
      const src = effectiveLines[i] ?? ls[i];
      if (!src) return ls;
      const half = Math.max(30, Math.round(src.durationMin / 2 / 30) * 30);
      const tail = Math.max(30, src.durationMin - half);
      const first: Line = {
        ...src,
        fullEvent: false,
        manualTime: true,
        startMin: src.startMin,
        durationMin: half,
      };
      const second: Line = {
        ...src,
        fullEvent: false,
        manualTime: true,
        startMin: src.startMin + src.durationMin - tail,
        durationMin: tail,
      };
      const next = [...ls];
      next.splice(i, 1, first, second);
      return next;
    });
  }

  function moveLine(i: number, dir: -1 | 1) {
    setLines((ls) => {
      const j = i + dir;
      if (j < 0 || j >= ls.length) return ls;
      const next = [...ls];
      [next[i], next[j]] = [next[j], next[i]];
      return pkgId ? restack(next, pkgStart) : next;
    });
  }

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
    setLines((ls) => {
      const next = ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l));
      // у комплексі зміна тривалості зсуває всі наступні позиції
      return pkgId && patch.durationMin != null ? restack(next, pkgStart) : next;
    });
  }

  async function save() {
    setError("");
    if (!phone.trim()) return setError("Вкажіть телефон");
    if (effectiveLines.length === 0) return setError("Додайте хоча б одну розвагу");
    setSaving(true);
    try {
      const manualPkgPrice = pkgPriceStr.trim() === "" ? null : Number(pkgPriceStr);
      const res = await fetch("/api/crm/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locationId,
          date,
          people,
          customerName: name,
          customerPhone: phone,
          status,
          ...(prepaidStr.trim() !== "" ? { prepaidAmount: Number(prepaidStr) || 0 } : {}),
          ...(pkgId ? { packageId: pkgId } : {}),
          ...(pkgId && manualPkgPrice != null && Number.isFinite(manualPkgPrice)
            ? { packagePrice: manualPkgPrice }
            : {}),
          items: effectiveLines.map((l) => ({
            activityId: l.activityId,
            startMin: l.startMin,
            durationMin: l.durationMin,
            people: l.people,
            // у комплексі ціну рахує сервер за тарифом комплексу
            ...(!pkgId && l.price != null && !Number.isNaN(l.price) ? { price: l.price } : {}),
            ...(l.roomId ? { roomId: l.roomId } : {}),
            ...(l.variantId ? { variantId: l.variantId } : {}),
            ...(pkgId ? { inPackage: !!l.fromPackage } : {}),
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

  // Ціна комплексу: ручна, якщо менеджер її перебив, інакше за тарифом.
  const pkgPrice = (() => {
    if (!pkg || !pkgAuto) return 0;
    const manual = pkgPriceStr.trim() === "" ? null : Number(pkgPriceStr);
    return manual != null && Number.isFinite(manual) ? manual : pkgAuto.total;
  })();
  // Позиції поза складом комплексу тарифікуються окремо і додаються зверху.
  const extrasTotal = effectiveLines
    .filter((l) => !(pkg && l.fromPackage))
    .reduce((sum, l) => sum + (l.price != null && !Number.isNaN(l.price) ? l.price : autoPrice(l)), 0);
  const addonsTotal = Object.entries(addonIds)
    .filter(([, q]) => q > 0)
    .reduce((sum, [id, q]) => sum + (catalog.addons.find((a) => a.id === id)?.price ?? 0) * q, 0);
  const grandTotal = pkgPrice + extrasTotal + addonsTotal;
  const busyLines = effectiveLines.filter((l) =>
    slotBusy(l.activityId, l.startMin, l.durationMin)
  ).length;

  // Сітка початку — по пів години. Для коротких сеансів (10/20 хв) потрібен
  // дрібніший крок, інакше два підряд поставити неможливо.
  const startOptionsFor = useCallback(
    (durationMin: number) => {
      const loc = catalog.locations.find((l) => l.id === locationId);
      const open = loc?.openMin ?? 600;
      const close = loc?.closeMin ?? 1260;
      const step = durationMin % 30 === 0 ? 30 : 10;
      const arr: number[] = [];
      for (let m = open; m <= close; m += step) arr.push(m);
      return arr;
    },
    [catalog.locations, locationId]
  );
  const startOptions = useMemo(() => startOptionsFor(30), [startOptionsFor]);

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
                setPkgId("");
                setPkgPriceStr("");
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
              type="text"
              inputMode="numeric"
              value={peopleStr}
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
          <div>
            <Label>Аванс, грн</Label>
            <input
              type="text"
              inputMode="numeric"
              value={prepaidStr}
              placeholder="0"
              onChange={(e) => {
                const raw = e.target.value.replace(/\D/g, "");
                setPrepaidStr(raw);
                // внесли аванс — статус сам стає «Аванс»
                if (raw && Number(raw) > 0 && status !== "PREPAID") setStatus("PREPAID");
              }}
              className="w-full rounded-xl border border-[#333] bg-[#0e0e0e] px-3 py-2.5 text-[14px] text-white"
              title="Скільки клієнт уже залишив — записується одразу"
            />
          </div>
        </div>

        {/* packages — фіксована ціна, склад підставляється цілком */}
        {locPackages.length > 0 && (
          <div>
            <Label>Комплекси</Label>
            <div className="mb-2 flex flex-wrap gap-2">
              {locPackages.map((p) => {
                const on = p.id === pkgId;
                const price = weekend ? p.fixedWeekend : p.fixedWeekday;
                return (
                  <button
                    key={p.id}
                    onClick={() => (on ? clearPackage() : applyPackage(p, pkgStart))}
                    className="rounded-full px-3 py-1.5 text-[12px] font-semibold transition"
                    style={{
                      background: on ? "#56EF02" : "#0e0e0e",
                      color: on ? "#111" : "#bbb",
                      border: `1px solid ${on ? "#56EF02" : "#333"}`,
                    }}
                  >
                    {p.icon} {p.name} · {fmtMoney(price)}
                  </button>
                );
              })}
            </div>

            {pkg && pkgAuto && (
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[#56EF02]/40 bg-[#56EF02]/10 px-3 py-2.5">
                <div className="min-w-0 flex-1 text-[13px] text-white">
                  <div className="font-bold">
                    {pkg.icon} {pkg.name}
                    <span className="ml-2 font-normal text-[#bbb]">
                      включено {pkg.maxPeople} осіб · {weekend ? "вихідний" : "будній"}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[12px] text-[#bbb]">
                    {fmtMoney(pkgAuto.base)}
                    {pkgAuto.extraCount > 0 && (
                      <>
                        {" "}
                        + {pkgAuto.extraCount} × {fmtMoney(pkgAuto.extraFee)} за додаткових
                      </>
                    )}{" "}
                    = <span className="font-bold text-white">{fmtMoney(pkgAuto.total)} грн</span>
                  </div>
                </div>
                <div>
                  <div className="mb-1 text-[11px] text-[#888]">Час початку</div>
                  <select
                    value={pkgStart}
                    onChange={(e) => {
                      const m = Number(e.target.value);
                      setPkgStart(m);
                      setLines((ls) => restack(ls, m));
                    }}
                    className="rounded-lg border border-[#333] bg-[#161616] px-2 py-1.5 text-[13px] text-white"
                    title="Години, де програма комплексу не вміщається, позначені «зайнято»"
                  >
                    {startOptions.map((m) => (
                      <option key={m} value={m}>
                        {minToHHMM(m)}
                        {packageFitsAt(pkg, m) ? "" : " · зайнято"}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <div className="mb-1 text-[11px] text-[#888]">Ціна</div>
                  <input
                    type="number"
                    value={pkgPriceStr}
                    placeholder={String(pkgAuto.total)}
                    onChange={(e) => setPkgPriceStr(e.target.value)}
                    className="w-28 rounded-lg border border-[#333] bg-[#161616] px-2 py-1.5 text-right text-[13px] text-white"
                    title="порожньо = ціна за тарифом комплексу"
                  />
                </div>
                <button
                  onClick={clearPackage}
                  className="h-7 w-7 rounded-full bg-[#2a2a2a] text-[#bbb]"
                  title="Прибрати комплекс"
                >
                  ✕
                </button>
              </div>
            )}
          </div>
        )}

        {/* activity lines */}
        <div>
          <Label>{pkg ? "Програма комплексу" : "Розваги"}</Label>
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
            {effectiveLines.map((l, i) => {
              const act = actById.get(l.activityId);
              // короткі сеанси 10/20 хв існують лише в CRM
              const durOptions = (
                act?.durationOptions.length
                  ? [...act.durationOptions, ...(act.crmDurationOptions ?? [])]
                  : [act?.durationMin ?? 60]
              ).sort((x, y) => x - y);
              const variants = variantOptions(l.activityId);
              const isRoom = act?.category === "room";
              const taken = slotBusy(l.activityId, l.startMin, l.durationMin);
              // Склад комплексу — фіксований: за ту саму ціну розваги не
              // підміняються. Міняти можна лише послідовність (▲▼),
              // сценарій, кімнату й кількість учасників.
              const locked = !!pkg && !!l.fromPackage;
              return (
                <div
                  key={i}
                  className={`flex flex-wrap items-center gap-2 rounded-xl px-3 py-2.5 ${
                    taken ? "bg-[#2a1414] ring-1 ring-[#a33]" : "bg-[#0e0e0e]"
                  }`}
                >
                  {pkg && (
                    <div className="flex flex-col">
                      <button
                        onClick={() => moveLine(i, -1)}
                        disabled={i === 0}
                        className="h-4 w-5 text-[10px] leading-none text-[#888] disabled:opacity-30"
                        title="Вище (час перерахується)"
                      >
                        ▲
                      </button>
                      <button
                        onClick={() => moveLine(i, 1)}
                        disabled={i === effectiveLines.length - 1}
                        className="h-4 w-5 text-[10px] leading-none text-[#888] disabled:opacity-30"
                        title="Нижче (час перерахується)"
                      >
                        ▼
                      </button>
                    </div>
                  )}
                  {locked ? (
                    <div
                      className="flex-1 truncate rounded-lg border border-[#2a2a2a] bg-[#141414] px-2 py-1.5 text-[13px] text-[#ddd]"
                      title="Розвага входить у комплекс — замінити її не можна"
                    >
                      {act?.icon} {act?.name}
                    </div>
                  ) : (
                    <select
                      value={l.activityId}
                      onChange={(e) => {
                        const a = actById.get(e.target.value);
                        updateLine(i, {
                          activityId: e.target.value,
                          durationMin: a?.durationOptions[0] ?? a?.durationMin ?? 60,
                          roomId: undefined,
                          variantId: undefined,
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
                  )}
                  {variants.length > 0 && (
                    <select
                      value={l.variantId ?? ""}
                      onChange={(e) => updateLine(i, { variantId: e.target.value || undefined })}
                      className="max-w-[190px] rounded-lg border border-[#333] bg-[#161616] px-2 py-1.5 text-[13px] text-white"
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
                  <select
                    value={l.startMin}
                    disabled={l.fullEvent || (locked && !l.manualTime)}
                    onChange={(e) => updateLine(i, { startMin: Number(e.target.value) })}
                    className={`rounded-lg border bg-[#161616] px-2 py-1.5 text-[13px] text-white disabled:opacity-50 ${
                      taken ? "border-[#a33] text-[#ff9b9b]" : "border-[#333]"
                    }`}
                    title={taken ? "На цей час розвага вже зайнята" : undefined}
                  >
                    {startOptionsFor(l.durationMin).map((m) => (
                      <option key={m} value={m}>
                        {minToHHMM(m)}
                        {slotBusy(l.activityId, m, l.durationMin) ? " · зайнято" : ""}
                      </option>
                    ))}
                  </select>
                  <select
                    value={l.durationMin}
                    disabled={l.fullEvent || (locked && !l.manualTime)}
                    onChange={(e) => updateLine(i, { durationMin: Number(e.target.value) })}
                    className="rounded-lg border border-[#333] bg-[#161616] px-2 py-1.5 text-[13px] text-white disabled:opacity-50"
                  >
                    {(durOptions.includes(l.durationMin)
                      ? durOptions
                      : [...durOptions, l.durationMin].sort((a, b) => a - b)
                    ).map((d) => (
                      <option key={d} value={d}>
                        {d >= 60 ? `${d / 60} год` : `${d} хв`}
                      </option>
                    ))}
                  </select>
                  {isRoom && (
                    <label
                      className="flex items-center gap-1.5 text-[12px] text-[#bbb]"
                      title="Кімната тримається від початку першої розваги до кінця останньої"
                    >
                      <input
                        type="checkbox"
                        checked={!!l.fullEvent}
                        onChange={(e) => updateLine(i, { fullEvent: e.target.checked })}
                      />
                      весь час
                    </label>
                  )}
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
                  {(!pkg || !l.fromPackage) && (
                    <input
                      type="number"
                      value={l.price ?? ""}
                      placeholder={String(autoPrice(l))}
                      onChange={(e) =>
                        updateLine(i, { price: e.target.value === "" ? undefined : Number(e.target.value) })
                      }
                      className="w-24 rounded-lg border border-[#333] bg-[#161616] px-2 py-1.5 text-right text-[13px] text-white"
                      title="ціна (порожньо = за тарифом)"
                    />
                  )}
                  {pkg && l.fromPackage && (
                    <span className="text-[12px] text-[#888]">у комплексі</span>
                  )}
                  {locked && isRoom && (
                    <button
                      onClick={() => splitRoomLine(i)}
                      className="rounded-lg border border-[#333] px-2 py-1 text-[12px] text-[#bbb] hover:border-[#56EF02] hover:text-white"
                      title="Розбити зал на два відрізки — між ними він вільний для інших"
                    >
                      ✂ розділити
                    </button>
                  )}
                  {(!locked || l.manualTime) && (
                    <button
                      onClick={() =>
                        setLines((ls) => {
                          const next = ls.filter((_, idx) => idx !== i);
                          return pkgId ? restack(next, pkgStart) : next;
                        })
                      }
                      className="h-7 w-7 rounded-full bg-[#2a2a2a] text-[#bbb]"
                    >
                      ✕
                    </button>
                  )}
                </div>
              );
            })}
            {effectiveLines.length === 0 && (
              <div className="rounded-xl border border-dashed border-[#333] px-3 py-4 text-center text-[13px] text-[#777]">
                Оберіть комплекс або додайте розваги до броні
              </div>
            )}
          </div>
          <p className="mt-2 text-[11px] text-[#777]">
            {pkg
              ? "Склад комплексу фіксований: розваги та їх тривалість за цю ціну не змінюються. Стрілками ▲▼ міняйте лише послідовність — час перерахується автоматично. Банкетну залу можна розбити на два відрізки кнопкою ✂. Усе інше додавайте окремо — воно порахується понад ціну комплексу."
              : "Порожнє поле ціни = система порахує за тарифом (будній/вихідний). Ціну можна змінити після створення."}
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

        {/* Підсумок: фіксована ціна комплексу + все, що дописали понад нього */}
        <div className="flex items-center justify-between rounded-xl bg-[#0e0e0e] px-4 py-3">
          <div className="text-[13px] text-[#aaa]">
            Разом
            {pkg && (
              <span className="ml-2 text-[12px] text-[#888]">
                комплекс {fmtMoney(pkgPrice)}
                {extrasTotal > 0 && ` + понад програму ${fmtMoney(extrasTotal)}`}
                {addonsTotal > 0 && ` + додатки ${fmtMoney(addonsTotal)}`}
              </span>
            )}
            {!pkg && addonsTotal > 0 && (
              <span className="ml-2 text-[12px] text-[#888]">
                розваги {fmtMoney(extrasTotal)} + додатки {fmtMoney(addonsTotal)}
              </span>
            )}
          </div>
          <div className="text-[20px] font-extrabold text-[#56EF02]">{fmtMoney(grandTotal)} грн</div>
        </div>

        {busyLines > 0 && (
          <div className="rounded-xl border border-[#a33] bg-[#2a1414] px-3 py-2 text-[12px] text-[#ff9b9b]">
            Позначені червоним позиції потрапляють на зайнятий час — оберіть інший або іншу кімнату.
          </div>
        )}

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
