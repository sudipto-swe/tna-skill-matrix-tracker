import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handleApi, ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { attendanceRecordSchema } from "@/lib/validation";

/**
 * POST /api/attendance/bulk — bulk attendance upload (CSV text: employeeCode,status,qualified,remarks).
 * Header row optional. status ∈ present|absent|excused; qualified ∈ yes|no.
 */
export async function POST(req: NextRequest) {
  return handleApi(req, { permission: "attendance:write" }, async (session) => {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      throw new ApiError(400, "Expected a multipart/form-data upload with a \"file\" field (CSV: employeeCode,status,qualified,remarks).");
    }
    const sessionId = String(form.get("sessionId") ?? "");
    const file = form.get("file");
    if (!sessionId) throw new ApiError(400, "sessionId is required.");
    if (!(file instanceof File)) throw new ApiError(400, "Upload a CSV file.");

    const s = await db.trainingSession.findUnique({
      where: { id: sessionId },
      include: { enrollments: { include: { employee: true } } },
    });
    if (!s) throw new ApiError(404, "Session not found.");

    const text = await file.text();
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const parseErrors: { line: number; error: string }[] = [];
    const records: { employeeId: string; status: "present" | "absent" | "excused"; qualified: boolean; remarks: string | null }[] = [];
    const byCode = new Map(s.enrollments.map((e) => [e.employee.employeeCode, e.employeeId]));

    lines.forEach((line, idx) => {
      const parts = line.split(",").map((p) => p.trim());
      if (idx === 0 && /employee\s*code/i.test(parts[0] ?? "")) return; // header
      const [code, status, qualified, remarks] = parts;
      const employeeId = byCode.get((code ?? "").toUpperCase()) ?? byCode.get(code ?? "");
      if (!employeeId) { parseErrors.push({ line: idx + 1, error: `Employee "${code}" is not enrolled in this session` }); return; }
      if (!["present", "absent", "excused"].includes(status ?? "")) { parseErrors.push({ line: idx + 1, error: `Invalid status "${status}" (use present|absent|excused)` }); return; }
      const q = (qualified ?? "").toLowerCase();
      if (q && !["yes", "no", "true", "false"].includes(q)) { parseErrors.push({ line: idx + 1, error: `Invalid qualified flag "${qualified}" (use yes|no)` }); return; }
      records.push({
        employeeId,
        status: status as "present" | "absent" | "excused",
        qualified: q === "yes" || q === "true",
        remarks: remarks || null,
      });
    });

    if (records.length === 0) {
      return { saved: 0, parseErrors, message: "No valid rows found." };
    }

    const parsed = attendanceRecordSchema.array().parse(records);
    await db.$transaction(async (tx) => {
      for (const r of parsed) {
        await tx.attendanceRecord.upsert({
          where: { sessionId_employeeId: { sessionId: s.id, employeeId: r.employeeId } },
          create: { sessionId: s.id, employeeId: r.employeeId, status: r.status, qualified: r.qualified, remarks: r.remarks ?? null },
          update: { status: r.status, qualified: r.qualified, remarks: r.remarks ?? null, recordedAt: new Date() },
        });
      }
    });
    await audit(req, session, "import", "attendance", s.id, `${s.code}: bulk upload ${parsed.length} records, ${parseErrors.length} rejected`);
    return { saved: parsed.length, parseErrors };
  });
}
