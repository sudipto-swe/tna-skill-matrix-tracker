/**
 * Zod validation schemas shared across API routes.
 * Single source of truth for input validation (SQL-injection-safe via
 * parameterised Prisma queries; XSS-safe via React escaping).
 */
import { z } from "zod";

export const LEVELS = [1, 2, 3, 4] as const;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().min(3).max(120),
  password: z.string().min(1).max(200),
});

export const employeeCreateSchema = z.object({
  employeeCode: z.string().trim().regex(/^[A-Za-z0-9-]{2,20}$/, "Employee code: 2-20 letters/digits/hyphens"),
  name: z.string().trim().min(2).max(120),
  // department is derived server-side from the job role (single source of truth);
  // the client may send departmentId for pre-filtering but it is never trusted.
  departmentId: z.string().min(1).optional(),
  productionAreaId: z.string().nullable().optional(),
  jobRoleId: z.string().min(1),
  designation: z.string().trim().min(2).max(120),
  joiningDate: z.coerce.date(),
  status: z.enum(["active", "probation", "on_leave", "notice_period", "separated"]).default("active"),
  supervisorName: z.string().trim().max(160).nullable().optional(),
  shift: z.enum(["General", "Morning", "Evening", "Night", "Rotating"]),
  category: z.enum(["Permanent", "Contract", "Trainee"]),
});

export const employeeUpdateSchema = employeeCreateSchema.partial();

export const competencySchema = z.object({
  code: z.string().trim().regex(/^[A-Za-z0-9-]{2,20}$/),
  name: z.string().trim().min(3).max(160),
  description: z.string().trim().min(5).max(1000),
  category: z.enum(["Technical", "Quality", "Safety", "Compliance", "Operational Excellence", "Behavioral"]),
  departmentId: z.string().nullable().optional(),
  baselineLevel: z.number().int().min(1).max(4).default(2),
  assessmentCriteria: z.string().trim().min(5).max(1000),
  assessmentFrequencyMonths: z.number().int().min(1).max(60).default(12),
  validityMonths: z.number().int().min(1).max(120).default(24),
  safetyCritical: z.boolean().default(false),
  mandatory: z.boolean().default(false),
  active: z.boolean().default(true),
});

export const competencyUpdateSchema = competencySchema.partial();

export const roleRequirementSchema = z.object({
  jobRoleId: z.string().min(1),
  competencyId: z.string().min(1),
  requiredLevel: z.number().int().min(1).max(4),
});

export const assessmentSchema = z.object({
  employeeId: z.string().min(1),
  competencyId: z.string().min(1),
  level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  notes: z.string().trim().max(500).nullable().optional(),
});

export const programSchema = z.object({
  code: z.string().trim().regex(/^[A-Za-z0-9-]{2,20}$/),
  title: z.string().trim().min(3).max(200),
  category: z.enum(["Safety", "Quality", "Technical", "Compliance", "Operational Excellence", "Leadership"]),
  description: z.string().trim().max(1000).nullable().optional(),
  competencyId: z.string().nullable().optional(),
  durationHours: z.number().min(0.5).max(80).default(4),
  deliveryMode: z.enum(["Classroom", "On-job", "Online", "Blended"]).default("Classroom"),
});

export const sessionSchema = z.object({
  programId: z.string().min(1),
  title: z.string().trim().min(3).max(200),
  scheduledDate: z.coerce.date(),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must be HH:MM"),
  durationHours: z.number().min(0.5).max(12),
  location: z.string().trim().min(2).max(120),
  trainer: z.string().trim().min(2).max(120),
  capacity: z.number().int().min(1).max(200),
  targetDepartmentId: z.string().nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});

export const sessionUpdateSchema = sessionSchema.partial().extend({
  status: z.enum(["scheduled", "in_progress", "completed", "cancelled"]).optional(),
});

export const enrollmentSchema = z.object({
  employeeIds: z.array(z.string().min(1)).min(1, "Select at least one employee").max(200),
});

export const attendanceRecordSchema = z.object({
  employeeId: z.string().min(1),
  status: z.enum(["present", "absent", "excused"]),
  qualified: z.boolean().default(false),
  remarks: z.string().trim().max(300).nullable().optional(),
});

export const attendanceSaveSchema = z.object({
  sessionId: z.string().min(1),
  records: z.array(attendanceRecordSchema).min(1).max(300),
});

export const qualificationSchema = z.object({
  employeeId: z.string().min(1),
  competencyId: z.string().min(1),
  issuedAt: z.coerce.date(),
  expiresAt: z.coerce.date(),
  certificateRef: z.string().trim().max(60).nullable().optional(),
  notes: z.string().trim().max(300).nullable().optional(),
});

export const userCreateSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  name: z.string().trim().min(2).max(120),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
  roleId: z.string().min(1),
  employeeId: z.string().nullable().optional(),
});

export const userUpdateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  roleId: z.string().min(1).optional(),
  employeeId: z.string().nullable().optional(),
  status: z.enum(["active", "disabled"]).optional(),
  password: z.string().min(8).max(200).optional(),
});

export const tnaRulesSchema = z.object({
  expiredMandatoryQualification: z.enum(["critical", "high", "medium", "low"]),
  safetyCriticalGap: z.enum(["critical", "high", "medium", "low"]),
  gapTwoPlus: z.enum(["critical", "high", "medium", "low"]),
  gapOne: z.enum(["critical", "high", "medium", "low"]),
  notAssessed: z.enum(["critical", "high", "medium", "low"]),
  notAssessedSafety: z.enum(["critical", "high", "medium", "low"]),
  assessmentExpired: z.enum(["critical", "high", "medium", "low"]),
  assessmentExpiredSafety: z.enum(["critical", "high", "medium", "low"]),
  expiringSoonDays: z.number().int().min(7).max(120),
  assessmentValidityDefaultMonths: z.number().int().min(6).max(60),
});

export const alertThresholdsSchema = z.object({
  within7Days: z.boolean(),
  within30Days: z.boolean(),
  emailEnabled: z.boolean(),
  emailConfigured: z.boolean(),
});

export const importRowSchema = z.object({
  employeeCode: z.string().trim().min(2).max(20),
  name: z.string().trim().min(2).max(120),
  department: z.string().trim().min(2).max(80),
  productionArea: z.string().trim().max(80).optional().nullable(),
  jobRole: z.string().trim().min(2).max(120),
  designation: z.string().trim().min(2).max(120),
  joiningDate: z.string().trim().min(4).max(30),
  status: z.string().trim().max(30),
  supervisor: z.string().trim().max(160).optional().nullable(),
  shift: z.string().trim().max(30),
  category: z.string().trim().max(30),
});

export const importCommitSchema = z.object({
  rows: z.array(importRowSchema).min(1, "Nothing to import").max(500, "Import limit: 500 rows per batch"),
});

export type ImportRow = z.infer<typeof importRowSchema>;
