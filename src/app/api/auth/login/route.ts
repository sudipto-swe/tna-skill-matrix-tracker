import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyPassword, createSessionToken, sessionCookieOptions } from "@/lib/auth";
import { handleApi, ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { loginSchema } from "@/lib/validation";
import { ensureSeededSafe } from "@/lib/ensure-seed";
import type { SessionUser } from "@/lib/auth";

export async function POST(req: NextRequest) {
  // 20 attempts / 5 min / IP: comfortably allows switching between the four
  // demo accounts while throttling brute force (failed attempts are audited).
  return handleApi(req, { public: true, limit: { max: 20, windowMs: 5 * 60_000 } }, async () => {
    // Self-healing: if the environment reset the database to an empty state,
    // seed it BEFORE validating credentials so the demo accounts always work.
    await ensureSeededSafe();

    const body = loginSchema.parse(await req.json());
    // ensureSeededSafe() probes the database file on disk on every login, so
    // an empty (environment-reset) or swapped database is healed right here,
    // and the shared client is reconnected to the current file, before any
    // credential lookup happens.
    const user = await db.user.findUnique({
      where: { email: body.email },
      include: { role: true, employee: { include: { department: true } } },
    });

    const invalid = () => new ApiError(401, "Invalid email or password.");
    if (!user) { await audit(req, null, "login_failed", "auth", null, `Unknown email: ${body.email}`); throw invalid(); }
    if (user.status !== "active") { await audit(req, null, "login_failed", "auth", user.id, "Disabled account"); throw new ApiError(403, "This account has been disabled. Contact the administrator."); }
    if (!verifyPassword(body.password, user.passwordHash)) {
      await audit(req, null, "login_failed", "auth", user.id, "Wrong password");
      throw invalid();
    }

    await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const pseudoSession: SessionUser = {
      userId: user.id, name: user.name, email: user.email,
      roleCode: user.role.code, roleName: user.role.name, permissions: [],
      employeeId: user.employeeId ?? null, employeeCode: null,
      departmentId: null, departmentName: null,
    };
    await audit(req, pseudoSession, "login", "auth", user.id, `Role: ${user.role.code}`);

    // Same signed token is delivered twice: as an httpOnly cookie (top-level
    // browser usage) and in the body (stored by the client and sent as a
    // Bearer header — required for cross-site iframe contexts where the
    // SameSite=Lax cookie is never attached by the browser).
    const token = createSessionToken(user.id);
    const res = NextResponse.json({
      token,
      user: {
        id: user.id, name: user.name, email: user.email,
        roleCode: user.role.code, roleName: user.role.name,
        permissions: JSON.parse(user.role.permissions),
        employeeId: user.employeeId ?? null,
        employeeCode: user.employee?.employeeCode ?? null,
        departmentId: user.employee?.departmentId ?? null,
        departmentName: user.employee?.department?.name ?? null,
      },
    });
    res.cookies.set({ ...sessionCookieOptions(), value: token });
    return res;
  });
}
