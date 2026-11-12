import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handleApi, ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { attendanceSaveSchema } from "@/lib/validation";

/**
 * PUT /api/attendance — save attendance for a session (upsert per employee).
 * Attendance (participation) is tracked separately from qualification.
 */
export async function PUT(req: NextRequest) {
  return handleApi(req, { permission: "attendance:write" }, async (session) => {
    const body = attendanceSaveSchema.parse(await req.json());
    const s = await db.trainingSession.findUnique({
      where: { id: body.sessionId },
      include: { enrollments: true },
    });
    if (!s) throw new ApiError(404, "Session not found.");
    if (s.status === "cancelled") throw new ApiError(409, "Cannot record attendance for a cancelled session.");

    const enrolledIds = new Set(s.enrollments.map((e) => e.employeeId));
    const notEnrolled = body.records.filter((r) => !enrolledIds.has(r.employeeId));
    if (notEnrolled.length) {
      throw new ApiError(400, `${notEnrolled.length} record(s) reference employees who are not enrolled in this session.`);
    }

    await db.$transaction(async (tx) => {
      for (const r of body.records) {
        await tx.attendanceRecord.upsert({
          where: { sessionId_employeeId: { sessionId: s.id, employeeId: r.employeeId } },
          create: { sessionId: s.id, employeeId: r.employeeId, status: r.status, qualified: r.qualified, remarks: r.remarks ?? null },
          update: { status: r.status, qualified: r.qualified, remarks: r.remarks ?? null, recordedAt: new Date() },
        });
        // keep enrolment status in sync with the outcome
        await tx.enrollment.updateMany({
          where: { sessionId: s.id, employeeId: r.employeeId },
          data: { status: r.status === "present" ? (r.qualified ? "completed" : "enrolled") : r.status === "absent" ? "dropped" : "enrolled" },
        });
      }
      // mark session completed once attendance exists
      if (s.status !== "completed" && s.scheduledDate < new Date()) {
        await tx.trainingSession.update({ where: { id: s.id }, data: { status: "completed" } });
      }
    });

    const present = body.records.filter((r) => r.status === "present").length;
    await audit(req, session, "update", "attendance", s.id, `${s.code}: ${body.records.length} records, ${present} present`);
    return {
      saved: body.records.length,
      attendancePct: body.records.length ? Math.round((present / body.records.length) * 100) : 0,
    };
  });
}
