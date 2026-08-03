import { getCurrentUser, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import LeadsClient from "@/components/crm/LeadsClient";

export const dynamic = "force-dynamic";

export default async function LeadsPage() {
  const user = await getCurrentUser();
  const leads = await prisma.lead.findMany({
    orderBy: { updatedAt: "desc" },
    take: 200,
  });
  return (
    <LeadsClient
      canWrite={!!user && can(user.role, "write")}
      isAdmin={user?.role === "ADMIN"}
      leads={leads.map((l) => ({
        id: l.id,
        phone: l.phone,
        name: l.name,
        locationName: l.locationName,
        date: l.date,
        people: l.people,
        status: l.status,
        updatedAt: l.updatedAt.toISOString(),
      }))}
    />
  );
}
