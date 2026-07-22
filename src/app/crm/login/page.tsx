"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Помилка входу");
      const next = params.get("next") || "/crm";
      router.push(next);
      router.refresh();
    } catch (err: any) {
      setError(err?.message || "Помилка");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0e0e0e] px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-card bg-[#161616] p-8 text-white shadow-2xl"
      >
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-[#56EF02] text-xl font-extrabold text-[#56EF02]">
            G
          </div>
          <div>
            <div className="text-base font-bold">G-75 · CRM</div>
            <div className="text-xs text-[#888]">панель менеджера</div>
          </div>
        </div>

        <label className="mb-1 block text-[12px] font-bold tracking-wide text-[#888]">EMAIL</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoFocus
          className="mb-4 w-full rounded-xl border border-[#333] bg-[#0e0e0e] px-3.5 py-3 text-[15px] text-white outline-none focus:border-[#56EF02]"
          placeholder="admin@g75.local"
        />

        <label className="mb-1 block text-[12px] font-bold tracking-wide text-[#888]">ПАРОЛЬ</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-5 w-full rounded-xl border border-[#333] bg-[#0e0e0e] px-3.5 py-3 text-[15px] text-white outline-none focus:border-[#56EF02]"
          placeholder="••••••••"
        />

        {error && <div className="mb-4 text-center text-[13px] text-[#ff8a5c]">{error}</div>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-full bg-[#56EF02] py-3.5 text-[16px] font-bold text-[#1A1A1A] disabled:opacity-60"
        >
          {loading ? "Вхід…" : "Увійти"}
        </button>
      </form>
    </div>
  );
}
