import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handleApi, isScopedToOwnDepartment, ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { employeeCreateSchema } from "@/lib/validation";

/** GET /api/employees — directory with filters (RBAC-scoped). */
export async function GET(req: NextRequest) {
  return handleApi(req, {}, async (session) => {
    const url = new URL(req.url);
    const canAll = session.permissions.includes("employees:read:all");
    const canDept = session.permissions.includes("employees:read:dept");
    const canSelf = session.permissions.includes("employees:read:self");
    if (!canAll && !canDept && !canSelf) {
      throw new ApiError(403, "Access denied: your role cannot view the employee directory.");
    }

    const search = url.searchParams.get("search")?.trim() ?? "";
    const deptId = url.searchParams.get("deptId") ?? "";
    const roleId = url.searchParams.get("roleId") ?? "";
    const shift = url.searchParams.get("shift") ?? "";
    const status = url.searchParams.get("status") ?? "";
    const category = url.searchParams.get("category") ?? "";
    const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
    const pageSize = Math.min(100, Math.max(5, Number(url.searchParams.get("pageSize") ?? 20)));

    // employee role → only self
    if (canSelf && !canAll && !canDept) {
      if (!session.employeeId) return { employees: [], total: 0, page: 1, pageSize };
      const emp = await db.employee.findUnique({
        where: { id: session.employeeId },
        include: { department: true, jobRole: true, productionArea: true },
      });
      return { employees: emp ? [emp] : [], total: emp ? 1 : 0, page: 1, pageSize: 1 };
    }

    const where = {
      ...(isScopedToOwnDepartment(session) ? { departmentId: session.departmentId! } : {}),
      ...(deptId && !isScopedToOwnDepartment(session) ? { departmentId: deptId } : {}),
      ...(roleId ? { jobRoleId: roleId } : {}),
      ...(shift ? { shift } : {}),
      ...(status ? { status } : {}),
      ...(category ? { category } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search } },
              { employeeCode: { contains: search } },
              { designation: { contains: search } },
            ],
          }
        : {}),
    };

    const [total, employees] = await Promise.all([
      db.employee.count({ where }),
      db.employee.findMany({
        where,
        include: { department: true, jobRole: true, productionArea: true },
        orderBy: [{ employeeCode: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      employees: employees.map((e) => ({
        id: e.id, employeeCode: e.employeeCode, name: e.name,
        department: e.department.name, departmentId: e.departmentId,
        productionArea: e.productionArea?.name ?? null, productionAreaId: e.productionAreaId,
        jobRole: e.jobRole.title, jobRoleId: e.jobRoleId,
        designation: e.designation, joiningDate: e.joiningDate, status: e.status,
        supervisorName: e.supervisorName, shift: e.shift, category: e.category,
      })),
      total, page, pageSize,
    };
  });
}

/** POST /api/employees — create (Administrator; Training Officers onboard via the import flow). */
export async function POST(req: NextRequest) {
  return handleApi(req, { permission: "employees:write" }, async (session) => {
    const body = employeeCreateSchema.parse(await req.json());

    const jobRole = await db.jobRole.findUnique({ where: { id: body.jobRoleId } });
    if (!jobRole) throw new ApiError(400, "Job role not found.");

    // production area must belong to the same department as the job role
    const requestedAreaId = body.productionAreaId?.trim() || null; // normalise "" → null
    if (requestedAreaId) {
      const area = await db.productionArea.findUnique({ where: { id: requestedAreaId } });
      if (!area) throw new ApiError(400, "Production area not found.");
      if (area.departmentId !== jobRole.departmentId) {
        throw new ApiError(400, `Production area "${area.name}" does not belong to the department of job role "${jobRole.title}".`);
      }
    }

    const emp = await db.employee.create({
      data: {
        employeeCode: body.employeeCode,
        name: body.name,
        departmentId: jobRole.departmentId, // department derived from job role for consistency
        productionAreaId: requestedAreaId,
        jobRoleId: body.jobRoleId,
        designation: body.designation,
        joiningDate: body.joiningDate,
        status: body.status,
        supervisorName: body.supervisorName ?? null,
        shift: body.shift,
        category: body.category,
      },
    });
    await audit(req, session, "create", "employee", emp.id, `${emp.employeeCode} — ${emp.name}`);
    return { employee: { id: emp.id, employeeCode: emp.employeeCode, name: emp.name } };
  });
}
