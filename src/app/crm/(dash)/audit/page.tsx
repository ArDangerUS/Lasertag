import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const ACTION_META: Record<string, { label: string; color: string }> = {
  CREATE: { label: "Створення", color: "#3cba54" },
  UPDATE: { label: "Зміна", color: "#3b82f6" },
  STATUS: { label: "Статус", color: "#a855f7" },
  DELETE: { label: "Видалення", color: "#ef4444" },
  PRICE: { label: "Ціни", color: "#f5a623" },
  LOGIN: { label: "Вхід", color: "#9ca3af" },
};

function fmtDateTime(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default async function AuditPage() {
  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { user: true },
  });

  return (
    <div className="rounded-card bg-[#161616] p-6">
      <h2 className="mb-1 text-[18px] font-extrabold">Журнал дій</h2>
      <p className="mb-5 text-[13px] text-[#888]">
        Хто і що змінив: створення, редагування, зміни статусів та видалення. Останні 200 записів.
      </p>

      <div className="overflow-x-auto thin-scroll">
        <table className="w-full min-w-[720px] border-collapse text-[13px]">
          <thead>
            <tr className="text-left text-[12px] uppercase tracking-wide text-[#777]">
              <th className="pb-2 pr-4 font-semibold">Час</th>
              <th className="pb-2 pr-4 font-semibold">Хто</th>
              <th className="pb-2 pr-4 font-semibold">Дія</th>
              <th className="pb-2 pr-4 font-semibold">Обʼєкт</th>
              <th className="pb-2 font-semibold">Опис</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => {
              const meta = ACTION_META[l.action] ?? { label: l.action, color: "#888" };
              return (
                <tr key={l.id} className="border-t border-[#242424]">
                  <td className="py-2.5 pr-4 text-[#aaa] whitespace-nowrap">{fmtDateTime(l.createdAt)}</td>
                  <td className="py-2.5 pr-4 text-[#ddd] whitespace-nowrap">
                    {l.user?.name || l.actorName || "система"}
                  </td>
                  <td className="py-2.5 pr-4">
                    <span
                      className="rounded-full px-2.5 py-1 text-[11px] font-bold"
                      style={{ background: meta.color + "22", color: meta.color }}
                    >
                      {meta.label}
                    </span>
                  </td>
                  <td className="py-2.5 pr-4 text-[#aaa] whitespace-nowrap">{l.entity}</td>
                  <td className="py-2.5 text-[#ccc]">{l.summary}</td>
                </tr>
              );
            })}
            {logs.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-[#777]">
                  Журнал порожній
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
