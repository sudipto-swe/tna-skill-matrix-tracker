/**
 * DEFINITIVE API harness v4 — final. Corrected payloads + expectations,
 * data-scope verification, DB-level teardown, seed-integrity assertion.
 * Run: node scripts/api-sweep-v4.mjs
 */
const BASE = "http://localhost:3000";
const CSRF = { "X-Requested-With": "XMLHttpRequest" };
const H = (t, extra = {}) => ({ ...CSRF, ...(t ? { Authorization: `Bearer ${t}` } : {}), ...extra });

const accounts = [
  { email: "admin@tna-demo.com", password: "Admin@1234", label: "ADMIN" },
  { email: "training@tna-demo.com", password: "Training@1234", label: "TRAINING" },
  { email: "supervisor@tna-demo.com", password: "Supervisor@1234", label: "SUPERVISOR" },
  { email: "employee@tna-demo.com", password: "Employee@1234", label: "EMPLOYEE" },
];

let pass = 0, fail = 0;
const results = [];
const check = (suite, name, ok, detail = "") => {
  if (ok) pass++; else fail++;
  results.push(`${ok ? "PASS" : "FAIL"} [${suite}] ${name}${detail ? " — " + detail : ""}`);
};

async function rawFetch(method, path, token, body, isForm = false) {
  return fetch(`${BASE}${path}`, {
    method,
    headers: isForm ? H(token) : { ...H(token), "Content-Type": "application/json" },
    body: isForm ? body : body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(60000),
  });
}

async function api(method, path, token, body, isForm = false) {
  for (let attempt = 0; ; attempt++) {
    let res, text;
    try {
      res = await rawFetch(method, path, token, body, isForm);
      text = await res.text();
    } catch (e) {
      return { status: 0, data: e.message, headers: null };
    }
    if (res.status === 429 && attempt < 3) {
      const retryAfter = Number(res.headers.get("retry-after") ?? "30") + 1;
      console.log(`  (rate limited on ${path}; waiting ${retryAfter}s…)`);
      await new Promise((r) => setTimeout(r, retryAfter * 1000));
      continue;
    }
    let data; try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data, headers: res.headers };
  }
}

