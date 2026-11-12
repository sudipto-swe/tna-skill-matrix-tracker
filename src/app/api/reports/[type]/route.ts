import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { handleApi, ApiError, isScopedToOwnDepartment } from "@/lib/api";
import { audit } from "@/lib/audit";
import { computeTna, summarizeTna, type TnaNeed } from "@/lib/tna";
import {
  buildSkillMatrixWorkbook, buildTnaWorkbook, buildTrainingCalendarWorkbook,
  buildAnnualPlanWorkbook, buildAttendanceWorkbook, buildQualificationExpiryWorkbook,
  buildEmployeeImportTemplate, toCsv, type MatrixRowData, type TnaRowData, type CalendarRowData,
  type AnnualPlanRow, type AttendanceRowData, type QualRowData,
} from "@/lib/excel";

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function fileResponse(buffer: Buffer, filename: string, contentType: string) {
  const res = new NextResponse(new Uint8Array(buffer));
  res.headers.set("Content-Type", contentType);
  res.headers.set("Content-Disposition", `attachment; filename="${filename}"`);
  res.headers.set("Cache-Control", "no-store");
  return res;
}

function complianceOf(n: TnaNeed): string {
  if (n.currentLevel === null) return "not_assessed";
  const gap = n.requiredLevel - n.currentLevel;
  if (gap > 0) return `gap${Math.min(gap, 3)}`;
  if (n.status === "expired_qualification") return "expired";
  if (n.status === "expiring_soon") return "expiring";
  if (n.status === "assessment_expired") return "expired";
  return "achieved";
}

