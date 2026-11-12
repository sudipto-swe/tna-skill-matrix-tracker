# Contributing

Thanks for your interest in improving the **TNA & Skill Matrix Tracker**! This is a portfolio project, but issues, discussions and pull requests are welcome.

## Getting set up

```bash
bun install                # or: npm install
cp .env.example .env       # set DATABASE_URL + AUTH_SECRET (any long random string for local dev)
bun run db:push            # create the SQLite schema
bun run db:seed            # synthetic dataset + demo users
bun run dev                # http://localhost:3000
```

Requirements: **Bun 1.x** (recommended) or Node 20+ with npm. No other services are needed — the default database is SQLite.

## Scripts

| Command | What it does |
|---|---|
| `bun run dev` | Start the Next.js dev server (port 3000) |
| `bun run lint` | ESLint (Next.js + TypeScript rules) — must pass with **0 errors, 0 warnings** |
| `bun run build` | Production build (includes type-check) |
| `bun run db:push` | Apply `prisma/schema.prisma` to the database |
| `bun run db:seed` | (Re)generate the deterministic synthetic dataset |
| `bun run db:generate` | Regenerate the Prisma client after schema changes |
| `bun run test:api` | 173-check API regression harness — requires the dev server running and a freshly seeded DB |

## Project conventions

- **TypeScript strict mode** everywhere; no `any` unless unavoidable (and then justify it in a comment).
- **Zod schemas** in `src/lib/validation.ts` are the single source of truth for API input shapes — new endpoints must validate through them.
- **Every API route** wraps its handler in `handleApi(req, opts, fn)` from `src/lib/api.ts`, which provides session auth, RBAC, CSRF and rate limiting. Never read the DB from a route without it.
- **Business logic lives in `src/lib/`** (e.g. the TNA engine) — keep route handlers thin.
- **UI**: use the existing shadcn/ui primitives in `src/components/ui/` and the design atoms in `src/components/app/shared.tsx`; follow the established navy/white enterprise palette. All views must remain responsive (mobile-first) and dark-mode compatible.
- **Audit trail**: any mutation, export or import performed by a route must be audit-logged via `src/lib/audit.ts`.

## Before opening a pull request

1. `bun run lint` → 0 problems.
2. `bun run build` → succeeds (this also type-checks).
3. `bun run test:api` against a freshly seeded DB → 173/173 PASS.
4. Manually exercise the affected views in **all four roles** — RBAC differences are easy to break and the harness does not cover pixel-level UI.
5. Update `docs/` if you changed contracts (API, schema, deployment) and add a line to `CHANGELOG.md` under *Unreleased*.

## Commit style

Conventional-ish, imperative mood: `fix: supervisor cross-department 403 on employee profile`, `feat: qualification expiry CSV column`, `docs: document SMTP env vars`.

## Reporting issues

Include: what you did, what you expected, what happened, the role you were signed in as, and any relevant entry from the in-app **Audit Logs** view (Administrator) or server logs.
