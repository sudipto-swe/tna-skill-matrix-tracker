/**
 * Runtime self-healing for the database.
 *
 * The sandbox/hosting environment may reset the SQLite database file to its
 * initial empty state (schema present, zero rows). Instead of relying on a
 * one-off manual seed, the app detects an empty database at runtime and seeds
 * the synthetic dataset automatically:
 *
 *  - `src/instrumentation.ts` → once per server boot
 *  - `/api/auth/login`        → before credential validation
 *  - `/api/health`            → on health probes
 *
 * Every call performs a real probe of the file on disk via a dedicated
 * short-lived connection — results are never cached across calls, so a
 * database wiped or swapped WHILE the server keeps running is detected too.
 * Concurrent callers share a single in-flight run (state on `globalThis`,
 * visible to every module instance in the process).
 *
 * The shared Prisma client can hold an open handle to a deleted/replaced db
 * file: reads still work (ghost data), writes fail with SQLITE_READONLY.
 * When its view diverges from the on-disk state it is forced to reconnect
 * (Prisma reconnects lazily on the next query after $disconnect).
 */
import { PrismaClient } from "@prisma/client";
import { db } from "./db";

export interface SeedStatus {
  seeded: boolean;
  users: number;
}

interface SeedState {
  promise: Promise<SeedStatus>;
  done: boolean; // true once settled successfully
}

const g = globalThis as typeof globalThis & { __tnaSeedState?: SeedState };

async function runEnsureSeeded(): Promise<SeedStatus> {
  // 1. Probe the actual file on disk with a dedicated short-lived connection.
  let fileUsers = 0;
  const probe = new PrismaClient({ log: ["error"] });
  try {
    fileUsers = await probe.user.count();
  } catch (e) {
    console.error("[ensure-seed] Probe failed:", e);
  } finally {
    await probe.$disconnect().catch(() => {});
  }

  // 2. What the shared client sees right now (-1 = query failed).
  const sharedUsers = await db.user.count().catch(() => -1);

  // 3. Drop the shared client's pooled connections BEFORE any seeding, so
  //    that (a) a stale handle to a deleted file is released, and (b) code
  //    used during seeding that goes through the shared client (e.g. the
  //    notification refresh) writes to the CURRENT file.
  let seeded = false;
  if (fileUsers === 0 || sharedUsers !== fileUsers) {
    await db.$disconnect().catch(() => {});
  }

  // 4. Seed if the file on disk is empty.
  if (fileUsers === 0) {
    console.log(
      "[ensure-seed] Empty database detected — seeding synthetic dataset automatically…"
    );
    // Import lazily so the (large) seed module is only loaded when needed.
    const { seedDatabase } = await import("../../prisma/seed");
    const res = await seedDatabase();
    seeded = res.seeded;
  }

  // 5. Report from the (re)connected shared client.
  const users = await db.user.count();
  if (seeded) {
    console.log(`[ensure-seed] Seed complete — ${users} user account(s) ready.`);
  }
  return { seeded, users };
}

function startRun(): SeedState {
  const state: SeedState = {
    promise: runEnsureSeeded()
      .then((r) => {
        if (g.__tnaSeedState) g.__tnaSeedState.done = true;
        return r;
      })
      .catch((e) => {
        // Allow a later request to retry instead of caching the failure.
        g.__tnaSeedState = undefined;
        throw e;
      }),
    done: false,
  };
  g.__tnaSeedState = state;
  return state;
}

/**
 * Ensures the database is seeded and the shared client points at the current
 * file. Concurrent callers share one in-flight run; sequential callers always
 * get a fresh probe (no stale success caching).
 */
export function ensureSeeded(): Promise<SeedStatus> {
  if (!g.__tnaSeedState || g.__tnaSeedState.done) startRun();
  return g.__tnaSeedState!.promise;
}

/** Never-throw variant for call sites that must not fail because of seeding. */
export async function ensureSeededSafe(): Promise<SeedStatus | null> {
  try {
    return await ensureSeeded();
  } catch (e) {
    console.error("[ensure-seed] Automatic seeding failed:", e);
    return null;
  }
}
