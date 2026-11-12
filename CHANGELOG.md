# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.1] — 2026-11-12

### Added
- `docker-compose.yml` — one-command local production stack (app + PostgreSQL 16 + schema/seed initializer profile).
- `CONTRIBUTING.md` and this changelog; repository-layout section in the README.

### Changed
- `package.json` metadata: proper package name (`tna-skill-matrix-tracker`) and description.
- README quick-start rewritten to be standalone (no sandbox references).

## [0.2.0] — 2026-11-11

### Added
- **Database self-healing**: the app seeds the synthetic dataset automatically when it finds an empty database (at server boot via `instrumentation.ts`, on login and on health probes) — an environment/database reset can no longer lock users out with "Invalid email or password".
- Bearer-token session transport alongside the httpOnly cookie (cross-site preview environments drop `SameSite=Lax` cookies; the client now stores the session token and sends `Authorization: Bearer` as a fallback).
- 173-check API regression harness (`scripts/api-sweep.mjs`, `bun run test:api`) covering auth, the 19-endpoint × 4-role RBAC matrix, data scoping, seed contracts, TNA business rules, full CRUD lifecycles, imports, reports and the audit trail.

### Fixed
- Four API routes whose in-route 403 responses were silently swallowed into `200 {}` by the response wrapper (RBAC hardening).
- `POST /api/attendance/bulk` returned 500 on non-form bodies → now a proper 400.
- Calendar session detail: attendance badge never rendered (type bug); "Record Attendance" button never showed for past sessions (type bug).
- React-Query cache was not isolated between user sessions (Providers cache-key bug) — stale data could leak across sign-ins.
- 11 TypeScript strict-mode errors; Radix dialog accessibility warnings.
- Sticky-footer layout defect on short pages (footer pushed 41px below the viewport).

### Changed
- Login rate limit retuned 10 → 20 requests / 5 min / IP for smoother demo account switching.

## [0.1.0] — 2026-11-10

### Added
- Initial complete system: employee management, competency framework with role-requirement matrix, interactive skill matrix, rule-based TNA engine with configurable priorities, training calendar with conflict/capacity guards, attendance tracking (incl. bulk CSV), qualification expiry monitoring with alert buckets, 6 styled XLSX reports + CSV exports, CSV/XLSX employee import wizard.
- 4 RBAC roles (Administrator, Training Officer, Department Supervisor, Employee) with 33 server-enforced permissions and supervisor department scoping.
- Authentication: scrypt password hashing, HMAC-SHA256 signed httpOnly session cookies, CSRF custom-header defence, per-route rate limiting.
- Deterministic synthetic dataset (seeded PRNG): 8 departments, 18 production areas, 27 job roles, 112 employees, 28 competencies, 180 role requirements, 728 assessments, 241 qualifications, 16 programs, 58 sessions.
- 17-model normalised Prisma schema (SQLite default, PostgreSQL-portable).
- Documentation set (`docs/`: ARCHITECTURE, API, DATABASE, DEPLOYMENT, SECURITY, TESTING + 17 screenshots), GitHub Actions CI, production Dockerfile, MIT license.
