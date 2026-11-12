import { NextRequest } from "next/server";
import { handleApi, ApiError, isScopedToOwnDepartment } from "@/lib/api";
import { computeTna, summarizeTna, refresherNeeds, getTnaRules } from "@/lib/tna";

/**
 * GET /api/tna?scope=individual|department|role|critical|refresher
 *             &deptId=&roleId=&priority=&category=&employeeId=&search=
 * The Training Needs Analysis engine, exposed with multiple report views.
 */
export async function GET(req: NextRequest) {
  return handleApi(req, {}, async (session) => {
    const canAll = session.permissions.includes("tna:read:all");
    const canDept = session.permissions.includes("tna:read:dept");
    const canSelf = session.permissions.includes("tna:read:self");
    if (!canAll && !canDept && !canSelf) {
      throw new ApiError(403, "Access denied: your role cannot view training needs.");
    }

    const url = new URL(req.url);
    const scope = url.searchParams.get("scope") ?? "individual";

    // ── employee: forced to own record ──
    if (!canAll && !canDept) {
      if (!session.employeeId) return { needs: [], summary: summarizeTna([], 0), rules: await getTnaRules() };
      const { needs } = await computeTna({ employeeId: session.employeeId });
      const open = needs.filter((n) => n.priority !== "none");
      return { needs: open, summary: summarizeTna(needs, 1), rules: await getTnaRules() };
    }

    const requestedDept = url.searchParams.get("deptId") ?? "";
    const scopeDept = isScopedToOwnDepartment(session) ? session.departmentId : requestedDept || null;

    const roleId = url.searchParams.get("roleId") ?? "";
    const priority = url.searchParams.get("priority") ?? "";
    const category = url.searchParams.get("category") ?? "";
    const search = url.searchParams.get("search")?.trim().toLowerCase() ?? "";

    const { needs, employeesConsidered } = await computeTna({ departmentId: scopeDept });
    const rules = await getTnaRules();
    let filtered = needs;

    if (scope === "critical") {
      filtered = needs.filter((n) => n.priority === "critical");
    } else if (scope === "refresher") {
      filtered = refresherNeeds(needs);
    } else {
      filtered = needs.filter((n) => n.priority !== "none"); // training needs only
    }
    if (roleId) filtered = filtered.filter((n) => n.jobRoleId === roleId);
    if (priority) filtered = filtered.filter((n) => n.priority === priority);
    if (category) filtered = filtered.filter((n) => n.category === category);
    if (search) {
      filtered = filtered.filter(
        (n) => n.employeeName.toLowerCase().includes(search) || n.employeeCode.toLowerCase().includes(search) || n.competencyName.toLowerCase().includes(search)
      );
    }

    const severity = { critical: 4, high: 3, medium: 2, low: 1, none: 0 } as const;
    filtered = [...filtered].sort(
      (a, b) => severity[b.priority] - severity[a.priority] || a.employeeCode.localeCompare(b.employeeCode) || a.competencyCode.localeCompare(b.competencyCode)
    );

    // role-wise summary
    const roleMap = new Map<string, { jobRoleId: string; jobRole: string; department: string; employees: Set<string>; slots: number; gaps: number; critical: number; avgGap: number }>();
    for (const n of needs) {
      let r = roleMap.get(n.jobRoleId);
      if (!r) {
        r = { jobRoleId: n.jobRoleId, jobRole: n.jobRoleTitle, department: n.departmentName, employees: new Set(), slots: 0, gaps: 0, critical: 0, avgGap: 0 };
        roleMap.set(n.jobRoleId, r);
      }
      r.employees.add(n.employeeId);
      r.slots += 1;
      if (n.priority !== "none") r.gaps += 1;
      if (n.priority === "critical") r.critical += 1;
    }
    const byRole = [...roleMap.values()].map((r) => ({ ...r, employees: r.employees.size, avgGap: r.slots ? Math.round((r.gaps / r.slots) * 100) / 100 : 0 }));

    return {
      needs: filtered,
      totalNeeds: filtered.length,
      employeesConsidered,
      summary: summarizeTna(needs, employeesConsidered),
      byRole: byRole.sort((a, b) => b.critical - a.critical || b.gaps - a.gaps),
      rules,
      scopeLabel: isScopedToOwnDepartment(session) ? session.departmentName : "Whole plant",
    };
  });
}
