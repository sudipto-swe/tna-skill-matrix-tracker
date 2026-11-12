/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TRAINING NEEDS ANALYSIS (TNA) ENGINE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * BUSINESS LOGIC
 * --------------
 * For every (employee × role-required competency) slot, the engine compares:
 *   Competency Gap = Required Level − Current Level
 *     gap ≤ 0            → competency achieved (no training need)
 *     gap >  0           → training gap identified
 *   "Not Assessed" is an explicit state — an employee with no assessment
 *   record is NEVER treated as Level 1.
 *
 * PRIORITY MODEL (rule-based, configurable in Settings by the Administrator)
 * -------------------------------------------------------------------------
 *  1. Expired MANDATORY/SAFETY qualification        → Critical (default)
 *  2. Safety-critical competency with any gap ≥ 1    → Critical (default)
 *  3. Unassessed safety-critical competency          → Critical (default)
 *  4. Gap of two or more levels                      → High    (default)
 *  5. Gap of exactly one level                       → Medium  (default)
 *  6. Unassessed (non-safety) competency             → High    (default)
 *  7. Assessment older than the reassessment freq.   → Medium  (High if safety)
 *  8. Qualification expiring within N days (30)      → High (mandatory) / Medium
 *
 *  Where multiple rules fire, the highest severity wins. Target resolution
 *  windows: Critical → 7 days, High → 30 days, Medium → 90 days.
 *
 *  ⚠ DISCLOSURE: this is a transparent, rule-based prioritisation model that
 *  reflects common manufacturing L&D practice. It is NOT a scientifically
 *  validated scoring instrument. Weights are configurable and every
 *  recommendation exposes its reasons so reviewers can audit the logic.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { db } from "./db";

export type TnaStatus =
  | "not_assessed"
  | "gap"
  | "assessment_expired"
  | "expiring_soon"
  | "expired_qualification"
  | "compliant";

export type TnaPriority = "critical" | "high" | "medium" | "low" | "none";

export interface TnaRules {
  expiredMandatoryQualification: TnaPriority;
  safetyCriticalGap: TnaPriority;
  gapTwoPlus: TnaPriority;
  gapOne: TnaPriority;
  notAssessed: TnaPriority;
  notAssessedSafety: TnaPriority;
  assessmentExpired: TnaPriority;
  assessmentExpiredSafety: TnaPriority;
  expiringSoonDays: number;
  assessmentValidityDefaultMonths: number;
}

export const DEFAULT_TNA_RULES: TnaRules = {
  expiredMandatoryQualification: "critical",
  safetyCriticalGap: "critical",
  gapTwoPlus: "high",
  gapOne: "medium",
  notAssessed: "high",
  notAssessedSafety: "critical",
  assessmentExpired: "medium",
  assessmentExpiredSafety: "high",
  expiringSoonDays: 30,
  assessmentValidityDefaultMonths: 24,
};

export interface TnaNeed {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  departmentId: string;
  departmentName: string;
  departmentCode: string;
  jobRoleId: string;
  jobRoleTitle: string;
  competencyId: string;
  competencyCode: string;
  competencyName: string;
  category: string;
  safetyCritical: boolean;
  mandatory: boolean;
  requiredLevel: number;
  currentLevel: number | null; // null = Not Assessed
  gap: number | null;
  status: TnaStatus;
  priority: TnaPriority;
  reasons: string[];
  recommendedAction: string;
  recommendedProgramCode: string | null;
  recommendedProgramTitle: string | null;
  dueDate: string | null;
  qualificationExpiresAt: string | null;
  lastAssessedAt: string | null;
}

// ── rules loading (cached 30 s) ──────────────────────────────────────────────
let rulesCache: { value: TnaRules; at: number } | null = null;

