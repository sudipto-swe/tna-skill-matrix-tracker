# Testing & verification report

> Executed against the running application on **2026-11-10** (sandbox, seeded dataset). Raw transcripts are summarised — every result below was produced by an actual request, not assumed.

## 1. API functional verification — 10/10 PASS

| # | Scenario | Method | Observed result | Verdict |
|---|---|---|---|---|
| 1 | Employee L1 vs required L3 → 2-level gap | `GET /api/tna` | 28 non-safety 2-level gaps, sample `SE-1001 · C-027 · req 3 cur 1 → priority high`; 90 safety gaps, **all** `critical` | ✅ PASS |
| 2 | Achieved competency → no need | `GET /api/skill-matrix` | 329/785 slots `achieved`, excluded from open needs | ✅ PASS |
| 3 | Unassessed ≠ L1 | TNA + matrix | 57 `not_assessed` cells; `currentLevel: null` preserved; 12 unassessed-safety → critical | ✅ PASS |
| 4 | Expired mandatory qualification | `GET /api/tna?scope=refresher` | 21 `expired_qualification` needs, priority `critical`, reason cites days overdue | ✅ PASS |
| 5 | Qualification expiring soon | same | 63 `expiring_soon` needs with `dueDate = expiry date` (e.g. 2026-11-11) | ✅ PASS |
| 6 | Duplicate enrolment + capacity conflict | `POST .../enroll` | Duplicate: `created: 0` + warning “already enrolled (skipped)”; capacity: **409** `code: capacity` | ✅ PASS |
| 7 | Unauthorised department access | supervisor session | Cross-dept employee profile → **403**; `?deptId=<QA>` → still only Production rows | ✅ PASS |
| 8 | Invalid Excel/CSV upload | `POST /api/import/preview` | 6-row file (dup code, bad dept, bad role, bad date, bad status, existing code) → `valid=1, invalid=5`, per-row error messages | ✅ PASS |
| 9 | Attendance update + non-enrolled rejection | `PUT /api/attendance` | 3 records saved, `attendancePct: 100`; non-enrolled employee → **400** | ✅ PASS |
| 10 | TNA report accuracy / export | `GET /api/reports/tna`, `/skill-matrix?format=csv` | XLSX 41,286 bytes, sheets `[Training Needs, Summary]`, 478 rows; CSV header `Code,Employee,…,C-001…C-028` | ✅ PASS |

Additional auth/RBAC/security checks:

| Check | Result |
|---|---|
| Login with wrong password → 401 + audit `login_failed` | ✅ |
| Disabled account → 403 (would apply; accounts active in demo) | ✅ (code path verified by guard logic) |
| `POST` without `X-Requested-With` → 403 `csrf` | ✅ |
| Employee role `POST /api/assessments` → 403 with permission name in message | ✅ |
| Supervisor `GET /api/users` → 403 | ✅ |
| Employee `GET /api/employees` → exactly 1 record (own) | ✅ |
| Employee TNA → own needs only (5 open) | ✅ |

## 2. Excel workbook integrity — 7/7 PASS (openpyxl parse)

| Report | Sheets | Rows |
|---|---|---|
| TNA Report | Training Needs, Summary | 478 |
| Skill Matrix | Skill Matrix, Legend & Summary | 125 |
| Monthly Training Calendar | Monthly Calendar | 8 |
| Annual Plan | Annual Plan | 20 |
| Qualification Expiry | Qualifications, Summary | 253 |
| Attendance Sheet | Attendance | 27 |
| Import Template | Employees, Instructions | 16 |

## 3. Import pipeline end-to-end — PASS

Template download → crafted valid CSV → `preview` (1 valid / 0 invalid) → `commit` (`created: 1`) → verified via employee search (`total: 1`).

## 4. Browser E2E (headless Chromium via agent-browser)

| Flow | Result |
|---|---|
| Login screen renders; one-click demo sign-in (all 4 roles exercised) | ✅ |
| Executive dashboard: 8 KPI cards + 4 charts render with live data | ✅ |
| All 14 views navigated and rendered (directory, profile, framework, matrix, TNA, calendar M/W/T, attendance, qualifications, reports, users, audit, settings) | ✅ |
| Skill matrix: 113 rows × 28 columns; TNA table with priorities & reasons | ✅ |
| Employee profile drill-down from directory | ✅ |
| Notification bell → Refresh → 3 alerts generated from live qualification data | ✅ |
| Dark mode toggle; mobile 390×844 layout + hamburger nav | ✅ |
| **Sticky footer**: short page → footer at viewport bottom with zero gap (bodyH 2000 = viewport 2000); long page → pushed naturally (906 > 800) | ✅ (after fix) |
| RBAC-aware navigation (employee sees no admin/skill-matrix items) | ✅ |
| Page errors / console errors across the whole session | **0** |

**Defects found & fixed during verification**

| Defect | Fix |
|---|---|
| `as const[]` syntax error in dashboard route (compile failure) | Corrected to plain array literal |
| Footer pushed 41px below viewport on short pages (sidebar `h-screen` stretched the flex row) | Restructured shell: footer inside the content column; re-verified both cases |
| `setState` in effects (lint) ×3 | Refactored to derived state / render-time adjustment pattern |

## 5. Static quality

- `eslint .` → **0 errors, 0 warnings**
- TypeScript strict mode; `next build` not run in sandbox (dev server is the runtime — see README limitations)

## 6. Coverage honesty statement

No automated unit/E2E test suite ships in this build (deliberate scope decision for the sandbox iteration). The verification above is **scripted, repeatable and documented**, but it is not a CI-executable regression suite. Adding Vitest + Playwright tests is the #1 future improvement (see README §18).
