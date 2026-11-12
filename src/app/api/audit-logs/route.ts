import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handleApi } from "@/lib/api";

/** GET /api/audit-logs?user=&action=&entity=&from=&to=&page= — Administrator. */
export async function GET(req: NextRequest) {
  return handleApi(req, { permission: "audit:read" }, async () => {
    const url = new URL(req.url);
    const user = url.searchParams.get("user")?.trim() ?? "";
    const action = url.searchParams.get("action") ?? "";
    const entity = url.searchParams.get("entity") ?? "";
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
    const pageSize = 25;

    const where = {
      ...(user ? { userName: { contains: user } } : {}),
      ...(action ? { action } : {}),
      ...(entity ? { entity } : {}),
      ...(from || to
        ? { createdAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(`${to}T23:59:59`) } : {}) } }
        : {}),
    };

    const [total, logs] = await Promise.all([
      db.auditLog.count({ where }),
      db.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      logs,
      total,
      page,
      pageSize,
      actions: ["login", "login_failed", "logout", "create", "update", "delete", "export", "import", "issue", "seed"],
      entities: ["auth", "employee", "competency", "role_competency", "assessment", "training_program", "training_session", "attendance", "qualification", "user", "report", "notifications", "database"],
    };
  });
}
