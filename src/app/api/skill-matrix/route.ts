import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handleApi, ApiError, isScopedToOwnDepartment } from "@/lib/api";
import { computeTna, type TnaNeed } from "@/lib/tna";

/**
 * GET /api/skill-matrix?deptId=&roleId=&shift=&category=&search=
 * Interactive employee × competency matrix built on the TNA engine.
 */
function complianceOf(n: TnaNeed): string {
  if (n.currentLevel === null) return "not_assessed";
  const gap = n.requiredLevel - n.currentLevel;
  if (n.status === "expired_qualification") return gap > 0 ? `gap${Math.min(gap, 3)}` : "expired";
  if (n.status === "expiring_soon") return gap > 0 ? `gap${Math.min(gap, 3)}` : "expiring";
  if (gap > 0) return `gap${Math.min(gap, 3)}`;
  if (n.status === "assessment_expired") return "expired";
  return "achieved";
}

export async function GET(req: NextRequest) {
  return handleApi(req, {}, async (session) => {
    const canAll = session.permissions.includes("skillmatrix:read:all");
    const canDept = session.permissions.includes("skillmatrix:read:dept");
    if (!canAll && !canDept) {
      throw new ApiError(403, "Access denied: your role cannot view the skill matrix.");
    }

    const url = new URL(req.url);
    const requestedDept = url.searchParams.get("deptId") ?? "";
    const roleId = url.searchParams.get("roleId") ?? "";
    const shift = url.searchParams.get("shift") ?? "";
    const category = url.searchParams.get("category") ?? "";
    const search = url.searchParams.get("search")?.trim().toLowerCase() ?? "";

    const scopeDept = isScopedToOwnDepartment(session) ? session.departmentId : requestedDept || null;
    const { needs } = await computeTna({ departmentId: scopeDept });

    // employee filter dimensions
    let filtered = needs;
    if (roleId) filtered = filtered.filter((n) => n.jobRoleId === roleId);
    if (search) filtered = filtered.filter((n) => n.employeeName.toLowerCase().includes(search) || n.employeeCode.toLowerCase().includes(search));

    // employee meta for shift filtering
    const employeeIds = [...new Set(filtered.map((n) => n.employeeId))];
    const employees = await db.employee.findMany({
      where: { id: { in: employeeIds } },
      include: { department: true, jobRole: true },
    });
    const empMap = new Map(employees.map((e) => [e.id, e]));
    if (shift) {
      const ok = new Set(employees.filter((e) => e.shift === shift).map((e) => e.id));
      filtered = filtered.filter((n) => ok.has(n.employeeId));
    }

    // column set: competencies required by the (filtered) roles, optionally by category
    const compMap = new Map<string, { id: string; code: string; name: string; category: string; safetyCritical: boolean }>();
    for (const n of filtered) {
      if (!compMap.has(n.competencyId)) {
        compMap.set(n.competencyId, { id: n.competencyId, code: n.competencyCode, name: n.competencyName, category: n.category, safetyCritical: n.safetyCritical });
      }
    }
    let competencies = [...compMap.values()].sort((a, b) => a.code.localeCompare(b.code));
    if (category) competencies = competencies.filter((c) => c.category === category);
    const compIds = new Set(competencies.map((c) => c.id));

    // pivot
    type Row = {
      employeeId: string; employeeCode: string; employeeName: string; department: string; jobRole: string; shift: string;
      cells: Record<string, { level: number | null; required: number; compliance: string }>;
      slots: number; achieved: number; gaps: number; coveragePct: number;
    };
    const rowMap = new Map<string, Row>();
    for (const n of filtered) {
      if (!compIds.has(n.competencyId)) continue;
      let row = rowMap.get(n.employeeId);
      if (!row) {
        const e = empMap.get(n.employeeId)!;
        row = {
          employeeId: n.employeeId, employeeCode: n.employeeCode, employeeName: n.employeeName,
          department: e.department.name, jobRole: e.jobRole.title, shift: e.shift,
          cells: {}, slots: 0, achieved: 0, gaps: 0, coveragePct: 0,
        };
        rowMap.set(n.employeeId, row);
      }
      const comp = complianceOf(n);
      row.cells[n.competencyId] = { level: n.currentLevel, required: n.requiredLevel, compliance: comp };
      row.slots += 1;
      if (comp === "achieved") row.achieved += 1;
      else row.gaps += 1;
    }
    const rows = [...rowMap.values()]
      .map((r) => ({ ...r, coveragePct: r.slots ? Math.round((r.achieved / r.slots) * 100) : 0 }))
      .sort((a, b) => a.employeeCode.localeCompare(b.employeeCode));

    // per-competency summary
    const compSummary = competencies.map((c) => {
      const cells = rows.map((r) => r.cells[c.id]).filter(Boolean);
      const assessed = cells.filter((x) => x.level !== null);
      return {
        competencyId: c.id, code: c.code, name: c.name,
        requiredSlots: cells.length,
        assessedPct: cells.length ? Math.round((assessed.length / cells.length) * 100) : 0,
        avgLevel: assessed.length ? Math.round((assessed.reduce((s, x) => s + (x.level ?? 0), 0) / assessed.length) * 10) / 10 : null,
        gaps: cells.filter((x) => x.compliance.startsWith("gap")).length,
        notAssessed: cells.filter((x) => x.compliance === "not_assessed").length,
      };
    });

    return {
      competencies,
      rows,
      compSummary,
      totalEmployees: rows.length,
      scope: isScopedToOwnDepartment(session) ? session.departmentName : "Whole plant",
    };
  });
}