export async function getTnaRules(): Promise<TnaRules> {
  if (rulesCache && Date.now() - rulesCache.at < 30_000) return rulesCache.value;
  try {
    const row = await db.setting.findUnique({ where: { key: "tna_rules" } });
    if (row) {
      const parsed = { ...DEFAULT_TNA_RULES, ...(JSON.parse(row.value) as Partial<TnaRules>) };
      rulesCache = { value: parsed, at: Date.now() };
      return parsed;
    }
  } catch (e) {
    console.error("[tna] failed to load rules, using defaults", e);
  }
  rulesCache = { value: DEFAULT_TNA_RULES, at: Date.now() };
  return DEFAULT_TNA_RULES;
}

export function invalidateTnaRulesCache() {
  rulesCache = null;
}

// ── helpers ──────────────────────────────────────────────────────────────────
const PRIORITY_RANK: Record<TnaPriority, number> = { critical: 4, high: 3, medium: 2, low: 1, none: 0 };

export function maxPriority(a: TnaPriority, b: TnaPriority): TnaPriority {
  return PRIORITY_RANK[a] >= PRIORITY_RANK[b] ? a : b;
}

function priorityDueDate(priority: TnaPriority, now: Date, expiresAt?: Date | null): string | null {
  if (expiresAt) return expiresAt.toISOString();
  if (priority === "critical") return new Date(now.getTime() + 7 * 86400_000).toISOString();
  if (priority === "high") return new Date(now.getTime() + 30 * 86400_000).toISOString();
  if (priority === "medium") return new Date(now.getTime() + 90 * 86400_000).toISOString();
  return null;
}

const day = 86400_000;

// ── engine ───────────────────────────────────────────────────────────────────
export interface TnaOptions {
  departmentId?: string | null;
  employeeId?: string | null;
}

