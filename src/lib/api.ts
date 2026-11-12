/**
 * API route guard + error handling.
 *
 * Every route handler wraps its logic in `handle()`:
 *  - resolves the session (httpOnly signed cookie)
 *  - enforces RBAC permission server-side
 *  - enforces CSRF protection for mutations (custom header, See auth notes)
 *  - normalises errors (ApiError / ZodError / unexpected 500)
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ZodError } from "zod";
import { getSessionUser, hasPermission, type SessionUser } from "./auth";
import { rateLimit, getClientIp } from "./rate-limit";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public details?: unknown
  ) {
    super(message);
  }
}

export async function requireSession(req: NextRequest, permission?: string): Promise<SessionUser> {
  const session = await getSessionUser(req);
  if (!session) throw new ApiError(401, "Authentication required. Please sign in.");
  if (permission && !hasPermission(session, permission)) {
    throw new ApiError(403, `Access denied: your role (${session.roleName}) lacks the "${permission}" permission.`);
  }
  return session;
}

/**
 * CSRF defence: state-changing requests must carry the X-Requested-With header
 * (set by our fetch client). Cross-site attackers cannot attach custom headers
 * without a CORS preflight, which this API never approves. Combined with the
 * SameSite=Lax session cookie this blocks CSRF in practice.
 */
function assertCsrf(req: NextRequest) {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method.toUpperCase())) return;
  if (req.headers.get("x-requested-with") === "XMLHttpRequest") return;
  throw new ApiError(403, "Cross-site request rejected.", "csrf");
}

export interface GuardOptions {
  permission?: string;
  /** rate limiting: max requests per window for this route (per IP) */
  limit?: { max: number; windowMs: number };
  public?: boolean;
}

export async function handleApi(
  req: NextRequest,
  opts: GuardOptions,
  fn: (session: SessionUser) => Promise<unknown>
): Promise<NextResponse> {
  try {
    if (opts.limit) {
      const rl = rateLimit(`${getClientIp(req)}:${new URL(req.url).pathname}`, opts.limit.max, opts.limit.windowMs);
      if (!rl.allowed) {
        return NextResponse.json(
          { error: `Too many requests. Try again in ${rl.retryAfterSeconds}s.`, code: "rate_limited" },
          { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
        );
      }
    }
    // CSRF defence applies to ALL state-changing requests, including the
    // public login route (blocks "login CSRF" where an attacker site silently
    // logs the victim into the attacker's account).
    assertCsrf(req);
    const session = opts.public ? (await getSessionUser(req)) ?? ANONYMOUS : await requireSession(req, opts.permission);
    const data = await fn(session);
    // Pass through pre-built responses unchanged. NOTE: this checks `Response`
    // (not `NextResponse`): NextResponse extends Response, and a route returning
    // a plain Response.json({error}, {status:403}) must keep its status code —
    // serialising it as data would silently swallow the error into a 200 {}.
    if (data instanceof Response) return data as NextResponse;
    return NextResponse.json(data ?? { ok: true });
  } catch (e) {
    if (e instanceof ApiError) {
      return NextResponse.json({ error: e.message, code: e.code ?? null, details: e.details ?? null }, { status: e.status });
    }
    if (e instanceof ZodError) {
      return NextResponse.json(
        { error: "Validation failed.", code: "validation", details: e.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
        { status: 400 }
      );
    }
    // Prisma known errors
    const err = e as { code?: string; message?: string };
    if (err?.code === "P2002") {
      return NextResponse.json({ error: "A record with the same unique value already exists.", code: "unique_violation" }, { status: 409 });
    }
    if (err?.code === "P2025") {
      return NextResponse.json({ error: "Record not found.", code: "not_found" }, { status: 404 });
    }
    if (err?.code === "P2003") {
      return NextResponse.json(
        { error: "Referenced record does not exist or does not match (foreign key constraint). Check the related entity.", code: "fk_violation" },
        { status: 400 }
      );
    }
    console.error("[api-error]", req.method, req.url, e);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}

const ANONYMOUS: SessionUser = {
  userId: "", name: "Anonymous", email: "", roleCode: "anonymous", roleName: "Anonymous",
  permissions: [], employeeId: null, employeeCode: null, departmentId: null, departmentName: null,
};

/** Scope helper: supervisors are restricted to their own department. */
export function assertDepartmentScope(session: SessionUser, departmentId: string | null | undefined): string | null {
  if (session.roleCode === "department_supervisor") {
    return session.departmentId; // always force own dept
  }
  return departmentId ?? null;
}

export function isScopedToOwnDepartment(session: SessionUser): boolean {
  return session.roleCode === "department_supervisor";
}
