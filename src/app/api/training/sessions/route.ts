import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handleApi, ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { sessionSchema } from "@/lib/validation";

/** GET /api/training/sessions?from=&to=&status=&month=&year= — calendar feed. */
export async function GET(req: NextRequest) {
  return handleApi(req, { permission: "training:read" }, async () => {
    const url = new URL(req.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const status = url.searchParams.get("status") ?? "";

    const sessions = await db.trainingSession.findMany({
      where: {
        ...(from || to
          ? { scheduledDate: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } }
          : {}),
        ...(status ? { status } : {}),
      },
      include: {
        program: true,
        targetDepartment: true,
        _count: { select: { enrollments: true, attendanceRecords: true } },
      },
      orderBy: { scheduledDate: "asc" },
    });

    return {
      sessions: sessions.map((s) => ({
        id: s.id, code: s.code, title: s.title, date: s.scheduledDate, startTime: s.startTime,
        durationHours: s.durationHours, location: s.location, trainer: s.trainer, capacity: s.capacity,
        status: s.status, notes: s.notes,
        programId: s.programId, programCode: s.program.code, category: s.program.category,
        targetDepartment: s.targetDepartment?.name ?? "Plant-wide",
        targetDepartmentId: s.targetDepartmentId,
        enrolled: s._count.enrollments, attendanceRecorded: s._count.attendanceRecords,
      })),
    };
  });
}

/** POST /api/training/sessions — schedule a session (duplicate-protected). */
export async function POST(req: NextRequest) {
  return handleApi(req, { permission: "training:write" }, async (session) => {
    const body = sessionSchema.parse(await req.json());

    // duplicate & conflict detection
    const dayStart = new Date(body.scheduledDate); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart.getTime() + 86400_000);
    const sameDay = await db.trainingSession.findMany({
      where: { scheduledDate: { gte: dayStart, lt: dayEnd }, status: { not: "cancelled" } },
    });
    if (sameDay.some((s) => s.title === body.title && s.location === body.location)) {
      throw new ApiError(409, "A session with the same title and location already exists on this date.", "duplicate");
    }
    if (sameDay.some((s) => s.trainer === body.trainer && s.startTime === body.startTime)) {
      throw new ApiError(409, `Trainer "${body.trainer}" is already booked at ${body.startTime} on this date.`, "trainer_conflict");
    }

    const count = await db.trainingSession.count();
    const code = `TS-${new Date().getFullYear()}-${String(count + 1).padStart(3, "0")}`;
    const s = await db.trainingSession.create({
      data: {
        code, programId: body.programId, title: body.title, scheduledDate: body.scheduledDate,
        startTime: body.startTime, durationHours: body.durationHours, location: body.location,
        trainer: body.trainer, capacity: body.capacity,
        targetDepartmentId: body.targetDepartmentId ?? null, notes: body.notes ?? null,
      },
    });
    await audit(req, session, "create", "training_session", s.id, `${s.code} — ${s.title} on ${s.scheduledDate.toISOString().slice(0, 10)}`);
    return { session: { id: s.id, code: s.code } };
  });
}
