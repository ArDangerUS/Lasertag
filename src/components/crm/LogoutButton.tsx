"use client";

import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/crm/login");
    router.refresh();
  }
  return (
    <button
      onClick={logout}
      className="rounded-full border border-[#333] px-3.5 py-2 text-[13px] font-semibold text-[#bbb] hover:border-[#555] hover:text-white"
    >
      Вийти
    </button>
  );
}