/** GET /api/reports/[type]?format=xlsx|csv — six core reports + import template. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ type: string }> }) {
  const { type } = await ctx.params;
  return handleApi(req, { permission: "reports:generate" }, async (session) => {
    const url = new URL(req.url);
    const format = (url.searchParams.get("format") ?? "xlsx").toLowerCase();
    const deptParam = url.searchParams.get("deptId") ?? "";
    const scopeDept = isScopedToOwnDepartment(session) ? session.departmentId : deptParam || null;
    const scopeLabel = scopeDept
      ? (await db.department.findUnique({ where: { id: scopeDept } }))?.name ?? "Department"
      : "Whole plant";
    const stamp = new Date().toISOString().slice(0, 10);

    // ── 1. Employee Skill Matrix ─────────────────────────────────────────────
    if (type === "skill-matrix") {
      const { needs } = await computeTna({ departmentId: scopeDept });
      const compMap = new Map<string, { id: string; code: string; name: string }>();
      for (const n of needs) compMap.set(n.competencyId, { id: n.competencyId, code: n.competencyCode, name: n.competencyName });
      const competencies = [...compMap.values()].sort((a, b) => a.code.localeCompare(b.code));

      const rowMap = new Map<string, MatrixRowData>();
      for (const n of needs) {
        let row = rowMap.get(n.employeeId);
        if (!row) {
          row = {
            employeeCode: n.employeeCode, employeeName: n.employeeName, departmentName: n.departmentName,
            jobRoleTitle: n.jobRoleTitle, shift: "", cells: [], coveragePct: 0, gapCount: 0,
          };
          rowMap.set(n.employeeId, row);
        }
        row.cells.push({ code: n.competencyCode, level: n.currentLevel === null ? "NA" : String(n.currentLevel), required: n.requiredLevel, compliance: complianceOf(n) });
      }
      const employees = await db.employee.findMany({ where: { id: { in: [...rowMap.keys()] } } });
      const shiftMap = new Map(employees.map((e) => [e.id, e.shift]));
      const rows = [...rowMap.entries()].map(([eid, r]) => {
        const cellsSorted = competencies.map((c) => r.cells.find((x) => x.code === c.code)!).filter(Boolean);
        const achieved = cellsSorted.filter((c) => c.compliance === "achieved").length;
        return {
          ...r,
          shift: shiftMap.get(eid) ?? "",
          cells: cellsSorted,
          coveragePct: cellsSorted.length ? Math.round((achieved / cellsSorted.length) * 100) : 0,
          gapCount: cellsSorted.filter((c) => c.compliance.startsWith("gap") || c.compliance === "not_assessed").length,
        };
      }).sort((a, b) => a.employeeCode.localeCompare(b.employeeCode));

      if (format === "csv") {
        const headers = ["Code", "Employee", "Department", "Job Role", "Shift", ...competencies.map((c) => c.code), "Coverage %", "Open Gaps"];
        const csv = toCsv(headers, rows.map((r) => [r.employeeCode, r.employeeName, r.departmentName, r.jobRoleTitle, r.shift, ...r.cells.map((c) => c.level), r.coveragePct, r.gapCount]));
        await audit(req, session, "export", "report", "skill-matrix", `CSV · ${scopeLabel} · ${rows.length} employees`);
        return fileResponse(Buffer.from(csv, "utf-8"), `Employee Skill Matrix ${stamp}.csv`, "text/csv; charset=utf-8");
      }
      const buffer = await buildSkillMatrixWorkbook(rows, competencies, scopeLabel, session.name);
      await audit(req, session, "export", "report", "skill-matrix", `XLSX · ${scopeLabel} · ${rows.length} employees`);
      return fileResponse(buffer, `Employee Skill Matrix ${stamp}.xlsx`, XLSX_TYPE);
    }

    // ── 2. Department / plant TNA report ────────────────────────────────────
    if (type === "tna") {
      const priority = url.searchParams.get("priority") ?? "";
      const { needs, employeesConsidered } = await computeTna({ departmentId: scopeDept });
      const summary = summarizeTna(needs, employeesConsidered);
      let open = needs.filter((n) => n.priority !== "none");
      if (priority) open = open.filter((n) => n.priority === priority);
      open.sort((a, b) => {
        const sev = { critical: 4, high: 3, medium: 2, low: 1, none: 0 } as const;
        return sev[b.priority] - sev[a.priority] || a.employeeCode.localeCompare(b.employeeCode);
      });

      const tnaRows: TnaRowData[] = open.map((n) => ({
        employeeCode: n.employeeCode, employeeName: n.employeeName, departmentName: n.departmentName,
        jobRoleTitle: n.jobRoleTitle, competencyCode: n.competencyCode, competencyName: n.competencyName,
        category: n.category, safetyCritical: n.safetyCritical, requiredLevel: n.requiredLevel,
        currentLevel: n.currentLevel, gap: n.gap, priority: n.priority, status: n.status,
        reasons: n.reasons, recommendedAction: n.recommendedAction,
        program: n.recommendedProgramTitle, dueDate: n.dueDate?.slice(0, 10) ?? null,
      }));
      const summaryRows = [
        { label: "Scope", value: scopeLabel },
        { label: "Employees considered", value: employeesConsidered },
        { label: "Competency slots analysed", value: summary.totalSlots },
        { label: "Slots compliant", value: summary.compliantSlots },
        { label: "Gaps identified (level gap)", value: summary.gapSlots },
        { label: "Not assessed slots", value: summary.notAssessedSlots },
        { label: "Expired assessments", value: summary.expiredAssessmentSlots },
        { label: "Expired qualifications", value: summary.expiredQualificationSlots },
        { label: "Qualifications expiring ≤ 30 days", value: summary.expiringQualificationSlots },
        { label: "Critical priority needs", value: summary.byPriority.critical },
        { label: "High priority needs", value: summary.byPriority.high },
        { label: "Medium priority needs", value: summary.byPriority.medium },
      ];
      if (format === "csv") {
        const headers = ["Employee Code", "Employee", "Department", "Job Role", "Competency", "Category", "Safety", "Required", "Current", "Gap", "Priority", "Status", "Reasons", "Recommended Action", "Program", "Target Date"];
        const csv = toCsv(headers, tnaRows.map((r) => [r.employeeCode, r.employeeName, r.departmentName, r.jobRoleTitle, r.competencyName, r.category, r.safetyCritical ? "YES" : "", r.requiredLevel, r.currentLevel ?? "NA", r.gap ?? "", r.priority.toUpperCase(), r.status, r.reasons.join(" "), r.recommendedAction, r.program ?? "", r.dueDate ?? ""]));
        await audit(req, session, "export", "report", "tna", `CSV · ${scopeLabel} · ${tnaRows.length} needs`);
        return fileResponse(Buffer.from(csv, "utf-8"), `Department TNA Report ${stamp}.csv`, "text/csv; charset=utf-8");
      }
      const buffer = await buildTnaWorkbook(tnaRows, summaryRows, scopeLabel, session.name);
      await audit(req, session, "export", "report", "tna", `XLSX · ${scopeLabel} · ${tnaRows.length} needs`);
      return fileResponse(buffer, `Department TNA Report ${stamp}.xlsx`, XLSX_TYPE);
    }

    // ── 3. Monthly training calendar ────────────────────────────────────────
    if (type === "training-calendar") {
      const monthParam = url.searchParams.get("month") ?? new Date().toISOString().slice(0, 7);
      const [y, m] = monthParam.split("-").map(Number);
      if (!y || !m || m < 1 || m > 12) throw new ApiError(400, "month must be YYYY-MM");
      const from = new Date(y, m - 1, 1);
      const to = new Date(y, m, 0, 23, 59, 59);
      const sessions = await db.trainingSession.findMany({
        where: { scheduledDate: { gte: from, lte: to }, ...(scopeDept ? { OR: [{ targetDepartmentId: scopeDept }, { targetDepartmentId: null }] } : {}) },
        include: { program: true, targetDepartment: true, _count: { select: { enrollments: true } } },
        orderBy: { scheduledDate: "asc" },
      });
      const rows: CalendarRowData[] = sessions.map((s) => ({
        date: s.scheduledDate, code: s.code, title: s.title, category: s.program.category, trainer: s.trainer,
        location: s.location, department: s.targetDepartment?.name ?? "Plant-wide", startTime: s.startTime,
        durationHours: s.durationHours, capacity: s.capacity, enrolled: s._count.enrollments, status: s.status,
      }));
      const monthLabel = from.toLocaleString("en", { month: "long", year: "numeric" });
      if (format === "csv") {
        const headers = ["Date", "Day", "Code", "Training Title", "Category", "Start", "Hours", "Trainer", "Location", "Target Department", "Capacity", "Enrolled", "Status"];
        const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        const csv = toCsv(headers, rows.map((r) => [r.date.toISOString().slice(0, 10), days[r.date.getDay()], r.code, r.title, r.category, r.startTime, r.durationHours, r.trainer, r.location, r.department, r.capacity, r.enrolled, r.status]));
        await audit(req, session, "export", "report", "training-calendar", `CSV · ${monthLabel}`);
        return fileResponse(Buffer.from(csv, "utf-8"), `Monthly Training Calendar ${monthParam}.csv`, "text/csv; charset=utf-8");
      }
      const buffer = await buildTrainingCalendarWorkbook(rows, monthLabel, session.name);
      await audit(req, session, "export", "report", "training-calendar", `XLSX · ${monthLabel}`);
      return fileResponse(buffer, `Monthly Training Calendar ${monthParam}.xlsx`, XLSX_TYPE);
    }

    // ── 4. Annual training plan ─────────────────────────────────────────────
    if (type === "annual-plan") {
      const year = Number(url.searchParams.get("year") ?? new Date().getFullYear());
      const from = new Date(year, 0, 1);
      const to = new Date(year, 11, 31, 23, 59, 59);
      const [programs, sessions] = await Promise.all([
        db.trainingProgram.findMany({ include: { competency: true }, orderBy: { code: "asc" } }),
        db.trainingSession.findMany({
          where: { scheduledDate: { gte: from, lte: to }, ...(scopeDept ? { OR: [{ targetDepartmentId: scopeDept }, { targetDepartmentId: null }] } : {}) },
          include: { program: true },
        }),
      ]);
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const rows: AnnualPlanRow[] = programs.map((p) => {
        const pSessions = sessions.filter((s) => s.programId === p.id);
        return {
          programCode: p.code, title: p.title, category: p.category,
          competencyCode: p.competency?.code ?? null, hours: p.durationHours, mode: p.deliveryMode,
          months: monthNames.map((mn, mi) => ({ month: mn, sessions: pSessions.filter((s) => s.scheduledDate.getMonth() === mi).length })),
          totalSessions: pSessions.length,
        };
      });
      if (format === "csv") {
        const headers = ["Code", "Program", "Category", "Competency", "Hours", "Mode", ...monthNames, "Sessions/yr"];
        const csv = toCsv(headers, rows.map((r) => [r.programCode, r.title, r.category, r.competencyCode ?? "", r.hours, r.mode, ...r.months.map((m) => m.sessions), r.totalSessions]));
        await audit(req, session, "export", "report", "annual-plan", `CSV · ${year}`);
        return fileResponse(Buffer.from(csv, "utf-8"), `Annual Training Plan ${year}.csv`, "text/csv; charset=utf-8");
      }
      const buffer = await buildAnnualPlanWorkbook(rows, year, session.name);
      await audit(req, session, "export", "report", "annual-plan", `XLSX · ${year}`);
      return fileResponse(buffer, `Annual Training Plan ${year}.xlsx`, XLSX_TYPE);
    }

    // ── 5. Attendance sheet ─────────────────────────────────────────────────
    if (type === "attendance") {
      const sessionId = url.searchParams.get("sessionId");
      if (!sessionId) throw new ApiError(400, "sessionId is required for the attendance report.");
      const s = await db.trainingSession.findUnique({
        where: { id: sessionId },
        include: { program: true, enrollments: { include: { employee: { include: { department: true, jobRole: true } } } }, attendanceRecords: true },
      });
      if (!s) throw new ApiError(404, "Session not found.");
      const records: AttendanceRowData[] = s.enrollments.map((e) => {
        const att = s.attendanceRecords.find((a) => a.employeeId === e.employeeId);
        return {
          employeeCode: e.employee.employeeCode, employeeName: e.employee.name,
          departmentName: e.employee.department.name, jobRoleTitle: e.employee.jobRole.title,
          status: att?.status ?? "—", qualified: att?.qualified ?? false, remarks: att?.remarks ?? null,
        };
      });
      const sessionInfo = {
        code: s.code, title: s.title, date: s.scheduledDate, startTime: s.startTime,
        durationHours: s.durationHours, trainer: s.trainer, location: s.location, category: s.program.category,
      };
      if (format === "csv") {
        const headers = ["Code", "Employee", "Department", "Job Role", "Attendance", "Qualified", "Remarks"];
        const csv = toCsv(headers, records.map((r) => [r.employeeCode, r.employeeName, r.departmentName, r.jobRoleTitle, r.status, r.qualified ? "YES" : "NO", r.remarks ?? ""]));
        await audit(req, session, "export", "report", "attendance", `CSV · ${s.code}`);
        return fileResponse(Buffer.from(csv, "utf-8"), `Training Attendance ${s.code} ${stamp}.csv`, "text/csv; charset=utf-8");
      }
      const buffer = await buildAttendanceWorkbook(sessionInfo, records, session.name);
      await audit(req, session, "export", "report", "attendance", `XLSX · ${s.code}`);
      return fileResponse(buffer, `Training Attendance ${s.code} ${stamp}.xlsx`, XLSX_TYPE);
    }

    // ── 6. Qualification expiry report ──────────────────────────────────────
    if (type === "qualification-expiry") {
      const now = new Date();
      const quals = await db.qualification.findMany({
        where: { employee: { status: { not: "separated" }, ...(scopeDept ? { departmentId: scopeDept } : {}) } },
        include: { competency: true, employee: { include: { department: true, jobRole: true } } },
        orderBy: { expiresAt: "asc" },
      });
      const rows: QualRowData[] = quals.map((q) => ({
        employeeCode: q.employee.employeeCode, employeeName: q.employee.name,
        departmentName: q.employee.department.name, jobRoleTitle: q.employee.jobRole.title,
        competencyName: q.competency.name, certificateRef: q.certificateRef,
        issuedAt: q.issuedAt, expiresAt: q.expiresAt,
        daysRemaining: Math.floor((q.expiresAt.getTime() - now.getTime()) / 86400_000),
        bucket: q.expiresAt < now ? "expired" : q.expiresAt.getTime() - now.getTime() <= 7 * 86400_000 ? "expiring_7" : q.expiresAt.getTime() - now.getTime() <= 30 * 86400_000 ? "expiring_30" : "valid",
      }));
      if (format === "csv") {
        const headers = ["Code", "Employee", "Department", "Job Role", "Qualification", "Certificate", "Issued", "Expires", "Days Left", "Status"];
        const bl = { expired: "EXPIRED", expiring_7: "≤ 7 days", expiring_30: "≤ 30 days", valid: "Valid" } as const;
        const csv = toCsv(headers, rows.map((r) => [r.employeeCode, r.employeeName, r.departmentName, r.jobRoleTitle, r.competencyName, r.certificateRef ?? "", r.issuedAt.toISOString().slice(0, 10), r.expiresAt.toISOString().slice(0, 10), r.daysRemaining, bl[r.bucket]]));
        await audit(req, session, "export", "report", "qualification-expiry", `CSV · ${scopeLabel} · ${rows.length} records`);
        return fileResponse(Buffer.from(csv, "utf-8"), `Qualification Expiry Report ${stamp}.csv`, "text/csv; charset=utf-8");
      }
      const buffer = await buildQualificationExpiryWorkbook(rows, scopeLabel, session.name);
      await audit(req, session, "export", "report", "qualification-expiry", `XLSX · ${scopeLabel} · ${rows.length} records`);
      return fileResponse(buffer, `Qualification Expiry Report ${stamp}.xlsx`, XLSX_TYPE);
    }

    // ── 7. Employee import template ─────────────────────────────────────────
    if (type === "employee-import-template") {
      const buffer = await buildEmployeeImportTemplate();
      await audit(req, session, "export", "report", "employee-import-template", "XLSX template");
      return fileResponse(buffer, "Employee Import Template.xlsx", XLSX_TYPE);
    }

    throw new ApiError(404, `Unknown report type "${type}".`);
  });
}
