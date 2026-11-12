import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handleApi } from "@/lib/api";

/** Organisation lookup: departments (+areas), job roles — used by filters everywhere. */
export async function GET(req: NextRequest) {
  return handleApi(req, { permission: "dashboard:view" }, async () => {
    const [departments, jobRoles] = await Promise.all([
      db.department.findMany({
        orderBy: { name: "asc" },
        include: { productionAreas: { orderBy: { code: "asc" } } },
      }),
      db.jobRole.findMany({
        orderBy: { title: "asc" },
        include: { department: { select: { id: true, name: true } } },
      }),
    ]);
    return {
      departments: departments.map((d) => ({
        id: d.id, code: d.code, name: d.name, description: d.description,
        areas: d.productionAreas.map((a) => ({ id: a.id, code: a.code, name: a.name })),
      })),
      jobRoles: jobRoles.map((j) => ({
        id: j.id, code: j.code, title: j.title, grade: j.grade,
        departmentId: j.departmentId, departmentName: j.department.name,
      })),
      shifts: ["General", "Morning", "Evening", "Night", "Rotating"],
      statuses: ["active", "probation", "on_leave", "notice_period", "separated"],
      categories: ["Permanent", "Contract", "Trainee"],
      competencyCategories: ["Technical", "Quality", "Safety", "Compliance", "Operational Excellence", "Behavioral"],
    };
  });
}
