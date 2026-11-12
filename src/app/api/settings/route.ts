import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handleApi, ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { tnaRulesSchema, alertThresholdsSchema } from "@/lib/validation";
import { invalidateTnaRulesCache, DEFAULT_TNA_RULES } from "@/lib/tna";

/** GET /api/settings — TNA rules + alert thresholds. */
export async function GET(req: NextRequest) {
  return handleApi(req, { permission: "settings:read" }, async () => {
    const rows = await db.setting.findMany();
    const get = (key: string) => rows.find((r) => r.key === key)?.value ?? null;
    let tnaRules: unknown = DEFAULT_TNA_RULES;
    let alertThresholds: unknown = { within7Days: true, within30Days: true, emailEnabled: false, emailConfigured: false };
    const rawRules = get("tna_rules");
    const rawThresholds = get("alert_thresholds");
    try { if (rawRules) tnaRules = JSON.parse(rawRules); } catch { /* defaults */ }
    try { if (rawThresholds) alertThresholds = JSON.parse(rawThresholds); } catch { /* defaults */ }
    return {
      tnaRules,
      alertThresholds,
      emailNotifications: {
        enabled: process.env.SMTP_HOST ? true : false,
        note: process.env.SMTP_HOST
          ? "SMTP is configured — email notifications can be enabled."
          : "SMTP is NOT configured (SMTP_HOST env var absent). In-app alerts work; email stays disabled.",
      },
    };
  });
}

/** PUT /api/settings — update rules (Administrator only). */
export async function PUT(req: NextRequest) {
  return handleApi(req, { permission: "settings:write" }, async (session) => {
    const body = (await req.json()) as { tnaRules?: unknown; alertThresholds?: unknown };
    const updated: string[] = [];

    if (body.tnaRules) {
      const rules = tnaRulesSchema.parse(body.tnaRules);
      await db.setting.upsert({
        where: { key: "tna_rules" },
        create: { key: "tna_rules", value: JSON.stringify(rules), updatedBy: session.name },
        update: { value: JSON.stringify(rules), updatedBy: session.name },
      });
      invalidateTnaRulesCache();
      updated.push("tna_rules");
    }
    if (body.alertThresholds) {
      const thresholds = alertThresholdsSchema.parse(body.alertThresholds);
      await db.setting.upsert({
        where: { key: "alert_thresholds" },
        create: { key: "alert_thresholds", value: JSON.stringify(thresholds), updatedBy: session.name },
        update: { value: JSON.stringify(thresholds), updatedBy: session.name },
      });
      updated.push("alert_thresholds");
    }
    if (!updated.length) throw new ApiError(400, "Provide tnaRules and/or alertThresholds.");
    await audit(req, session, "update", "notifications", null, `Settings updated: ${updated.join(", ")}`);
    return { updated };
  });
}
