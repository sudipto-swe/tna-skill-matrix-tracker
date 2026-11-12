# API reference

Base URL: `/api` · All responses JSON unless noted · Auth via `tna_session` httpOnly cookie (set by login).

**Conventions**
- Mutations (`POST/PUT/PATCH/DELETE`) require the `X-Requested-With: XMLHttpRequest` header (CSRF defence).
- Errors: `{ "error": string, "code": string|null, "details": any|null }` with proper HTTP status (400 validation, 401 unauthenticated, 403 permission/CSRF/scope, 404 not found, 409 conflict, 429 rate-limited, 500 internal).
- Permission names below refer to the RBAC matrix (see Settings → User Management in the app for the full live matrix).

## Authentication

| Method | Path | Permission | Description |
|---|---|---|---|
| POST | `/auth/login` | public (20 req/5 min/IP) | `{email, password}` → sets session cookie, returns user + permissions. Failures audit-logged. |
| POST | `/auth/logout` | public | Clears cookie, audit-logged. |
| GET | `/auth/me` | public | 200 with session user, or 401. |

## Dashboard & org

| Method | Path | Permission | Description |
|---|---|---|---|
| GET | `/health` | public | `{status, database, time}` — used by monitors. |
| GET | `/dashboard` | `dashboard:view` | Role-scoped: management KPIs (employees, compliance %, gaps, criticals, upcoming, overdue quals, 6-month trend, level distribution, top gaps, critical list) or personal dashboard for the employee role. |
| GET | `/org` | `dashboard:view` | Departments (+areas), job roles, shifts/statuses/categories lists. |

## Employees

| Method | Path | Permission | Description |
|---|---|---|---|
| GET | `/employees` | `employees:read:all\|dept\|self` | Filters: `search, deptId, roleId, shift, status, category, page, pageSize`. Supervisors force-scoped to own dept; employee role → own record only. |
| POST | `/employees` | `employees:write` | Create (department derived from job role). |
| GET | `/employees/:id` | role-scoped | Full profile: employee, assessments, qualifications, training history, TNA needs. |
| PUT | `/employees/:id` | `employees:write` | Update. |

## Competency framework

| Method | Path | Permission | Description |
|---|---|---|---|
| GET | `/competencies` | `competencies:read` | Filters `category, deptId, search`; includes `requiredBy` roles and counts. |
| POST | `/competencies` | `competencies:write` | Create competency. |
| GET | `/competencies/:id` | `competencies:read` | Detail + requirements + level distribution stats. |
| PUT | `/competencies/:id` | `competencies:write` | Update. |
| PUT | `/competencies/role-requirements` | `competencies:write` | Upsert `{jobRoleId, competencyId, requiredLevel}`. |
| DELETE | `/competencies/role-requirements?jobRoleId&competencyId` | `competencies:write` | Remove requirement. |

## Assessments, matrix, TNA

| Method | Path | Permission | Description |
|---|---|---|---|
| GET | `/assessments?employeeId[&competencyId]` | read (scoped) | Assessment history (newest first). |
| POST | `/assessments` | `assessments:write` | `{employeeId, competencyId, level 1-4, notes?}` — supervisors restricted to own department. |
| GET | `/skill-matrix` | `skillmatrix:read:all\|dept` | Params `deptId, roleId, shift, category, search` → competencies (columns), rows (cells with level/required/compliance), per-competency summary. |
| GET | `/tna` | `tna:read:all\|dept\|self` | Params `scope=individual\|department\|role\|critical\|refresher`, `deptId, roleId, priority, category, search` → needs[] (with reasons, actions, due dates), summary, byRole, rules. |

## Training & attendance

| Method | Path | Permission | Description |
|---|---|---|---|
| GET | `/training/programs` | `training:read` | Program catalogue. |
| POST | `/training/programs` | `training:write` | Create program. |
| GET | `/training/sessions` | `training:read` | `from, to, status` filters; includes enrolled counts. |
| POST | `/training/sessions` | `training:write` | Schedule — **409** on same title+location same day, or trainer double-booking. |
| GET | `/training/sessions/:id` | `training:read` | Session + roster (enrolments merged with attendance). |
| PUT | `/training/sessions/:id` | `training:write` | Update/status changes (capacity ≥ enrolments enforced; cancel blocked when attendance exists). |
| DELETE | `/training/sessions/:id` | `training:write` | Delete only when no attendance. |
| POST | `/training/sessions/:id/enroll` | `training:write` | `{employeeIds[]}` — skips duplicates, **409** on capacity breach, skips inactive/unknown. |
| DELETE | `/training/sessions/:id/enroll?employeeId` | `training:write` | Remove enrolment (blocked if attendance recorded). |
| PUT | `/attendance` | `attendance:write` | `{sessionId, records[{employeeId, status, qualified, remarks}]}` — upserts, syncs enrolment status, rejects non-enrolled. |
| POST | `/attendance/bulk` | `attendance:write` | multipart `sessionId` + CSV `employeeCode,status,qualified,remarks`; per-line error report. |

## Qualifications, notifications

| Method | Path | Permission | Description |
|---|---|---|---|
| GET | `/qualifications` | `qualifications:read:*` | `bucket=all\|expired\|expiring_7\|expiring_30\|valid`, `deptId, competencyId, search`; returns counts per bucket. |
| POST | `/qualifications` | `qualifications:write` | Issue/renew (upsert per employee×competency). |
| GET | `/notifications` | `notifications:read` | User + role-broadcast notifications, unread count. |
| PATCH | `/notifications` | `notifications:read` | Mark read `{ids[]}` or `{all:true}`. |
| POST | `/notifications/refresh` | `notifications:read` | Recompute alerts from live data (expiry buckets, upcoming sessions). |

## Reports & imports

| Method | Path | Permission | Description |
|---|---|---|---|
| GET | `/reports/:type?format=xlsx\|csv` | `reports:generate` | `:type` ∈ `skill-matrix` · `tna` · `training-calendar` (+`month=YYYY-MM`) · `annual-plan` (+`year`) · `attendance` (+`sessionId`) · `qualification-expiry` · `employee-import-template`. XLSX styled workbooks; CSV with BOM. Supervisors forced to own department. Every export audit-logged. |
| POST | `/import/preview` | `import:execute` | multipart CSV/XLSX (≤2 MB, ≤500 rows) → validated rows + per-row errors. Nothing saved. |
| POST | `/import/commit` | `import:execute` | `{rows[]}` — server re-validates, creates employees transactionally, returns created/failed. |

## Administration

| Method | Path | Permission | Description |
|---|---|---|---|
| GET | `/users` | `users:manage` | Users + roles with permissions. |
| POST | `/users` | `users:manage` | Create (email unique, employee link unique, scrypt hash). |
| PUT | `/users/:id` | `users:manage` | Update role/link/status/password. Guards: cannot disable self; cannot demote last active administrator. |
| GET | `/audit-logs` | `audit:read` | Filters `user, action, entity, from, to, page` (25/page). |
| GET | `/settings` | `settings:read` | TNA rules + alert thresholds + SMTP status. |
| PUT | `/settings` | `settings:write` | Update rules/thresholds (Zod-validated); TNA cache invalidated. |
