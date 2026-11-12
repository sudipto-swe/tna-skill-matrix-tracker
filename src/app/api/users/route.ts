import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handleApi, ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { hashPassword } from "@/lib/auth";
import { userCreateSchema } from "@/lib/validation";

/** GET /api/users — user management (Administrator only). */
export async function GET(req: NextRequest) {
  return handleApi(req, { permission: "users:manage" }, async () => {
    const [users, roles] = await Promise.all([
      db.user.findMany({
        include: {
          role: true,
          employee: { select: { id: true, name: true, employeeCode: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
      db.role.findMany({ orderBy: { code: "asc" } }),
    ]);
    return {
      users: users.map((u) => ({
        id: u.id, email: u.email, name: u.name, status: u.status,
        roleCode: u.role.code, roleName: u.role.name, roleId: u.roleId,
        employee: u.employee ? { id: u.employee.id, name: u.employee.name, code: u.employee.employeeCode } : null,
        lastLoginAt: u.lastLoginAt, createdAt: u.createdAt,
      })),
      roles: roles.map((r) => ({
        id: r.id, code: r.code, name: r.name, description: r.description,
        permissions: JSON.parse(r.permissions) as string[],
      })),
    };
  });
}

/** POST /api/users — create user (Administrator only). */
export async function POST(req: NextRequest) {
  return handleApi(req, { permission: "users:manage" }, async (session) => {
    const body = userCreateSchema.parse(await req.json());
    const role = await db.role.findUnique({ where: { id: body.roleId } });
    if (!role) throw new ApiError(400, "Role not found.");
    if (body.employeeId) {
      const emp = await db.employee.findUnique({ where: { id: body.employeeId } });
      if (!emp) throw new ApiError(400, "Linked employee not found.");
      const taken = await db.user.findUnique({ where: { employeeId: body.employeeId } });
      if (taken) throw new ApiError(409, `This employee is already linked to user ${taken.email}.`);
    }
    const user = await db.user.create({
      data: {
        email: body.email,
        name: body.name,
        passwordHash: hashPassword(body.password),
        roleId: body.roleId,
        employeeId: body.employeeId ?? null,
      },
    });
    await audit(req, session, "create", "user", user.id, `${user.email} — role ${role.code}`);
    return { user: { id: user.id, email: user.email } };
  });
}
