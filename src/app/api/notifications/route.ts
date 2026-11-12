import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handleApi } from "@/lib/api";
import { z } from "zod";

/** GET /api/notifications — in-app alerts for the signed-in user. */
export async function GET(req: NextRequest) {
  return handleApi(req, { permission: "notifications:read" }, async (session) => {
    const url = new URL(req.url);
    const unreadOnly = url.searchParams.get("unread") === "1";

    const where = {
      OR: [{ userId: session.userId }, { audienceRole: session.roleCode }],
      ...(unreadOnly ? { readAt: null } : {}),
    };
    const notifications = await db.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    const unread = await db.notification.count({ where: { ...where, readAt: null } });
    return { notifications, unread };
  });
}

/** PATCH /api/notifications — mark read. */
export async function PATCH(req: NextRequest) {
  return handleApi(req, { permission: "notifications:read" }, async (session) => {
    const body = z.object({ ids: z.array(z.string()).optional(), all: z.boolean().optional() }).parse(await req.json());
    const where = body.all
      ? { OR: [{ userId: session.userId }, { audienceRole: session.roleCode }], readAt: null }
      : { id: { in: body.ids ?? [] }, OR: [{ userId: session.userId }, { audienceRole: session.roleCode }] };
    await db.notification.updateMany({ where, data: { readAt: new Date() } });
    return { ok: true };
  });
}
