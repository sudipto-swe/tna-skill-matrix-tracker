import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handleApi, ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { importCommitSchema } from "@/lib/validation";

/**
 * POST /api/import/commit — create employees from a validated preview.
 * Validation is repeated server-side; nothing is trusted from the client.
 */
export async function POST(req: NextRequest) {
  return handleApi(req, { permission: "import:execute", limit: { max: 20, windowMs: 60_000 } }, async (session) => {
    const body = importCommitSchema.parse(await req.json());

    const [departments, jobRoles, areas] = await Promise.all([
      db.department.findMany(),
      db.jobRole.findMany(),
      db.productionArea.findMany(),
    ]);
    const deptByName = new Map(departments.map((d) => [d.name.toLowerCase(), d]));
    const roleByName = new Map(jobRoles.map((j) => [j.title.toLowerCase(), j]));
    const areaByName = new Map(areas.map((a) => [a.name.toLowerCase(), a]));

    let created = 0;
    const failed: { employeeCode: string; error: string }[] = [];

    await db.$transaction(async (tx) => {
      for (const row of body.rows) {
        try {
          const dept = deptByName.get(row.department.toLowerCase());
          const role = roleByName.get(row.jobRole.toLowerCase());
          if (!dept || !role || role.departmentId !== dept.id) {
            throw new Error("Invalid department/job role combination.");
          }
          const area = row.productionArea ? areaByName.get(row.productionArea.toLowerCase()) : null;
          const employee = await tx.employee.create({
            data: {
              employeeCode: row.employeeCode,
              name: row.name,
              departmentId: dept.id,
              productionAreaId: area?.id ?? null,
              jobRoleId: role.id,
              designation: row.designation,
              joiningDate: new Date(row.joiningDate),
              status: ["active", "probation", "on_leave", "notice_period"].includes(row.status) ? row.status : "active",
              supervisorName: row.supervisor ?? null,
              shift: row.shift,
              category: row.category,
            },
          });
          created += 1;
          void employee;
        } catch (e) {
          failed.push({ employeeCode: row.employeeCode, error: e instanceof Error ? e.message : "Unknown error" });
        }
      }
    });

    await audit(req, session, "import", "employee", null, `Imported ${created} employee(s) from file; ${failed.length} failed`);
    return { created, failed, total: body.rows.length };
  });
}
