# Architecture

## High-level design

Single Next.js 16 application (App Router) containing both the React 19 frontend and the REST API (Node runtime route handlers). One deployable, typed end-to-end with TypeScript.

```
src/
├── app/
│   ├── page.tsx                  # SPA entry — renders <TnaApp/>
│   ├── layout.tsx                # root layout, metadata
│   └── api/                      # REST backend (27 route handlers)
│       ├── auth/{login,logout,me}/route.ts
│       ├── health/route.ts
│       ├── dashboard/route.ts
│       ├── org/route.ts
│       ├── employees/{route.ts,[id]/route.ts}
│       ├── competencies/{route.ts,[id]/route.ts,role-requirements/route.ts}
│       ├── assessments/route.ts
│       ├── skill-matrix/route.ts
│       ├── tna/route.ts
│       ├── qualifications/route.ts
│       ├── training/{programs/route.ts,sessions/route.ts,sessions/[id]/route.ts,sessions/[id]/enroll/route.ts}
│       ├── attendance/{route.ts,bulk/route.ts}
│       ├── reports/[type]/route.ts        # 6 reports × {xlsx,csv} + import template
│       ├── import/{preview,commit}/route.ts
│       ├── users/{route.ts,[id]/route.ts}
│       ├── audit-logs/route.ts
│       ├── settings/route.ts
│       └── notifications/{route.ts,refresh/route.ts}
├── lib/
│   ├── db.ts          # Prisma client singleton
│   ├── auth.ts        # scrypt hashing, HMAC session tokens, session resolution
│   ├── api.ts         # handleApi guard: auth → RBAC → CSRF → rate-limit → errors
│   ├── rate-limit.ts  # sliding-window limiter (in-memory)
│   ├── audit.ts       # audit logger
│   ├── validation.ts  # Zod schemas (single source of truth)
│   ├── tna.ts         # ★ TNA engine (pure business logic)
│   ├── notifications.ts # alert materialisation from live data
│   └── excel.ts       # ExcelJS workbook builders (6 reports + template)
├── components/app/    # frontend
│   ├── tna-app.tsx    # bootstrap: session → login | shell + view router
│   ├── app-shell.tsx  # navy sidebar, topbar (search/alerts/theme/user), sticky footer
│   ├── login-view.tsx # split-screen login with one-click demo accounts
│   ├── shared.tsx     # design-system atoms (badges, stat cards, chips…)
│   └── views/         # 13 view components
└── store/app-store.ts # Zustand: session, active view, selections
```

## Request lifecycle

Every API route wraps its handler in `handleApi(req, opts, fn)`:

1. **Rate limit** (per-IP, per-route bucket) → 429 with Retry-After.
2. **Session** — verify signed httpOnly cookie, load fresh user + role (disabled users rejected).
3. **RBAC** — required permission checked against the role's permission list → 403 with explicit message.
4. **CSRF** — mutations must carry `X-Requested-With: XMLHttpRequest` (cross-site pages cannot attach custom headers without CORS approval; combined with SameSite=Lax cookies).
5. **Handler** — Zod-parsed input, Prisma queries (parameterised), business logic.
6. **Errors** — `ApiError` → status + message; `ZodError` → 400 + field details; Prisma P2002 → 409; else 500 (logged).
7. **Audit** — sensitive actions recorded (login, mutations, exports, imports).

## The TNA engine (`src/lib/tna.ts`)

Pure, configuration-driven computation over `(employee × role-required competency)` slots:

```
for each employee × required competency:
    current  = latest assessment level (or NULL → "Not Assessed")
    qual     = qualification record (safety competencies)
    gap      = required − current

    rules evaluated (highest severity wins):
      qual expired & (mandatory|safety)   → rules.expiredMandatoryQualification (Critical)
      qual expiring ≤ N days              → High (mandatory) / Medium
      no assessment & safety              → rules.notAssessedSafety (Critical)
      no assessment                       → rules.notAssessed (High)
      assessment older than frequency     → Medium (High if safety)
      gap ≥ 1 & safety-critical           → rules.safetyCriticalGap (Critical)
      gap ≥ 2                             → rules.gapTwoPlus (High)
      gap = 1                             → rules.gapOne (Medium)

    output: status, priority, reasons[], recommendedAction, dueDate, program
```

- Rules live in the `Setting` table (JSON) and are editable in the Settings UI by the Administrator; the engine caches them for 30 s.
- The **skill matrix view is the same data pivoted** — one engine, two presentations, no logic drift.
- **Disclosure**: the model is a transparent rule mapping reflecting L&D practice — *not* a scientifically validated instrument. This is stated in the UI and the README.

## Frontend architecture

- **Single route** (`/`) — the whole application is a client-side SPA (view switching via Zustand), which keeps the deployment surface minimal.
- **TanStack Query** for all server state (caching, invalidation, loading/error states).
- **Design system**: navy/blue/white enterprise palette, shadcn/ui primitives, Recharts dashboards, Framer Motion view transitions, light/dark themes.
- **Responsive**: mobile-first (hamburger nav via Sheet, sticky first table columns, horizontal scroll for wide matrices), ≥44px touch targets, semantic HTML + ARIA throughout.

## Performance notes

- The TNA engine loads the full scoped dataset in 4 queries and indexes in memory (112 employees ≈ 800 slots computes in <100 ms).
- ExcelJS workbooks are generated per-request (streamed as buffers) and not cached — report data must always be live.
- In-memory rate limiter and rule cache suit single-instance deployment; swap for Redis when scaling horizontally (documented limitation).