export async function computeTna(options: TnaOptions = {}): Promise<{ needs: TnaNeed[]; employeesConsidered: number }> {
  const rules = await getTnaRules();
  const now = new Date();

  const employees = await db.employee.findMany({
    where: {
      status: { not: "separated" },
      ...(options.employeeId ? { id: options.employeeId } : {}),
      ...(options.departmentId ? { departmentId: options.departmentId } : {}),
    },
    include: { department: true, jobRole: true },
  });
  if (employees.length === 0) return { needs: [], employeesConsidered: 0 };

  const employeeIds = employees.map((e) => e.id);
  const jobRoleIds = [...new Set(employees.map((e) => e.jobRoleId))];

  const roleComps = await db.roleCompetency.findMany({
    where: { jobRoleId: { in: jobRoleIds } },
    include: { competency: true },
  });
  const requirementsByRole = new Map<string, typeof roleComps>();
  for (const rc of roleComps) {
    const list = requirementsByRole.get(rc.jobRoleId) ?? [];
    list.push(rc);
    requirementsByRole.set(rc.jobRoleId, list);
  }

  const assessments = await db.assessment.findMany({
    where: { employeeId: { in: employeeIds } },
    orderBy: { assessedAt: "desc" },
  });
  const latestAssessment = new Map<string, (typeof assessments)[number]>();
  for (const a of assessments) {
    const key = `${a.employeeId}:${a.competencyId}`;
    if (!latestAssessment.has(key)) latestAssessment.set(key, a);
  }

  const qualifications = await db.qualification.findMany({
    where: { employeeId: { in: employeeIds } },
  });
  const qualByEmpComp = new Map<string, (typeof qualifications)[number]>();
  for (const q of qualifications) qualByEmpComp.set(`${q.employeeId}:${q.competencyId}`, q);

  const programs = await db.trainingProgram.findMany({ where: { active: true } });
  const programByComp = new Map<string, (typeof programs)[number]>();
  for (const p of programs) if (p.competencyId && !programByComp.has(p.competencyId)) programByComp.set(p.competencyId, p);

  const needs: TnaNeed[] = [];

  for (const emp of employees) {
    const reqs = requirementsByRole.get(emp.jobRoleId) ?? [];
    for (const rc of reqs) {
      const comp = rc.competency;
      const key = `${emp.id}:${comp.id}`;
      const assessment = latestAssessment.get(key) ?? null;
      const qual = qualByEmpComp.get(key) ?? null;
      const program = comp.id ? programByComp.get(comp.id) : undefined;

      const currentLevel = assessment ? assessment.level : null;
      const gap = currentLevel === null ? null : rc.requiredLevel - currentLevel;

      const reasons: string[] = [];
      let priority: TnaPriority = "none";
      let status: TnaStatus = "compliant";

      // ── qualification checks (safety-critical competencies) ──
      if (qual) {
        const daysToExpiry = Math.floor((qual.expiresAt.getTime() - now.getTime()) / day);
        if (daysToExpiry < 0) {
          status = "expired_qualification";
          const p = comp.mandatory || comp.safetyCritical ? rules.expiredMandatoryQualification : "medium";
          priority = maxPriority(priority, p);
          reasons.push(
            `Mandatory qualification expired ${Math.abs(daysToExpiry)} day(s) ago (${qual.expiresAt.toISOString().slice(0, 10)}).`
          );
        } else if (daysToExpiry <= rules.expiringSoonDays) {
          if (status === "compliant") status = "expiring_soon";
          const p = comp.mandatory || comp.safetyCritical ? "high" : "medium";
          priority = maxPriority(priority, p);
          reasons.push(`Qualification expires in ${daysToExpiry} day(s) (${qual.expiresAt.toISOString().slice(0, 10)}) — refresher needed.`);
        }
      }

      // ── assessment checks ──
      if (!assessment) {
        if (status === "compliant") status = "not_assessed";
        const p = comp.safetyCritical ? rules.notAssessedSafety : rules.notAssessed;
        priority = maxPriority(priority, p);
        reasons.push("No assessment record — this competency has never been assessed (Not Assessed ≠ Level 1).");
      } else {
        const validMonths = comp.assessmentFrequencyMonths || rules.assessmentValidityDefaultMonths;
        const expiresAssessment = new Date(assessment.assessedAt.getTime() + validMonths * 30.5 * day);
        if (expiresAssessment < now) {
          if (status === "compliant") status = "assessment_expired";
          const p = comp.safetyCritical ? rules.assessmentExpiredSafety : rules.assessmentExpired;
          priority = maxPriority(priority, p);
          reasons.push(
            `Last assessment ${assessment.assessedAt.toISOString().slice(0, 10)} exceeds the ${validMonths}-month reassessment frequency.`
          );
        }
      }

      // ── gap checks ──
      if (gap !== null && gap > 0) {
        if (status === "compliant") status = "gap";
        const p = comp.safetyCritical
          ? rules.safetyCriticalGap
          : gap >= 2
            ? rules.gapTwoPlus
            : rules.gapOne;
        priority = maxPriority(priority, p);
        reasons.push(
          `Current level ${currentLevel} vs required level ${rc.requiredLevel} — ${gap}-level gap${comp.safetyCritical ? " on a SAFETY-CRITICAL competency" : ""}.`
        );
      }

      // ── recommended action ──
      let recommendedAction: string;
      switch (status) {
        case "expired_qualification":
          recommendedAction = `Re-qualify immediately — task authorisation must be suspended until the refresher is completed${program ? ` (${program.title})` : ""}.`;
          break;
        case "expiring_soon":
          recommendedAction = `Schedule refresher training before the qualification expiry date${program ? ` (${program.title})` : ""}.`;
          break;
        case "not_assessed":
          recommendedAction = `Conduct a baseline assessment${program ? `; enrol on "${program.title}" if a gap is confirmed` : ""}.`;
          break;
        case "gap":
          recommendedAction = `Close the ${gap}-level gap through targeted training and re-assessment${program ? ` (${program.title})` : ""}.`;
          break;
        case "assessment_expired":
          recommendedAction = "Re-assess to revalidate the competency level (no current gap identified).";
          break;
        default:
          recommendedAction = "No action — competency achieved; maintain the standard reassessment cycle.";
      }

      needs.push({
        employeeId: emp.id,
        employeeCode: emp.employeeCode,
        employeeName: emp.name,
        departmentId: emp.departmentId,
        departmentName: emp.department.name,
        departmentCode: emp.department.code,
        jobRoleId: emp.jobRoleId,
        jobRoleTitle: emp.jobRole.title,
        competencyId: comp.id,
        competencyCode: comp.code,
        competencyName: comp.name,
        category: comp.category,
        safetyCritical: comp.safetyCritical,
        mandatory: comp.mandatory,
        requiredLevel: rc.requiredLevel,
        currentLevel,
        gap,
        status,
        priority,
        reasons,
        recommendedAction,
        recommendedProgramCode: program?.code ?? null,
        recommendedProgramTitle: program?.title ?? null,
        dueDate: priorityDueDate(priority, now, status === "expired_qualification" || status === "expiring_soon" ? qual?.expiresAt ?? null : null),
        qualificationExpiresAt: qual ? qual.expiresAt.toISOString() : null,
        lastAssessedAt: assessment ? assessment.assessedAt.toISOString() : null,
      });
    }
  }

  return { needs, employeesConsidered: employees.length };
}

