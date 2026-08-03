import { getCurrentUser, can } from "@/lib/auth";
import { loadCrmCatalog } from "@/lib/crm-data";
import CalendarClient from "@/components/crm/CalendarClient";

export const dynamic = "force-dynamic";

export default async function CrmCalendarPage() {
  const user = await getCurrentUser();
  const catalog = await loadCrmCatalog();
  return (
    <CalendarClient
      catalog={catalog}
      canWrite={!!user && can(user.role, "write")}
      isAdmin={user?.role === "ADMIN"}
    />
  );
}
