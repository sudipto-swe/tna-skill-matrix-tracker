import { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { db } from "@/lib/db";
import { handleApi, ApiError } from "@/lib/api";

/**
 * POST /api/import/preview — upload CSV/XLSX, validate, return preview.
 * Nothing is saved at this stage.
 */
const REQUIRED_HEADERS = [
  "employee code", "employee name", "department", "job role", "designation",
  "joining date (yyyy-mm-dd)", "employment status", "shift", "employment category",
];

interface PreviewRow {
  employeeCode: string; name: string; department: string; productionArea: string | null;
  jobRole: string; designation: string; joiningDate: string; status: string;
  supervisor: string | null; shift: string; category: string;
}

export async function POST(req: NextRequest) {
  return handleApi(req, { permission: "import:execute", limit: { max: 20, windowMs: 60_000 } }, async () => {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      throw new ApiError(400, "Expected a multipart/form-data upload with a \"file\" field (CSV or XLSX).");
    }
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError(400, "Upload a file (CSV or XLSX).");
    if (file.size > 2 * 1024 * 1024) throw new ApiError(400, "File too large (max 2 MB).");

    const isCsv = file.name.toLowerCase().endsWith(".csv") || file.type === "text/csv";
    if (!isCsv && !file.name.toLowerCase().endsWith(".xlsx")) {
      throw new ApiError(400, "Only .csv and .xlsx files are supported.");
    }

    // ── parse into raw rows ──
    let rawRows: Record<string, string>[] = [];
    if (isCsv) {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length === 0) throw new ApiError(400, "The file is empty.");
      const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/"/g, ""));
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].match(/("([^"]|"")*"|[^,]*)(,|$)/g)?.map((v) => v.replace(/,$/, "").replace(/^"|"$/g, "").replace(/""/g, '"').trim()) ?? [];
        const row: Record<string, string> = {};
        headers.forEach((h, hi) => (row[h] = values[hi] ?? ""));
        rawRows.push(row);
      }
    } else {
      const wb = new ExcelJS.Workbook();
      try {
        await wb.xlsx.load(await file.arrayBuffer());
      } catch {
        throw new ApiError(400, "The file is not a valid XLSX workbook (corrupt or wrong format).");
      }
      const ws = wb.getWorksheet("Employees") ?? wb.worksheets[0];
      if (!ws) throw new ApiError(400, "No worksheet found in the workbook.");
      const headers: string[] = [];
      ws.getRow(1).eachCell((c, col) => {
        headers[col] = String(c.value ?? "").trim().toLowerCase();
      });
      ws.eachRow((row, rn) => {
        if (rn === 1) return;
        const obj: Record<string, string> = {};
        headers.forEach((h, col) => {
          if (h) obj[h] = String(row.getCell(col).value ?? "").trim();
        });
        if (Object.values(obj).some((v) => v !== "")) rawRows.push(obj);
      });
    }

    if (rawRows.length === 0) throw new ApiError(400, "No data rows found below the header.");
    if (rawRows.length > 500) throw new ApiError(400, "Maximum 500 rows per import.");

    // ── reference data ──
    const [departments, jobRoles, areas, existingCodes] = await Promise.all([
      db.department.findMany(),
      db.jobRole.findMany(),
      db.productionArea.findMany({ include: { department: true } }),
      db.employee.findMany({ select: { employeeCode: true } }),
    ]);
    const deptByName = new Map(departments.map((d) => [d.name.toLowerCase(), d]));
    const roleByName = new Map(jobRoles.map((j) => [j.title.toLowerCase(), j]));
    const areaByName = new Map(areas.map((a) => [a.name.toLowerCase(), a]));
    const codeSet = new Set(existingCodes.map((e) => e.employeeCode.toUpperCase()));

    const valid: PreviewRow[] = [];
    const invalid: { row: number; employeeCode: string; errors: string[] }[] = [];
    const seen = new Set<string>();

    rawRows.forEach((r, i) => {
      const rowNo = i + 2; // +1 header, +1 1-based
      const get = (...keys: string[]) => {
        for (const k of keys) {
          const v = r[k] ?? r[k.replace(/ \(.*\)$/, "")] ?? "";
          if (v) return v.trim();
        }
        return "";
      };
      const employeeCode = get("employee code");
      const name = get("employee name");
      const department = get("department");
      const productionArea = get("production area") || null;
      const jobRole = get("job role");
      const designation = get("designation");
      const joiningDate = get("joining date (yyyy-mm-dd)", "joining date");
      const status = get("employment status").toLowerCase();
      const supervisor = get("supervisor") || null;
      const shift = get("shift");
      const category = get("employment category");

      const errors: string[] = [];
      if (!employeeCode) errors.push("Employee Code is required");
      else if (!/^[A-Za-z0-9-]{2,20}$/.test(employeeCode)) errors.push("Employee Code must be 2-20 letters/digits/hyphens");
      else if (codeSet.has(employeeCode.toUpperCase())) errors.push(`Employee Code already exists in the system`);
      else if (seen.has(employeeCode.toUpperCase())) errors.push("Duplicate Employee Code within this file");
      if (name.length < 2) errors.push("Employee Name is required");
      const dept = deptByName.get(department.toLowerCase());
      if (!dept) errors.push(`Unknown Department "${department}"`);
      const role = roleByName.get(jobRole.toLowerCase());
      if (!role) errors.push(`Unknown Job Role "${jobRole}"`);
      if (dept && role && role.departmentId !== dept.id) errors.push(`Job Role "${jobRole}" does not belong to ${dept.name}`);
      if (productionArea) {
        const area = areaByName.get(productionArea.toLowerCase());
        if (!area) errors.push(`Unknown Production Area "${productionArea}"`);
        else if (dept && area.departmentId !== dept.id) errors.push(`Production Area "${productionArea}" does not belong to ${dept.name}`);
      }
      if (!designation) errors.push("Designation is required");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(joiningDate) || isNaN(Date.parse(joiningDate))) errors.push("Joining Date must be a valid YYYY-MM-DD date");
      if (!["active", "probation", "on_leave", "notice_period"].includes(status)) errors.push(`Status "${status}" must be active|probation|on_leave|notice_period`);
      if (!["General", "Morning", "Evening", "Night", "Rotating"].includes(shift)) errors.push(`Shift "${shift}" must be General|Morning|Evening|Night|Rotating`);
      if (!["Permanent", "Contract", "Trainee"].includes(category)) errors.push(`Category "${category}" must be Permanent|Contract|Trainee`);

      if (errors.length) {
        invalid.push({ row: rowNo, employeeCode: employeeCode || "(blank)", errors });
      } else {
        seen.add(employeeCode.toUpperCase());
        valid.push({ employeeCode, name, department, productionArea, jobRole, designation, joiningDate, status, supervisor, shift, category });
      }
    });

    return {
      fileName: file.name,
      total: rawRows.length,
      validCount: valid.length,
      invalidCount: invalid.length,
      preview: valid.slice(0, 25),
      invalidPreview: invalid.slice(0, 25),
      departments: departments.map((d) => d.name),
      jobRoles: jobRoles.map((j) => j.title),
    };
  });
}
