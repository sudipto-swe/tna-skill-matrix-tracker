# Security documentation

## Threat model & controls

| Threat | Control | Where |
|---|---|---|
| Password theft | scrypt KDF (N=16384 default, 64-byte key), unique per-user salt, `timingSafeEqual` comparison; no plaintext ever persisted or logged | `src/lib/auth.ts` |
| Session forgery | HMAC-SHA256 signed tokens (`payload.signature`), `AUTH_SECRET` required ≥16 chars in production (fails closed), 8h expiry, tamper-evident payload | `src/lib/auth.ts` |
| Session theft | httpOnly cookie (no JS access), SameSite=Lax, `secure` flag in production, cookie cleared on logout | `login/route.ts` |
| Privilege escalation | 33-granular-permission RBAC enforced **inside every API route** (never only in the UI); role re-loaded fresh from DB per request (disabled users lose access immediately); supervisors hard-scoped to own department server-side | `src/lib/api.ts`, each route |
| CSRF | Mutations require `X-Requested-With` custom header (impossible for cross-origin attackers without CORS approval) + SameSite=Lax cookies | `src/lib/api.ts` |
| Brute force | Sliding-window rate limit on login: 20 requests / 5 min / IP → 429 + Retry-After; general per-route buckets; failed logins audit-logged with IP | `src/lib/rate-limit.ts` |
| SQL injection | Prisma parameterised queries exclusively; no raw string SQL (single `$queryRaw` in `/api/health` contains no user input) | all routes |
| XSS | React automatic escaping; zero `dangerouslySetInnerHTML`; API returns JSON only | frontend |
| Input abuse | Zod schemas on every endpoint (types, enums, lengths, regex, dates); multipart limits (2 MB import files, 500-row cap, 300-record attendance cap) | `src/lib/validation.ts` |
| Mass assignment | Explicit field whitelists in create/update handlers (never spread raw bodies into Prisma) | routes |
| Enumeration | Login failures return a generic message for unknown email vs wrong password | `auth/login` |
| Unauthorised data scoping | Department scope assertion on employee/qualification/TNA/assessment reads; self-scope for employee role | routes |
| Missing accountability | Audit log: login success/failure, logout, create/update/delete, exports, imports — user, role, action, entity, entity id, details, IP, timestamp | `src/lib/audit.ts` |
| Secret leakage | `.env` git-ignored; `.env.example` documents variables; secrets never hard-coded; audit/details never include credentials | repo hygiene |
| Account takeover via user mgmt | Cannot disable own account; cannot demote/disable the last active administrator; employee link uniqueness | `users/[id]/route.ts` |
| Upload attacks | Extension + size validation; ExcelJS parses in-memory (no execution); filenames never used for storage paths | `import/preview`, `attendance/bulk` |

## Rate limiting details

| Bucket | Limit |
|---|---|
| `POST /api/auth/login` | 20 / 5 min / IP |
| `POST /api/import/*` | 20 / min / IP |
| All other routes | default (no bucket unless specified) |

In-memory implementation → single instance. For multi-instance deployments, back the limiter with Redis (documented limitation).

## Security verification performed

- ✅ CSRF guard: mutation without custom header → `403 {"code":"csrf"}` (tested via curl)
- ✅ RBAC negative tests: employee → `POST /api/assessments` (403), supervisor → `GET /api/users` (403), supervisor cross-department employee read (403)
- ✅ Auth: wrong password → 401 generic message + `login_failed` audit entry
- ✅ Rate limit: enforced by limiter logic; login bucket exercised during QA

## Reporting

Found a vulnerability? Please open a GitHub issue with details (this is a portfolio project — no bug bounty).

## Backup guidance

- SQLite (sandbox): copy `db/custom.db` while the server is stopped (or use `VACUUM INTO`).
- PostgreSQL (production): `pg_dump` nightly + point-in-time recovery from the managed provider (Supabase/Neon automate this); retain ≥30 days. Export workbooks are regenerable from live data and need no backup.
