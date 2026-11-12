/**
 * Excel report builders (ExcelJS) — professional, styled workbooks for the
 * six core reports plus the employee import template.
 *
 * Design: navy header bands, frozen panes, auto-filters, colour-coded
 * competency/priority cells, summary sheets, IFERROR-wrapped live formulas.
 */
import ExcelJS from "exceljs";

const NAVY = "FF102A43";
const SLATE = "FF3E5C76";
const LIGHT = "FFF1F5F9";
const BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFD4DAE3" } },
  left: { style: "thin", color: { argb: "FFD4DAE3" } },
  bottom: { style: "thin", color: { argb: "FFD4DAE3" } },
  right: { style: "thin", color: { argb: "FFD4DAE3" } },
};

const LEVEL_FILL: Record<string, string> = {
  NA: "FFE8EAED",
  "1": "FFF6C7C2",
  "2": "FFFCE8B5",
  "3": "FFCFE8CF",
  "4": "FFA8D5A2",
};
const COMPLIANCE_FILL: Record<string, string> = {
  achieved: "FFD5EFD5",
  gap1: "FFFFF2CC",
  gap2: "FFFBD9B3",
  gap3: "FFF5B7B1",
  not_assessed: "FFE8EAED",
  expired: "FFD1D5EE",
  expiring: "FFFDE9B2",
};
const PRIORITY_FILL: Record<string, string> = {
  critical: "FFF5B7B1",
  high: "FFFBD9B3",
  medium: "FFFDE9B2",
  low: "FFEDF2F7",
  none: "FFF8FAFC",
};

function titleBand(ws: ExcelJS.Worksheet, title: string, subtitle: string, colCount: number) {
  ws.mergeCells(1, 1, 1, colCount);
  const t = ws.getCell(1, 1);
  t.value = title;
  t.font = { bold: true, size: 16, color: { argb: NAVY } };
  t.alignment = { vertical: "middle", horizontal: "left" };
  ws.getRow(1).height = 28;

  ws.mergeCells(2, 1, 2, colCount);
  const s = ws.getCell(2, 1);
  s.value = subtitle;
  s.font = { size: 10, italic: true, color: { argb: "FF64748B" } };
  ws.getRow(2).height = 16;
}

function headerRow(ws: ExcelJS.Worksheet, rowIdx: number, headers: string[]) {
  const row = ws.getRow(rowIdx);
  headers.forEach((h, i) => {
    const c = row.getCell(i + 1);
    c.value = h;
    c.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    c.border = BORDER;
  });
  row.height = 22;
}

function styleCell(c: ExcelJS.Cell, fill?: string) {
  c.border = BORDER;
  c.alignment = { vertical: "middle", wrapText: false };
  c.font = { size: 10 };
  if (fill) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
}

async function toBuffer(wb: ExcelJS.Workbook): Promise<Buffer> {
  const ab = await wb.xlsx.writeBuffer();
  return Buffer.from(ab);
}

const nowLabel = () => new Date().toISOString().slice(0, 16).replace("T", " ");

