import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handleApi, ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { sessionUpdateSchema } from "@/lib/validation";

/** GET /api/training/sessions/[id] — detail with enrollment roster + attendance. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handleApi(req, { permission: "training:read" }, async () => {
    const s = await db.trainingSession.findUnique({
      where: { id },
      include: {
        program: true,
        targetDepartment: true,
        enrollments: {
          include: { employee: { include: { department: true, jobRole: true } } },
          orderBy: { employee: { employeeCode: "asc" } },
        },
        attendanceRecords: true,
      },
    });
    if (!s) throw new ApiError(404, "Session not found.");

    return {
      session: {
        id: s.id, code: s.code, title: s.title, date: s.scheduledDate, startTime: s.startTime,
        durationHours: s.durationHours, location: s.location, trainer: s.trainer, capacity: s.capacity,
        status: s.status, notes: s.notes,
        programId: s.programId, programCode: s.program.code, category: s.program.category,
        description: s.program.description, deliveryMode: s.program.deliveryMode,
        targetDepartment: s.targetDepartment?.name ?? "Plant-wide",
        targetDepartmentId: s.targetDepartmentId,
      },
      roster: s.enrollments.map((e) => {
        const att = s.attendanceRecords.find((a) => a.employeeId === e.employeeId);
        return {
          enrollmentId: e.id,
          employeeId: e.employee.id, employeeCode: e.employee.employeeCode, employeeName: e.employee.name,
          department: e.employee.department.name, jobRole: e.employee.jobRole.title, shift: e.employee.shift,
          status: att?.status ?? null, qualified: att?.qualified ?? null, remarks: att?.remarks ?? null,
          enrolledAt: e.enrolledAt,
        };
      }),
      attendanceRecorded: s.attendanceRecords.length,
    };
  });
}

/** PUT /api/training/sessions/[id] — update / change status. */
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handleApi(req, { permission: "training:write" }, async (session) => {
    const body = sessionUpdateSchema.parse(await req.json());
    const existing = await db.trainingSession.findUnique({ where: { id }, include: { _count: { select: { enrollments: true } } } });
    if (!existing) throw new ApiError(404, "Session not found.");

    if (body.capacity !== undefined && body.capacity < existing._count.enrollments) {
      throw new ApiError(409, `Capacity (${body.capacity}) is below the current enrollment count (${existing._count.enrollments}).`);
    }
    if (body.status === "cancelled") {
      const attCount = await db.attendanceRecord.count({ where: { sessionId: id } });
      if (attCount > 0) throw new ApiError(409, "Cannot cancel a session with recorded attendance.");
    }

    const s = await db.trainingSession.update({ where: { id }, data: body });
    await audit(req, session, "update", "training_session", id, `${s.code} — ${Object.keys(body).join(", ")}`);
    return { session: { id: s.id, code: s.code, status: s.status } };
  });
}

/** DELETE /api/training/sessions/[id] — only when scheduled and no attendance. */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handleApi(req, { permission: "training:write" }, async (session) => {
    const existing = await db.trainingSession.findUnique({ where: { id }, include: { _count: { select: { attendanceRecords: true } } } });
    if (!existing) throw new ApiError(404, "Session not found.");
    if (existing._count.attendanceRecords > 0) {
      throw new ApiError(409, "Cannot delete a session that has attendance records. Cancel it instead.");
    }
    await db.enrollment.deleteMany({ where: { sessionId: id } });
    await db.trainingSession.delete({ where: { id } });
    await audit(req, session, "delete", "training_session", id, `${existing.code} — ${existing.title}`);
    return { ok: true };
  });
}
