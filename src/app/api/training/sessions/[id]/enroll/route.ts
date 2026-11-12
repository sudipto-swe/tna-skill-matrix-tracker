import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handleApi, ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { enrollmentSchema } from "@/lib/validation";

/** POST /api/training/sessions/[id]/enroll — bulk enrol with duplicate & capacity checks. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handleApi(req, { permission: "training:write" }, async (session) => {
    const body = enrollmentSchema.parse(await req.json());
    const s = await db.trainingSession.findUnique({
      where: { id },
      include: { enrollments: true },
    });
    if (!s) throw new ApiError(404, "Session not found.");
    if (s.status === "cancelled" || s.status === "completed") {
      throw new ApiError(409, `Cannot enrol into a ${s.status} session.`);
    }

    const existingIds = new Set(s.enrollments.map((e) => e.employeeId));
    const duplicates = body.employeeIds.filter((eid) => existingIds.has(eid));
    const fresh = [...new Set(body.employeeIds)].filter((eid) => !existingIds.has(eid));

    if (s.enrollments.length + fresh.length > s.capacity) {
      throw new ApiError(
        409,
        `Capacity conflict: ${s.capacity - s.enrollments.length} seat(s) free, ${fresh.length} new enrolment(s) requested.`,
        "capacity"
      );
    }

    const employees = await db.employee.findMany({ where: { id: { in: fresh }, status: { not: "separated" } } });
    const foundIds = new Set(employees.map((e) => e.id));
    const invalid = fresh.filter((eid) => !foundIds.has(eid));

    let created = 0;
    for (const eid of foundIds) {
      await db.enrollment.create({ data: { sessionId: id, employeeId: eid } });
      created += 1;
    }
    await audit(req, session, "update", "training_session", id, `${s.code}: enrolled ${created} employee(s)`);

    const warnings: string[] = [];
    if (duplicates.length) warnings.push(`${duplicates.length} employee(s) were already enrolled (skipped).`);
    if (invalid.length) warnings.push(`${invalid.length} employee ID(s) not found or inactive (skipped).`);
    return { created, warnings };
  });
}

/** DELETE /api/training/sessions/[id]/enroll?employeeId= — remove enrolment. */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handleApi(req, { permission: "training:write" }, async (session) => {
    const url = new URL(req.url);
    const employeeId = url.searchParams.get("employeeId");
    if (!employeeId) throw new ApiError(400, "employeeId is required.");
    const att = await db.attendanceRecord.findUnique({ where: { sessionId_employeeId: { sessionId: id, employeeId } } });
    if (att) throw new ApiError(409, "Cannot remove an enrolment with recorded attendance.");
    await db.enrollment.deleteMany({ where: { sessionId: id, employeeId } });
    await audit(req, session, "update", "training_session", id, `Removed enrolment ${employeeId}`);
    return { ok: true };
  });
}
