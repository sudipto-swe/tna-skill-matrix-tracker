import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handleApi, ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { roleRequirementSchema } from "@/lib/validation";

/** PUT /api/competencies/role-requirements — upsert role↔competency requirement (Administrator). */
export async function PUT(req: NextRequest) {
  return handleApi(req, { permission: "competencies:write" }, async (session) => {
    const body = roleRequirementSchema.parse(await req.json());
    const [role, comp] = await Promise.all([
      db.jobRole.findUnique({ where: { id: body.jobRoleId } }),
      db.competency.findUnique({ where: { id: body.competencyId } }),
    ]);
    if (!role) throw new ApiError(400, "Job role not found.");
    if (!comp) throw new ApiError(400, "Competency not found.");

    const rc = await db.roleCompetency.upsert({
      where: { jobRoleId_competencyId: { jobRoleId: body.jobRoleId, competencyId: body.competencyId } },
      create: { jobRoleId: body.jobRoleId, competencyId: body.competencyId, requiredLevel: body.requiredLevel },
      update: { requiredLevel: body.requiredLevel },
    });
    await audit(req, session, "update", "role_competency", rc.id, `${role.title} requires ${comp.code} at L${body.requiredLevel}`);
    return { roleCompetency: { id: rc.id, requiredLevel: rc.requiredLevel } };
  });
}

/** DELETE /api/competencies/role-requirements?jobRoleId&competencyId */
export async function DELETE(req: NextRequest) {
  return handleApi(req, { permission: "competencies:write" }, async (session) => {
    const url = new URL(req.url);
    const jobRoleId = url.searchParams.get("jobRoleId");
    const competencyId = url.searchParams.get("competencyId");
    if (!jobRoleId || !competencyId) throw new ApiError(400, "jobRoleId and competencyId are required.");
    await db.roleCompetency.delete({ where: { jobRoleId_competencyId: { jobRoleId, competencyId } } });
    await audit(req, session, "delete", "role_competency", null, `${jobRoleId} × ${competencyId}`);
    return { ok: true };
  });
}