// ── summaries ────────────────────────────────────────────────────────────────
export interface TnaSummary {
  totalSlots: number;
  compliantSlots: number;
  gapSlots: number;
  notAssessedSlots: number;
  expiredAssessmentSlots: number;
  expiringQualificationSlots: number;
  expiredQualificationSlots: number;
  byPriority: Record<TnaPriority, number>;
  byDepartment: {
    departmentId: string;
    departmentName: string;
    employees: number;
    slots: number;
    compliant: number;
    gaps: number;
    critical: number;
    coveragePct: number;
  }[];
}

export function summarizeTna(needs: TnaNeed[], employeesConsidered: number): TnaSummary {
  const byPriority: Record<TnaPriority, number> = { critical: 0, high: 0, medium: 0, low: 0, none: 0 };
  const deptMap = new Map<string, TnaSummary["byDepartment"][number]>();
  const deptEmployees = new Map<string, Set<string>>();

  for (const n of needs) {
    byPriority[n.priority] += 1;
    if (!deptMap.has(n.departmentId)) {
      deptMap.set(n.departmentId, {
        departmentId: n.departmentId, departmentName: n.departmentName, employees: 0,
        slots: 0, compliant: 0, gaps: 0, critical: 0, coveragePct: 0,
      });
      deptEmployees.set(n.departmentId, new Set());
    }
    const d = deptMap.get(n.departmentId)!;
    deptEmployees.get(n.departmentId)!.add(n.employeeId);
    d.slots += 1;
    if (n.status === "compliant") d.compliant += 1;
    if (n.status === "gap" || n.status === "not_assessed") d.gaps += 1;
    if (n.priority === "critical") d.critical += 1;
  }
  const byDepartment = [...deptMap.values()].map((d) => ({
    ...d,
    employees: deptEmployees.get(d.departmentId)!.size,
    coveragePct: d.slots ? Math.round((d.compliant / d.slots) * 100) : 0,
  }));
  // include departments with no slots at all? not needed — every dept has roles with requirements

  return {
    totalSlots: needs.length,
    compliantSlots: needs.filter((n) => n.status === "compliant").length,
    gapSlots: needs.filter((n) => n.status === "gap").length,
    notAssessedSlots: needs.filter((n) => n.status === "not_assessed").length,
    expiredAssessmentSlots: needs.filter((n) => n.status === "assessment_expired").length,
    expiringQualificationSlots: needs.filter((n) => n.status === "expiring_soon").length,
    expiredQualificationSlots: needs.filter((n) => n.status === "expired_qualification").length,
    byPriority,
    byDepartment,
  };
}

/** Refresher training requirements = expired/expiring qualifications + overdue safety reassessments. */
export function refresherNeeds(needs: TnaNeed[]): TnaNeed[] {
  return needs.filter(
    (n) => n.status === "expired_qualification" || n.status === "expiring_soon" || (n.safetyCritical && n.status === "assessment_expired")
  );
}
