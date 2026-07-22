import { redirect } from "next/navigation";
import { getCurrentUser, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import UsersClient from "@/components/crm/UsersClient";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const user = await getCurrentUser();
  if (!user || !can(user.role, "manageUsers")) redirect("/crm");

  const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" } });
  return (
    <UsersClient
      me={user.id}
      initial={users.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        active: u.active,
      }))}
    />
  );
}
