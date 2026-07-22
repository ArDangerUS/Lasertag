import { prisma } from "./prisma";
import type { SessionUser } from "./auth";

type AuditInput = {
  actor?: SessionUser | null;
  action: "CREATE" | "UPDATE" | "DELETE" | "STATUS" | "LOGIN" | "PRICE";
  entity: string;
  entityId?: string;
  summary?: string;
  before?: unknown;
  after?: unknown;
  bookingId?: string;
};

// Append an immutable audit record. Never throws into the caller's flow.
export async function audit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: input.actor?.id ?? null,
        actorName: input.actor?.name ?? "система",
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? "",
        summary: input.summary ?? "",
        before: input.before ? JSON.stringify(input.before) : "",
        after: input.after ? JSON.stringify(input.after) : "",
        bookingId: input.bookingId ?? null,
      },
    });
  } catch (e) {
    console.error("audit failed", e);
  }
}
