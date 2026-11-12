/**
 * In-memory sliding-window rate limiter.
 * Suitable for the single-instance sandbox deployment; swap for Redis in a
 * multi-instance production setup (documented in README).
 */
const buckets = new Map<string, { hits: number[]; }>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  let entry = buckets.get(key);
  if (!entry) {
    entry = { hits: [] };
    buckets.set(key, entry);
  }
  entry.hits = entry.hits.filter((t) => now - t < windowMs);
  if (entry.hits.length >= limit) {
    const oldest = entry.hits[0];
    return { allowed: false, remaining: 0, retryAfterSeconds: Math.ceil((windowMs - (now - oldest)) / 1000) };
  }
  entry.hits.push(now);
  // opportunistic cleanup
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      if (v.hits.length === 0 || now - v.hits[v.hits.length - 1] > windowMs * 2) buckets.delete(k);
    }
  }
  return { allowed: true, remaining: limit - entry.hits.length, retryAfterSeconds: 0 };
}

export function getClientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
