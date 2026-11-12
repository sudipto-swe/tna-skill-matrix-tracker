import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handleApi, ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { hashPassword } from "@/lib/auth";
import { userUpdateSchema } from "@/lib/validation";

/** PUT /api/users/[id] — update user / reset password / disable (Administrator). */
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handleApi(req, { permission: "users:manage" }, async (session) => {
    const body = userUpdateSchema.parse(await req.json());
    const target = await db.user.findUnique({ where: { id }, include: { role: true } });
    if (!target) throw new ApiError(404, "User not found.");

    // safety: cannot disable yourself or demote/disable the last administrator
    if (id === session.userId && body.status === "disabled") {
      throw new ApiError(409, "You cannot disable your own account.");
    }
    if (target.role.code === "administrator") {
      const admins = await db.user.count({ where: { role: { code: "administrator" }, status: "active" } });
      const demotesOrDisables = (body.roleId && body.roleId !== target.roleId) || body.status === "disabled";
      if (admins <= 1 && demotesOrDisables) {
        throw new ApiError(409, "Cannot demote or disable the last active administrator.");
      }
    }
    if (body.employeeId) {
      const taken = await db.user.findFirst({ where: { employeeId: body.employeeId, NOT: { id } } });
      if (taken) throw new ApiError(409, `This employee is already linked to user ${taken.email}.`);
    }

    const data: Record<string, unknown> = {};
    if (body.name) data.name = body.name;
    if (body.roleId) data.roleId = body.roleId;
    if (body.employeeId !== undefined) data.employeeId = body.employeeId;
    if (body.status) data.status = body.status;
    if (body.password) data.passwordHash = hashPassword(body.password);

    await db.user.update({ where: { id }, data });
    await audit(
      req, session, "update", "user", id,
      `${target.email} — ${[...Object.keys(body)].join(", ")}${body.password ? " (password reset)" : ""}`
    );
    return { ok: true };
  });
}
