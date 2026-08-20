"use client";

import PhoneMenu from "./PhoneMenu";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import type { PublicCatalog, PubActivity } from "@/lib/public-catalog";
import type { Dict } from "@/lib/i18n";
import type { Locale } from "@/lib/constants";
import { SLOT_STEP_MIN } from "@/lib/constants";
import {
  resolvePrice,
  tieredBlockPrice,
  usesWeekendRate,
  fmtMoney,
  minToHHMM,
  lasertagMorningDiscount,
} from "@/lib/pricing";

type Pick = { activityId: string; startMin: number };

type Props = {
  catalog: PublicCatalog;
  dict: Dict;
  locale: Locale;
  today: string;
  phone: string;
  viberUrl: string;
  telegramUrl: string;
  // true = сторінка в iframe на WordPress: шапка і плаваючий TG приховані
  embed?: boolean;
  // куди веде логотип: основний сайт клієнта (HOME_URL) або сама сторінка
  homeUrl?: string;
};

const G = "#56EF02";
const PERK_LIMIT = 6; // perks shown before "показати все"
// Плаваюча Telegram-кнопка — лише для прямих заходів на book.lasertag.in.ua.
// В embed-режимі (iframe на WordPress) вона не вмикається: висота iframe
// дорівнює висоті всього вмісту, тому position:fixed «прилипає» не до екрана,
// а до низу сторінки і кнопка не плаває. Для сторінки /book таку кнопку
// додаємо на боці WordPress — див. docs/WORDPRESS.md.
const SHOW_TG_FAB = true;

