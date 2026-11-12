import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handleApi } from "@/lib/api";
import { audit } from "@/lib/audit";
import { programSchema } from "@/lib/validation";

/** GET /api/training/programs */
export async function GET(req: NextRequest) {
  return handleApi(req, { permission: "training:read" }, async () => {
    const programs = await db.trainingProgram.findMany({
      include: {
        competency: true,
        _count: { select: { sessions: true } },
      },
      orderBy: { code: "asc" },
    });
    return {
      programs: programs.map((p) => ({
        id: p.id, code: p.code, title: p.title, category: p.category, description: p.description,
        competencyId: p.competencyId, competency: p.competency ? `${p.competency.code} — ${p.competency.name}` : null,
        durationHours: p.durationHours, deliveryMode: p.deliveryMode, active: p.active,
        sessionCount: p._count.sessions,
      })),
    };
  });
}

/** POST /api/training/programs — create (Administrator / Training Officer). */
export async function POST(req: NextRequest) {
  return handleApi(req, { permission: "training:write" }, async (session) => {
    const body = programSchema.parse(await req.json());
    const program = await db.trainingProgram.create({
      data: { ...body, description: body.description ?? null, competencyId: body.competencyId ?? null },
    });
    await audit(req, session, "create", "training_program", program.id, `${program.code} — ${program.title}`);
    return { program: { id: program.id, code: program.code } };
  });
}
