import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handleApi } from "@/lib/api";
import { audit } from "@/lib/audit";
import { competencySchema } from "@/lib/validation";

/** GET /api/competencies — framework with role requirements + stats. */
export async function GET(req: NextRequest) {
  return handleApi(req, { permission: "competencies:read" }, async () => {
    const url = new URL(req.url);
    const category = url.searchParams.get("category") ?? "";
    const deptId = url.searchParams.get("deptId") ?? "";
    const search = url.searchParams.get("search")?.trim() ?? "";

    const competencies = await db.competency.findMany({
      where: {
        ...(category ? { category } : {}),
        ...(deptId ? { OR: [{ departmentId: deptId }, { departmentId: null }] } : {}),
        ...(search ? { OR: [{ name: { contains: search } }, { code: { contains: search } }, { description: { contains: search } }] } : {}),
      },
      include: {
        department: true,
        roleCompetencies: { include: { jobRole: { include: { department: true } } } },
        _count: { select: { assessments: true, qualifications: true } },
      },
      orderBy: { code: "asc" },
    });

    return {
      competencies: competencies.map((c) => ({
        id: c.id, code: c.code, name: c.name, description: c.description, category: c.category,
        department: c.department?.name ?? "Plant-wide",
        departmentId: c.departmentId,
        baselineLevel: c.baselineLevel,
        assessmentCriteria: c.assessmentCriteria,
        assessmentFrequencyMonths: c.assessmentFrequencyMonths,
        validityMonths: c.validityMonths,
        safetyCritical: c.safetyCritical,
        mandatory: c.mandatory,
        active: c.active,
        requiredBy: c.roleCompetencies.map((rc) => ({
          jobRoleId: rc.jobRoleId, jobRole: rc.jobRole.title, requiredLevel: rc.requiredLevel,
          department: rc.jobRole.department.name,
        })),
        assessmentCount: c._count.assessments,
        qualificationCount: c._count.qualifications,
      })),
    };
  });
}

/** POST /api/competencies — create (Administrator). */
export async function POST(req: NextRequest) {
  return handleApi(req, { permission: "competencies:write" }, async (session) => {
    const body = competencySchema.parse(await req.json());
    const comp = await db.competency.create({
      data: { ...body, departmentId: body.departmentId ?? null },
    });
    await audit(req, session, "create", "competency", comp.id, `${comp.code} — ${comp.name}`);
    return { competency: { id: comp.id, code: comp.code, name: comp.name } };
  });
}