export default function BookingClient({
  catalog,
  dict,
  locale,
  today,
  phone,
  viberUrl,
  telegramUrl,
  embed = false,
  homeUrl = "/",
}: Props) {
  const locations = catalog.locations;
  const [date, setDate] = useState(today);
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [people, setPeople] = useState(10);
  // Текстове відображення поля «Учасники»: можна повністю стерти під час
  // вводу; порожнє поле при виході відновлюється до останнього значення.
  const [peopleStr, setPeopleStr] = useState("10");
  const [customerPhone, setPhone] = useState("");
  // Ключ сесії для «лідів»: телефон зберігається в CRM, щойно введений,
  // навіть якщо бронювання не завершили. Один ключ = один запис (без дублів).
  const [leadKey, setLeadKey] = useState("");
  useEffect(() => {
    try {
      const existing = sessionStorage.getItem("g75-lead-key");
      if (existing) setLeadKey(existing);
      else {
        const k = crypto.randomUUID();
        sessionStorage.setItem("g75-lead-key", k);
        setLeadKey(k);
      }
    } catch {
      setLeadKey(crypto.randomUUID());
    }
  }, []);
  const [customerName, setName] = useState("");
  const [chosen, setChosen] = useState<Record<string, boolean>>({});
  const [picks, setPicks] = useState<Pick[]>([]);
  const [addonQty, setAddonQty] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState<Record<string, number[]>>({});
  const [occupied, setOccupied] = useState<Record<string, number[]>>({});
  const [loadingAvail, setLoadingAvail] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ code: string; total: number } | null>(null);
  // Package flow: which package's time-picker is open, and the chosen booking.
  const [pkgOpenId, setPkgOpenId] = useState<string | null>(null);
  const [pkgBooking, setPkgBooking] = useState<{ packageId: string; startMin: number } | null>(null);
  const [expandedPerks, setExpandedPerks] = useState<Record<string, boolean>>({});
  // Обраний сценарій розваги (квести): activityId → variantId. Порожньо =
  // «порадьте» — на ціну й доступність часу не впливає.
  const [variantByAct, setVariantByAct] = useState<Record<string, string>>({});

  const location = locations.find((l) => l.id === locationId) ?? locations[0];

  // Якщо сторінку вбудовано в iframe (WordPress-сторінка /book) — повідомляємо
  // батьківському вікну реальну висоту, щоб не було подвійного скролу.
  useEffect(() => {
    if (typeof window === "undefined" || window.parent === window) return;
    const send = () => {
      window.parent.postMessage(
        { type: "g75-embed-height", height: document.documentElement.scrollHeight },
        "*"
      );
    };
    send();
    const ro = new ResizeObserver(send);
    ro.observe(document.documentElement);
    const t = setInterval(send, 1500); // страховка на випадок пропущених змін
    return () => {
      ro.disconnect();
      clearInterval(t);
    };
  }, []);

  // Тихе збереження ліда: щойно у телефоні достатньо цифр — надсилаємо в CRM
  // (з дебаунсом, щоб не смикати сервер на кожну клавішу).
  const lastLeadPayload = useRef("");
  useEffect(() => {
    if (!leadKey) return;
    const digits = customerPhone.replace(/\D/g, "");
    if (digits.length < 9) return;
    const payload = JSON.stringify({
      sessionKey: leadKey,
      phone: customerPhone.trim(),
      name: customerName.trim(),
      locationName: location?.name ?? "",
      date,
      people,
    });
    if (payload === lastLeadPayload.current) return;
    const t = setTimeout(() => {
      lastLeadPayload.current = payload;
      fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
      }).catch(() => {});
    }, 1200);
    return () => clearTimeout(t);
  }, [leadKey, customerPhone, customerName, location?.name, date, people]);
  const weekend = usesWeekendRate(date);

  // Activities available at the current location.
  const locActivities = useMemo(
    () =>
      catalog.activities
        .filter((a) => a.locationIds.includes(locationId))
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [catalog.activities, locationId]
  );

  const actById = useMemo(() => {
    const m = new Map<string, PubActivity>();
    catalog.activities.forEach((a) => m.set(a.id, a));
    return m;
  }, [catalog.activities]);

  // When location changes, drop chosen/picks that no longer apply.
  useEffect(() => {
    setChosen((prev) => {
      const next: Record<string, boolean> = {};
      locActivities.forEach((a) => {
        if (prev[a.id]) next[a.id] = true;
      });
      return next;
    });
    setPicks((prev) => prev.filter((p) => locActivities.some((a) => a.id === p.activityId)));
    // packages are location-specific — reset selection when location changes
    setPkgOpenId(null);
    setPkgBooking(null);
    setExpandedPerks({}); // always collapse details when returning to a location
    setVariantByAct({}); // набір сценаріїв відрізняється по локаціях
  }, [locationId, locActivities]);

  // If the group grows beyond an activity's capacity, drop that selection.
  useEffect(() => {
    setChosen((prev) => {
      const next: Record<string, boolean> = {};
      Object.keys(prev).forEach((id) => {
        const a = actById.get(id);
        if (a && people <= a.maxPeople) next[id] = true;
      });
      return Object.keys(next).length === Object.keys(prev).length ? prev : next;
    });
    setPicks((prev) =>
      prev.filter((p) => {
        const a = actById.get(p.activityId);
        return a && people <= a.maxPeople;
      })
    );
  }, [people, actById]);

  // Packages offered at the current location.
  const locPackages = useMemo(
    () => catalog.packages.filter((p) => p.locationIds.includes(locationId)),
    [catalog.packages, locationId]
  );

  // Expand a package into concrete booking items given a start time.
  // Non-room activities run consecutively (by `order`); room items (banquet)
  // are reserved in parallel from the start for their full duration.
  const expandPackage = useCallback(
    (pkg: PublicCatalog["packages"][number], startMin: number) => {
      const sorted = [...pkg.items].sort((a, b) => a.order - b.order);
      // Sequential items run back-to-back in order; parallel items (whole-event
      // banquet) are reserved from the start for their full duration.
      const seq = sorted.filter((i) => !i.parallel);
      const parallelItems = sorted.filter((i) => i.parallel);
      const out: { activityId: string; startMin: number; durationMin: number; title: string }[] = [];
      let cursor = startMin;
      for (const it of seq) {
        const a = actById.get(it.activityId);
        out.push({ activityId: it.activityId, startMin: cursor, durationMin: it.durationMin, title: a?.name ?? "" });
        cursor += it.durationMin;
      }
      for (const it of parallelItems) {
        const a = actById.get(it.activityId);
        out.push({ activityId: it.activityId, startMin, durationMin: it.durationMin, title: a?.name ?? "" });
      }
      return out;
    },
    [actById]
  );

  // Підбір розстановки комплексу: якщо канонічний порядок упирається в чужу
  // бронь, пробуємо переставити послідовні розваги місцями (бектрекінг).
  // Повертає конкретну розстановку або null, якщо не влазить у жодному порядку.
  const fitPackage = useCallback(
    (pkg: PublicCatalog["packages"][number], startMin: number) => {
      const sorted = [...pkg.items].sort((a, b) => a.order - b.order);
      const seq = sorted.filter((i) => !i.parallel);
      const par = sorted.filter((i) => i.parallel);

      const slotFree = (activityId: string, from: number, dur: number) => {
        if (from < location.openMin || from + dur > location.closeMin) return false;
        const occ = occupied[activityId] ?? [];
        for (let m = from; m < from + dur; m += SLOT_STEP_MIN) {
          if (occ.includes(m)) return false;
        }
        return true;
      };

      // паралельні (банкетна на весь час) — фіксовано від старту
      for (const it of par) {
        if (!slotFree(it.activityId, startMin, it.durationMin)) return null;
      }

      type Placed = { activityId: string; startMin: number; durationMin: number; title: string };
      const mk = (it: (typeof seq)[number], at: number): Placed => ({
        activityId: it.activityId,
        startMin: at,
        durationMin: it.durationMin,
        title: actById.get(it.activityId)?.name ?? "",
      });

      // Перестановки: pool переставляється вільно (бектрекінг, канонічний
      // порядок у пріоритеті), tail іде строго після pool у своєму порядку.
      const tryArrangement = (pool: typeof seq, tail: typeof seq): Placed[] | null => {
        const acc: Placed[] = [];
        const used = new Array(pool.length).fill(false);
        const dfs = (cursor: number, count: number): boolean => {
          if (count === pool.length) {
            let c = cursor;
            const tailPlaced: Placed[] = [];
            for (const it of tail) {
              if (!slotFree(it.activityId, c, it.durationMin)) return false;
              tailPlaced.push(mk(it, c));
              c += it.durationMin;
            }
            acc.push(...tailPlaced);
            return true;
          }
          const tried = new Set<string>();
          for (let i = 0; i < pool.length; i++) {
            if (used[i]) continue;
            const key = `${pool[i].activityId}|${pool[i].durationMin}`;
            if (tried.has(key)) continue; // однакові позиції не дублюємо
            tried.add(key);
            if (!slotFree(pool[i].activityId, cursor, pool[i].durationMin)) continue;
            used[i] = true;
            acc.push(mk(pool[i], cursor));
            if (dfs(cursor + pool[i].durationMin, count + 1)) return true;
            acc.pop();
            used[i] = false;
          }
          return false;
        };
        return dfs(startMin, 0) ? acc : null;
      };

      // Кімнати (банкетна) — завжди в кінці, якщо це взагалі можливо;
      // повна перестановка — лише крайній випадок.
      const games = seq.filter((it) => actById.get(it.activityId)?.category !== "room");
      const rooms = seq.filter((it) => actById.get(it.activityId)?.category === "room");
      const placed = tryArrangement(games, rooms) ?? tryArrangement(seq, []);
      if (!placed) return null;

      return [
        ...placed,
        ...par.map((it) => ({
          activityId: it.activityId,
          startMin,
          durationMin: it.durationMin,
          title: actById.get(it.activityId)?.name ?? "",
        })),
      ];
    },
    [occupied, location, actById]
  );

  // Is the whole package sequence bookable starting at `startMin`?
  const packageFits = useCallback(
    (pkg: PublicCatalog["packages"][number], startMin: number) => fitPackage(pkg, startMin) !== null,
    [fitPackage]
  );

  // Valid start minutes for a package on the current date.
  const packageStarts = useCallback(
    (pkg: PublicCatalog["packages"][number]) => {
      const arr: number[] = [];
      for (let m = location.openMin; m + SLOT_STEP_MIN <= location.closeMin; m += SLOT_STEP_MIN) {
        if (packageFits(pkg, m)) arr.push(m);
      }
      return arr;
    },
    [location, packageFits]
  );

  // Fetch availability whenever location/date changes (+ примусово через
  // availTick: після власного бронювання, помилки конфлікту чи повернення
  // на вкладку — щоб календар не показував застарілу зайнятість).
  const [availTick, setAvailTick] = useState(0);
  useEffect(() => {
    const onFocus = () => setAvailTick((t) => t + 1);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);
  useEffect(() => {
    if (!locationId || !date) return;
    let cancelled = false;
    setLoadingAvail(true);
    fetch(`/api/availability?locationId=${locationId}&date=${date}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) {
          setBusy(d.busyByActivity ?? {});
          setOccupied(d.occupiedByActivity ?? {});
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingAvail(false);
      });
    return () => {
      cancelled = true;
    };
  }, [locationId, date, availTick]);

  // Duration-flexible activities (lasertag, banquet, Gorodok attractions) are
  // booked as 30-min slots; adjacent slots merge into longer blocks in the cart.
  const actDuration = useCallback(
    (a: PubActivity) => (a.durationOptions.length ? 30 : a.durationMin),
    []
  );

  const priceRowsOf = useCallback(
    (a: PubActivity) =>
      a.prices.map((p) => ({
        locationId: p.locationId,
        durationMin: p.durationMin,
        priceWeekday: p.weekday,
        priceWeekend: p.weekend,
      })),
    []
  );

  // Price for a specific duration (30/60 for flexible; null for fixed).
  const priceFor = useCallback(
    (a: PubActivity, durationMin: number | null) =>
      resolvePrice(priceRowsOf(a), { locationId, durationMin, date }) ?? 0,
    [priceRowsOf, locationId, date]
  );

  const unitPrice = useCallback(
    (a: PubActivity) =>
      a.durationOptions.length ? priceFor(a, 30) : priceFor(a, null),
    [priceFor]
  );

  const chosenActs = useMemo(
    () => locActivities.filter((a) => chosen[a.id]),
    [locActivities, chosen]
  );

  // Розваги, у яких на цій локації є сценарії на вибір (квести) і які клієнт
  // уже додав — окремо чи у складі комплексу.
  const variantActs = useMemo(() => {
    const ids = new Set<string>(chosenActs.map((a) => a.id));
    if (pkgBooking) {
      catalog.packages
        .find((x) => x.id === pkgBooking.packageId)
        ?.items.forEach((it) => ids.add(it.activityId));
    }
    return locActivities.filter(
      (a) => ids.has(a.id) && a.variants.some((v) => v.locationIds.includes(locationId))
    );
  }, [chosenActs, pkgBooking, catalog.packages, locActivities, locationId]);

  const toggleChosen = (id: string) =>
    setChosen((prev) => {
      const next = { ...prev };
      if (next[id]) {
        delete next[id];
        setPicks((ps) => ps.filter((p) => p.activityId !== id));
      } else next[id] = true;
      return next;
    });

  // All time ranges this customer has already committed to (any activity + the
  // selected package). One group can't be in two places at once, so these block
  // overlapping slots across every activity's column.
  const myBusyRanges = useMemo(() => {
    const ranges: [number, number][] = [];
    picks.forEach((p) => {
      const a = actById.get(p.activityId);
      // кімнати (банкетна) навмисно паралельні — власний час вони не блокують
      if (a && a.category !== "room") ranges.push([p.startMin, p.startMin + actDuration(a)]);
    });
    if (pkgBooking) {
      const p = catalog.packages.find((x) => x.id === pkgBooking.packageId);
      // та сама розстановка, з якою комплекс реально бронюється
      if (p)
        (fitPackage(p, pkgBooking.startMin) ?? expandPackage(p, pkgBooking.startMin)).forEach((it) => {
          if (actById.get(it.activityId)?.category !== "room")
            ranges.push([it.startMin, it.startMin + it.durationMin]);
        });
    }
    return ranges;
  }, [picks, actById, actDuration, pkgBooking, catalog.packages, fitPackage, expandPackage]);

  // Slot status for an activity's start minute.
  const slotStatus = useCallback(
    (a: PubActivity, startMin: number): "selected" | "busy" | "free" => {
      const dur = actDuration(a);
      const end = startMin + dur;
      if (picks.some((p) => p.activityId === a.id && p.startMin === startMin)) return "selected";
      if (end > location.closeMin) return "busy";
      // busy if another customer already occupies any covered slot
      const b = busy[a.id] ?? [];
      for (let m = startMin; m < end; m += SLOT_STEP_MIN) {
        if (b.includes(m)) return "busy";
      }
      // block anything overlapping this customer's own bookings (all activities
      // + package) — can't do two things at the same time. Банкетна кімната —
      // виняток: вона йде паралельно зі святом (лазертаг 12–13, банкет 12–14).
      if (a.category !== "room") {
        for (const [rs, re] of myBusyRanges) {
          if (startMin < re && rs < end) return "busy";
        }
      }
      return "free";
    },
    [actDuration, picks, busy, location, myBusyRanges]
  );

  const togglePick = (activityId: string, startMin: number) => {
    setError("");
    setPicks((prev) => {
      const exists = prev.some((p) => p.activityId === activityId && p.startMin === startMin);
      if (exists) return prev.filter((p) => !(p.activityId === activityId && p.startMin === startMin));
      return [...prev, { activityId, startMin }];
    });
  };

  // Time grid rows.
  const slots = useMemo(() => {
    const arr: number[] = [];
    for (let m = location.openMin; m + SLOT_STEP_MIN <= location.closeMin; m += SLOT_STEP_MIN)
      arr.push(m);
    return arr;
  }, [location]);

  // Cart. Consecutive 30-min picks of the same flexible activity merge into
  // one block priced as hours + leftover half-hour (2×30 = the hourly price).
  const cart = useMemo(() => {
    type CartItem = {
      key: string;
      activityId: string;
      startMin: number;
      durationMin: number;
      slotStarts: number[]; // constituent picks (for removal)
      title: string;
      icon: string;
      sub: string;
      price: number;
      people: number;
      priceOverride?: number; // explicit price sent to the server (arena closure)
      arenaCombined?: boolean; // this line shows lasertag + arena closure as one
    };
    const items: CartItem[] = [];

    const pushBlock = (a: PubActivity, startMin: number, durationMin: number, slotStarts: number[]) => {
      const factor = lasertagMorningDiscount({
        activityKey: a.key,
        locationSlug: location.slug,
        date,
        startMin,
        durationMin,
      });
      const base = a.durationOptions.length
        ? tieredBlockPrice(priceRowsOf(a), { locationId, date, durationMin })
        : priceFor(a, null);
      const unit = Math.round(base * factor);
      const discounted = factor < 1;
      items.push({
        key: `${a.id}|${startMin}|${durationMin}`,
        activityId: a.id,
        startMin,
        durationMin,
        slotStarts,
        title: a.name,
        icon: a.icon,
        sub: `${minToHHMM(startMin)}–${minToHHMM(startMin + durationMin)}${discounted ? " · −40%" : ""} · ${
          a.perPerson ? `${people} × ${fmtMoney(unit)}` : dict.perGroup
        }`,
        price: a.perPerson ? unit * Math.max(1, people) : unit,
        people: a.perPerson ? Math.max(1, people) : Math.min(people, a.maxPeople),
      });
    };

    const byAct = new Map<string, number[]>();
    picks.forEach((p) => {
      const arr = byAct.get(p.activityId) ?? [];
      arr.push(p.startMin);
      byAct.set(p.activityId, arr);
    });
    byAct.forEach((starts, activityId) => {
      const a = actById.get(activityId);
      if (!a) return;
      const sorted = [...starts].sort((x, y) => x - y);
      if (!a.durationOptions.length) {
        // fixed-duration activity: each pick is its own item
        sorted.forEach((s) => pushBlock(a, s, a.durationMin, [s]));
        return;
      }
      // flexible: merge consecutive 30-min slots
      const emit = (start: number, slots: number[]) => {
        const end = start + slots.length * 30;
        // The −40% hour (10:00–11:00, Mon–Thu) applies only to the full hour.
        // A longer block starting at 10:00 is split so the discounted hour and
        // the regular remainder show as two separate lines.
        const discountedHour =
          lasertagMorningDiscount({
            activityKey: a.key,
            locationSlug: location.slug,
            date,
            startMin: start,
            durationMin: Math.min(end, 660) - start,
          }) < 1;
        if (discountedHour && end > 660) {
          const before = slots.filter((s) => s < 660);
          const after = slots.filter((s) => s >= 660);
          pushBlock(a, start, before.length * 30, before);
          if (after.length) pushBlock(a, 660, after.length * 30, after);
          return;
        }
        pushBlock(a, start, slots.length * 30, slots);
      };
      let blockStart = sorted[0];
      let run: number[] = [sorted[0]];
      for (let i = 1; i <= sorted.length; i++) {
        const cur = sorted[i];
        if (cur != null && cur === run[run.length - 1] + 30) {
          run.push(cur);
          continue;
        }
        emit(blockStart, [...run]);
        if (cur != null) {
          blockStart = cur;
          run = [cur];
        }
      }
    });
    items.sort((x, y) => x.startMin - y.startMin);

    // «Індивідуальне закриття арени» — 14 000 грн ЗА ГОДИНУ НА КОМПАНІЮ, а не
    // додатково до лазертагу. Доступне лише коли обрана 1 година лазертагу;
    // тоді ця година входить у ціну закриття (стає 0 у кошику).
    const laserAct = catalog.activities.find((x) => x.key === "laser");
    const arenaAddon = catalog.addons.find((x) => x.key === "arena");
    const arenaOn = arenaAddon ? (addonQty[arenaAddon.id] ?? 0) > 0 : false;
    const arenaBlockIdx = laserAct
      ? items.findIndex((i) => i.activityId === laserAct.id && i.durationMin === 60)
      : -1;
    const arenaApplied = arenaOn && arenaBlockIdx >= 0;
    if (arenaApplied && arenaAddon) {
      // Show lasertag + closure as ONE combined line at the full arena price.
      // The server still receives them separately (laser price 0 + the addon)
      // so the CRM keeps a clear breakdown.
      const it = items[arenaBlockIdx];
      it.title = `${it.title} · ${dict.arenaTag}`;
      it.price = arenaAddon.price;
      it.priceOverride = 0;
      it.arenaCombined = true;
      it.sub = `${minToHHMM(it.startMin)}–${minToHHMM(it.startMin + it.durationMin)} · ${dict.arenaAll}`;
    }

    const addons = catalog.addons
      .filter((ad) => (addonQty[ad.id] ?? 0) > 0)
      // arena is rendered inside the combined lasertag line, never separately
      .filter((ad) => ad.key !== "arena")
      .map((ad) => {
        const qty = addonQty[ad.id];
        const price = ad.tiers ? (ad.tiers[String(qty)] ?? ad.price * qty) : ad.price * qty;
        return { id: ad.id, title: ad.name, qty, price, tiered: !!ad.tiers };
      });
    const arenaAddonId = arenaApplied && arenaAddon ? arenaAddon.id : null;

    // Selected package (if any) → concrete booking items at fixed price.
    let pkg: {
      packageId: string;
      name: string;
      icon: string;
      price: number;
      startMin: number;
      endMin: number;
      items: { activityId: string; startMin: number; durationMin: number; title: string }[];
    } | null = null;
    if (pkgBooking) {
      const p = catalog.packages.find((x) => x.id === pkgBooking.packageId);
      if (p) {
        // Розстановка з урахуванням перестановок (fallback — канонічний порядок)
        const expanded = fitPackage(p, pkgBooking.startMin) ?? expandPackage(p, pkgBooking.startMin);
        // Доплата за учасників понад включену кількість: фіксована ставка
        // («Сталкер» 1500 грн) або 10% від ціни комплексу за кожного.
        const base = weekend ? p.fixedWeekend : p.fixedWeekday;
        const extraCount = Math.max(0, people - p.maxPeople);
        const extraFee = p.extraPersonFee > 0 ? p.extraPersonFee : Math.round(base * 0.1);
        const price = base + extraCount * extraFee;
        const endMin = Math.max(...expanded.map((i) => i.startMin + i.durationMin));
        pkg = {
          packageId: p.id,
          name: p.name,
          icon: p.icon,
          price,
          startMin: pkgBooking.startMin,
          endMin,
          items: expanded,
        };
      }
    }

    const total =
      items.reduce((s, i) => s + i.price, 0) +
      addons.reduce((s, a) => s + a.price, 0) +
      (pkg?.price ?? 0);
    return { items, addons, pkg, total, arenaAddonId };
  }, [picks, actById, people, dict, catalog.activities, catalog.addons, catalog.packages, addonQty, pkgBooking, fitPackage, expandPackage, weekend, location.slug, date, locationId, priceRowsOf, priceFor]);

  // Arena closure is only meaningful with a 1-hour lasertag block selected.
  const laserActId = useMemo(
    () => catalog.activities.find((a) => a.key === "laser")?.id,
    [catalog.activities]
  );
  const arenaEligible = useMemo(
    () => cart.items.some((i) => i.activityId === laserActId && i.durationMin === 60),
    [cart.items, laserActId]
  );
  // Auto-unselect the arena addon when the qualifying hour disappears.
  useEffect(() => {
    const arena = catalog.addons.find((a) => a.key === "arena");
    if (!arena) return;
    if ((addonQty[arena.id] ?? 0) > 0 && !arenaEligible) {
      setAddonQty((q) => ({ ...q, [arena.id]: 0 }));
    }
  }, [arenaEligible, addonQty, catalog.addons]);

  async function submit() {
    setError("");
    if (!customerPhone.trim()) return setError(dict.errPhone);
    if (cart.items.length === 0 && !cart.pkg) return setError(dict.errEmpty);
    if (!people || people < 1) return setError(dict.errPeople);
    setSubmitting(true);
    try {
      // Individual activity picks. priceOverride (0) is sent for the lasertag
      // hour covered by the arena closure so the server doesn't re-price it.
      const individualItems = cart.items.map((i) => ({
        activityId: i.activityId,
        startMin: i.startMin,
        durationMin: i.durationMin,
        people: i.people,
        ...(i.priceOverride != null ? { price: i.priceOverride } : {}),
        ...(variantByAct[i.activityId] ? { variantId: variantByAct[i.activityId] } : {}),
      }));
      // Package items: ціну комплексу рахує сервер за packageId (щоб клієнт
      // не міг її підмінити) — сюди йде лише склад і час.
      const packageItems = cart.pkg
        ? cart.pkg.items.map((it) => ({
            activityId: it.activityId,
            startMin: it.startMin,
            durationMin: it.durationMin,
            // кількість по кожній складовій обрізається до її фізичного
            // ліміту (наприклад, квест-кімната до 10) — доплата за
            // додаткових учасників уже врахована в ціні комплексу
            people: Math.min(people, actById.get(it.activityId)?.maxPeople ?? people),
            ...(variantByAct[it.activityId] ? { variantId: variantByAct[it.activityId] } : {}),
          }))
        : [];

      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locationId,
          date,
          people,
          customerName,
          customerPhone,
          comment: "",
          lang: locale,
          ...(cart.pkg ? { packageId: cart.pkg.packageId } : {}),
          items: [...individualItems, ...packageItems],
          addons: [
            ...cart.addons.map((a) => ({ addonId: a.id, qty: a.qty })),
            // arena closure is displayed inside the combined lasertag line but
            // is stored as a separate addon for a clear CRM breakdown
            ...(cart.arenaAddonId ? [{ addonId: cart.arenaAddonId, qty: 1 }] : []),
          ],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Помилка");
      setResult({ code: data.code, total: data.total });
      // бронювання завершено — лід більше не потрібен
      if (leadKey) fetch(`/api/leads?key=${leadKey}`, { method: "DELETE" }).catch(() => {});
      // календар зайнятості одразу враховує щойно створену бронь
      setAvailTick((t) => t + 1);
    } catch (e: any) {
      setError(e?.message || "Помилка");
      // конфлікт = хтось устиг зайняти час; тягнемо свіжу зайнятість
      setAvailTick((t) => t + 1);
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setResult(null);
    setPicks([]);
    setChosen({});
    setAddonQty({});
    setPkgBooking(null);
    setPkgOpenId(null);
  }

  const summaryLine = `${location.name} · ${date}${weekend ? ` · ${dict.weekendBadge}` : ""} · ${people} ${dict.peopleWord}`;

  return (
    <div style={{ minHeight: "100vh", background: "#f2f2f2" }}>
      {/* Header (sticky, like the main site; compact on phones) */}
      {embed ? (
        // embed-режим (iframe на WordPress): шапка сайту вже є в обгортки —
        // лишаємо компактне посилання «на основний сайт» і перемикач мови.
        // target="_top" обовʼязково: інакше основний сайт відкриється
        // всередині iframe.
        <div className="flex items-center gap-3 px-4 pt-3 md:px-10">
          <a
            href={homeUrl}
            target="_top"
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-green transition hover:opacity-80 sm:text-[14px]"
          >
            <span aria-hidden="true">←</span>
            {dict.backToSite}
          </a>
          <div className="ml-auto">
            <LangDropdown locale={locale} embed />
          </div>
        </div>
      ) : (
      <header className="sticky top-0 z-50 flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-[#e8e8e8] bg-white px-4 py-2 sm:gap-x-6 sm:py-3 md:px-10">
        {/* LEFT: logo (→ start screen) + brand name, contacts underneath */}
        <div className="flex min-w-0 flex-1 items-center gap-2.5 sm:gap-3">
          {/* логотип веде на основний сайт (або на початок бронювання) */}
          <a href={homeUrl} target="_top" aria-label={dict.brandName} className="shrink-0">
            <BrandLogo />
          </a>
          <div className="min-w-0 leading-tight">
            <div className="truncate text-[15px] font-bold text-brand-green sm:text-[17px]">
              {dict.brandName}
            </div>
            <div className="mt-1 flex items-center gap-1.5 sm:gap-2">
              <a
                href="https://t.me/Lasertag_G75"
                target="_blank"
                rel="noreferrer"
                aria-label="Telegram"
                title="Telegram"
                className="flex h-6 w-6 items-center justify-center rounded-full bg-[#229ED9] text-white transition hover:opacity-90 sm:h-7 sm:w-7"
              >
                <TelegramGlyph />
              </a>
              <a
                href="viber://chat?number=%2B380994895161"
                aria-label="Viber"
                title="Viber"
                className="flex h-6 w-6 items-center justify-center rounded-full bg-[#7360F2] text-white transition hover:opacity-90 sm:h-7 sm:w-7"
              >
                <ViberGlyph />
              </a>
              {/* на телефоні тап відкриває вибір (дзвінок / контакти / копія),
                  на компі — звичайний клік-дзвінок як раніше */}
              <PhoneMenu
                phone={phone}
                contactName={dict.brandName}
                variant="light"
                desktopPlainCall
                labels={{
                  call: dict.phoneCall,
                  add: dict.phoneAddContact,
                  copy: dict.phoneCopy,
                  copied: dict.phoneCopied,
                }}
                className="text-[12px] font-bold text-brand-ink sm:text-[14px]"
              />
            </div>
          </div>
        </div>

        {/* RIGHT: languages only */}
        <div className="ml-auto flex items-center">
          <LangDropdown locale={locale} />
        </div>
      </header>
      )}

      {/* Плаваюча кнопка Telegram — на всіх екранах; в embed-режимі
          прихована (на сайті-обгортці свої контакти/віджети) */}
      {SHOW_TG_FAB && !embed && (
        <a
          href="https://t.me/Lasertag_G75"
          target="_blank"
          rel="noreferrer"
          aria-label="Telegram"
          className="fixed right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#229ED9] text-white shadow-[0_6px_20px_rgba(34,158,217,0.45)] transition hover:scale-105 active:scale-95"
          style={{ bottom: "calc(20px + env(safe-area-inset-bottom))" }}
        >
          <svg
            width="26"
            height="26"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
            style={{ marginLeft: -2, marginTop: 2 }}
          >
            <path d="M23.91 3.79 20.3 20.84c-.25 1.21-.98 1.5-2 .94l-5.5-4.07-2.66 2.57c-.3.3-.55.56-1.1.56-.72 0-.6-.27-.84-.95L6.3 13.7l-5.45-1.7c-1.18-.35-1.19-1.16.26-1.75l21.26-8.2c.97-.43 1.9.24 1.53 1.73Z" />
          </svg>
        </a>
      )}

      <div className="mx-auto max-w-[1280px] px-5 pb-16 pt-8 md:px-10">
        {/* Title */}
        <div className="mb-6 flex flex-wrap items-baseline gap-4">
          <h1 className="m-0 text-[34px] font-extrabold text-brand-ink">{dict.title}</h1>
          <p className="m-0 text-[15px] text-[#777]">{dict.subtitle}</p>
        </div>

        {/* Step 1 */}
        <div className="grid grid-cols-1 gap-6 rounded-card bg-white p-6 shadow-card md:grid-cols-4">
          <Field n={1} label={dict.stepDate} badge={weekend ? dict.weekendBadge : undefined}>
            <DatePicker value={date} min={today} onChange={setDate} locale={locale} />
          </Field>
          <Field n={2} label={dict.stepLocation}>
            <select
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              className="w-full rounded-xl border border-[#E5E5E5] bg-white px-3.5 py-3 text-[15px]"
            >
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </Field>
          <Field n={3} label={dict.stepPeople}>
            <div className="flex items-stretch gap-2">
              <button
                onClick={() => {
                  const next = Math.max(1, people - 1);
                  setPeople(next);
                  setPeopleStr(String(next));
                }}
                className="w-11 rounded-xl border border-[#E5E5E5] bg-white text-lg font-bold"
              >
                −
              </button>
              <input
                type="text"
                inputMode="numeric"
                value={peopleStr}
                onChange={(e) => {
                  const raw = e.target.value.replace(/\D/g, "");
                  setPeopleStr(raw);
                  const n = parseInt(raw, 10);
                  if (Number.isFinite(n) && n >= 1) setPeople(Math.min(100, n));
                }}
                onBlur={() => {
                  const n = Math.min(100, Math.max(1, parseInt(peopleStr, 10) || people));
                  setPeople(n);
                  setPeopleStr(String(n));
                }}
                className="w-full rounded-xl border border-[#E5E5E5] px-3.5 py-3 text-center text-[15px]"
              />
              <button
                onClick={() => {
                  const next = Math.min(100, people + 1);
                  setPeople(next);
                  setPeopleStr(String(next));
                }}
                className="w-11 rounded-xl border border-[#E5E5E5] bg-white text-lg font-bold"
              >
                +
              </button>
            </div>
          </Field>
          <Field n={4} label={dict.stepPhone}>
            <input
              type="tel"
              name="phone"
              // браузер сам пропонує збережений номер — заповнення одним тапом
              autoComplete="tel"
              inputMode="tel"
              placeholder={dict.phonePlaceholder}
              value={customerPhone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-xl border border-[#E5E5E5] px-3.5 py-3 text-[15px]"
            />
            {/* прозора згода: номер може використовуватись для зв'язку */}
            <p className="mb-0 mt-1.5 text-[11px] leading-snug text-[#a5a5a5]">{dict.phoneConsent}</p>
          </Field>
        </div>

        {/* Main grid */}
        <div className="mt-6 grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex min-w-0 flex-col gap-6">
            {/* Packages (комплекси) — per location, booked as a sequence */}
            {locPackages.length > 0 && (
              <section className="rounded-card bg-white p-7 shadow-card">
                <h2 className="m-0 text-[22px] font-extrabold text-brand-ink">{dict.packagesTitle}</h2>
                <p className="mb-4 mt-1 text-[13px] text-[#999]">{dict.packagesHint}</p>
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                  {locPackages.map((p) => {
                    const basePrice = weekend ? p.fixedWeekend : p.fixedWeekday;
                    const extraCount = Math.max(0, people - p.maxPeople);
                    const extraFee = p.extraPersonFee > 0 ? p.extraPersonFee : Math.round(basePrice * 0.1);
                    const price = basePrice + extraCount * extraFee;
                    const open = pkgOpenId === p.id;
                    const chosenPkg = pkgBooking?.packageId === p.id;
                    const perksExpanded = !!expandedPerks[p.id];
                    // Пункт про доплату йде одразу після «До N учасників»
                    // з уже порахованою ставкою для цього комплексу.
                    const feePerk = dict.pkgPerkExtra.replace("{fee}", fmtMoney(extraFee));
                    const allPerks: string[] = [];
                    let feeInserted = false;
                    for (const perk of p.perks) {
                      allPerks.push(perk);
                      if (!feeInserted && /(до|up to)\s*\d+/i.test(perk) && /(учасн|участ|guest)/i.test(perk)) {
                        allPerks.push(feePerk);
                        feeInserted = true;
                      }
                    }
                    if (!feeInserted) allPerks.push(feePerk);
                    const shownPerks = perksExpanded ? allPerks : allPerks.slice(0, PERK_LIMIT);
                    // 30-min starts, trimmed so the grid ends at the last bookable
                    // hour-row (no trailing rows that are entirely unavailable).
                    let lastFit = -1;
                    if (open) {
                      for (let m = location.openMin; m < location.closeMin; m += SLOT_STEP_MIN) {
                        if (packageFits(p, m)) lastFit = m;
                      }
                    }
                    const lastHour = Math.floor(lastFit / 60);
                    const allStarts: number[] = [];
                    if (lastFit >= 0) {
                      for (let m = location.openMin; m < location.closeMin; m += SLOT_STEP_MIN) {
                        if (Math.floor(m / 60) <= lastHour) allStarts.push(m);
                      }
                    }
                    const anyFits = lastFit >= 0;
                    return (
                      <div
                        key={p.id}
                        className={`flex flex-col rounded-2xl border p-5 transition ${
                          chosenPkg ? "border-2 border-[#56EF02] bg-[#f6fee9]" : "border-[#E5E5E5] bg-white"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xl">{p.icon}</span>
                          <span className="text-[15px] font-extrabold text-brand-ink">{p.name}</span>
                        </div>
                        <ul className="mt-3 flex flex-col gap-1.5">
                          {shownPerks.map((perk, i) => (
                            <li key={i} className="flex gap-2 text-[13px] leading-snug text-[#555]">
                              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#56EF02]" />
                              <span>{perk}</span>
                            </li>
                          ))}
                        </ul>
                        {allPerks.length > PERK_LIMIT && (
                          <button
                            onClick={() => setExpandedPerks((s) => ({ ...s, [p.id]: !perksExpanded }))}
                            className="mt-2 self-start text-[12px] font-bold text-brand-green"
                          >
                            {perksExpanded
                              ? dict.pkgShowLess
                              : dict.pkgShowMore.replace("{n}", String(allPerks.length - PERK_LIMIT))}
                          </button>
                        )}
                        <div className="mt-auto pt-4 text-[13px] text-[#888]">
                          <span className="text-[18px] font-extrabold text-brand-ink">
                            {fmtMoney(basePrice)}
                          </span>{" "}
                          {dict.uah}
                          {extraCount > 0 && (
                            <>
                              <span className="mt-0.5 block text-[12px] font-semibold text-[#b6791b]">
                                {dict.pkgExtraLine
                                  .replace("{n}", String(extraCount))
                                  .replace("{fee}", fmtMoney(extraFee))}
                              </span>
                              <span className="mt-0.5 block text-[13px] font-bold text-brand-ink">
                                {dict.pkgTotalLine.replace("{sum}", fmtMoney(price))}
                              </span>
                            </>
                          )}
                        </div>

                        {chosenPkg ? (
                          <button
                            onClick={() => {
                              setPkgBooking(null);
                              setPkgOpenId(null);
                            }}
                            className="mt-3 rounded-full border border-[#b9ef7a] bg-[#eefcdc] py-2.5 text-[14px] font-bold text-[#3c6b0c]"
                          >
                            ✓ {dict.added} · {dict.remove}
                          </button>
                        ) : (
                          <button
                            onClick={() => setPkgOpenId(open ? null : p.id)}
                            className="mt-3 rounded-full py-2.5 text-[14px] font-bold text-brand-ink2"
                            style={{ background: G }}
                          >
                            {open ? dict.pkgHideTimes : dict.pkgChoose}
                          </button>
                        )}

                        {open && !chosenPkg && (
                          <div className="mt-3 border-t border-[#eee] pt-3">
                            {!anyFits ? (
                              <div className="rounded-xl border border-dashed border-[#ddd] p-3 text-center text-[12px] text-[#999]">
                                {dict.pkgNoTime}
                              </div>
                            ) : (
                              <>
                                <div className="mb-2 text-[11px] font-bold tracking-wide text-[#777]">
                                  {dict.pkgStartTime}
                                </div>
                                {/* 2-column grid: rows = hours, cols = :00 / :30 */}
                                <div className="grid grid-cols-2 gap-2">
                                  {allStarts.map((m) => {
                                    const fits = packageFits(p, m);
                                    return fits ? (
                                      <button
                                        key={m}
                                        onClick={() => {
                                          setPkgBooking({ packageId: p.id, startMin: m });
                                          setPkgOpenId(null);
                                          setError("");
                                        }}
                                        className="rounded-lg border border-[#E5E5E5] bg-white py-2 text-center text-[13px] font-semibold text-brand-ink hover:border-[#56EF02] hover:bg-[#f6fee9]"
                                      >
                                        {minToHHMM(m)}
                                      </button>
                                    ) : (
                                      <div
                                        key={m}
                                        className="rounded-lg border border-[#f0f0f0] bg-[#f4f4f4] py-2 text-center text-[13px] text-[#c4c4c4] line-through"
                                      >
                                        {minToHHMM(m)}
                                      </div>
                                    );
                                  })}
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Choose activities (combo) */}
            <section className="rounded-card bg-white p-7 shadow-card">
              <h2 className="m-0 text-[22px] font-extrabold text-brand-ink">{dict.chooseActs}</h2>
              <p className="mb-3.5 mt-1 text-[13px] text-[#999]">{dict.chooseActsHint}</p>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                {locActivities.map((a) => {
                  const on = !!chosen[a.id];
                  const unlimited = a.maxPeople >= 999; // 999 = без обмежень
                  const overMax = !unlimited && people > a.maxPeople;
                  const rangeLabel = unlimited
                    ? ""
                    : a.minPeople <= 1
                      ? dict.peopleUpTo.replace("{n}", String(a.maxPeople))
                      : dict.peopleRange
                          .replace("{a}", String(a.minPeople))
                          .replace("{b}", String(a.maxPeople));
                  return (
                    <button
                      key={a.id}
                      onClick={() => {
                        if (overMax) return;
                        toggleChosen(a.id);
                      }}
                      className={`rounded-2xl p-3 text-left transition ${
                        on
                          ? "border-2 border-[#56EF02] bg-[#f6fee9]"
                          : overMax
                            ? "cursor-not-allowed border border-[#eee] bg-[#fafafa] opacity-70"
                            : "border border-[#E5E5E5] bg-white"
                      }`}
                    >
                      <ActivityPhoto photo={a.photo} actKey={a.key} alt={a.name} />
                      <span className="flex items-center gap-2">
                        <span className="text-lg">{a.icon}</span>
                        <span className="flex-1 text-[13px] font-bold leading-tight">{a.name}</span>
                        <span
                          className={`flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                            on ? "bg-[#56EF02] text-brand-ink2" : "bg-[#f0f0f0] text-[#ccc]"
                          }`}
                        >
                          ✓
                        </span>
                      </span>
                      <span className="mt-1.5 block text-[12px] leading-relaxed text-[#888]">
                        {a.durationOptions.length ? (
                          <>
                            <span className="block">
                              <span className="font-semibold text-[#666]">
                                30 {dict.min} – {fmtMoney(priceFor(a, 30))}
                              </span>{" "}
                              {dict.uah} {a.perPerson ? dict.perPerson : dict.perGroup}
                            </span>
                            <span className="block">
                              <span className="font-semibold text-[#666]">
                                60 {dict.min} – {fmtMoney(priceFor(a, 60))}
                              </span>{" "}
                              {dict.uah} {a.perPerson ? dict.perPerson : dict.perGroup}
                            </span>
                          </>
                        ) : (
                          <>
                            {fmtMoney(unitPrice(a))} {dict.uah}{" "}
                            {a.perPerson ? dict.perPerson : dict.perGroup} · {a.durationMin} {dict.min}
                          </>
                        )}
                        {rangeLabel && (
                          <span className="block text-[11px] text-[#a5a5a5]">{rangeLabel}</span>
                        )}
                        {overMax && (
                          <span className="mt-1 block text-[11px] font-bold text-[#b6791b]">
                            {dict.maxPeopleWarn.replace("{n}", String(a.maxPeople))}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Сценарії (квести): вибір не впливає на ціну й вільний час */}
              {variantActs.map((a) => {
                const vars = a.variants.filter((v) => v.locationIds.includes(locationId));
                const sel = variantByAct[a.id] ?? "";
                return (
                  <div key={a.id} className="mt-5">
                    <div className="mb-2 text-[12px] font-bold tracking-wider text-[#777]">
                      {a.icon} {a.name.toUpperCase()} — {dict.variantTitle.toUpperCase()}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {[{ id: "", name: dict.variantAny }, ...vars].map((v) => {
                        const on = sel === v.id;
                        return (
                          <button
                            key={v.id || "any"}
                            onClick={() => setVariantByAct((m) => ({ ...m, [a.id]: v.id }))}
                            className={`rounded-full px-3.5 py-2 text-[13px] font-semibold transition ${
                              on
                                ? "border-2 border-[#56EF02] bg-[#f6fee9] text-brand-ink"
                                : "border border-[#E5E5E5] bg-white text-[#666] hover:border-[#bbb]"
                            }`}
                          >
                            {v.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {/* Availability calendar */}
              <div className="mb-3 mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
                <span className="text-[12px] font-bold tracking-wider text-[#777]">
                  {dict.calendarTitle}
                </span>
                {/* legend at the top so it's clear before scanning the table */}
                {chosenActs.length > 0 && (
                  <div className="flex flex-wrap items-center gap-4 text-[12px] text-[#888]">
                    <Legend color="#fff" border="#E5E5E5" label={dict.legendFree} />
                    <Legend color={G} label={dict.legendYours} />
                    <Legend color="#f0f0f0" label={dict.legendBusy} />
                  </div>
                )}
                <span className="h-px flex-1 bg-[#f0f0f0]" />
                {loadingAvail && <span className="text-[11px] text-[#bbb]">…</span>}
              </div>
              {chosenActs.some((a) => a.durationOptions.length > 0) && (
                <p className="mb-3 mt-0 text-[12px] text-[#999]">{dict.mergeHint}</p>
              )}

              {chosenActs.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[#ddd] p-5 text-center text-[13px] text-[#999]">
                  {dict.chooseAtLeastOne}
                </div>
              ) : (
                (() => {
                  const cols = `40px repeat(${chosenActs.length}, minmax(0, 1fr))`;
                  const gap = chosenActs.length > 6 ? "gap-1" : "gap-1.5";
                  // shrink cell text/height as more columns are added — no scroll
                  const dense = chosenActs.length > 6;
                  return (
                    <div>
                      <div className={`grid ${gap}`} style={{ gridTemplateColumns: cols }}>
                        <div />
                        {chosenActs.map((a) => (
                          <div
                            key={a.id}
                            className="min-w-0 truncate pb-1 text-center text-[11px] font-bold text-[#555]"
                            title={a.name}
                          >
                            <span className={dense ? "" : "hidden sm:inline"}>{a.icon}</span>
                            <span className={dense ? "hidden" : "hidden sm:inline"}> </span>
                            <span className={dense ? "hidden md:inline" : ""}>
                              {a.name.length > 10 ? a.name.slice(0, 9) + "…" : a.name}
                            </span>
                            <span className={dense ? "md:hidden" : "sm:hidden"}>{a.icon}</span>
                          </div>
                        ))}
                      </div>
                      {slots.map((m, ri) => (
                        <div
                          key={m}
                          className={`mb-1.5 grid ${gap}`}
                          style={{ gridTemplateColumns: cols }}
                        >
                          <div
                            className={`flex items-center ${
                              ri % 2 === 0
                                ? "text-[12px] font-bold text-brand-ink"
                                : "text-[10px] font-semibold text-[#999]"
                            }`}
                          >
                            {minToHHMM(m)}
                          </div>
                          {chosenActs.map((a) => {
                            const st = slotStatus(a, m);
                            const dur = actDuration(a);
                            if (st === "selected")
                              return (
                                <button
                                  key={a.id}
                                  onClick={() => togglePick(a.id, m)}
                                  className={`min-w-0 rounded-lg font-bold text-brand-ink2 ${
                                    dense ? "min-h-[30px] text-[9px]" : "min-h-[34px] text-[11px]"
                                  }`}
                                  style={{ background: G, border: `1px solid ${G}` }}
                                >
                                  <span className={dense ? "hidden xl:inline" : ""}>
                                    {minToHHMM(m)}–{minToHHMM(m + dur)}
                                  </span>
                                  <span className={dense ? "xl:hidden" : "hidden"}>✓</span>
                                </button>
                              );
                            if (st === "free")
                              return (
                                <button
                                  key={a.id}
                                  onClick={() => togglePick(a.id, m)}
                                  className={`min-w-0 rounded-lg border border-[#E5E5E5] bg-white hover:border-[#56EF02] ${
                                    dense ? "min-h-[30px]" : "min-h-[34px]"
                                  }`}
                                />
                              );
                            return (
                              <div
                                key={a.id}
                                className={`min-w-0 rounded-lg border border-[#f0f0f0] bg-[#f0f0f0] ${
                                  dense ? "min-h-[30px]" : "min-h-[34px]"
                                }`}
                              />
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  );
                })()
              )}
            </section>

            {/* Addons */}
            {catalog.addons.length > 0 && (
              <section className="rounded-card bg-white p-7 shadow-card">
                <h2 className="mb-4 text-xl font-extrabold text-brand-ink">{dict.addonsTitle}</h2>
                <div className="grid grid-cols-2 gap-3.5 md:grid-cols-4">
                  {/* Плитки з фото йдуть першими (перший ряд), без фото — далі */}
                  {[...catalog.addons]
                    .sort((x, y) => (y.photo ? 1 : 0) - (x.photo ? 1 : 0))
                    .map((ad) => {
                    const qty = addonQty[ad.id] ?? 0;
                    const on = qty > 0;
                    const tierKeys = ad.tiers
                      ? Object.keys(ad.tiers).map(Number).sort((x, y) => x - y)
                      : [];
                    const maxTier = tierKeys.length ? tierKeys[tierKeys.length - 1] : 0;
                    const shownPrice = ad.tiers
                      ? ad.tiers[String(on ? qty : tierKeys[0])] ?? ad.price
                      : ad.price;
                    const arenaLocked = ad.key === "arena" && !arenaEligible;
                    return (
                      <button
                        key={ad.id}
                        onClick={() => {
                          if (arenaLocked) return;
                          setAddonQty((q) => ({ ...q, [ad.id]: on ? 0 : 1 }));
                        }}
                        className={`flex flex-col rounded-2xl border p-4 text-left transition ${
                          on
                            ? "border-2 border-[#56EF02] bg-[#f6fee9]"
                            : arenaLocked
                              ? "cursor-not-allowed border-[#eee] bg-[#fafafa] opacity-70"
                              : "border-[#E5E5E5] bg-white"
                        }`}
                      >
                        {ad.photo && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={ad.photo}
                            alt={ad.name}
                            className="mb-2.5 h-24 w-full rounded-xl object-cover"
                          />
                        )}
                        <span className="flex w-full items-start gap-2">
                          <span className="flex-1 text-[14px] font-bold leading-tight">{ad.name}</span>
                          <span
                            className={`flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                              on ? "bg-[#56EF02] text-brand-ink2" : "bg-[#f0f0f0] text-[#ccc]"
                            }`}
                          >
                            ✓
                          </span>
                        </span>
                        {/* For tiered addons (photographer) the hint shows only once selected */}
                        {ad.sub && (!ad.tiers || on) && (
                          <span className="mt-1 block text-[12px] text-[#888]">{ad.sub}</span>
                        )}
                        {arenaLocked && (
                          <span className="mt-1 block text-[11px] font-bold text-[#b6791b]">
                            {dict.arenaNeedHour}
                          </span>
                        )}

                        {/* Photographer hours stepper */}
                        {ad.tiers && on && (
                          <span
                            className="mt-3 flex items-center gap-2"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <span
                              role="button"
                              onClick={() =>
                                setAddonQty((q) => ({ ...q, [ad.id]: Math.max(1, qty - 1) }))
                              }
                              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-[#c9e8a9] bg-white text-[14px] font-bold"
                            >
                              −
                            </span>
                            <span className="text-[13px] font-bold">
                              {qty} {dict.hoursShort}
                            </span>
                            <span
                              role="button"
                              onClick={() =>
                                setAddonQty((q) => ({ ...q, [ad.id]: Math.min(maxTier, qty + 1) }))
                              }
                              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-[#c9e8a9] bg-white text-[14px] font-bold"
                            >
                              +
                            </span>
                          </span>
                        )}

                        {shownPrice > 0 && (
                          <span className="mt-auto block pt-3 text-[15px] font-extrabold">
                            {fmtMoney(shownPrice)} <span className="text-[12px] font-semibold text-[#999]">{dict.uah}</span>
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Notes */}
            <section className="flex flex-col gap-2.5 rounded-card bg-white px-7 py-6 shadow-card">
              {dict.notes.map((n, i) => (
                <p key={i} className="m-0 text-[13px] leading-relaxed text-[#666]">
                  {n}
                </p>
              ))}
            </section>
          </div>

          {/* Summary */}
          <aside id="bk-summary" className="scroll-mt-24 rounded-card bg-brand-ink p-6 text-white lg:sticky lg:top-24">
            {result ? (
              <div className="py-6 text-center">
                <div
                  className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full text-2xl font-extrabold text-brand-ink2"
                  style={{ background: G }}
                >
                  ✓
                </div>
                <div className="text-xl font-extrabold">{dict.submitted}</div>
                <p className="mx-auto mt-2.5 max-w-[280px] text-[14px] leading-relaxed text-[#aaa]">
                  {dict.submittedText.replace("{phone}", customerPhone)}
                </p>
                <button
                  onClick={reset}
                  className="mt-5 rounded-full border border-[#444] px-5 py-2.5 text-[13px] font-semibold text-white"
                >
                  {dict.newBooking}
                </button>
              </div>
            ) : (
              <div>
                <div className="text-lg font-extrabold">{dict.yourBooking}</div>
                <div className="mt-1 text-[13px] text-[#aaa]">{summaryLine}</div>

                {cart.items.length === 0 && cart.addons.length === 0 && !cart.pkg ? (
                  <div className="mt-4 rounded-2xl border border-dashed border-[#555] px-4 py-6 text-center text-[13px] leading-relaxed text-[#999]">
                    {dict.cartEmpty}
                  </div>
                ) : (
                  <div className="mt-4 flex flex-col gap-2.5">
                    {/* Selected package block */}
                    {cart.pkg && (
                      <div className="rounded-xl bg-[#1d1d1d] p-3.5">
                        <div className="flex items-start justify-between gap-2.5">
                          <div>
                            <div className="text-[13px] font-bold">
                              {cart.pkg.icon} {cart.pkg.name}
                            </div>
                            <div className="mt-0.5 text-[12px] text-[#999]">
                              {minToHHMM(cart.pkg.startMin)}–{minToHHMM(cart.pkg.endMin)}
                            </div>
                          </div>
                          <div className="flex items-center gap-2.5">
                            <span className="whitespace-nowrap text-[13px] font-bold">
                              {fmtMoney(cart.pkg.price)} {dict.uah}
                            </span>
                            <button
                              onClick={() => setPkgBooking(null)}
                              className="h-[22px] w-[22px] rounded-full bg-[#333] text-[12px] text-[#bbb]"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                        <div className="mt-2 flex flex-col gap-1 border-t border-[#2c2c2c] pt-2">
                          {cart.pkg.items.map((it, i) => (
                            <div key={i} className="flex justify-between text-[11px] text-[#8f8f8f]">
                              <span>{it.title}</span>
                              <span>
                                {minToHHMM(it.startMin)}–{minToHHMM(it.startMin + it.durationMin)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {cart.items.map((it) => (
                      <CartRow
                        key={it.key}
                        title={`${it.icon} ${it.title}`}
                        sub={it.sub}
                        price={`${fmtMoney(it.price)} ${dict.uah}`}
                        onRemove={() => {
                          setPicks((prev) =>
                            prev.filter(
                              (p) =>
                                !(p.activityId === it.activityId && it.slotStarts.includes(p.startMin))
                            )
                          );
                          // removing the combined line also drops the closure
                          if (it.arenaCombined && cart.arenaAddonId) {
                            setAddonQty((q) => ({ ...q, [cart.arenaAddonId!]: 0 }));
                          }
                        }}
                      />
                    ))}
                    {cart.addons.map((ad) => (
                      <CartRow
                        key={ad.id}
                        title={ad.title}
                        sub={ad.tiered ? `${ad.qty} ${dict.hoursShort}` : `×${ad.qty}`}
                        price={ad.price > 0 ? `${fmtMoney(ad.price)} ${dict.uah}` : "—"}
                        onRemove={() => setAddonQty((q) => ({ ...q, [ad.id]: 0 }))}
                      />
                    ))}
                  </div>
                )}

                <div className="my-4 border-t border-[#333]" />
                <div className="flex items-baseline justify-between">
                  <span className="text-[14px] text-[#aaa]">{dict.total}</span>
                  <span>
                    <span className="text-3xl font-extrabold">{fmtMoney(cart.total)}</span>{" "}
                    <span className="text-[14px] text-[#aaa]">{dict.uah}</span>
                  </span>
                </div>

                <input
                  type="text"
                  name="name"
                  autoComplete="name"
                  placeholder={dict.namePlaceholder}
                  value={customerName}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-3 w-full rounded-xl border border-[#333] bg-[#1d1d1d] px-3.5 py-3 text-[14px] text-white placeholder:text-[#666]"
                />

                {error && (
                  <div className="mt-3 text-center text-[13px] text-[#ffb066]">{error}</div>
                )}

                <button
                  onClick={submit}
                  disabled={submitting}
                  className="mt-4 w-full rounded-full py-4 text-[17px] font-bold text-brand-ink2 disabled:opacity-60"
                  style={{ background: G }}
                >
                  {dict.book}
                </button>
                <p className="mt-3 text-center text-[12px] text-[#888]">{dict.prepayNote}</p>
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

function Field({
  n,
  label,
  badge,
  children,
}: {
  n: number;
  label: string;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2.5 flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#56EF02] text-[12px] font-bold text-brand-ink2">
          {n}
        </span>
        <span className="text-[12px] font-bold tracking-wide text-[#555]">{label}</span>
        {badge && (
          <span className="rounded-full bg-[#fdf3e3] px-2.5 py-0.5 text-[11px] font-bold text-[#b6791b]">
            {badge}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

// Photo for an activity card. Tries Activity.photo from the DB first, then
// public/activities/<key>.jpg / .jpeg / .png / .webp by convention — drop a
// file there and it appears automatically. Hidden when nothing exists.
function ActivityPhoto({ photo, actKey, alt }: { photo: string; actKey: string; alt: string }) {
  const candidates = useMemo(() => {
    const arr: string[] = [];
    if (photo) arr.push(photo);
    for (const ext of ["jpg", "jpeg", "png", "webp"]) arr.push(`/activities/${actKey}.${ext}`);
    return arr;
  }, [photo, actKey]);
  const [idx, setIdx] = useState(0);
  const [ok, setOk] = useState(false);
  const ref = useRef<HTMLImageElement>(null);
  // SSR: якщо картинка завантажилась до гідратації, onLoad/onError вже не спрацюють
  useEffect(() => {
    const el = ref.current;
    if (!el || !el.complete) return;
    if (el.naturalWidth > 0) setOk(true);
    else setIdx((i) => i + 1);
  }, [idx]);
  if (idx >= candidates.length) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      src={candidates[idx]}
      alt={alt}
      className={`mb-2 h-28 w-full rounded-xl object-cover ${ok ? "" : "hidden"}`}
      onLoad={() => setOk(true)}
      onError={() => {
        setOk(false);
        setIdx((i) => i + 1);
      }}
    />
  );
}

function Legend({ color, border, label }: { color: string; border?: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="inline-block h-3.5 w-3.5 rounded"
        style={{ background: color, border: border ? `1px solid ${border}` : undefined }}
      />
      {label}
    </span>
  );
}

function CartRow({
  title,
  sub,
  price,
  onRemove,
}: {
  title: string;
  sub: string;
  price: string;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-2.5 rounded-xl bg-[#1d1d1d] px-3.5 py-3">
      <div>
        <div className="text-[13px] font-bold">{title}</div>
        <div className="mt-0.5 text-[12px] text-[#999]">{sub}</div>
      </div>
      <div className="flex items-center gap-2.5">
        <span className="whitespace-nowrap text-[13px] font-bold">{price}</span>
        <button
          onClick={onRemove}
          className="h-[22px] w-[22px] rounded-full bg-[#333] text-[12px] text-[#bbb]"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

// Logo sources in priority order: the local file (put your logo at
// public/logo-g75.svg and it wins automatically), then the live-site SVG,
// then the drawn emblem as a last resort.
const LOGO_SOURCES = [
  "/logo-g75.svg",
  "https://www.lasertag.in.ua/wp-content/uploads/2026/04/logo4.svg",
];

function BrandLogo() {
  const [srcIdx, setSrcIdx] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  const advance = () => {
    setLoaded(false);
    setSrcIdx((i) => i + 1);
  };

  // SSR: якщо лого завантажилось до гідратації, onLoad/onError не спрацюють —
  // перевіряємо стан картинки одразу після монтування.
  useEffect(() => {
    const el = imgRef.current;
    if (!el || !el.complete) return;
    if (el.naturalWidth > 0) setLoaded(true);
    else advance();
  }, [srcIdx]);

  // A hanging request (blocked host) never fires onError — time it out.
  useEffect(() => {
    if (loaded || srcIdx >= LOGO_SOURCES.length) return;
    const t = setTimeout(advance, 4000);
    return () => clearTimeout(t);
  }, [srcIdx, loaded]);

  return (
    <span className="relative inline-block h-10 w-10 sm:h-[52px] sm:w-[52px]">
      {srcIdx >= LOGO_SOURCES.length ? (
        <G75Logo />
      ) : (
        <>
          {!loaded && (
            <span className="absolute inset-0">
              <G75Logo />
            </span>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src={LOGO_SOURCES[srcIdx]}
            alt="Лазертаг G-75"
            width={52}
            height={52}
            className="relative h-full w-full object-contain"
            style={{ opacity: loaded ? 1 : 0 }}
            onLoad={() => setLoaded(true)}
            onError={advance}
          />
        </>
      )}
    </span>
  );
}

// G-75 target-style emblem. Links home; approximates the club's logo.
function G75Logo() {
  return (
    <svg width="100%" height="100%" viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <circle cx="24" cy="24" r="21" stroke="#139600" strokeWidth="2" />
      <circle cx="24" cy="24" r="15" stroke="#56EF02" strokeWidth="1.5" opacity="0.7" />
      {/* crosshair ticks */}
      <g stroke="#139600" strokeWidth="2" strokeLinecap="round">
        <line x1="24" y1="1" x2="24" y2="7" />
        <line x1="24" y1="41" x2="24" y2="47" />
        <line x1="1" y1="24" x2="7" y2="24" />
        <line x1="41" y1="24" x2="47" y2="24" />
      </g>
      {/* central triangle "A" mark */}
      <path d="M24 12 L33 32 H27.5 L24 23 L20.5 32 H15 Z" fill="#139600" />
      <text x="24" y="40" textAnchor="middle" fontSize="6" fontWeight="800" fill="#139600" fontFamily="Open Sans, sans-serif">
        TAG
      </text>
    </svg>
  );
}

// Official Telegram paper-plane (simple-icons path, plane only).
function TelegramGlyph() {
  return (
    <svg className="h-[14px] w-[14px] sm:h-4 sm:w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ marginLeft: -1, marginTop: 1 }}>
      <path d="M23.91 3.79 20.3 20.84c-.25 1.21-.98 1.5-2 .94l-5.5-4.07-2.66 2.57c-.3.3-.55.56-1.1.56-.72 0-.6-.27-.84-.95L6.3 13.7l-5.45-1.7c-1.18-.35-1.19-1.16.26-1.75l21.26-8.2c.97-.43 1.9.24 1.53 1.73Z" />
    </svg>
  );
}

// Official Viber bubble-with-handset (simple-icons path).
function ViberGlyph() {
  return (
    <svg className="h-[14px] w-[14px] sm:h-4 sm:w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M11.4 0C9.473.028 5.333.344 3.02 2.467 1.302 4.187.696 6.7.633 9.817.57 12.933.488 18.776 6.12 20.36h.003l-.004 2.416s-.037.977.61 1.177c.777.242 1.234-.5 1.98-1.302.407-.44.972-1.084 1.397-1.58 3.85.324 6.812-.416 7.15-.525.776-.252 5.176-.816 5.892-6.657.74-6.02-.36-9.83-2.34-11.546-.596-.55-3.006-2.3-8.375-2.323 0 0-.395-.025-1.037-.017zm.058 1.693c.545-.004.88.017.88.017 4.542.02 6.717 1.388 7.222 1.846 1.675 1.435 2.53 4.868 1.906 9.897v.002c-.596 4.876-4.17 5.184-4.83 5.396-.28.09-2.882.737-6.153.523 0 0-2.436 2.94-3.197 3.704-.12.12-.26.167-.352.144-.13-.033-.166-.188-.164-.414l.02-4.018c-4.762-1.32-4.485-6.292-4.43-8.895.054-2.604.543-4.738 1.996-6.173 1.96-1.773 5.474-2.018 7.11-2.03zm.38 2.602c-.167 0-.303.135-.303.302 0 .167.136.302.302.302 1.532 0 2.8.5 3.798 1.482.997.982 1.485 2.312 1.5 4.066.002.167.14.3.306.3h.002c.167 0 .3-.14.3-.306-.017-1.905-.552-3.402-1.68-4.512-1.126-1.11-2.564-1.634-4.226-1.634zm-3.4.937c-.184-.033-.378.003-.542.106l-.01.005c-.328.19-.628.435-.9.767-.014.02-.03.034-.042.05-.22.267-.347.53-.38.786-.02.152-.006.306.042.452l.017.012c.234.717.77 1.996 1.966 3.6.696.937 1.393 1.722 2.086 2.35.35.313.767.66 1.216.996l.13.09c.673.474 1.335.836 1.94 1.096 0 0 1.7.744 2.42.744.212 0 .458-.05.657-.19.267-.19.457-.42.6-.68v-.007c.146-.263.096-.514-.106-.68-.4-.34-1.03-.76-1.42-.99-.402-.238-.804-.09-.97.128l-.352.444c-.176.216-.5.187-.5.187l-.01.005c-2.375-.607-3.01-3.014-3.01-3.014s-.03-.323.19-.5l.442-.353c.212-.166.366-.568.128-.97-.23-.39-.65-1.02-.99-1.42-.148-.18-.36-.276-.583-.316zm4.49.324c-.167 0-.302.135-.302.302 0 .167.135.302.302.302 1.16.02 2.09.36 2.777 1.096.688.735 1.023 1.717 1.006 2.977 0 .167.133.303.3.305h.002c.166 0 .302-.133.304-.3.02-1.39-.36-2.55-1.166-3.41-.807-.862-1.936-1.252-3.223-1.272zm1.037 1.32c-.167 0-.302.136-.302.303 0 .167.135.302.302.302.523.01.937.164 1.216.457.28.293.43.717.44 1.28.002.166.14.3.305.3h.003c.167-.002.3-.14.3-.306-.013-.664-.202-1.213-.61-1.64-.406-.427-.96-.63-1.653-.643z" />
    </svg>
  );
}

// Monday-first date picker (native inputs can't force week start). Marks
// weekends, blocks past dates, localised month/weekday labels.
const DP_WEEKDAYS: Record<Locale, string[]> = {
  uk: ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"],
  ru: ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"],
  en: ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"],
};
const DP_MONTHS: Record<Locale, string[]> = {
  uk: ["Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень", "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень"],
  ru: ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
};

function DatePicker({
  value,
  min,
  onChange,
  locale,
}: {
  value: string;
  min: string;
  onChange: (iso: string) => void;
  locale: Locale;
}) {
  const [open, setOpen] = useState(false);
  const parse = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return { y, m: m - 1, d };
  };
  const sel = parse(value);
  const [view, setView] = useState({ y: sel.y, m: sel.m });

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [open]);

  const iso = (y: number, m: number, d: number) =>
    `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const label = `${String(sel.d).padStart(2, "0")}.${String(sel.m + 1).padStart(2, "0")}.${sel.y}`;

  const firstIdx = (new Date(view.y, view.m, 1).getDay() + 6) % 7; // Monday = 0
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstIdx).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  const minAtMonthStart = iso(view.y, view.m, 1) < min && `${view.y}-${String(view.m + 1).padStart(2, "0")}` <= min.slice(0, 7);

  const shift = (delta: number) =>
    setView((v) => {
      const m = v.m + delta;
      if (m < 0) return { y: v.y - 1, m: 11 };
      if (m > 11) return { y: v.y + 1, m: 0 };
      return { y: v.y, m };
    });

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => {
          setView({ y: sel.y, m: sel.m });
          setOpen((o) => !o);
        }}
        className="flex w-full items-center justify-between rounded-xl border border-[#E5E5E5] bg-white px-3.5 py-3 text-left text-[15px] text-brand-ink"
      >
        {label}
        <span className="text-[#999]">📅</span>
      </button>
      {open && (
        <div className="absolute left-0 z-40 mt-2 w-[290px] rounded-2xl border border-[#eee] bg-white p-3 shadow-xl">
          <div className="mb-2 flex items-center justify-between">
            <button
              onClick={() => shift(-1)}
              disabled={!!minAtMonthStart}
              className="flex h-8 w-8 items-center justify-center rounded-full text-[#555] hover:bg-[#f2f2f2] disabled:opacity-30"
            >
              ‹
            </button>
            <div className="text-[14px] font-bold text-brand-ink">
              {DP_MONTHS[locale][view.m]} {view.y}
            </div>
            <button
              onClick={() => shift(1)}
              className="flex h-8 w-8 items-center justify-center rounded-full text-[#555] hover:bg-[#f2f2f2]"
            >
              ›
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1">
            {DP_WEEKDAYS[locale].map((w, i) => (
              <div
                key={w}
                className={`py-1 text-center text-[11px] font-bold ${i >= 4 ? "text-[#e0791b]" : "text-[#999]"}`}
              >
                {w}
              </div>
            ))}
            {cells.map((d, i) => {
              if (d === null) return <div key={`e${i}`} />;
              const dayIso = iso(view.y, view.m, d);
              const disabled = dayIso < min;
              const selected = dayIso === value;
              const isWeekend = i % 7 >= 4; // Пт, Сб, Нд — вихідний тариф
              return (
                <button
                  key={d}
                  disabled={disabled}
                  onClick={() => {
                    onChange(dayIso);
                    setOpen(false);
                  }}
                  className={`h-9 rounded-lg text-[13px] font-semibold transition ${
                    selected
                      ? "bg-brand-lime text-brand-ink2"
                      : disabled
                        ? "text-[#d0d0d0]"
                        : isWeekend
                          ? "text-[#e0791b] hover:bg-[#fdf3e3]"
                          : "text-brand-ink hover:bg-[#f2f2f2]"
                  }`}
                >
                  {d}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex justify-end border-t border-[#f0f0f0] pt-2">
            <button
              onClick={() => {
                onChange(min);
                setView(parse(min));
                setOpen(false);
              }}
              className="text-[12px] font-semibold text-brand-green"
            >
              {locale === "ru" ? "Сегодня" : locale === "en" ? "Today" : "Сьогодні"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function LangDropdown({ locale, embed = false }: { locale: Locale; embed?: boolean }) {
  const [open, setOpen] = useState(false);
  const all: Locale[] = ["uk", "ru", "en"];
  const others = all.filter((l) => l !== locale);
  // в embed-режимі перемикання мови не має губити ?embed=1
  const hrefFor = (l: Locale) => `/?lang=${l}${embed ? "&embed=1" : ""}`;
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [open]);

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-2 py-1.5 text-[14px] font-bold text-brand-green"
      >
        {locale.toUpperCase()}
        <span className={`text-[10px] transition ${open ? "rotate-180" : ""}`}>⌄</span>
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-16 overflow-hidden rounded-xl border border-[#eee] bg-white py-1 text-center shadow-lg">
          {others.map((l) => (
            <a
              key={l}
              href={hrefFor(l)}
              className="block px-3 py-1.5 text-[14px] font-semibold text-brand-ink hover:bg-[#f4f4f4]"
            >
              {l.toUpperCase()}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
