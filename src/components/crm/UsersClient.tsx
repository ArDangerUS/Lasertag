"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ROLE_META, ROLES, type Role } from "@/lib/constants";

type U = { id: string; email: string; name: string; role: string; active: boolean };

export default function UsersClient({ me, initial }: { me: string; initial: U[] }) {
  const router = useRouter();
  // Local copy updated optimistically after each action — the table reflects
  // changes immediately, no page reload needed. Re-synced on server refresh.
  const [users, setUsers] = useState(initial);
  useEffect(() => setUsers(initial), [initial]);
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // create form
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("MANAGER");

  async function create() {
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/crm/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name, password, role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Помилка");
      // show the new user in the table immediately
      setUsers((us) => [
        ...us,
        { id: data.id, email: email.toLowerCase().trim(), name, role, active: true },
      ]);
      setShowCreate(false);
      setEmail("");
      setName("");
      setPassword("");
      router.refresh();
    } catch (e: any) {
      setError(e?.message || "Помилка");
    } finally {
      setBusy(false);
    }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch(`/api/crm/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Помилка");
      // apply the change to the table immediately
      setUsers((us) =>
        us.map((u) =>
          u.id === id
            ? {
                ...u,
                ...(typeof body.role === "string" ? { role: body.role } : {}),
                ...(typeof body.active === "boolean" ? { active: body.active } : {}),
                ...(typeof body.name === "string" ? { name: body.name } : {}),
              }
            : u
        )
      );
      router.refresh();
    } catch (e: any) {
      alert(e?.message || "Помилка");
    } finally {
      setBusy(false);
    }
  }

  async function resetPw(id: string) {
    const pw = prompt("Новий пароль (мін. 8 символів):");
    if (!pw) return;
    if (pw.length < 8) return alert("Пароль замалий");
    patch(id, { password: pw });
  }

  return (
    <div className="rounded-card bg-[#161616] p-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-[18px] font-extrabold">Користувачі</h2>
          <p className="text-[13px] text-[#888]">
            Створюйте акаунти для персоналу. Ролі визначають, хто може змінювати броні, ціни та
            користувачів.
          </p>
        </div>
        <button
          onClick={() => setShowCreate((s) => !s)}
          className="rounded-full bg-[#56EF02] px-4 py-2.5 text-[13px] font-bold text-[#1A1A1A]"
        >
          + Новий користувач
        </button>
      </div>

      {showCreate && (
        <div className="mb-5 rounded-xl border border-[#2a2a2a] bg-[#0e0e0e] p-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <input
              placeholder="Імʼя"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-lg border border-[#333] bg-[#161616] px-3 py-2 text-[14px] text-white"
            />
            <input
              placeholder="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-lg border border-[#333] bg-[#161616] px-3 py-2 text-[14px] text-white"
            />
            <input
              placeholder="пароль (≥8)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-lg border border-[#333] bg-[#161616] px-3 py-2 text-[14px] text-white"
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="rounded-lg border border-[#333] bg-[#161616] px-3 py-2 text-[14px] text-white"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_META[r].uk}
                </option>
              ))}
            </select>
          </div>
          {error && <div className="mt-3 text-[13px] text-[#ff8a5c]">{error}</div>}
          <div className="mt-3 flex justify-end gap-2">
            <button
              onClick={() => setShowCreate(false)}
              className="rounded-full border border-[#333] px-4 py-2 text-[13px] text-[#bbb]"
            >
              Скасувати
            </button>
            <button
              onClick={create}
              disabled={busy}
              className="rounded-full bg-[#56EF02] px-4 py-2 text-[13px] font-bold text-[#1A1A1A]"
            >
              Створити
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto thin-scroll">
        <table className="w-full min-w-[720px] border-collapse text-[14px]">
          <thead>
            <tr className="text-left text-[12px] uppercase tracking-wide text-[#777]">
              <th className="pb-2 pr-4 font-semibold">Імʼя</th>
              <th className="pb-2 pr-4 font-semibold">Email</th>
              <th className="pb-2 pr-4 font-semibold">Роль</th>
              <th className="pb-2 pr-4 font-semibold">Статус</th>
              <th className="pb-2 font-semibold">Дії</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-[#242424]">
                <td className="py-3 pr-4 font-semibold">
                  {u.name} {u.id === me && <span className="text-[11px] text-[#56EF02]">(ви)</span>}
                </td>
                <td className="py-3 pr-4 text-[#aaa]">{u.email}</td>
                <td className="py-3 pr-4">
                  <select
                    value={u.role}
                    disabled={u.id === me}
                    onChange={(e) => patch(u.id, { role: e.target.value })}
                    className="rounded-lg border border-[#333] bg-[#0e0e0e] px-2 py-1.5 text-[13px] text-white disabled:opacity-50"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_META[r].uk}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-3 pr-4">
                  <span
                    className="rounded-full px-2.5 py-1 text-[11px] font-bold"
                    style={{
                      background: u.active ? "#12351a" : "#3a1414",
                      color: u.active ? "#3cba54" : "#ff7a7a",
                    }}
                  >
                    {u.active ? "активний" : "деактивований"}
                  </span>
                </td>
                <td className="py-3">
                  <div className="flex gap-2">
                    <button
                      onClick={() => resetPw(u.id)}
                      className="rounded-full border border-[#333] px-3 py-1.5 text-[12px] text-[#bbb] hover:text-white"
                    >
                      Пароль
                    </button>
                    {u.id !== me && (
                      <button
                        onClick={() => patch(u.id, { active: !u.active })}
                        className="rounded-full border border-[#333] px-3 py-1.5 text-[12px] text-[#bbb] hover:text-white"
                      >
                        {u.active ? "Деактивувати" : "Активувати"}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
