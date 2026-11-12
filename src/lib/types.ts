/** Shared frontend types mirroring the API contracts. */

export interface SessionUser {
  userId: string;
  name: string;
  email: string;
  roleCode: string;
  roleName: string;
  permissions: string[];
  employeeId: string | null;
  employeeCode: string | null;
  departmentId: string | null;
  departmentName: string | null;
}

export type TnaPriority = "critical" | "high" | "medium" | "low" | "none";
export type TnaStatus = "not_assessed" | "gap" | "assessment_expired" | "expiring_soon" | "expired_qualification" | "compliant";

export interface TnaNeed {
  employeeId: string; employeeCode: string; employeeName: string;
  departmentId: string; departmentName: string; jobRoleId: string; jobRoleTitle: string;
  competencyId: string; competencyCode: string; competencyName: string;
  category: string; safetyCritical: boolean; mandatory: boolean;
  requiredLevel: number; currentLevel: number | null; gap: number | null;
  status: TnaStatus; priority: TnaPriority; reasons: string[];
  recommendedAction: string; recommendedProgramCode: string | null; recommendedProgramTitle: string | null;
  dueDate: string | null; qualificationExpiresAt: string | null; lastAssessedAt: string | null;
}

export interface TnaSummary {
  totalSlots: number; compliantSlots: number; gapSlots: number; notAssessedSlots: number;
  expiredAssessmentSlots: number; expiringQualificationSlots: number; expiredQualificationSlots: number;
  byPriority: Record<TnaPriority, number>;
  byDepartment: { departmentId: string; departmentName: string; employees: number; slots: number; compliant: number; gaps: number; critical: number; coveragePct: number }[];
}

export interface TnaResponse {
  needs: TnaNeed[];
  totalNeeds?: number;
  employeesConsidered?: number;
  summary: TnaSummary;
  byRole?: { jobRoleId: string; jobRole: string; department: string; employees: number; slots: number; gaps: number; critical: number; avgGap: number }[];
  rules: TnaRules;
  scopeLabel?: string;
}

export interface TnaRules {
  expiredMandatoryQualification: TnaPriority; safetyCriticalGap: TnaPriority;
  gapTwoPlus: TnaPriority; gapOne: TnaPriority;
  notAssessed: TnaPriority; notAssessedSafety: TnaPriority;
  assessmentExpired: TnaPriority; assessmentExpiredSafety: TnaPriority;
  expiringSoonDays: number; assessmentValidityDefaultMonths: number;
}

export interface EmployeeRow {
  id: string; employeeCode: string; name: string;
  department: string; departmentId: string;
  productionArea: string | null; productionAreaId: string | null;
  jobRole: string; jobRoleId: string;
  designation: string; joiningDate: string; status: string;
  supervisorName: string | null; shift: string; category: string;
}

export interface EmployeeListResponse { employees: EmployeeRow[]; total: number; page: number; pageSize: number }

export interface EmployeeDetailResponse {
  employee: EmployeeRow;
  assessments: { id: string; competencyId: string; competency: string; code: string; level: number; assessedBy: string; assessedAt: string; notes: string | null; frequencyMonths: number }[];
  qualifications: { id: string; competency: string; competencyId: string; issuedAt: string; expiresAt: string; certificateRef: string | null; expired: boolean }[];
  trainingHistory: { sessionId: string; title: string; code: string; date: string; category: string; status: string; enrolledStatus: string; attendance: string | null; qualified: boolean | null }[];
  needs: TnaNeed[];
}

export interface OrgData {
  departments: { id: string; code: string; name: string; description: string | null; areas: { id: string; code: string; name: string }[] }[];
  jobRoles: { id: string; code: string; title: string; grade: string; departmentId: string; departmentName: string }[];
  shifts: string[]; statuses: string[]; categories: string[];
  competencyCategories: string[];
}

export interface CompetencyRow {
  id: string; code: string; name: string; description: string; category: string;
  department: string; departmentId: string | null; baselineLevel: number;
  assessmentCriteria: string; assessmentFrequencyMonths: number; validityMonths: number;
  safetyCritical: boolean; mandatory: boolean; active: boolean;
  requiredBy: { jobRoleId: string; jobRole: string; requiredLevel: number; department: string }[];
  assessmentCount: number; qualificationCount: number;
}

