/**
 * Next.js server instrumentation — runs once when the server process boots.
 *
 * Guarantees the database is never empty: if the environment reset the SQLite
 * file (schema only, zero rows), the synthetic dataset is seeded automatically
 * before the first request is served. Any failure here must never block
 * server startup — the login and health routes re-run the check as a fallback.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { ensureSeededSafe } = await import("./lib/ensure-seed");
      await ensureSeededSafe();
    } catch (e) {
      console.error("[instrumentation] Startup seed check failed:", e);
    }
  }
}
