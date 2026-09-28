import { redirect } from "next/navigation";
import { getCurrentUser, can } from "@/lib/auth";
import StatsClient from "@/components/crm/StatsClient";

export const dynamic = "force-dynamic";

export default async function StatsPage() {
  const user = await getCurrentUser();
  // Виручка — тільки для адміністратора; менеджеру сторінки просто немає
  if (!user || !can(user.role, "seeRevenue")) redirect("/crm");
  return <StatsClient />;
}