export interface MatrixResponse {
  competencies: { id: string; code: string; name: string; category: string; safetyCritical: boolean }[];
  rows: {
    employeeId: string; employeeCode: string; employeeName: string; department: string;
    jobRole: string; shift: string;
    cells: Record<string, { level: number | null; required: number; compliance: string }>;
    slots: number; achieved: number; gaps: number; coveragePct: number;
  }[];
  compSummary: { competencyId: string; code: string; name: string; requiredSlots: number; assessedPct: number; avgLevel: number | null; gaps: number; notAssessed: number }[];
  totalEmployees: number;
  scope: string;
}

export interface QualificationRow {
  id: string; employeeId: string; employeeName: string; employeeCode: string;
  competencyId: string; competencyName: string; competencyCode: string; safetyCritical: boolean;
  issuedAt: string; expiresAt: string; certificateRef: string | null;
  daysRemaining: number; bucket: "expired" | "expiring_7" | "expiring_30" | "valid";
  department?: string | null; jobRole?: string | null;
}

export interface TrainingSessionRow {
  id: string; code: string; title: string; date: string; startTime: string;
  durationHours: number; location: string; trainer: string; capacity: number;
  status: string; notes: string | null; programId: string; programCode: string;
  category: string; targetDepartment: string; targetDepartmentId: string | null;
  enrolled: number; attendanceRecorded: number;
}

export interface SessionDetail {
  session: Omit<TrainingSessionRow, "enrolled" | "attendanceRecorded"> & { description: string | null; deliveryMode: string };
  roster: {
    enrollmentId: string; employeeId: string; employeeCode: string; employeeName: string;
    department: string; jobRole: string; shift: string;
    status: string | null; qualified: boolean | null; remarks: string | null; enrolledAt: string;
  }[];
  attendanceRecorded: number;
}

export interface ProgramRow {
  id: string; code: string; title: string; category: string; description: string | null;
  competencyId: string | null; competency: string | null;
  durationHours: number; deliveryMode: string; active: boolean; sessionCount: number;
}

export interface DashboardResponse {
  personal: boolean;
  scope?: string;
  kpis?: {
    totalEmployees: number; assessedEmployees: number; assessmentCoveragePct: number;
    totalSlots: number; complianceRatePct: number; identifiedSkillGaps: number;
    criticalTrainingNeeds: number; upcomingSessions: number; overdueQualifications: number;
  };
  tnaSummary?: TnaSummary;
  trend?: { month: string; sessions: number; attendees: number; present: number; attendanceRate: number }[];
  levelDistribution?: { level: number; count: number }[];
  notAssessedCount?: number;
  gapsByCategory?: { category: string; gaps: number }[];
  topGaps?: { competency: string; code: string; gaps: number; critical: number }[];
  criticalNeeds?: { employee: string; competency: string; department: string; reasons: string[]; dueDate: string | null }[];
  upcomingSessionsList?: { id: string; code: string; title: string; date: string; startTime: string; location: string; trainer: string; category: string; enrolled: number; capacity: number; status: string; department: string }[];
  // personal (employee)
  employee?: { id: string; code: string; name: string; designation: string; department: string; jobRole: string; shift: string; productionArea: string | null; joiningDate: string; category: string } | null;
  needs?: TnaNeed[];
  summary?: TnaSummary | null;
  upcomingSessions?: { id: string; title: string; date: string; startTime: string; location: string; trainer: string; status: string }[];
  trainingHistory?: { id: string; title: string; date: string; status: string; qualified: boolean }[];
  qualifications?: { id: string; competency: string; expiresAt: string; issuedAt: string; certificateRef: string | null; bucket: string }[];
}

export interface UserRow {
  id: string; email: string; name: string; status: string;
  roleCode: string; roleName: string; roleId: string;
  employee: { id: string; name: string; code: string } | null;
  lastLoginAt: string | null; createdAt: string;
}

export interface RoleRow { id: string; code: string; name: string; description: string | null; permissions: string[] }

export interface AuditRow {
  id: string; userId: string | null; userName: string; roleCode: string | null;
  action: string; entity: string; entityId: string | null; details: string | null;
  ip: string | null; createdAt: string;
}

export interface NotificationRow {
  id: string; userId: string | null; audienceRole: string | null; type: string;
  severity: string; title: string; message: string; linkView: string | null;
  readAt: string | null; createdAt: string;
}

export interface SettingsData {
  tnaRules: TnaRules;
  alertThresholds: { within7Days: boolean; within30Days: boolean; emailEnabled: boolean; emailConfigured: boolean };
  emailNotifications: { enabled: boolean; note: string };
}
