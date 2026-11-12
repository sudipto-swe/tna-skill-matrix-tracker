# Production container — TNA & Skill Matrix Tracker
# Build:  docker build -t tna-skill-matrix .
# Run:    docker run -p 3000:3000 -e DATABASE_URL=... -e AUTH_SECRET=... tna-skill-matrix
FROM node:22-alpine AS base

# ── Dependencies ─────────────────────────────────────────────────────────────
FROM base AS deps
WORKDIR /app
COPY package.json bun.lock* package-lock.json* ./
# install with npm (works everywhere); swap for bun/yarn if you prefer
RUN npm install --legacy-peer-deps

# ── Build ────────────────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Dummy values so `next build` can evaluate env at build time (runtime overrides)
ENV DATABASE_URL="file:./build-placeholder.db"
ENV AUTH_SECRET="build-time-placeholder-secret"
RUN npm run build

# ── Runtime ──────────────────────────────────────────────────────────────────
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# prisma schema + seed for operators to run migrations
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server.js"]
