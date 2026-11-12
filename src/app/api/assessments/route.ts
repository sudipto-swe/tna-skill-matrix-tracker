import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handleApi, ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { assessmentSchema } from "@/lib/validation";

/**
 * GET /api/assessments?employeeId=&competencyId= — assessment history (scoped).
 */
export async function GET(req: NextRequest) {
  return handleApi(req, {}, async (session) => {
    const url = new URL(req.url);
    const employeeId = url.searchParams.get("employeeId");
    const competencyId = url.searchParams.get("competencyId");
    if (!employeeId) throw new ApiError(400, "employeeId is required.");

    // RBAC scope
    if (session.roleCode === "employee" && session.employeeId !== employeeId) {
      throw new ApiError(403, "You can only view your own assessments.");
    }
    if (session.roleCode === "department_supervisor") {
      const emp = await db.employee.findUnique({ where: { id: employeeId } });
      if (!emp || emp.departmentId !== session.departmentId) throw new ApiError(403, "Employee outside your department.");
    }

    const assessments = await db.assessment.findMany({
      where: { employeeId, ...(competencyId ? { competencyId } : {}) },
      include: { competency: true, employee: { select: { name: true, employeeCode: true } } },
      orderBy: { assessedAt: "desc" },
    });
    return {
      assessments: assessments.map((a) => ({
        id: a.id, competency: a.competency.name, code: a.competency.code, competencyId: a.competencyId,
        level: a.level, assessedBy: a.assessedBy, assessedAt: a.assessedAt, notes: a.notes,
        employee: a.employee ? `${a.employee.name} (${a.employee.employeeCode})` : null,
      })),
    };
  });
}

/**
 * POST /api/assessments — record a new competency assessment.
 * Training Officer (any dept) or Department Supervisor (own dept only).
 */
export async function POST(req: NextRequest) {
  return handleApi(req, { permission: "assessments:write" }, async (session) => {
    const body = assessmentSchema.parse(await req.json());
    const emp = await db.employee.findUnique({ where: { id: body.employeeId }, include: { department: true } });
    if (!emp) throw new ApiError(404, "Employee not found.");
    if (session.roleCode === "department_supervisor" && emp.departmentId !== session.departmentId) {
      throw new ApiError(403, "You can only assess employees in your own department.");
    }
    const comp = await db.competency.findUnique({ where: { id: body.competencyId } });
    if (!comp) throw new ApiError(404, "Competency not found.");

    const assessment = await db.assessment.create({
      data: {
        employeeId: body.employeeId,
        competencyId: body.competencyId,
        level: body.level,
        assessedBy: session.name,
        assessedById: session.userId,
        assessedAt: new Date(),
        notes: body.notes ?? null,
      },
    });
    await audit(req, session, "create", "assessment", assessment.id, `${emp.employeeCode} ${comp.code}: Level ${body.level}`);
    return { assessment: { id: assessment.id, level: assessment.level, assessedAt: assessment.assessedAt } };
  });
}
