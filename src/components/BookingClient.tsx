"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useCallback } from "react";
import type { PublicCatalog, PubActivity } from "@/lib/public-catalog";
import type { Dict } from "@/lib/i18n";
import type { Locale } from "@/lib/constants";
import { SLOT_STEP_MIN } from "@/lib/constants";
import { resolvePrice, usesWeekendRate, fmtMoney, minToHHMM } from "@/lib/pricing";
import { confirmDeepLink } from "@/lib/telegram-links";

type Pick = { activityId: string; startMin: number };

type Props = {
  catalog: PublicCatalog;
  dict: Dict;
  locale: Locale;
  today: string;
  phone: string;
  viberUrl: string;
  telegramUrl: string;
};

const G = "#56EF02";

export default function BookingClient({
  catalog,
  dict,
  locale,
  today,
  phone,
  viberUrl,
  telegramUrl,
}: Props) {
  const locations = catalog.locations;
  const [date, setDate] = useState(today);
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [people, setPeople] = useState(10);
  const [customerPhone, setPhone] = useState("");
  const [customerName, setName] = useState("");
  const [duration, setDuration] = useState(60); // lasertag duration
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

  const location = locations.find((l) => l.id === locationId) ?? locations[0];
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
  }, [locationId, locActivities]);

  // Packages offered at the current location.
  const locPackages = useMemo(
    () => catalog.packages.filter((p) => p.locationId === locationId),
    [catalog.packages, locationId]
  );

  // Expand a package into concrete booking items given a start time.
  // Non-room activities run consecutively (by `order`); room items (banquet)
  // are reserved in parallel from the start for their full duration.
  const expandPackage = useCallback(
    (pkg: PublicCatalog["packages"][number], startMin: number) => {
      const sorted = [...pkg.items].sort((a, b) => a.order - b.order);
      const seq = sorted.filter((i) => actById.get(i.activityId)?.category !== "room");
      const rooms = sorted.filter((i) => actById.get(i.activityId)?.category === "room");
      const out: { activityId: string; startMin: number; durationMin: number; title: string }[] = [];
      let cursor = startMin;
      for (const it of seq) {
        const a = actById.get(it.activityId);
        out.push({ activityId: it.activityId, startMin: cursor, durationMin: it.durationMin, title: a?.name ?? "" });
        cursor += it.durationMin;
      }
      for (const it of rooms) {
        const a = actById.get(it.activityId);
        out.push({ activityId: it.activityId, startMin, durationMin: it.durationMin, title: a?.name ?? "" });
      }
      return out;
    },
    [actById]
  );

  // Is the whole package sequence bookable starting at `startMin`?
  const packageFits = useCallback(
    (pkg: PublicCatalog["packages"][number], startMin: number) => {
      const items = expandPackage(pkg, startMin);
      for (const it of items) {
        const end = it.startMin + it.durationMin;
        if (end > location.closeMin) return false;
        const occ = occupied[it.activityId] ?? [];
        for (let m = it.startMin; m < end; m += SLOT_STEP_MIN) {
          if (occ.includes(m)) return false;
        }
      }
      return true;
    },
    [expandPackage, occupied, location]
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

  // Fetch availability whenever location/date changes.
  useEffect(() => {
    if (!locationId || !date) return;
    let cancelled = false;
    setLoadingAvail(true);
    fetch(`/api/availability?locationId=${locationId}&date=${date}`)
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
  }, [locationId, date]);

  const actDuration = useCallback(
    (a: PubActivity) => (a.durationOptions.length ? duration : a.durationMin),
    [duration]
  );

  const unitPrice = useCallback(
    (a: PubActivity) => {
      const rows = a.prices.map((p) => ({
        locationId: p.locationId,
        durationMin: p.durationMin,
        priceWeekday: p.weekday,
        priceWeekend: p.weekend,
      }));
      return (
        resolvePrice(rows, {
          locationId,
          durationMin: a.durationOptions.length ? duration : null,
          date,
        }) ?? 0
      );
    },
    [locationId, duration, date]
  );

  const linePrice = useCallback(
    (a: PubActivity) => (a.perPerson ? unitPrice(a) * Math.max(1, people) : unitPrice(a)),
    [unitPrice, people]
  );

  const chosenActs = useMemo(
    () => locActivities.filter((a) => chosen[a.id]),
    [locActivities, chosen]
  );

  const toggleChosen = (id: string) =>
    setChosen((prev) => {
      const next = { ...prev };
      if (next[id]) {
        delete next[id];
        setPicks((ps) => ps.filter((p) => p.activityId !== id));
      } else next[id] = true;
      return next;
    });

  // Slot status for an activity's start minute.
  const slotStatus = useCallback(
    (a: PubActivity, startMin: number): "selected" | "busy" | "free" => {
      const dur = actDuration(a);
      if (picks.some((p) => p.activityId === a.id && p.startMin === startMin)) return "selected";
      if (startMin + dur > location.closeMin) return "busy";
      const b = busy[a.id] ?? [];
      // busy if any covered slot is in the busy list
      for (let m = startMin; m < startMin + dur; m += SLOT_STEP_MIN) {
        if (b.includes(m)) return "busy";
      }
      // block overlap with own picks of the SAME activity
      const mine = picks.filter((p) => p.activityId === a.id);
      for (const p of mine) {
        const pd = actDuration(a);
        if (startMin < p.startMin + pd && p.startMin < startMin + dur) return "busy";
      }
      return "free";
    },
    [actDuration, picks, busy, location]
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

  // Cart.
  const cart = useMemo(() => {
    const items = picks
      .map((p) => {
        const a = actById.get(p.activityId);
        if (!a) return null;
        const dur = actDuration(a);
        return {
          key: `${p.activityId}|${p.startMin}`,
          activityId: p.activityId,
          startMin: p.startMin,
          durationMin: dur,
          title: a.name,
          icon: a.icon,
          sub: `${minToHHMM(p.startMin)}–${minToHHMM(p.startMin + dur)} · ${
            a.perPerson ? `${people} × ${fmtMoney(unitPrice(a))}` : dict.perGroup
          }`,
          price: a.perPerson ? unitPrice(a) * Math.max(1, people) : unitPrice(a),
          people: a.perPerson ? Math.max(1, people) : Math.min(people, a.maxPeople),
        };
      })
      .filter(Boolean) as {
      key: string;
      activityId: string;
      startMin: number;
      durationMin: number;
      title: string;
      icon: string;
      sub: string;
      price: number;
      people: number;
    }[];
    const addons = catalog.addons
      .filter((ad) => (addonQty[ad.id] ?? 0) > 0)
      .map((ad) => ({
        id: ad.id,
        title: ad.name,
        qty: addonQty[ad.id],
        price: ad.price * addonQty[ad.id],
      }));

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
        const expanded = expandPackage(p, pkgBooking.startMin);
        const price = weekend ? p.fixedWeekend : p.fixedWeekday;
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
    return { items, addons, pkg, total };
  }, [picks, actById, actDuration, people, unitPrice, dict, catalog.addons, catalog.packages, addonQty, pkgBooking, expandPackage, weekend]);

  async function submit() {
    setError("");
    if (!customerPhone.trim()) return setError(dict.errPhone);
    if (cart.items.length === 0 && !cart.pkg) return setError(dict.errEmpty);
    if (!people || people < 1) return setError(dict.errPeople);
    setSubmitting(true);
    try {
      // Individual activity picks.
      const individualItems = cart.items.map((i) => ({
        activityId: i.activityId,
        startMin: i.startMin,
        durationMin: i.durationMin,
        people: i.people,
      }));
      // Package items: fixed package price on the first item, 0 on the rest so
      // the booking total equals the advertised package price.
      const packageItems = cart.pkg
        ? cart.pkg.items.map((it, idx) => ({
            activityId: it.activityId,
            startMin: it.startMin,
            durationMin: it.durationMin,
            people: Math.min(people, 200),
            price: idx === 0 ? cart.pkg!.price : 0,
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
          comment: cart.pkg ? `Комплекс: ${cart.pkg.name}` : "",
          lang: locale,
          items: [...individualItems, ...packageItems],
          addons: cart.addons.map((a) => ({ addonId: a.id, qty: a.qty })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Помилка");
      setResult({ code: data.code, total: data.total });
    } catch (e: any) {
      setError(e?.message || "Помилка");
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

  const summaryLine = `${location.name} · ${date}${weekend ? ` · ${dict.weekendBadge}` : ""} · ${people} ${dict.stepPeople.toLowerCase()}`;

  return (
    <div style={{ minHeight: "100vh", background: "#f2f2f2" }}>
      {/* Header */}
      <header className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-[#e8e8e8] bg-white px-5 py-3 md:px-10">
        {/* LEFT: logo (→ start screen) + brand name */}
        <div className="flex items-center gap-3">
          <Link href="/" aria-label={dict.brandName} className="shrink-0">
            <G75Logo />
          </Link>
          <div className="leading-tight">
            <div className="text-[17px] font-bold text-brand-green">{dict.brandName}</div>
            <div className="text-[12px] text-[#777]">{dict.brandSub}</div>
          </div>
        </div>

        {/* RIGHT: contacts (Telegram / Viber / phone) then languages */}
        <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex items-center gap-2">
            {/* TODO: replace "#" with the real Telegram link */}
            <a
              href="#"
              aria-label="Telegram"
              title="Telegram"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-[#229ED9] text-white transition hover:opacity-90"
            >
              <TelegramGlyph />
            </a>
            {/* TODO: replace "#" with the real Viber link */}
            <a
              href="#"
              aria-label="Viber"
              title="Viber"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-[#7360F2] text-white transition hover:opacity-90"
            >
              <ViberGlyph />
            </a>
            <a href={`tel:${phone}`} className="text-[15px] font-bold text-brand-ink">
              {phone}
            </a>
          </div>
          <LangDropdown locale={locale} />
        </div>
      </header>

      <div className="mx-auto max-w-[1280px] px-5 pb-16 pt-8 md:px-10">
        {/* Title */}
        <div className="mb-6 flex flex-wrap items-baseline gap-4">
          <h1 className="m-0 text-[34px] font-extrabold text-brand-ink">{dict.title}</h1>
          <p className="m-0 text-[15px] text-[#777]">{dict.subtitle}</p>
        </div>

        {/* Step 1 */}
        <div className="grid grid-cols-1 gap-6 rounded-card bg-white p-6 shadow-card md:grid-cols-4">
          <Field n={1} label={dict.stepDate} badge={weekend ? dict.weekendBadge : undefined}>
            <input
              type="date"
              value={date}
              min={today}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-xl border border-[#E5E5E5] px-3.5 py-3 text-[15px]"
            />
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
                onClick={() => setPeople((p) => Math.max(1, p - 1))}
                className="w-11 rounded-xl border border-[#E5E5E5] bg-white text-lg font-bold"
              >
                −
              </button>
              <input
                type="number"
                min={1}
                max={100}
                value={people}
                onChange={(e) => setPeople(Math.max(1, Number(e.target.value) || 1))}
                className="w-full rounded-xl border border-[#E5E5E5] px-3.5 py-3 text-center text-[15px]"
              />
              <button
                onClick={() => setPeople((p) => Math.min(100, p + 1))}
                className="w-11 rounded-xl border border-[#E5E5E5] bg-white text-lg font-bold"
              >
                +
              </button>
            </div>
          </Field>
          <Field n={4} label={dict.stepPhone}>
            <input
              type="tel"
              placeholder={dict.phonePlaceholder}
              value={customerPhone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-xl border border-[#E5E5E5] px-3.5 py-3 text-[15px]"
            />
          </Field>
        </div>

        {/* Main grid */}
        <div className="mt-6 grid grid-cols-1 items-start gap-6 lg:grid-cols-[1fr_360px]">
          <div className="flex flex-col gap-6">
            {/* Packages (комплекси) — per location, booked as a sequence */}
            {locPackages.length > 0 && (
              <section className="rounded-card bg-white p-7 shadow-card">
                <h2 className="m-0 text-[22px] font-extrabold text-brand-ink">{dict.packagesTitle}</h2>
                <p className="mb-4 mt-1 text-[13px] text-[#999]">{dict.packagesHint}</p>
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                  {locPackages.map((p) => {
                    const price = weekend ? p.fixedWeekend : p.fixedWeekday;
                    const open = pkgOpenId === p.id;
                    const chosenPkg = pkgBooking?.packageId === p.id;
                    const overCap = people > p.maxPeople;
                    const starts = open && !overCap ? packageStarts(p) : [];
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
                        <ul className="mt-3 flex flex-1 flex-col gap-1.5">
                          {p.perks.map((perk, i) => (
                            <li key={i} className="flex gap-2 text-[13px] leading-snug text-[#555]">
                              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#56EF02]" />
                              <span>{perk}</span>
                            </li>
                          ))}
                        </ul>
                        <div className="mt-4 text-[13px] text-[#888]">
                          <span className="text-[18px] font-extrabold text-brand-ink">
                            {fmtMoney(price)}
                          </span>{" "}
                          {dict.uah} · {weekend ? "ПТ-НД" : "ПН-ЧТ"}
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
                            {overCap ? (
                              <div className="rounded-xl bg-[#fdf3e3] p-3 text-[12px] leading-relaxed text-[#b6791b]">
                                {dict.pkgMaxPeople.replace("{max}", String(p.maxPeople))}
                              </div>
                            ) : starts.length === 0 ? (
                              <div className="rounded-xl border border-dashed border-[#ddd] p-3 text-center text-[12px] text-[#999]">
                                {dict.pkgNoTime}
                              </div>
                            ) : (
                              <>
                                <div className="text-[11px] font-bold tracking-wide text-[#777]">
                                  {dict.pkgStartTime}
                                </div>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {starts.map((m) => (
                                    <button
                                      key={m}
                                      onClick={() => {
                                        setPkgBooking({ packageId: p.id, startMin: m });
                                        setPkgOpenId(null);
                                        setError("");
                                      }}
                                      className="rounded-full border border-[#E5E5E5] bg-white px-3 py-1.5 text-[13px] font-semibold hover:border-[#56EF02]"
                                    >
                                      {minToHHMM(m)}
                                    </button>
                                  ))}
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
                  return (
                    <button
                      key={a.id}
                      onClick={() => toggleChosen(a.id)}
                      className={`rounded-2xl p-3 text-left transition ${
                        on
                          ? "border-2 border-[#56EF02] bg-[#f6fee9]"
                          : "border border-[#E5E5E5] bg-white"
                      }`}
                    >
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
                      <span className="mt-1.5 block text-[12px] text-[#888]">
                        {fmtMoney(unitPrice(a))} {dict.uah} {a.perPerson ? dict.perPerson : dict.perGroup} ·{" "}
                        {actDuration(a)} {dict.min}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Lasertag duration toggle (if a duration-based activity chosen) */}
              {chosenActs.some((a) => a.durationOptions.length > 0) && (
                <div className="mt-4 flex items-center gap-2.5">
                  <span className="text-[13px] text-[#555]">{dict.durationLaser}</span>
                  {[30, 60].map((d) => (
                    <button
                      key={d}
                      onClick={() => setDuration(d)}
                      className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold ${
                        duration === d
                          ? "bg-brand-ink text-[#56EF02]"
                          : "border border-[#E5E5E5] bg-white text-brand-ink"
                      }`}
                    >
                      {d} {dict.min}
                    </button>
                  ))}
                </div>
              )}

              {/* Availability calendar */}
              <div className="mb-3 mt-5 flex items-center gap-2.5">
                <span className="text-[12px] font-bold tracking-wider text-[#777]">
                  {dict.calendarTitle}
                </span>
                <span className="h-px flex-1 bg-[#f0f0f0]" />
                {loadingAvail && <span className="text-[11px] text-[#bbb]">…</span>}
              </div>

              {chosenActs.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[#ddd] p-5 text-center text-[13px] text-[#999]">
                  {dict.chooseAtLeastOne}
                </div>
              ) : (
                <div className="overflow-x-auto thin-scroll">
                  <div style={{ minWidth: Math.max(360, 60 + chosenActs.length * 110) }}>
                    <div
                      className="grid gap-1.5"
                      style={{ gridTemplateColumns: `48px repeat(${chosenActs.length}, 1fr)` }}
                    >
                      <div />
                      {chosenActs.map((a) => (
                        <div
                          key={a.id}
                          className="truncate pb-1 text-center text-[12px] font-bold text-[#555]"
                          title={a.name}
                        >
                          {a.icon} {a.name.length > 12 ? a.name.slice(0, 11) + "…" : a.name}
                        </div>
                      ))}
                    </div>
                    {slots.map((m, ri) => (
                      <div
                        key={m}
                        className="mb-1.5 grid gap-1.5"
                        style={{ gridTemplateColumns: `48px repeat(${chosenActs.length}, 1fr)` }}
                      >
                        <div
                          className={`flex items-center ${
                            ri % 2 === 0
                              ? "text-[13px] font-bold text-brand-ink"
                              : "text-[11px] font-semibold text-[#999]"
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
                                className="min-h-[34px] rounded-lg text-[11px] font-bold text-brand-ink2"
                                style={{ background: G, border: `1px solid ${G}` }}
                              >
                                {minToHHMM(m)}–{minToHHMM(m + dur)}
                              </button>
                            );
                          if (st === "free")
                            return (
                              <button
                                key={a.id}
                                onClick={() => togglePick(a.id, m)}
                                className="min-h-[34px] rounded-lg border border-[#E5E5E5] bg-white hover:border-[#56EF02]"
                              />
                            );
                          return (
                            <div
                              key={a.id}
                              className="min-h-[34px] rounded-lg border border-[#f0f0f0] bg-[#f0f0f0]"
                            />
                          );
                        })}
                      </div>
                    ))}
                    <div className="mt-3 flex flex-wrap gap-4 text-[12px] text-[#888]">
                      <Legend color="#fff" border="#E5E5E5" label={dict.legendFree} />
                      <Legend color={G} label={dict.legendYours} />
                      <Legend color="#f0f0f0" label={dict.legendBusy} />
                    </div>
                  </div>
                </div>
              )}
            </section>

            {/* Addons */}
            {catalog.addons.length > 0 && (
              <section className="rounded-card bg-white p-7 shadow-card">
                <h2 className="mb-4 text-xl font-extrabold text-brand-ink">{dict.addonsTitle}</h2>
                <div className="grid grid-cols-2 gap-3.5 md:grid-cols-4">
                  {catalog.addons.map((ad) => {
                    const on = (addonQty[ad.id] ?? 0) > 0;
                    return (
                      <div
                        key={ad.id}
                        className={`flex flex-col justify-between rounded-2xl border p-4 ${
                          on ? "border-[#56EF02] bg-[#f6fee9]" : "border-[#E5E5E5] bg-white"
                        }`}
                      >
                        <div>
                          <div className="text-[14px] font-bold leading-tight">{ad.name}</div>
                          <div className="mt-1 text-[12px] text-[#888]">{ad.sub}</div>
                        </div>
                        <div className="mt-3.5 flex items-center justify-between">
                          <span className="text-[15px] font-extrabold">{fmtMoney(ad.price)}</span>
                          <button
                            onClick={() =>
                              setAddonQty((q) => ({ ...q, [ad.id]: on ? 0 : 1 }))
                            }
                            className={`rounded-full px-3 py-1.5 text-[12px] font-bold ${
                              on
                                ? "bg-[#eefcdc] text-[#3c6b0c]"
                                : "bg-brand-ink text-[#56EF02]"
                            }`}
                          >
                            {on ? dict.added : dict.add}
                          </button>
                        </div>
                      </div>
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
          <aside id="bk-summary" className="scroll-mt-4 rounded-card bg-brand-ink p-6 text-white lg:sticky lg:top-6">
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
                <div className="mt-4 rounded-xl bg-[#1d1d1d] px-4 py-3">
                  <div className="text-[12px] text-[#888]">{dict.bookingCode}</div>
                  <div className="text-lg font-extrabold tracking-widest text-[#56EF02]">
                    {result.code}
                  </div>
                </div>
                <a
                  href={confirmDeepLink(telegramUrl, result.code)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 block rounded-full bg-[#2aabee] px-5 py-3 text-[15px] font-bold text-white"
                >
                  {dict.confirmTelegram}
                </a>
                <button
                  onClick={reset}
                  className="mt-3 rounded-full border border-[#444] px-5 py-2.5 text-[13px] font-semibold text-white"
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
                        onRemove={() => togglePick(it.activityId, it.startMin)}
                      />
                    ))}
                    {cart.addons.map((ad) => (
                      <CartRow
                        key={ad.id}
                        title={ad.title}
                        sub={`×${ad.qty}`}
                        price={`${fmtMoney(ad.price)} ${dict.uah}`}
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

// G-75 target-style emblem. Links home; approximates the club's logo.
function G75Logo() {
  return (
    <svg width="46" height="46" viewBox="0 0 48 48" fill="none" aria-hidden="true">
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

function TelegramGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M21.94 4.9 3.6 11.98c-1.05.42-1.04 1.02-.18 1.28l4.6 1.44 1.77 5.55c.22.6.4.83.83.83.33 0 .5-.15.7-.35l2.2-2.14 4.58 3.38c.84.46 1.44.22 1.65-.78l2.98-14.05c.3-1.22-.46-1.77-1.26-1.4Z" />
    </svg>
  );
}

function ViberGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 3C7.9 3 4.5 5.7 4.5 9.4c0 1.7.7 3.2 1.9 4.4-.1 1-.5 2.2-.9 2.9-.2.3 0 .7.4.6 1.5-.4 2.6-1 3.3-1.5.9.3 1.8.4 2.8.4 4.1 0 7.5-2.7 7.5-6.4C19 5.7 15.6 3 12 3Zm0 11.4c-.9 0-1.8-.1-2.6-.4l-.4-.2-.4.3c-.5.3-1.1.7-1.9 1 .3-.6.5-1.3.6-1.9l.1-.5-.4-.4c-1-1-1.6-2.2-1.6-3.5 0-2.9 2.8-5.2 6.1-5.2s6.1 2.3 6.1 5.2-2.7 5.2-6.1 5.2Zm3.3-3.6c-.2-.1-1-.5-1.2-.6-.2-.1-.3-.1-.4.1l-.5.6c-.1.1-.2.1-.4 0-.7-.3-1.3-.7-1.8-1.5-.1-.2 0-.3.1-.4l.3-.4c.1-.1 0-.3 0-.4l-.5-1.1c-.1-.3-.3-.3-.4-.3h-.3c-.1 0-.3 0-.5.2-.2.2-.6.6-.6 1.4s.6 1.6.7 1.7c.1.1 1.2 1.9 3 2.6 1.1.4 1.5.5 2 .4.3-.1 1-.4 1.1-.8.1-.4.1-.7.1-.8-.1-.1-.2-.1-.4-.2Z" />
    </svg>
  );
}

function LangDropdown({ locale }: { locale: Locale }) {
  const [open, setOpen] = useState(false);
  const all: Locale[] = ["uk", "ru", "en"];
  const others = all.filter((l) => l !== locale);
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
              href={`/?lang=${l}`}
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
