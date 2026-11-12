/**
 * Authentication core — password hashing (scrypt) + signed session tokens.
 *
 * - Passwords: scrypt KDF with per-user random salt (no plaintext ever stored).
 * - Sessions: stateless HMAC-SHA256 signed tokens in an httpOnly, SameSite=Lax
 *   cookie (8h expiry). Secret comes from AUTH_SECRET env var.
 * - Enforced server-side on every API route (see lib/api.ts).
 */
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { db } from "./db";

export const SESSION_COOKIE = "tna_session";
const SESSION_HOURS = 8;

function getSecret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("AUTH_SECRET must be set in production (>= 16 chars).");
    }
    return "tna-dev-only-secret-change-me";
  }
  return s;
}

// ── password hashing ─────────────────────────────────────────────────────────
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [scheme, salt, hash] = stored.split(":");
    if (scheme !== "scrypt" || !salt || !hash) return false;
    const test = scryptSync(password, salt, 64);
    return timingSafeEqual(Buffer.from(hash, "hex"), test);
  } catch {
    return false;
  }
}

// ── signed tokens ────────────────────────────────────────────────────────────
const b64url = (buf: Buffer) => buf.toString("base64url");

interface TokenPayload {
  uid: string;
  exp: number; // epoch ms
}

export function createSessionToken(userId: string): string {
  const payload: TokenPayload = { uid: userId, exp: Date.now() + SESSION_HOURS * 3600_000 };
  const body = b64url(Buffer.from(JSON.stringify(payload)));
  const sig = createHmac("sha256", getSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifySessionToken(token: string): TokenPayload | null {
  try {
    const [body, sig] = token.split(".");
    if (!body || !sig) return null;
    const expected = createHmac("sha256", getSecret()).update(body).digest("base64url");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as TokenPayload;
    if (!payload.uid || typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

// ── session user resolution ──────────────────────────────────────────────────
export interface SessionUser {
  userId: string;
  name: string;
  email: string;
  roleCode: string;
  roleName: string;
  permissions: string[];
  employeeId: string | null;
  employeeCode: string | null;
  departmentId: string | null;
  departmentName: string | null;
}

/**
 * Extracts the session token from the request.
 *
 * Two transport channels, same signed token:
 *  1. httpOnly cookie — normal top-level browser usage (preferred).
 *  2. `Authorization: Bearer` header — required when the app is embedded in a
 *     cross-site iframe (e.g. a preview panel). Browsers do not attach
 *     SameSite=Lax cookies to cross-site iframe requests, so the client stores
 *     the token returned by the login endpoint and sends it as a header instead.
 */
function extractSessionToken(req: NextRequest): string | null {
  const cookie = req.cookies.get(SESSION_COOKIE)?.value;
  if (cookie) return cookie;
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const t = auth.slice(7).trim();
    return t || null;
  }
  return null;
}

export async function getSessionUser(req: NextRequest): Promise<SessionUser | null> {
  const token = extractSessionToken(req);
  if (!token) return null;
  const payload = verifySessionToken(token);
  if (!payload) return null;

  const user = await db.user.findUnique({
    where: { id: payload.uid },
    include: { role: true, employee: { include: { department: true } } },
  });
  if (!user || user.status !== "active") return null;

  let permissions: string[] = [];
  try {
    permissions = JSON.parse(user.role.permissions) as string[];
  } catch {
    permissions = [];
  }

  return {
    userId: user.id,
    name: user.name,
    email: user.email,
    roleCode: user.role.code,
    roleName: user.role.name,
    permissions,
    employeeId: user.employee?.id ?? null,
    employeeCode: user.employee?.employeeCode ?? null,
    departmentId: user.employee?.departmentId ?? null,
    departmentName: user.employee?.department?.name ?? null,
  };
}

export function sessionCookieOptions() {
  return {
    name: SESSION_COOKIE,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_HOURS * 3600,
  };
}

export function hasPermission(session: SessionUser, permission: string): boolean {
  return session.permissions.includes(permission);
}