// ═══════════════════════════════════════════════════════════════════════════
// 1. EMPLOYEE SKILL MATRIX
// ═══════════════════════════════════════════════════════════════════════════
export interface MatrixRowData {
  employeeCode: string;
  employeeName: string;
  departmentName: string;
  jobRoleTitle: string;
  shift: string;
  cells: { code: string; level: string; required: number; compliance: string }[];
  coveragePct: number;
  gapCount: number;
}
export async function buildSkillMatrixWorkbook(
  rows: MatrixRowData[],
  competencies: { code: string; name: string }[],
  scopeLabel: string,
  generatedBy: string
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "TNA & Skill Matrix Tracker";
  const ws = wb.addWorksheet("Skill Matrix", { views: [{ state: "frozen", xSplit: 3, ySplit: 4 }] });

  const headers = ["Code", "Employee", "Department", "Job Role", "Shift", ...competencies.map((c) => c.code), "Coverage %", "Open Gaps"];
  titleBand(ws, "Employee Skill Matrix", `${scopeLabel} · Generated ${nowLabel()} by ${generatedBy} · Levels: 1=Awareness 2=Basic 3=Competent 4=Advanced · NA=Not Assessed`, headers.length);
  headerRow(ws, 4, headers);

  ws.getColumn(1).width = 10;
  ws.getColumn(2).width = 24;
  ws.getColumn(3).width = 20;
  ws.getColumn(4).width = 26;
  ws.getColumn(5).width = 10;
  competencies.forEach((_, i) => (ws.getColumn(6 + i).width = 9));
  ws.getColumn(6 + competencies.length).width = 11;
  ws.getColumn(7 + competencies.length).width = 11;

  rows.forEach((r, ri) => {
    const row = ws.getRow(5 + ri);
    row.getCell(1).value = r.employeeCode;
    row.getCell(2).value = r.employeeName;
    row.getCell(3).value = r.departmentName;
    row.getCell(4).value = r.jobRoleTitle;
    row.getCell(5).value = r.shift;
    [1, 2, 3, 4, 5].forEach((i) => styleCell(row.getCell(i)));
    r.cells.forEach((cell, ci) => {
      const c = row.getCell(6 + ci);
      c.value = cell.level;
      styleCell(c, LEVEL_FILL[cell.level] ?? "FFFFFFFF");
      c.alignment = { horizontal: "center", vertical: "middle" };
    });
    const cov = row.getCell(6 + r.cells.length);
    cov.value = r.coveragePct / 100;
    cov.numFmt = "0%";
    styleCell(cov);
    const gaps = row.getCell(7 + r.cells.length);
    gaps.value = r.gapCount;
    styleCell(gaps);
    row.height = 18;
  });
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: headers.length } };

  // Legend & summary sheet
  const ws2 = wb.addWorksheet("Legend & Summary");
  titleBand(ws2, "Legend & Competency Summary", "Colour coding and per-competency statistics", 8);
  headerRow(ws2, 4, ["Level", "Meaning", "Description"]);
  const legend = [
    ["1", "Awareness", "Understands basic concepts but requires supervision"],
    ["2", "Basic", "Can perform routine tasks with guidance"],
    ["3", "Competent", "Can perform assigned tasks independently"],
    ["4", "Advanced", "Can troubleshoot, guide others, demonstrate expertise"],
    ["NA", "Not Assessed", "No assessment record — NOT the same as Level 1"],
  ];
  legend.forEach((l, i) => {
    const row = ws2.getRow(5 + i);
    row.getCell(1).value = l[0];
    row.getCell(2).value = l[1];
    row.getCell(3).value = l[2];
    row.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: LEVEL_FILL[l[0]] } };
    [1, 2, 3].forEach((c) => styleCell(row.getCell(c)));
  });
  ws2.getColumn(1).width = 10; ws2.getColumn(2).width = 18; ws2.getColumn(3).width = 60;

  return toBuffer(wb);
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. TNA REPORT
// ═══════════════════════════════════════════════════════════════════════════
export interface TnaRowData {
  employeeCode: string;
  employeeName: string;
  departmentName: string;
  jobRoleTitle: string;
  competencyCode: string;
  competencyName: string;
  category: string;
  safetyCritical: boolean;
  requiredLevel: number;
  currentLevel: number | null;
  gap: number | null;
  priority: string;
  status: string;
  reasons: string[];
  recommendedAction: string;
  program: string | null;
  dueDate: string | null;
}
export async function buildTnaWorkbook(
  tnaRows: TnaRowData[],
  summary: { label: string; value: string | number }[],
  scopeLabel: string,
  generatedBy: string
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "TNA & Skill Matrix Tracker";

  const ws = wb.addWorksheet("Training Needs", { views: [{ state: "frozen", xSplit: 0, ySplit: 4 }] });
  const headers = ["Employee Code", "Employee", "Department", "Job Role", "Competency", "Category", "Safety", "Required", "Current", "Gap", "Priority", "Status", "Reasons", "Recommended Action", "Program", "Target Date"];
  titleBand(ws, "Training Needs Analysis Report", `${scopeLabel} · Generated ${nowLabel()} by ${generatedBy} · Rule-based prioritisation (see Summary sheet) — not a validated psychometric score.`, headers.length);
  headerRow(ws, 4, headers);
  [10, 22, 18, 24, 30, 16, 8, 9, 9, 6, 10, 16, 55, 55, 28, 12].forEach((w, i) => (ws.getColumn(i + 1).width = w));

  tnaRows.forEach((r, ri) => {
    const row = ws.getRow(5 + ri);
    const vals = [
      r.employeeCode, r.employeeName, r.departmentName, r.jobRoleTitle, r.competencyName, r.category,
      r.safetyCritical ? "YES" : "", r.requiredLevel, r.currentLevel ?? "NA", r.gap ?? "—",
      r.priority.toUpperCase(), r.status.replace(/_/g, " "), r.reasons.join(" "), r.recommendedAction,
      r.program ?? "", r.dueDate ?? "",
    ];
    vals.forEach((v, i) => {
      const c = row.getCell(i + 1);
      c.value = v;
      styleCell(c);
      if (i === 10) { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PRIORITY_FILL[r.priority] ?? "FFFFFFFF" } }; c.font = { bold: true, size: 10 }; }
      if (i === 13 || i === 12) c.alignment = { vertical: "top", wrapText: true };
    });
  });
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: headers.length } };

  const ws2 = wb.addWorksheet("Summary");
  titleBand(ws2, "TNA Summary & Prioritisation Model", `${scopeLabel} · Generated ${nowLabel()}`, 4);
  headerRow(ws2, 4, ["Metric", "Value"]);
  summary.forEach((s, i) => {
    const row = ws2.getRow(5 + i);
    row.getCell(1).value = s.label;
    row.getCell(2).value = s.value;
    styleCell(row.getCell(1)); styleCell(row.getCell(2));
  });
  ws2.getColumn(1).width = 46; ws2.getColumn(2).width = 18;
  const note = ws2.getRow(5 + summary.length + 1);
  note.getCell(1).value = "Prioritisation rules: expired mandatory qualification → Critical; safety-critical gap → Critical; 2-level gap → High; 1-level gap → Medium; unassessed → High (Critical if safety); assessment beyond frequency → Medium (High if safety); qualification expiring ≤30 days → High/Medium. These weights are configurable in Settings and reflect L&D practice, not a scientifically validated model.";
  note.getCell(1).alignment = { wrapText: true, vertical: "top" };
  ws2.mergeCells(note.number, 1, note.number, 4);
  ws2.getRow(note.number).height = 60;

  return toBuffer(wb);
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. TRAINING CALENDAR (monthly)
// ═══════════════════════════════════════════════════════════════════════════
export interface CalendarRowData {
  date: Date; code: string; title: string; category: string; trainer: string; location: string;
  department: string; startTime: string; durationHours: number; capacity: number; enrolled: number; status: string;
}
export async function buildTrainingCalendarWorkbook(rows: CalendarRowData[], monthLabel: string, generatedBy: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "TNA & Skill Matrix Tracker";
  const ws = wb.addWorksheet("Monthly Calendar", { views: [{ state: "frozen", ySplit: 4 }] });
  const headers = ["Date", "Day", "Code", "Training Title", "Category", "Start", "Hours", "Trainer", "Location", "Target Department", "Capacity", "Enrolled", "Seats Free", "Status"];
  titleBand(ws, "Monthly Training Calendar", `${monthLabel} · Generated ${nowLabel()} by ${generatedBy}`, headers.length);
  headerRow(ws, 4, headers);
  [12, 10, 12, 42, 16, 8, 7, 30, 22, 20, 9, 10, 10, 12].forEach((w, i) => (ws.getColumn(i + 1).width = w));

  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  rows.forEach((r, ri) => {
    const row = ws.getRow(5 + ri);
    const vals = [
      r.date.toISOString().slice(0, 10), days[r.date.getDay()], r.code, r.title, r.category, r.startTime,
      r.durationHours, r.trainer, r.location, r.department, r.capacity, r.enrolled,
      { formula: `MAX(0,K${5 + ri}-L${5 + ri})` }, r.status,
    ];
    vals.forEach((v, i) => { const c = row.getCell(i + 1); c.value = v as ExcelJS.CellValue; styleCell(c); });
  });
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: headers.length } };
  return toBuffer(wb);
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. ANNUAL TRAINING PLAN
// ═══════════════════════════════════════════════════════════════════════════
export interface AnnualPlanRow {
  programCode: string; title: string; category: string; competencyCode: string | null; hours: number; mode: string;
  months: { month: string; sessions: number }[];
  totalSessions: number;
}
export async function buildAnnualPlanWorkbook(rows: AnnualPlanRow[], year: number, generatedBy: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "TNA & Skill Matrix Tracker";
  const ws = wb.addWorksheet("Annual Plan", { views: [{ state: "frozen", xSplit: 3, ySplit: 4 }] });
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const headers = ["Code", "Program", "Category", "Competency", "Hours", "Mode", ...months, "Sessions/yr"];
  titleBand(ws, `Annual Training Plan ${year}`, `Planned and executed sessions per program · Generated ${nowLabel()} by ${generatedBy}`, headers.length);
  headerRow(ws, 4, headers);
  ws.getColumn(1).width = 9; ws.getColumn(2).width = 44; ws.getColumn(3).width = 18; ws.getColumn(4).width = 12;
  ws.getColumn(5).width = 8; ws.getColumn(6).width = 11;
  months.forEach((_, i) => (ws.getColumn(7 + i).width = 7));
  ws.getColumn(19).width = 11;

  rows.forEach((r, ri) => {
    const row = ws.getRow(5 + ri);
    const vals: (string | number)[] = [r.programCode, r.title, r.category, r.competencyCode ?? "", r.hours, r.mode];
    r.months.forEach((m) => vals.push(m.sessions));
    vals.push(r.totalSessions);
    vals.forEach((v, i) => {
      const c = row.getCell(i + 1);
      c.value = v;
      styleCell(c, i >= 6 && i < 18 && typeof v === "number" && v > 0 ? "FFDDEBF7" : undefined);
      if (i >= 6) c.alignment = { horizontal: "center", vertical: "middle" };
    });
    // live SUM formula for the year total
    row.getCell(19).value = { formula: `SUM(G${5 + ri}:R${5 + ri})` };
  });
  return toBuffer(wb);
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. ATTENDANCE SHEET
// ═══════════════════════════════════════════════════════════════════════════
export interface AttendanceRowData {
  employeeCode: string; employeeName: string; departmentName: string; jobRoleTitle: string;
  status: string; qualified: boolean; remarks: string | null;
}
export async function buildAttendanceWorkbook(
  session: { code: string; title: string; date: Date; startTime: string; durationHours: number; trainer: string; location: string; category: string },
  records: AttendanceRowData[],
  generatedBy: string
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "TNA & Skill Matrix Tracker";
  const ws = wb.addWorksheet("Attendance", { views: [{ state: "frozen", ySplit: 10 }] });

  titleBand(ws, "Training Attendance Sheet", `${session.title} (${session.code})`, 8);
  const meta: [string, string][] = [
    ["Date", session.date.toISOString().slice(0, 10)],
    ["Time / Duration", `${session.startTime} · ${session.durationHours} h · ${session.location}`],
    ["Trainer", session.trainer],
    ["Category", session.category],
    ["Exported", `${nowLabel()} by ${generatedBy}`],
  ];
  meta.forEach((m, i) => {
    const row = ws.getRow(4 + i);
    const k = row.getCell(1); k.value = m[0]; k.font = { bold: true, size: 10, color: { argb: SLATE } }; styleCell(k);
    ws.mergeCells(row.number, 2, row.number, 4);
    const v = row.getCell(2); v.value = m[1]; styleCell(v);
  });

  const headerIdx = 10;
  const headers = ["Code", "Employee", "Department", "Job Role", "Attendance", "Qualified", "Remarks"];
  headerRow(ws, headerIdx, headers);
  [10, 24, 20, 26, 12, 10, 36].forEach((w, i) => (ws.getColumn(i + 1).width = w));

  records.forEach((r, ri) => {
    const row = ws.getRow(headerIdx + 1 + ri);
    const vals = [r.employeeCode, r.employeeName, r.departmentName, r.jobRoleTitle, r.status, r.qualified ? "YES" : "NO", r.remarks ?? ""];
    vals.forEach((v, i) => {
      const c = row.getCell(i + 1);
      c.value = v;
      styleCell(c, i === 4 ? (v === "present" ? "FFD5EFD5" : v === "absent" ? "FFF5B7B1" : "FFFDE9B2") : undefined);
    });
  });

  // live summary formulas
  const sumRow = headerIdx + records.length + 2;
  const presentRange = `E${headerIdx + 1}:E${headerIdx + records.length}`;
  const cell = ws.getRow(sumRow).getCell(5);
  cell.value = { formula: `IFERROR(COUNTIF(${presentRange},"present")/COUNTA(${presentRange}),0)` };
  cell.numFmt = "0%";
  ws.getRow(sumRow).getCell(4).value = "Attendance %:";
  ws.getRow(sumRow).getCell(4).font = { bold: true };
  const sigRow = sumRow + 2;
  ws.getRow(sigRow).getCell(2).value = "Trainer signature: ______________________";
  ws.getRow(sigRow).getCell(5).value = "L&D review: ______________________";
  return toBuffer(wb);
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. QUALIFICATION EXPIRY REPORT
// ═══════════════════════════════════════════════════════════════════════════
export interface QualRowData {
  employeeCode: string; employeeName: string; departmentName: string; jobRoleTitle: string;
  competencyName: string; certificateRef: string | null; issuedAt: Date; expiresAt: Date;
  daysRemaining: number; bucket: "expired" | "expiring_7" | "expiring_30" | "valid";
}
export async function buildQualificationExpiryWorkbook(rows: QualRowData[], scopeLabel: string, generatedBy: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "TNA & Skill Matrix Tracker";
  const ws = wb.addWorksheet("Qualifications", { views: [{ state: "frozen", ySplit: 4 }] });
  const headers = ["Code", "Employee", "Department", "Job Role", "Qualification", "Certificate", "Issued", "Expires", "Days Left", "Status"];
  titleBand(ws, "Qualification Expiry Report", `${scopeLabel} · Generated ${nowLabel()} by ${generatedBy}`, headers.length);
  headerRow(ws, 4, headers);
  [10, 24, 20, 26, 32, 16, 12, 12, 10, 16].forEach((w, i) => (ws.getColumn(i + 1).width = w));

  const bucketLabel: Record<string, string> = { expired: "EXPIRED", expiring_7: "≤ 7 days", expiring_30: "≤ 30 days", valid: "Valid" };
  const bucketFill: Record<string, string> = { expired: PRIORITY_FILL.critical, expiring_7: PRIORITY_FILL.high, expiring_30: PRIORITY_FILL.medium, valid: "FFD5EFD5" };
  rows.forEach((r, ri) => {
    const row = ws.getRow(5 + ri);
    const vals = [r.employeeCode, r.employeeName, r.departmentName, r.jobRoleTitle, r.competencyName, r.certificateRef ?? "",
      r.issuedAt.toISOString().slice(0, 10), r.expiresAt.toISOString().slice(0, 10), r.daysRemaining, bucketLabel[r.bucket]];
    vals.forEach((v, i) => {
      const c = row.getCell(i + 1);
      c.value = v;
      styleCell(c, i === 9 ? bucketFill[r.bucket] : undefined);
    });
  });
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: headers.length } };

  const ws2 = wb.addWorksheet("Summary");
  titleBand(ws2, "Expiry Summary", `${scopeLabel}`, 3);
  headerRow(ws2, 4, ["Status", "Count"]);
  const counts = [
    ["Expired", rows.filter((r) => r.bucket === "expired").length],
    ["Expiring within 7 days", rows.filter((r) => r.bucket === "expiring_7").length],
    ["Expiring within 30 days", rows.filter((r) => r.bucket === "expiring_30").length],
    ["Valid", rows.filter((r) => r.bucket === "valid").length],
  ] as [string, number][];
  counts.forEach((c2, i) => {
    const row = ws2.getRow(5 + i);
    row.getCell(1).value = c2[0]; row.getCell(2).value = c2[1];
    styleCell(row.getCell(1)); styleCell(row.getCell(2));
  });
  ws2.getColumn(1).width = 30; ws2.getColumn(2).width = 12;
  return toBuffer(wb);
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. EMPLOYEE IMPORT TEMPLATE
// ═══════════════════════════════════════════════════════════════════════════
export async function buildEmployeeImportTemplate(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "TNA & Skill Matrix Tracker";
  const ws = wb.addWorksheet("Employees");

  const headers = ["Employee Code", "Employee Name", "Department", "Production Area", "Job Role", "Designation", "Joining Date (YYYY-MM-DD)", "Employment Status", "Supervisor", "Shift", "Employment Category"];
  headerRow(ws, 1, headers);
  [14, 26, 20, 20, 30, 24, 22, 16, 26, 12, 18].forEach((w, i) => (ws.getColumn(i + 1).width = w));

  const samples = [
    ["SE-2001", "Md. Sample Rahman", "Production", "Making Line 1", "Machine Operator (Making)", "Machine Operator II", "2024-03-15", "active", "Md. Sample Hossain", "Morning", "Permanent"],
    ["SE-2002", "Sample Akter", "Quality Assurance", "Testing Laboratory", "Laboratory Analyst", "Laboratory Analyst", "2023-08-01", "active", "Sample Manager", "General", "Contract"],
    ["SE-2003", "Md. Test Islam", "Maintenance", "Mechanical Workshop", "Maintenance Technician (Mechanical)", "Maintenance Technician I", "2022-11-10", "probation", "Sample Supervisor", "Evening", "Trainee"],
  ];
  samples.forEach((s, ri) => {
    const row = ws.getRow(2 + ri);
    s.forEach((v, i) => { const c = row.getCell(i + 1); c.value = v; styleCell(c); });
  });
  // data validation lists (rows 2-500)
  for (let r = 2; r <= 500; r++) {
    ws.getCell(`H${r}`).dataValidation = { type: "list", allowBlank: true, formulae: ['"active,probation,on_leave,notice_period"'] };
    ws.getCell(`J${r}`).dataValidation = { type: "list", allowBlank: true, formulae: ['"General,Morning,Evening,Night,Rotating"'] };
    ws.getCell(`K${r}`).dataValidation = { type: "list", allowBlank: true, formulae: ['"Permanent,Contract,Trainee"'] };
  }

  const ws2 = wb.addWorksheet("Instructions");
  titleBand(ws2, "Employee Import Template — Instructions", "Read before uploading. All data must be SYNTHETIC (demo).", 2);
  const lines = [
    ["1", "Fill the Employees sheet. The three sample rows (SE-2001..SE-2003) are examples — delete or replace them."],
    ["2", "Department and Job Role must match existing values in the system (see lists below)."],
    ["3", "Production Area is optional; it must belong to the chosen department when provided."],
    ["4", "Joining Date format: YYYY-MM-DD."],
    ["5", "Employment Status: active, probation, on_leave, notice_period."],
    ["6", "Shift: General, Morning, Evening, Night, Rotating."],
    ["7", "Employment Category: Permanent, Contract, Trainee."],
    ["8", "Employee Code must be unique — duplicates in the file or against existing records are rejected."],
    ["9", "Upload in Reports & Imports → Import Employees. You will see a validation preview before anything is saved."],
  ];
  lines.forEach((l, i) => {
    const row = ws2.getRow(4 + i);
    row.getCell(1).value = l[0]; row.getCell(1).font = { bold: true };
    row.getCell(2).value = l[1]; row.getCell(2).alignment = { wrapText: true, vertical: "top" };
  });
  ws2.getColumn(1).width = 6; ws2.getColumn(2).width = 100;
  return toBuffer(wb);
}

// ═══════════════════════════════════════════════════════════════════════════
// CSV helper
// ═══════════════════════════════════════════════════════════════════════════
export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))];
  return "\uFEFF" + lines.join("\r\n");
}
