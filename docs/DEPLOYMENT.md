# Deployment guide

The application ships as a **single Next.js 16 service** backed by Prisma. Two supported paths:

## Option A — Vercel + managed PostgreSQL (recommended for demos)

1. **Database** — create a PostgreSQL database (Supabase / Neon free tiers work). Copy the connection string.
2. **Push the schema** (one-time, from your machine):
   ```bash
   DATABASE_URL="postgresql://…" bunx prisma db push
   DATABASE_URL="postgresql://…" bun run db:seed        # optional demo data
   ```
3. **Vercel** — import the Git repository; set environment variables:
   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | `postgresql://…` (pooled connection string) |
   | `AUTH_SECRET` | `openssl rand -hex 32` output |
4. Deploy. Verify `GET /api/health` → `{"status":"ok","database":"connected"}`.
5. Sign in with the demo accounts (change/remove them for any real use).

> SQLite is not suitable for Vercel serverless (ephemeral FS) — PostgreSQL is required here.

## Option B — Docker (any host)

A production Dockerfile is included (`Dockerfile`, standalone output):

```bash
docker build -t tna-skill-matrix .
docker run -p 3000:3000 \
  -e DATABASE_URL="postgresql://…" \
  -e AUTH_SECRET="$(openssl rand -hex 32)" \
  tna-skill-matrix
```

### docker-compose (app + PostgreSQL, fastest path)

A self-contained stack is included — app container, PostgreSQL 16, and a one-time initializer that pushes the schema and loads the synthetic dataset:

```bash
# 1) Start PostgreSQL + the app (health-checked, on http://localhost:3000)
docker compose up -d --build

# 2) One-time: create the schema + seed the demo data
docker compose --profile tools run --rm init

# 3) Sign in with a demo account (README §10)
```

For anything beyond a local demo, put a real `AUTH_SECRET` in a `.env` file next to `docker-compose.yml` (compose loads it automatically) before step 1.

## CI

`.github/workflows/ci.yml` runs on every push/PR:
1. `bun install`
2. `bun run lint`
3. `bun run build` (type-check + production compile)

## Environment variables

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | SQLite `file:…` or PostgreSQL URL |
| `AUTH_SECRET` | production | ≥16 chars; app **fails closed** without it in production |
| `SMTP_HOST/PORT/USER/PASS/FROM` | no | Email notifications remain honestly disabled until configured |

## Post-deployment checklist

- [ ] `GET /api/health` returns `ok` with DB connected
- [ ] Login works with all demo roles
- [ ] Dashboard KPIs load (proves DB + TNA engine)
- [ ] Generate one report of each type (audit trail records the exports)
- [ ] Configure real TNA rule weights in Settings (Administrator)
- [ ] Remove or re-password demo accounts for non-portfolio use
- [ ] Set up database backups (see `docs/SECURITY.md`)

## Error monitoring guidance

- The API logs errors server-side (`console.error` in `handleApi`) — pipe platform logs to your monitor (Vercel Integrations / Sentry self-hosted).
- `GET /api/health` is designed for uptime checks (returns 503 when the DB is unreachable).
- Audit logs provide user-level forensics for data incidents.

## Sandbox note

This repository was developed in a managed sandbox where the Next.js **dev server on port 3000** is the running instance (SQLite at `db/custom.db`). The Preview Panel in that environment is the live demo surface. The production steps above apply when taking the code to your own infrastructure.
