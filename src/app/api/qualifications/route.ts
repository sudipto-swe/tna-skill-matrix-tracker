import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handleApi, ApiError, isScopedToOwnDepartment } from "@/lib/api";
import { audit } from "@/lib/audit";
import { qualificationSchema } from "@/lib/validation";

const DAY = 86400_000;

function bucketOf(expiresAt: Date, now: Date): "expired" | "expiring_7" | "expiring_30" | "valid" {
  const d = (expiresAt.getTime() - now.getTime()) / DAY;
  if (d < 0) return "expired";
  if (d <= 7) return "expiring_7";
  if (d <= 30) return "expiring_30";
  return "valid";
}

/** GET /api/qualifications?bucket=&deptId=&competencyId=&search= */
export async function GET(req: NextRequest) {
  return handleApi(req, {}, async (session) => {
    const canAll = session.permissions.includes("qualifications:read:all");
    const canDept = session.permissions.includes("qualifications:read:dept");
    const canSelf = session.permissions.includes("qualifications:read:self");
    if (!canAll && !canDept && !canSelf) throw new ApiError(403, "Access denied: your role cannot view qualifications.");

    const url = new URL(req.url);
    const now = new Date();
    const bucket = url.searchParams.get("bucket") ?? "all";
    const competencyId = url.searchParams.get("competencyId") ?? "";
    const search = url.searchParams.get("search")?.trim().toLowerCase() ?? "";

    // employee: own qualifications only
    if (!canAll && !canDept) {
      if (!session.employeeId) return { qualifications: [], counts: { expired: 0, expiring_7: 0, expiring_30: 0, valid: 0 } };
      const quals = await db.qualification.findMany({
        where: { employeeId: session.employeeId, ...(competencyId ? { competencyId } : {}) },
        include: { competency: true, employee: true },
        orderBy: { expiresAt: "asc" },
      });
      return {
        qualifications: quals.map((q) => ({ ...mapQual(q, now), department: null, jobRole: null })),
        counts: {
          expired: quals.filter((q) => bucketOf(q.expiresAt, now) === "expired").length,
          expiring_7: quals.filter((q) => bucketOf(q.expiresAt, now) === "expiring_7").length,
          expiring_30: quals.filter((q) => bucketOf(q.expiresAt, now) === "expiring_30").length,
          valid: quals.filter((q) => bucketOf(q.expiresAt, now) === "valid").length,
        },
      };
    }

    const scopeDept = isScopedToOwnDepartment(session) ? session.departmentId : url.searchParams.get("deptId") || null;
    const quals = await db.qualification.findMany({
      where: {
        employee: { status: { not: "separated" }, ...(scopeDept ? { departmentId: scopeDept } : {}) },
        ...(competencyId ? { competencyId } : {}),
      },
      include: { competency: true, employee: { include: { jobRole: true, department: true } } },
      orderBy: { expiresAt: "asc" },
    });

    let mapped = quals.map((q) => ({
      ...mapQual(q, now),
      department: q.employee.department.name,
      jobRole: q.employee.jobRole.title,
    }));
    if (bucket !== "all") mapped = mapped.filter((q) => q.bucket === bucket);
    if (search) {
      mapped = mapped.filter((q) => q.employeeName.toLowerCase().includes(search) || q.employeeCode.toLowerCase().includes(search) || q.competencyName.toLowerCase().includes(search));
    }

    return {
      qualifications: mapped,
      counts: {
        expired: quals.filter((q) => bucketOf(q.expiresAt, now) === "expired").length,
        expiring_7: quals.filter((q) => bucketOf(q.expiresAt, now) === "expiring_7").length,
        expiring_30: quals.filter((q) => bucketOf(q.expiresAt, now) === "expiring_30").length,
        valid: quals.filter((q) => bucketOf(q.expiresAt, now) === "valid").length,
      },
    };
  });
}

function mapQual(q: { id: string; issuedAt: Date; expiresAt: Date; certificateRef: string | null; employeeId: string; competency: { id: string; name: string; code: string; safetyCritical: boolean }; employee: { name: string; employeeCode: string } }, now: Date) {
  return {
    id: q.id, employeeId: q.employeeId, employeeName: q.employee.name, employeeCode: q.employee.employeeCode,
    competencyId: q.competency.id, competencyName: q.competency.name, competencyCode: q.competency.code,
    safetyCritical: q.competency.safetyCritical,
    issuedAt: q.issuedAt, expiresAt: q.expiresAt, certificateRef: q.certificateRef,
    daysRemaining: Math.floor((q.expiresAt.getTime() - now.getTime()) / DAY),
    bucket: bucketOf(q.expiresAt, now),
  };
}

/** POST /api/qualifications — issue or renew (upsert per employee+competency). */
export async function POST(req: NextRequest) {
  return handleApi(req, { permission: "qualifications:write" }, async (session) => {
    const body = qualificationSchema.parse(await req.json());
    if (body.expiresAt <= body.issuedAt) throw new ApiError(400, "Expiry date must be after the issue date.");
    const [emp, comp] = await Promise.all([
      db.employee.findUnique({ where: { id: body.employeeId } }),
      db.competency.findUnique({ where: { id: body.competencyId } }),
    ]);
    if (!emp) throw new ApiError(404, "Employee not found.");
    if (!comp) throw new ApiError(404, "Competency not found.");

    const q = await db.qualification.upsert({
      where: { employeeId_competencyId: { employeeId: body.employeeId, competencyId: body.competencyId } },
      create: { ...body, certificateRef: body.certificateRef ?? null, notes: body.notes ?? null },
      update: { issuedAt: body.issuedAt, expiresAt: body.expiresAt, certificateRef: body.certificateRef ?? null, notes: body.notes ?? null },
    });
    await audit(req, session, "issue", "qualification", q.id, `${emp.employeeCode} — ${comp.code} valid to ${body.expiresAt.toISOString().slice(0, 10)}`);
    return { qualification: { id: q.id } };
  });
}
