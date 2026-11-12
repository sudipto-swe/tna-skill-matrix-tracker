import { NextRequest } from "next/server";
import { handleApi } from "@/lib/api";
import { audit } from "@/lib/audit";
import { refreshAlerts } from "@/lib/notifications";

/** POST /api/notifications/refresh — recompute in-app alerts from live data. */
export async function POST(req: NextRequest) {
  return handleApi(req, { permission: "notifications:read" }, async (session) => {
    const result = await refreshAlerts();
    await audit(req, session, "update", "notifications", null, `Alerts refreshed — ${result.created} new notification(s)`);
    return result;
  });
}
