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
  const [loadingAvail, setLoadingAvail] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ code: string; total: number } | null>(null);

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
  }, [locationId, locActivities]);

  // Fetch availability whenever location/date changes.
  useEffect(() => {
    if (!locationId || !date) return;
    let cancelled = false;
    setLoadingAvail(true);
    fetch(`/api/availability?locationId=${locationId}&date=${date}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setBusy(d.busyByActivity ?? {});
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
    const total =
      items.reduce((s, i) => s + i.price, 0) + addons.reduce((s, a) => s + a.price, 0);
    return { items, addons, total };
  }, [picks, actById, actDuration, people, unitPrice, dict, catalog.addons, addonQty]);

  async function submit() {
    setError("");
    if (!customerPhone.trim()) return setError(dict.errPhone);
    if (cart.items.length === 0) return setError(dict.errEmpty);
    if (!people || people < 1) return setError(dict.errPeople);
    setSubmitting(true);
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locationId,
          date,
          people,
          customerName,
          customerPhone,
          lang: locale,
          items: cart.items.map((i) => ({
            activityId: i.activityId,
            startMin: i.startMin,
            durationMin: i.durationMin,
            people: i.people,
          })),
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
  }

  const summaryLine = `${location.name} · ${date}${weekend ? ` · ${dict.weekendBadge}` : ""} · ${people} ${dict.stepPeople.toLowerCase()}`;

  return (
    <div style={{ minHeight: "100vh", background: "#f2f2f2" }}>
      {/* Header */}
      <header className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-[#e8e8e8] bg-white px-5 py-3 md:px-10">
        {/* Logo → back to the start screen (regular lasertag) */}
        <Link href="/" aria-label={dict.brandName} className="shrink-0">
          <G75Logo />
        </Link>

        {/* Brand + messengers + phone */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <div className="text-[17px] font-bold leading-tight text-brand-green">
            {dict.brandName}
          </div>
          <div className="flex items-center gap-2">
            {/* TODO: replace "#" with the real Telegram channel link */}
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
        </div>

        {/* Language dropdown */}
        <div className="ml-auto flex items-center gap-3">
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
            {/* Packages */}
            {catalog.packages.length > 0 && (
              <section className="rounded-card bg-white p-7 shadow-card">
                <h2 className="m-0 text-[22px] font-extrabold text-brand-ink">{dict.packagesTitle}</h2>
                <p className="mb-3 mt-1 text-[13px] text-[#999]">{dict.packagesHint}</p>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {catalog.packages.map((p) => {
                    const items = p.itemActivityIds
                      .map((id) => actById.get(id))
                      .filter(Boolean) as PubActivity[];
                    const price =
                      (weekend ? p.fixedWeekend : p.fixedWeekday) ||
                      items.reduce((s, a) => s + linePrice(a), 0);
                    return (
                      <button
                        key={p.id}
                        onClick={() => {
                          // Select all package activities (interest); user then picks times.
                          setChosen((prev) => {
                            const next = { ...prev };
                            items.forEach((a) => {
                              if (a.locationIds.includes(locationId)) next[a.id] = true;
                            });
                            return next;
                          });
                        }}
                        className="rounded-2xl border border-[#E5E5E5] bg-white p-4 text-left hover:border-[#b9ef7a]"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xl">{p.icon}</span>
                          <span className="font-bold">{p.name}</span>
                        </div>
                        <div className="mt-1 text-[12px] text-[#888]">{p.desc}</div>
                        <div className="mt-2 text-[13px] font-extrabold text-brand-green">
                          {dict.add} · ~{fmtMoney(price)} {dict.uah}
                        </div>
                      </button>
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

                {cart.items.length === 0 && cart.addons.length === 0 ? (
                  <div className="mt-4 rounded-2xl border border-dashed border-[#555] px-4 py-6 text-center text-[13px] leading-relaxed text-[#999]">
                    {dict.cartEmpty}
                  </div>
                ) : (
                  <div className="mt-4 flex flex-col gap-2.5">
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
  const langs: { code: Locale; label: string }[] = [
    { code: "uk", label: "Українська" },
    { code: "ru", label: "Русский" },
    { code: "en", label: "English" },
  ];
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
        className="flex items-center gap-1.5 rounded-full border border-[#e8e8e8] px-3 py-2 text-[13px] font-bold text-brand-ink hover:border-[#cfcfcf]"
      >
        {locale.toUpperCase()}
        <span className={`text-[10px] text-[#999] transition ${open ? "rotate-180" : ""}`}>▾</span>
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-40 overflow-hidden rounded-xl border border-[#eee] bg-white py-1 shadow-lg">
          {langs.map((l) => (
            <a
              key={l.code}
              href={`/?lang=${l.code}`}
              className={`flex items-center justify-between px-3.5 py-2 text-[13px] hover:bg-[#f5f5f5] ${
                l.code === locale ? "font-bold text-brand-green" : "text-brand-ink"
              }`}
            >
              <span>{l.label}</span>
              <span className="text-[11px] font-bold uppercase text-[#999]">{l.code}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
