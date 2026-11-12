import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handleApi, isScopedToOwnDepartment } from "@/lib/api";
import { computeTna, summarizeTna } from "@/lib/tna";

/**
 * Executive dashboard — role-scoped statistics.
 *  admin / training_officer → whole plant
 *  department_supervisor    → own department
 *  employee                 → personal development dashboard
 */
export async function GET(req: NextRequest) {
  return handleApi(req, { permission: "dashboard:view" }, async (session) => {
    const now = new Date();
    const in30 = new Date(now.getTime() + 30 * 86400_000);

    // ── employee self-service dashboard ─────────────────────────────────────
    if (session.roleCode === "employee") {
      if (!session.employeeId) {
        return { personal: true as const, employee: null, needs: [], summary: null, sessions: [], qualifications: [] };
      }
      const emp = await db.employee.findUnique({
        where: { id: session.employeeId },
        include: { department: true, jobRole: true, productionArea: true },
      });
      if (!emp) return { personal: true as const, employee: null, needs: [], summary: null, sessions: [], qualifications: [] };

      const { needs } = await computeTna({ employeeId: emp.id });
      const enrollments = await db.enrollment.findMany({
        where: { employeeId: emp.id, session: { scheduledDate: { gte: now }, status: { in: ["scheduled", "in_progress"] } } },
        include: { session: { include: { program: true } } },
        orderBy: { session: { scheduledDate: "asc" } },
        take: 8,
      });
      const history = await db.attendanceRecord.findMany({
        where: { employeeId: emp.id },
        include: { session: true },
        orderBy: { session: { scheduledDate: "desc" } },
        take: 8,
      });
      const quals = await db.qualification.findMany({
        where: { employeeId: emp.id },
        include: { competency: true },
        orderBy: { expiresAt: "asc" },
      });

      return {
        personal: true as const,
        employee: {
          id: emp.id, code: emp.employeeCode, name: emp.name, designation: emp.designation,
          department: emp.department.name, jobRole: emp.jobRole.title, shift: emp.shift,
          productionArea: emp.productionArea?.name ?? null, joiningDate: emp.joiningDate, category: emp.category,
        },
        needs,
        summary: summarizeTna(needs, 1),
        upcomingSessions: enrollments.map((e) => ({
          id: e.session.id, title: e.session.title, date: e.session.scheduledDate,
          startTime: e.session.startTime, location: e.session.location, trainer: e.session.trainer,
          status: e.session.status,
        })),
        trainingHistory: history.map((h) => ({
          id: h.session.id, title: h.session.title, date: h.session.scheduledDate,
          status: h.status, qualified: h.qualified,
        })),
        qualifications: quals.map((q) => ({
          id: q.id, competency: q.competency.name, expiresAt: q.expiresAt, issuedAt: q.issuedAt,
          certificateRef: q.certificateRef,
          bucket: q.expiresAt < now ? "expired" : q.expiresAt < in30 ? "expiring_30" : "valid",
        })),
      };
    }

    // ── management dashboards (admin / training officer / supervisor) ──────
    const deptId = isScopedToOwnDepartment(session) ? session.departmentId : null;
    const { needs } = await computeTna({ departmentId: deptId });
    const summary = summarizeTna(needs, 0);

    const employeesWhere = {
      status: { not: "separated" as const },
      ...(deptId ? { departmentId: deptId } : {}),
    };
    const [totalEmployees, assessedEmployees] = await Promise.all([
      db.employee.count({ where: employeesWhere }),
      db.employee.count({ where: { ...employeesWhere, assessments: { some: {} } } }),
    ]);

    const sessionsWhere = {
      scheduledDate: { gte: now, lte: in30 },
      status: { in: ["scheduled", "in_progress"] },
      ...(deptId ? { OR: [{ targetDepartmentId: deptId }, { targetDepartmentId: null }] } : {}),
    };
    const upcomingSessions = await db.trainingSession.findMany({
      where: sessionsWhere,
      include: { program: true, targetDepartment: true, _count: { select: { enrollments: true } } },
      orderBy: { scheduledDate: "asc" },
      take: 30,
    });

    const overdueQuals = await db.qualification.count({
      where: { expiresAt: { lt: now }, employee: employeesWhere },
    });

    // training completion trend — last 6 months (completed sessions + attendance)
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const pastSessions = await db.trainingSession.findMany({
      where: {
        scheduledDate: { gte: sixMonthsAgo, lte: now },
        status: "completed",
        ...(deptId ? { OR: [{ targetDepartmentId: deptId }, { targetDepartmentId: null }] } : {}),
      },
      include: { _count: { select: { enrollments: true, attendanceRecords: { where: { status: "present" } } } } },
      orderBy: { scheduledDate: "asc" },
    });
    const monthLabel = (d: Date) => `${d.toLocaleString("en", { month: "short" })} ${String(d.getFullYear()).slice(2)}`;
    const trendMap = new Map<string, { month: string; sessions: number; attendees: number; present: number }>();
    for (let m = 5; m >= 0; m--) {
      const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
      trendMap.set(monthLabel(d), { month: monthLabel(d), sessions: 0, attendees: 0, present: 0 });
    }
    for (const s of pastSessions) {
      const key = monthLabel(new Date(s.scheduledDate.getFullYear(), s.scheduledDate.getMonth(), 1));
      const t = trendMap.get(key);
      if (t) { t.sessions += 1; t.attendees += s._count.enrollments; t.present += s._count.attendanceRecords; }
    }
    const trend = [...trendMap.values()].map((t) => ({
      ...t,
      attendanceRate: t.attendees ? Math.round((t.present / t.attendees) * 100) : 0,
    }));

    // competency level distribution (latest assessments within scope)
    const levelDistribution = [1, 2, 3, 4].map((lvl) => ({ level: lvl, count: needs.filter((n) => n.currentLevel === lvl).length }));
    const notAssessedCount = needs.filter((n) => n.currentLevel === null).length;

    // gaps by category
    const openNeeds = needs.filter((n) => n.priority !== "none");
    const categories = [...new Set(needs.map((n) => n.category))];
    const gapsByCategory = categories.map((c) => ({
      category: c,
      gaps: openNeeds.filter((n) => n.category === c).length,
    }));

    // top competency gaps
    const gapByComp = new Map<string, { competency: string; code: string; gaps: number; critical: number }>();
    for (const n of openNeeds) {
      const g = gapByComp.get(n.competencyId) ?? { competency: n.competencyName, code: n.competencyCode, gaps: 0, critical: 0 };
      g.gaps += 1;
      if (n.priority === "critical") g.critical += 1;
      gapByComp.set(n.competencyId, g);
    }
    const topGaps = [...gapByComp.values()].sort((a, b) => b.gaps - a.gaps).slice(0, 8);

    const criticalNeeds = needs
      .filter((n) => n.priority === "critical")
      .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""))
      .slice(0, 10)
      .map((n) => ({
        employee: `${n.employeeName} (${n.employeeCode})`, competency: n.competencyName,
        department: n.departmentName, reasons: n.reasons, dueDate: n.dueDate,
      }));

    return {
      personal: false as const,
      scope: deptId ? session.departmentName : "Whole plant",
      kpis: {
        totalEmployees,
        assessedEmployees,
        assessmentCoveragePct: totalEmployees ? Math.round((assessedEmployees / totalEmployees) * 100) : 0,
        totalSlots: summary.totalSlots,
        complianceRatePct: summary.totalSlots ? Math.round((summary.compliantSlots / summary.totalSlots) * 100) : 0,
        identifiedSkillGaps: summary.gapSlots + summary.notAssessedSlots,
        criticalTrainingNeeds: summary.byPriority.critical,
        upcomingSessions: upcomingSessions.length,
        overdueQualifications: overdueQuals,
      },
      tnaSummary: summary,
      trend,
      levelDistribution,
      notAssessedCount,
      gapsByCategory,
      topGaps,
      criticalNeeds,
      upcomingSessionsList: upcomingSessions.slice(0, 8).map((s) => ({
        id: s.id, code: s.code, title: s.title, date: s.scheduledDate, startTime: s.startTime,
        location: s.location, trainer: s.trainer, category: s.program.category,
        enrolled: s._count.enrollments, capacity: s.capacity, status: s.status,
        department: s.targetDepartment?.name ?? "Plant-wide",
      })),
    };
  });
}
