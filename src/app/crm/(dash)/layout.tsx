import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { ROLE_META } from "@/lib/constants";
import LogoutButton from "@/components/crm/LogoutButton";

export const dynamic = "force-dynamic";

export default async function DashLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  // Token may be cryptographically valid while the user no longer exists
  // (fresh DB after db:reset). Go through /api/auth/clear to drop the stale
  // cookie — a plain redirect to /crm/login would loop via the middleware.
  if (!user) redirect("/api/auth/clear");
  const meta = ROLE_META[user.role];

  return (
    <div className="min-h-screen bg-[#0e0e0e] text-white">
      <div className="mx-auto max-w-[1400px] px-4 py-4 md:px-6">
        {/* Top bar */}
        <header className="mb-5 flex flex-wrap items-center gap-4 rounded-card bg-[#161616] px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-[#56EF02] text-lg font-extrabold text-[#56EF02]">
              G
            </div>
            <div>
              <div className="text-[15px] font-bold">G-75 · CRM</div>
              <div className="text-[11px] text-[#888]">панель менеджера</div>
            </div>
          </div>

          <nav className="flex flex-wrap items-center gap-1">
            <NavLink href="/crm">Календар</NavLink>
            <NavLink href="/crm/leads">Ліди</NavLink>
            <NavLink href="/crm/stats">Статистика</NavLink>
            {meta.canEditCatalog && <NavLink href="/crm/settings">Розваги і ціни</NavLink>}
            {meta.canManageUsers && <NavLink href="/crm/users">Користувачі</NavLink>}
            <NavLink href="/crm/audit">Журнал</NavLink>
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <div className="text-right">
              <div className="text-[13px] font-semibold">{user.name}</div>
              <div className="text-[11px] text-[#888]">{meta.uk}</div>
            </div>
            <LogoutButton />
          </div>
        </header>

        {children}
      </div>
    </div>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-full px-3.5 py-2 text-[13px] font-semibold text-[#bbb] hover:bg-[#222] hover:text-white"
    >
      {children}
    </Link>
  );
}
