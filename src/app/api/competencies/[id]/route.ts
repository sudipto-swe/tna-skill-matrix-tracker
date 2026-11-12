import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handleApi, ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { competencyUpdateSchema } from "@/lib/validation";

/** GET /api/competencies/[id] — detail with requirements and assessment stats. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handleApi(req, { permission: "competencies:read" }, async () => {
    const c = await db.competency.findUnique({
      where: { id },
      include: {
        department: true,
        roleCompetencies: { include: { jobRole: { include: { department: true } } } },
      },
    });
    if (!c) throw new ApiError(404, "Competency not found.");

    const assessments = await db.assessment.findMany({ where: { competencyId: id } });
    const levelCounts = [1, 2, 3, 4].map((l) => ({ level: l, count: assessments.filter((a) => a.level === l).length }));

    return {
      competency: {
        id: c.id, code: c.code, name: c.name, description: c.description, category: c.category,
        department: c.department?.name ?? "Plant-wide", departmentId: c.departmentId,
        baselineLevel: c.baselineLevel, assessmentCriteria: c.assessmentCriteria,
        assessmentFrequencyMonths: c.assessmentFrequencyMonths, validityMonths: c.validityMonths,
        safetyCritical: c.safetyCritical, mandatory: c.mandatory, active: c.active,
      },
      requiredBy: c.roleCompetencies.map((rc) => ({
        jobRoleId: rc.jobRoleId, jobRole: rc.jobRole.title, department: rc.jobRole.department.name, requiredLevel: rc.requiredLevel,
      })),
      stats: {
        totalAssessments: assessments.length,
        levelCounts,
        avgLevel: assessments.length
          ? Math.round((assessments.reduce((s, a) => s + a.level, 0) / assessments.length) * 10) / 10
          : null,
      },
    };
  });
}

/** PUT /api/competencies/[id] — update (Administrator). */
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handleApi(req, { permission: "competencies:write" }, async (session) => {
    const body = competencyUpdateSchema.parse(await req.json());
    const comp = await db.competency.update({ where: { id }, data: body });
    await audit(req, session, "update", "competency", id, `${comp.code} — fields: ${Object.keys(body).join(", ")}`);
    return { competency: { id: comp.id, code: comp.code, name: comp.name } };
  });
}
