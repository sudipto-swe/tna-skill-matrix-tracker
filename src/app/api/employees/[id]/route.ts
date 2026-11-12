import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handleApi, ApiError, isScopedToOwnDepartment } from "@/lib/api";
import { audit } from "@/lib/audit";
import { employeeUpdateSchema } from "@/lib/validation";
import { computeTna } from "@/lib/tna";

function assertEmployeeAccess(session: { roleCode: string; departmentId: string | null; employeeId: string | null }, emp: { id: string; departmentId: string }) {
  if (session.roleCode === "employee" && session.employeeId !== emp.id) {
    throw new ApiError(403, "You can only view your own profile.");
  }
  if (session.roleCode === "department_supervisor" && session.departmentId !== emp.departmentId) {
    throw new ApiError(403, "You can only view employees in your own department.");
  }
}

/** GET /api/employees/[id] — full profile: assessments, quals, training, TNA needs. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handleApi(req, {}, async (session) => {
    const emp = await db.employee.findUnique({
      where: { id },
      include: { department: true, jobRole: true, productionArea: true },
    });
    if (!emp) throw new ApiError(404, "Employee not found.");
    assertEmployeeAccess(session, emp);

    const [assessments, qualifications, enrollments, attendance, tna] = await Promise.all([
      db.assessment.findMany({
        where: { employeeId: id },
        include: { competency: true },
        orderBy: { assessedAt: "desc" },
      }),
      db.qualification.findMany({
        where: { employeeId: id },
        include: { competency: true },
        orderBy: { expiresAt: "asc" },
      }),
      db.enrollment.findMany({
        where: { employeeId: id },
        include: { session: { include: { program: true, targetDepartment: true } } },
        orderBy: { session: { scheduledDate: "desc" } },
      }),
      db.attendanceRecord.findMany({
        where: { employeeId: id },
        include: { session: true },
        orderBy: { session: { scheduledDate: "desc" } },
      }),
      computeTna({ employeeId: id }),
    ]);

    return {
      employee: {
        id: emp.id, employeeCode: emp.employeeCode, name: emp.name,
        department: emp.department.name, departmentId: emp.departmentId,
        productionArea: emp.productionArea?.name ?? null,
        jobRole: emp.jobRole.title, jobRoleId: emp.jobRoleId,
        designation: emp.designation, joiningDate: emp.joiningDate, status: emp.status,
        supervisorName: emp.supervisorName, shift: emp.shift, category: emp.category,
      },
      assessments: assessments.map((a) => ({
        id: a.id, competencyId: a.competencyId, competency: a.competency.name, code: a.competency.code,
        level: a.level, assessedBy: a.assessedBy, assessedAt: a.assessedAt, notes: a.notes,
        frequencyMonths: a.competency.assessmentFrequencyMonths,
      })),
      qualifications: qualifications.map((q) => ({
        id: q.id, competency: q.competency.name, competencyId: q.competencyId,
        issuedAt: q.issuedAt, expiresAt: q.expiresAt, certificateRef: q.certificateRef,
        expired: q.expiresAt < new Date(),
      })),
      trainingHistory: enrollments.map((e) => {
        const att = attendance.find((a) => a.sessionId === e.sessionId);
        return {
          sessionId: e.sessionId, title: e.session.title, code: e.session.code,
          date: e.session.scheduledDate, category: e.session.program.category,
          status: e.session.status, enrolledStatus: e.status,
          attendance: att?.status ?? null, qualified: att?.qualified ?? null,
        };
      }),
      needs: tna.needs,
    };
  });
}

/** PUT /api/employees/[id] — update (Administrator / Training Officer). */
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handleApi(req, { permission: "employees:write" }, async (session) => {
    const body = employeeUpdateSchema.parse(await req.json());
    const existing = await db.employee.findUnique({ where: { id } });
    if (!existing) throw new ApiError(404, "Employee not found.");

    const data: Record<string, unknown> = { ...body };
    // never trust a client-supplied department — it must always follow the job role
    delete data.departmentId;
    const effectiveRoleId = body.jobRoleId ?? existing.jobRoleId;
    const jr = await db.jobRole.findUnique({ where: { id: effectiveRoleId } });
    if (!jr) throw new ApiError(400, "Job role not found.");
    data.departmentId = jr.departmentId; // keep department in sync with the role
    // production area must belong to that same department (normalise "" → null)
    const requestedAreaId = body.productionAreaId !== undefined ? (body.productionAreaId?.trim() || null) : existing.productionAreaId;
    data.productionAreaId = requestedAreaId;
    if (requestedAreaId) {
      const area = await db.productionArea.findUnique({ where: { id: requestedAreaId } });
      if (!area) throw new ApiError(400, "Production area not found.");
      if (area.departmentId !== jr.departmentId) {
        throw new ApiError(400, `Production area "${area.name}" does not belong to the department of job role "${jr.title}".`);
      }
    }

    const emp = await db.employee.update({ where: { id }, data });
    await audit(req, session, "update", "employee", id, `${emp.employeeCode} — fields: ${Object.keys(body).join(", ")}`);
    return { employee: { id: emp.id, employeeCode: emp.employeeCode, name: emp.name } };
  });
}
