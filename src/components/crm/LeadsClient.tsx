"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PhoneMenu from "@/components/PhoneMenu";

type Lead = {
  id: string;
  phone: string;
  name: string;
  locationName: string;
  date: string;
  people: number;
  status: string; // NEW | DONE
  updatedAt: string;
};

export default function LeadsClient({
  leads: initial,
  canWrite,
  isAdmin = false,
}: {
  leads: Lead[];
  canWrite: boolean;
  isAdmin?: boolean;
}) {
  const router = useRouter();
  const [leads, setLeads] = useState(initial);

  // Роутер Next кешує сторінку ~30 с: після повернення з іншої вкладки CRM
  // без цього показувався застарілий список. Примусово тягнемо свіжий стан
  // і синхронізуємо його з локальним.
  useEffect(() => {
    router.refresh();
  }, [router]);
  useEffect(() => {
    setLeads(initial);
  }, [initial]);

  async function setStatus(id: string, status: "NEW" | "DONE") {
    const res = await fetch(`/api/crm/leads/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) setLeads((ls) => ls.map((l) => (l.id === id ? { ...l, status } : l)));
  }

  async function remove(id: string) {
    if (!confirm("Видалити лід? Цю дію не можна буде скасувати.")) return;
    const res = await fetch(`/api/crm/leads/${id}`, { method: "DELETE" });
    if (res.ok) setLeads((ls) => ls.filter((l) => l.id !== id));
  }

  const fresh = leads.filter((l) => l.status === "NEW");
  const done = leads.filter((l) => l.status === "DONE");

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-card bg-[#161616] p-6">
        <h2 className="text-[18px] font-extrabold">Ліди з форми бронювання</h2>
        <p className="text-[13px] text-[#888]">
          Відвідувачі, які ввели номер телефону на сайті, але не натиснули «Забронювати». Успішне
          бронювання прибирає лід автоматично. Передзвоніть — і позначте «Опрацьовано».
        </p>
        <button onClick={() => router.refresh()} className="mt-2 rounded-full bg-[#0e0e0e] px-3.5 py-1.5 text-[12px] font-bold text-[#56EF02] ring-1 ring-[#333]">
          Оновити список
        </button>
      </div>

      {[{ title: `Нові (${fresh.length})`, list: fresh }, { title: `Опрацьовані (${done.length})`, list: done }].map(
        (grp) => (
          <div key={grp.title} className="rounded-card bg-[#161616] p-6">
            <div className="mb-3 text-[13px] font-bold uppercase tracking-wide text-[#777]">{grp.title}</div>
            {grp.list.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#333] px-3 py-4 text-center text-[13px] text-[#777]">
                Поки порожньо
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {grp.list.map((l) => (
                  <div key={l.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-[#0e0e0e] px-4 py-3">
                    <PhoneMenu
                      phone={l.phone}
                      contactName={l.name ? `${l.name} (G-75 лід)` : "Лід G-75"}
                      className="text-[15px] font-extrabold text-[#56EF02]"
                    />
                    {l.name && <span className="text-[13px] text-[#ddd]">{l.name}</span>}
                    <span className="text-[12px] text-[#888]">
                      {[l.locationName, l.date, l.people ? `${l.people} ос` : ""].filter(Boolean).join(" · ")}
                    </span>
                    <span className="ml-auto text-[11px] text-[#666]">
                      {new Date(l.updatedAt).toLocaleString("uk-UA", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    {canWrite && l.status === "NEW" && (
                      <button
                        onClick={() => setStatus(l.id, "DONE")}
                        className="rounded-full bg-[#161616] px-3 py-1.5 text-[12px] font-bold text-[#56EF02] ring-1 ring-[#333] hover:ring-[#56EF02]"
                      >
                        ✓ Опрацьовано
                      </button>
                    )}
                    {canWrite && l.status === "DONE" && (
                      <button
                        onClick={() => setStatus(l.id, "NEW")}
                        className="rounded-full bg-[#161616] px-3 py-1.5 text-[12px] text-[#bbb] ring-1 ring-[#333]"
                      >
                        ↩ У нові
                      </button>
                    )}
                    {/* видалення — лише адміністратор */}
                    {isAdmin && (
                      <button
                        onClick={() => remove(l.id)}
                        className="rounded-full px-2.5 py-1.5 text-[12px] text-[#ff7a7a] hover:bg-[#2a1414]"
                        title="Видалити (лише адміністратор)"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      )}
    </div>
  );
}