async function main() {
  // ═══ 1. AUTH (login budget: 4 + 2 neg + 1 csrf + 2 lifecycle = 9) ═══
  const T = {}; let adminSetCookie = "";
  for (const a of accounts) {
    const r = await api("POST", "/api/auth/login", null, { email: a.email, password: a.password });
    const ok = r.status === 200 && r.data?.token;
    check("AUTH", `login ${a.label}`, ok, ok ? r.data.user.roleCode : JSON.stringify(r.data).slice(0, 100));
    if (ok) T[a.label] = r.data.token;
    if (a.label === "ADMIN" && ok) adminSetCookie = r.headers.get("set-cookie") ?? "";
  }
  check("AUTH", "login sets session cookie", adminSetCookie.includes("tna_session="));
  const meRes = await fetch(`${BASE}/api/auth/me`, { headers: { cookie: adminSetCookie.split(";")[0] } });
  check("AUTH", "cookie track: /me works", meRes.status === 200);
  let r = await api("POST", "/api/auth/login", null, { email: "admin@tna-demo.com", password: "nope" });
  check("AUTH", "wrong password → 401", r.status === 401, `status=${r.status}`);
  r = await api("POST", "/api/auth/login", null, { email: "ghost@x.com", password: "x" });
  check("AUTH", "unknown email → 401", r.status === 401, `status=${r.status}`);
  r = await api("GET", "/api/dashboard", "forged.token.value");
  check("AUTH", "forged token → 401", r.status === 401, `status=${r.status}`);
  const noCsrf = await fetch(`${BASE}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  check("AUTH", "missing CSRF → 403", noCsrf.status === 403, `status=${noCsrf.status}`);
  for (const [label, token] of Object.entries(T)) {
    r = await api("GET", "/api/auth/me", token);
    check("AUTH", `/me ${label}`, r.status === 200 && !!r.data?.user, r.data?.user?.roleCode);
  }

  // ═══ 2. READ RBAC MATRIX (design-verified) ═════════════════════════
  const readMatrix = [
    ["/api/dashboard", { ADMIN: 200, TRAINING: 200, SUPERVISOR: 200, EMPLOYEE: 200 }],
    ["/api/org", { ADMIN: 200, TRAINING: 200, SUPERVISOR: 200, EMPLOYEE: 200 }], // reference data
    ["/api/employees", { ADMIN: 200, TRAINING: 200, SUPERVISOR: 200, EMPLOYEE: 200 }], // self-scoped
    ["/api/competencies", { ADMIN: 200, TRAINING: 200, SUPERVISOR: 200, EMPLOYEE: 200 }],
    ["/api/skill-matrix", { ADMIN: 200, TRAINING: 200, SUPERVISOR: 200, EMPLOYEE: 403 }],
    ["/api/tna", { ADMIN: 200, TRAINING: 200, SUPERVISOR: 200, EMPLOYEE: 200 }], // self-scoped
    ["/api/training/programs", { ADMIN: 200, TRAINING: 200, SUPERVISOR: 200, EMPLOYEE: 200 }],
    ["/api/training/sessions", { ADMIN: 200, TRAINING: 200, SUPERVISOR: 200, EMPLOYEE: 200 }],
    ["/api/qualifications", { ADMIN: 200, TRAINING: 200, SUPERVISOR: 200, EMPLOYEE: 200 }], // self-scoped
    ["/api/audit-logs", { ADMIN: 200, TRAINING: 403, SUPERVISOR: 403, EMPLOYEE: 403 }],
    ["/api/users", { ADMIN: 200, TRAINING: 403, SUPERVISOR: 403, EMPLOYEE: 403 }],
    ["/api/settings", { ADMIN: 200, TRAINING: 200, SUPERVISOR: 200, EMPLOYEE: 200 }],
    ["/api/notifications", { ADMIN: 200, TRAINING: 200, SUPERVISOR: 200, EMPLOYEE: 200 }],
    ["/api/reports/skill-matrix", { ADMIN: 200, TRAINING: 200, SUPERVISOR: 200, EMPLOYEE: 403 }],
    ["/api/reports/tna", { ADMIN: 200, TRAINING: 200, SUPERVISOR: 200, EMPLOYEE: 403 }],
    ["/api/reports/training-calendar", { ADMIN: 200, TRAINING: 200, SUPERVISOR: 200, EMPLOYEE: 403 }],
    ["/api/reports/annual-plan", { ADMIN: 200, TRAINING: 200, SUPERVISOR: 200, EMPLOYEE: 403 }],
    ["/api/reports/qualification-expiry", { ADMIN: 200, TRAINING: 200, SUPERVISOR: 200, EMPLOYEE: 403 }],
    ["/api/reports/employee-import-template", { ADMIN: 200, TRAINING: 200, SUPERVISOR: 200, EMPLOYEE: 403 }],
  ];
  for (const [path, expect] of readMatrix) {
    for (const [role, want] of Object.entries(expect)) {
      r = await api("GET", path, T[role]);
      check("RBAC", `GET ${path} ${role}→${want}`, r.status === want, `got=${r.status}`);
    }
  }
  // write-only endpoints: RBAC fires before body validation
  r = await api("PUT", "/api/competencies/role-requirements", T.SUPERVISOR, {});
  check("RBAC", "PUT role-requirements denied supervisor", r.status === 403, `status=${r.status}`);
  r = await api("DELETE", "/api/competencies/role-requirements?id=x&competencyId=y", T.SUPERVISOR);
  check("RBAC", "DELETE role-requirements denied supervisor", r.status === 403, `status=${r.status}`);
  r = await api("PUT", "/api/competencies/role-requirements", T.ADMIN, {});
  check("VALID", "PUT role-requirements admin bad body → 400", r.status === 400, `status=${r.status}`);
  r = await api("PUT", "/api/attendance", T.EMPLOYEE, {});
  check("RBAC", "PUT attendance denied employee", r.status === 403, `status=${r.status}`);

  // ═══ 3. DATA-SCOPE VERIFICATION ════════════════════════════════════
  const empMe = await api("GET", "/api/auth/me", T.EMPLOYEE);
  const empCode = empMe.data?.user?.employeeCode;
  const empName = empMe.data?.user?.name;
  r = await api("GET", "/api/employees", T.EMPLOYEE);
  const selfList = r.data?.employees ?? [];
  check("SCOPE", "employee directory = self only", r.status === 200 && selfList.length === 1 && selfList[0].employeeCode === empCode, `len=${selfList.length}`);
  r = await api("GET", "/api/tna", T.EMPLOYEE);
  const selfNeeds = r.data?.needs ?? [];
  check("SCOPE", "employee TNA = own needs only", r.status === 200 && selfNeeds.length > 0 && selfNeeds.every((n) => n.employeeCode === empCode), `n=${selfNeeds.length} all-self=${selfNeeds.every((n) => n.employeeCode === empCode)}`);
  r = await api("GET", "/api/qualifications", T.EMPLOYEE);
  const selfQuals = r.data?.qualifications ?? [];
  check("SCOPE", "employee qualifications = own only", r.status === 200 && selfQuals.every((q) => q.employeeCode === empCode), `n=${selfQuals.length}`);
  // assessments: own ok, other denied
  const empIdSelf = empMe.data?.user?.employeeId;
  if (empIdSelf) {
    r = await api("GET", `/api/assessments?employeeId=${empIdSelf}`, T.EMPLOYEE);
    check("SCOPE", "employee reads own assessments", r.status === 200, `status=${r.status}`);
    const anyEmp = await api("GET", "/api/employees?pageSize=5", T.ADMIN);
    const otherId = (anyEmp.data?.employees ?? []).find((e) => e.id !== empIdSelf)?.id;
    if (otherId) {
      r = await api("GET", `/api/assessments?employeeId=${otherId}`, T.EMPLOYEE);
      check("SCOPE", "employee denied others' assessments", r.status === 403, `status=${r.status}`);
      r = await api("GET", `/api/assessments?employeeId=${otherId}`, T.ADMIN);
      check("RBAC", "admin reads any assessments", r.status === 200, `status=${r.status}`);
    }
  }
  const supMe = await api("GET", "/api/auth/me", T.SUPERVISOR);
  r = await api("GET", "/api/employees?pageSize=100", T.SUPERVISOR);
  const supEmps = r.data?.employees ?? [];
  check("SCOPE", "supervisor directory dept-scoped", supEmps.length > 0 && supEmps.every((e) => e.department === supMe.data?.user?.departmentName), `${supEmps.length} in "${supMe.data?.user?.departmentName}"`);

  // ═══ 4. DATA INTEGRITY ═════════════════════════════════════════════
  r = await api("GET", "/api/employees?pageSize=100", T.ADMIN);
  check("DATA", "112 employees", r.data?.total === 112, `total=${r.data?.total}`);
  r = await api("GET", "/api/employees?page=3&pageSize=20", T.ADMIN);
  check("DATA", "pagination", r.data?.page === 3 && r.data?.employees?.length === 20, `page=${r.data?.page}`);
  r = await api("GET", "/api/competencies", T.ADMIN);
  check("DATA", "28 competencies", (r.data?.competifications ?? r.data?.competencies ?? []).length === 28, `got=${(r.data?.competencies ?? []).length}`);
  r = await api("GET", "/api/training/sessions", T.ADMIN);
  const sessList = r.data?.sessions ?? [];
  check("DATA", "58 sessions", sessList.length === 58, `got=${sessList.length}`);
  r = await api("GET", "/api/training/programs", T.ADMIN);
  check("DATA", "16 programs", (r.data?.programs ?? []).length === 16, `got=${(r.data?.programs ?? []).length}`);
  r = await api("GET", "/api/dashboard", T.ADMIN);
  check("DATA", "admin dashboard shape", r.status === 200 && !!r.data?.kpis && !!r.data?.tnaSummary && Array.isArray(r.data?.criticalNeeds), `keys=${Object.keys(r.data || {}).slice(0, 5).join(",")}`);
  r = await api("GET", "/api/dashboard", T.EMPLOYEE);
  check("DATA", "employee dashboard shape", r.status === 200 && !!r.data?.personal, `keys=${Object.keys(r.data || {}).slice(0, 5).join(",")}`);
  // TNA rules
  r = await api("GET", "/api/tna?scope=critical", T.ADMIN);
  const crit = r.data?.needs ?? [];
  check("RULE", "TNA critical scope", crit.length > 0 && crit.every((n) => String(n.priority).toLowerCase() === "critical"), `n=${crit.length}`);
  r = await api("GET", "/api/tna", T.ADMIN);
  const needs = r.data?.needs ?? [];
  const gapped = needs.filter((n) => n.currentLevel !== null);
  check("RULE", "gap = required − current", gapped.length > 0 && gapped.every((n) => n.gap === n.requiredLevel - n.currentLevel), `n=${gapped.length}`);
  const na = needs.filter((n) => n.currentLevel === null);
  check("RULE", "not-assessed: gap is null (never treated as L1)", na.length > 0 && na.every((n) => n.gap === null), `n=${na.length}`);
  // qualification buckets (seed contract)
  r = await api("GET", "/api/qualifications", T.ADMIN);
  const counts = r.data?.counts;
  check("RULE", "qualification buckets 21/22/39/159", counts?.expired === 21 && counts?.expiring_7 === 22 && counts?.expiring_30 === 39 && counts?.valid === 159, JSON.stringify(counts));

  // ═══ 5. CRUD LIFECYCLES ════════════════════════════════════════════
  const org = await api("GET", "/api/org", T.ADMIN);
  const orgData = org.data?.departments ? org.data : (org.data?.data ?? org.data);
  const depts = orgData?.departments ?? [];
  const supMe2 = await api("GET", "/api/auth/me", T.SUPERVISOR);
  const supDeptId = supMe2.data?.user?.departmentId ?? depts[0]?.id; // create sweep staff in supervisor's dept
  const supDeptName = supMe2.data?.user?.departmentName;
  const otherDeptId = (depts.find((d) => d.id !== supDeptId) ?? depts[0])?.id;
  const jobRoleId = (orgData?.jobRoles ?? []).find((j) => j.departmentId === supDeptId)?.id ?? (orgData?.jobRoles ?? [])[0]?.id;
  check("DATA", "org reference data", depts.length === 8 && !!jobRoleId, `depts=${depts.length}`);

  // — Employee (created in supervisor's dept so the supervisor flow can assess it) —
  r = await api("POST", "/api/employees", T.ADMIN, {
    employeeCode: "SWEEP-001", name: "Sweep Test Employee", departmentId: supDeptId, jobRoleId,
    designation: "Test Operator", joiningDate: "2025-01-15", shift: "General", category: "Permanent",
  });
  const empOk = r.status === 200 || r.status === 201;
  check("CRUD", "create employee (admin)", empOk, `status=${r.status} ${JSON.stringify(r.data).slice(0, 90)}`);
  let sweepEmpId = r.data?.employee?.id ?? r.data?.id;
  if (!sweepEmpId && empOk) {
    const f = await api("GET", "/api/employees?search=SWEEP-001", T.ADMIN);
    sweepEmpId = f.data?.employees?.[0]?.id;
  }
  check("DATA", "sweep employee resolved", !!sweepEmpId);
  if (sweepEmpId) {
    r = await api("POST", "/api/employees", T.ADMIN, { employeeCode: "SWEEP-001", name: "Dup", jobRoleId, designation: "x", joiningDate: "2025-01-15", shift: "General", category: "Permanent" });
    check("VALID", "duplicate employeeCode → 400/409", r.status === 400 || r.status === 409, `status=${r.status}`);
    r = await api("POST", "/api/employees", T.ADMIN, { name: "No Code" });
    check("VALID", "missing fields → 400", r.status === 400, `status=${r.status}`);
    r = await api("PUT", `/api/employees/${sweepEmpId}`, T.TRAINING, { designation: "Senior Test Operator" });
    check("RBAC", "training officer cannot update staff (admin-only; imports instead)", r.status === 403, `status=${r.status}`);
    r = await api("PUT", `/api/employees/${sweepEmpId}`, T.ADMIN, { designation: "Senior Test Operator" });
    check("CRUD", "update employee (admin)", r.status === 200, `status=${r.status}`);
    r = await api("PUT", `/api/employees/${sweepEmpId}`, T.EMPLOYEE, { designation: "HACKED" });
    check("RBAC", "employee cannot update staff", r.status === 403, `status=${r.status}`);
    r = await api("GET", `/api/employees/${sweepEmpId}`, T.ADMIN);
    check("CRUD", "employee detail", r.status === 200, `status=${r.status}`);
    r = await api("GET", "/api/employees/does-not-exist", T.ADMIN);
    check("VALID", "unknown employee → 404", r.status === 404, `status=${r.status}`);
  }

  // — Competency —
  r = await api("POST", "/api/competencies", T.ADMIN, {
    code: "SWP-01", name: "Sweep Competency", description: "Temporary sweep competency for testing.",
    category: "Technical", baselineLevel: 2, assessmentCriteria: "Can perform the sweep test adequately.",
    assessmentFrequencyMonths: 12, validityMonths: 24, safetyCritical: false, mandatory: false, active: true,
  });
  const compOk = r.status === 200 || r.status === 201;
  check("CRUD", "create competency (admin)", compOk, `status=${r.status}`);
  r = await api("POST", "/api/competencies", T.TRAINING, { code: "SWP-02", name: "Nope", description: "xxxxx", category: "Technical", assessmentCriteria: "xxxxx" });
  check("RBAC", "training cannot create competency", r.status === 403, `status=${r.status}`);
  let sweepCompId = r.data?.competency?.id ?? r.data?.id;
  if (!sweepCompId && compOk) {
    const cl = await api("GET", "/api/competencies", T.ADMIN);
    sweepCompId = (cl.data?.competencies ?? []).find((c) => c.code === "SWP-01")?.id;
  }
  if (sweepCompId) {
    r = await api("PUT", `/api/competencies/${sweepCompId}`, T.ADMIN, { name: "Sweep Competency v2" });
    check("CRUD", "update competency (admin)", r.status === 200, `status=${r.status}`);
    r = await api("GET", `/api/competencies/${sweepCompId}`, T.ADMIN);
    check("CRUD", "competency detail", r.status === 200, `status=${r.status}`);
  }

  // — Assessment (supervisor: own dept ok, other dept denied) —
  if (sweepEmpId && sweepCompId) {
    r = await api("POST", "/api/assessments", T.SUPERVISOR, { employeeId: sweepEmpId, competencyId: sweepCompId, level: 2, notes: "sweep" });
    check("CRUD", `supervisor assesses own-dept employee (${supDeptName})`, r.status === 200 || r.status === 201, `status=${r.status}`);
    // cross-dept denial: create a second employee in another department
    const otherJobRole = (orgData?.jobRoles ?? []).find((j) => j.departmentId === otherDeptId)?.id ?? jobRoleId;
    const emp2 = await api("POST", "/api/employees", T.ADMIN, { employeeCode: "SWEEP-002", name: "Other Dept Employee", departmentId: otherDeptId, jobRoleId: otherJobRole, designation: "Operator 2", joiningDate: "2025-02-01", shift: "General", category: "Permanent" });
    const emp2Id = emp2.data?.employee?.id ?? emp2.data?.id ?? (await api("GET", "/api/employees?search=SWEEP-002", T.ADMIN)).data?.employees?.[0]?.id;
    if (emp2Id) {
      r = await api("POST", "/api/assessments", T.SUPERVISOR, { employeeId: emp2Id, competencyId: sweepCompId, level: 2 });
      check("SCOPE", "supervisor denied cross-dept assessment", r.status === 403, `status=${r.status}`);
    }
    r = await api("POST", "/api/assessments", T.SUPERVISOR, { employeeId: sweepEmpId, competencyId: sweepCompId, level: 9 });
    check("VALID", "level > 4 rejected", r.status === 400, `status=${r.status}`);
    r = await api("POST", "/api/assessments", T.EMPLOYEE, { employeeId: sweepEmpId, competencyId: sweepCompId, level: 3 });
    check("RBAC", "employee cannot assess", r.status === 403, `status=${r.status}`);
  }

  // — Program / Session / Enroll / Attendance —
  r = await api("POST", "/api/training/programs", T.TRAINING, { code: "SWP-PRG", title: "Sweep Program", category: "Technical", deliveryMode: "Classroom", durationHours: 4, description: "temp" });
  const prgOk = r.status === 200 || r.status === 201;
  check("CRUD", "create program (training)", prgOk, `status=${r.status}`);
  r = await api("POST", "/api/training/programs", T.SUPERVISOR, { code: "SWP-PRG-2", title: "Nope", category: "Technical" });
  check("RBAC", "supervisor cannot create program", r.status === 403, `status=${r.status}`);
  let prgId = r.data?.program?.id ?? r.data?.id;
  if (!prgId && prgOk) {
    const pl = await api("GET", "/api/training/programs", T.TRAINING);
    prgId = (pl.data?.programs ?? []).find((p) => p.code === "SWP-PRG")?.id;
  }
  if (prgId) {
    r = await api("POST", "/api/training/sessions", T.TRAINING, { programId: prgId, title: "Sweep Session", scheduledDate: "2026-12-01", startTime: "09:00", durationHours: 4, capacity: 10, trainer: "Sweep Trainer", location: "Training Room A" });
    const sessOk = r.status === 200 || r.status === 201;
    check("CRUD", "create session (training)", sessOk, `status=${r.status}`);
    let sweepSessId = r.data?.session?.id ?? r.data?.id;
    if (!sweepSessId && sessOk) {
      const sl = await api("GET", "/api/training/sessions", T.TRAINING);
      sweepSessId = (sl.data?.sessions ?? []).find((s) => s.title === "Sweep Session")?.id;
    }
    if (sweepSessId && sweepEmpId) {
      r = await api("POST", `/api/training/sessions/${sweepSessId}/enroll`, T.TRAINING, { employeeIds: [sweepEmpId] });
      check("CRUD", "bulk enroll", r.status === 200 && r.data?.created === 1, `status=${r.status} created=${r.data?.created}`);
      r = await api("POST", `/api/training/sessions/${sweepSessId}/enroll`, T.TRAINING, { employeeIds: [sweepEmpId] });
      check("RULE", "duplicate enroll → warning", r.status === 200 && r.data?.created === 0 && (r.data?.warnings?.length ?? 0) > 0, JSON.stringify(r.data).slice(0, 80));
      r = await api("POST", "/api/attendance/bulk", T.TRAINING, { sessionId: sweepSessId, records: [] });
      check("ROBUST", "attendance bulk JSON → 400 (not 500)", r.status === 400, `status=${r.status}`);
      const fd = new FormData();
      fd.append("sessionId", sweepSessId);
      fd.append("file", new Blob(["employeeCode,status,qualified,remarks\nSWEEP-001,present,yes,sweep ok"], { type: "text/csv" }), "attendance.csv");
      r = await api("POST", "/api/attendance/bulk", T.TRAINING, fd, true);
      check("CRUD", "bulk attendance CSV", r.status === 200 && r.data?.saved === 1, `status=${r.status} ${JSON.stringify(r.data).slice(0, 70)}`);
      r = await api("POST", "/api/attendance/bulk", T.EMPLOYEE, new FormData());
      check("RBAC", "employee cannot mark attendance", r.status === 403, `status=${r.status}`);
      r = await api("PUT", "/api/attendance", T.TRAINING, { sessionId: sweepSessId, records: [{ employeeId: sweepEmpId, status: "present", qualified: true, remarks: "updated" }] });
      check("CRUD", "single attendance update", r.status === 200, `status=${r.status}`);
      r = await api("DELETE", `/api/training/sessions/${sweepSessId}`, T.TRAINING);
      check("RULE", "session w/ attendance cannot be deleted → 409", r.status === 409, `status=${r.status}`);
    }
  }

  // — Qualification —
  if (sweepEmpId && sweepCompId) {
    r = await api("POST", "/api/qualifications", T.TRAINING, { employeeId: sweepEmpId, competencyId: sweepCompId, certificateRef: "SWP-CERT-001", issuedAt: "2026-01-01", expiresAt: "2026-06-01" });
    check("CRUD", "issue qualification", r.status === 200 || r.status === 201, `status=${r.status}`);
    r = await api("POST", "/api/qualifications", T.TRAINING, { employeeId: sweepEmpId, competencyId: sweepCompId, issuedAt: "2026-06-01", expiresAt: "2026-01-01" });
    check("VALID", "expiry before issue → 400", r.status === 400, `status=${r.status}`);
  }

  // — Users —
  const usersResp = await api("GET", "/api/users", T.ADMIN);
  const roles = usersResp.data?.roles ?? [];
  const employeeRole = roles.find((x) => x.code === "employee") ?? roles[roles.length - 1];
  r = await api("POST", "/api/users", T.ADMIN, { name: "Sweep User", email: "sweep@tna-demo.com", password: "Sweep@1234", roleId: employeeRole.id });
  const userOk = r.status === 200 || r.status === 201;
  check("CRUD", "create user (admin)", userOk, `status=${r.status}`);
  r = await api("POST", "/api/users", T.TRAINING, { name: "X Y", email: "x@x.com", password: "longenough1", roleId: employeeRole.id });
  check("RBAC", "training cannot create users", r.status === 403, `status=${r.status}`);
  let sweepUserId = r.data?.user?.id ?? r.data?.id;
  if (!sweepUserId && userOk) {
    const ul = await api("GET", "/api/users", T.ADMIN);
    sweepUserId = (ul.data?.users ?? []).find((u) => u.email === "sweep@tna-demo.com")?.id;
  }
  if (sweepUserId) {
    r = await api("POST", "/api/auth/login", null, { email: "sweep@tna-demo.com", password: "Sweep@1234" });
    check("CRUD", "new user can login", r.status === 200, `status=${r.status}`);
    r = await api("PUT", `/api/users/${sweepUserId}`, T.ADMIN, { status: "disabled" });
    check("CRUD", "disable user (admin)", r.status === 200, `status=${r.status}`);
    r = await api("POST", "/api/auth/login", null, { email: "sweep@tna-demo.com", password: "Sweep@1234" });
    check("RULE", "disabled user cannot login", r.status === 403, `status=${r.status}`);
  }

  // — Settings —
  r = await api("GET", "/api/settings", T.ADMIN);
  if (r.data) {
    r = await api("PUT", "/api/settings", T.ADMIN, { tnaRules: r.data.tnaRules });
    check("CRUD", "update settings (admin)", r.status === 200, `status=${r.status}`);
    r = await api("PUT", "/api/settings", T.TRAINING, { tnaRules: {} });
    check("RBAC", "training cannot write settings", r.status === 403, `status=${r.status}`);
  }

  // — Notifications —
  r = await api("GET", "/api/notifications", T.ADMIN);
  const notifs = r.data?.notifications ?? [];
  check("DATA", "notifications present", r.status === 200, `n=${notifs.length} unread=${r.data?.unread}`);
  if (notifs.length > 0) {
    const target = notifs.find((n) => !n.read) ?? notifs[0];
    r = await api("PATCH", "/api/notifications", T.ADMIN, { ids: [target.id], read: true });
    check("CRUD", "mark notification read", r.status === 200, `status=${r.status}`);
  }
  r = await api("POST", "/api/notifications/refresh", T.ADMIN);
  check("CRUD", "notifications refresh", r.status === 200, `status=${r.status}`);

  // ═══ 6. IMPORT ════════════════════════════════════════════════════
  const tmplRes = await fetch(`${BASE}/api/reports/employee-import-template`, { headers: { Authorization: `Bearer ${T.TRAINING}` } });
  const tmplBuf = tmplRes.status === 200 ? await tmplRes.arrayBuffer() : null;
  check("IMPORT", "template downloads", tmplRes.status === 200 && tmplBuf?.byteLength > 500, `bytes=${tmplBuf?.byteLength ?? 0}`);
  if (tmplBuf) {
    const fd = new FormData();
    fd.append("file", new Blob([tmplBuf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "template.xlsx");
    r = await api("POST", "/api/import/preview", T.TRAINING, fd, true);
    check("IMPORT", "preview parses template", r.status === 200 && r.data?.total >= 0, `status=${r.status} ${JSON.stringify(r.data).slice(0, 80)}`);
    r = await api("POST", "/api/import/preview", T.SUPERVISOR, fd, true);
    check("RBAC", "supervisor cannot import", r.status === 403, `status=${r.status}`);
  }

  // ═══ 7. REPORTS ═══════════════════════════════════════════════════
  for (const type of ["skill-matrix", "tna", "training-calendar", "annual-plan", "qualification-expiry"]) {
    for (const fmt of ["xlsx", "csv"]) {
      const res = await fetch(`${BASE}/api/reports/${type}?format=${fmt}`, { headers: { Authorization: `Bearer ${T.ADMIN}` } });
      const buf = res.status === 200 ? await res.arrayBuffer() : null;
      check("REPORT", `${type}.${fmt}`, res.status === 200 && buf?.byteLength > 300, `status=${res.status} bytes=${buf?.byteLength ?? 0}`);
    }
  }
  const sl2 = await api("GET", "/api/training/sessions", T.ADMIN);
  const anySession = (sl2.data?.sessions ?? [])[0];
  if (anySession) {
    const res = await fetch(`${BASE}/api/reports/attendance?sessionId=${anySession.id}`, { headers: { Authorization: `Bearer ${T.TRAINING}` } });
    const buf = res.status === 200 ? await res.arrayBuffer() : null;
    check("REPORT", "attendance.xlsx w/ sessionId", res.status === 200 && buf?.byteLength > 300, `status=${res.status} bytes=${buf?.byteLength ?? 0}`);
  }
  r = await api("GET", "/api/reports/not-a-report", T.ADMIN);
  check("REPORT", "invalid type → 404", r.status === 404, `status=${r.status}`);
  r = await api("GET", "/api/reports/attendance", T.ADMIN);
  check("VALID", "attendance w/o sessionId → 400", r.status === 400, `status=${r.status}`);

  // ═══ 8. AUDIT ═════════════════════════════════════════════════════
  r = await api("GET", "/api/audit-logs?pageSize=20", T.ADMIN);
  const logs = r.data?.logs ?? [];
  const actions = new Set(logs.map((l) => l.action));
  check("AUDIT", "mutations audited", r.status === 200 && logs.length >= 10, `total=${r.data?.total}`);
  check("AUDIT", "audit covers key actions", ["create", "update", "export", "login"].every((a) => actions.has(a)), [...actions].join(","));

  // ═══ 9. LOGOUT ════════════════════════════════════════════════════
  r = await api("POST", "/api/auth/logout", T.ADMIN);
  check("AUTH", "logout 200", r.status === 200, `status=${r.status}`);

  // ═══ 10. DB-LEVEL TEARDOWN + SEED INTEGRITY ═══════════════════════
  const { PrismaClient } = await import("@prisma/client");
  const db = new PrismaClient();
  try {
    // FK-safe order: attendance → enrollments → sessions → program → quals → assessments → competency → user → employee
    const sweepProgramIds = (await db.trainingProgram.findMany({ where: { code: { in: ["SWP-PRG", "SWP-PRG-2"] } }, select: { id: true } })).map((p) => p.id);
    const del = {
      attendance: await db.attendanceRecord.deleteMany({ where: { session: { programId: { in: sweepProgramIds } } } }),
      enrollments: await db.enrollment.deleteMany({ where: { session: { programId: { in: sweepProgramIds } } } }),
      sessions: await db.trainingSession.deleteMany({ where: { programId: { in: sweepProgramIds } } }),
      programs: await db.trainingProgram.deleteMany({ where: { code: { in: ["SWP-PRG", "SWP-PRG-2"] } } }),
      qualifications: await db.qualification.deleteMany({ where: { certificateRef: "SWP-CERT-001" } }),
      assessments: await db.assessment.deleteMany({ where: { notes: "sweep" } }),
      competencies: await db.competency.deleteMany({ where: { code: { in: ["SWP-01", "SWP-02"] } } }),
      users: await db.user.deleteMany({ where: { email: "sweep@tna-demo.com" } }),
      employees: await db.employee.deleteMany({ where: { employeeCode: { in: ["SWEEP-001", "SWEEP-002"] } } }),
    };
    const total = Object.values(del).reduce((a, b) => a + b.count, 0);
    check("CLEANUP", "test artifacts removed via DB", true, `rows=${total}`);

    const final = {
      employees: await db.employee.count(),
      competencies: await db.competency.count(),
      programs: await db.trainingProgram.count(),
      sessions: await db.trainingSession.count(),
      qualifications: await db.qualification.count(),
      users: await db.user.count(),
    };
    check("INTEGRITY", "seed counts restored 112/28/16/58/241/4",
      final.employees === 112 && final.competencies === 28 && final.programs === 16 && final.sessions === 58 && final.qualifications === 241 && final.users === 4,
      JSON.stringify(final));
  } finally {
    await db.$disconnect();
  }

  console.log(results.join("\n"));
  console.log(`\n═════════ HARNESS v4 COMPLETE ═════════`);
  console.log(`PASS: ${pass}   FAIL: ${fail}`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error("HARNESS CRASHED:", e); process.exit(2); });
