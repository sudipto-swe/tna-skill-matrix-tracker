/**
 * Audit logger — every sensitive mutation and access event is recorded.
 */
import { db } from "./db";
import { getClientIp } from "./rate-limit";
import type { SessionUser } from "./auth";

export async function audit(
  req: Request,
  session: SessionUser | null,
  action: string,
  entity: string,
  entityId?: string | null,
  details?: string | null
): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        userId: session?.userId ?? null,
        userName: session?.name ?? "Anonymous",
        roleCode: session?.roleCode ?? null,
        action,
        entity,
        entityId: entityId ?? null,
        details: details ?? null,
        ip: getClientIp(req),
      },
    });
  } catch (e) {
    // never let audit failures break the API
    console.error("[audit] failed:", e);
  }
}
