"use client";
/**
 * Typed fetch client. Adds the CSRF header, normalises API errors.
 *
 * Session transport: the server accepts the signed session token from either
 * the httpOnly cookie OR the `Authorization: Bearer` header. The header path
 * is essential when the app runs inside a cross-site iframe (preview panels),
 * because browsers do not attach SameSite=Lax cookies to cross-site iframe
 * requests. The token returned by /api/auth/login is stored in localStorage
 * and attached here automatically.
 */

export class ApiClientError extends Error {
  constructor(message: string, public status: number, public details?: unknown) {
    super(message);
  }
}

const TOKEN_KEY = "tna_session_token";

export function setAuthToken(token: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable (private mode etc.) — cookie may still work */
  }
}

function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function authHeaders(): Record<string, string> {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function api<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const isLogin = path === "/api/auth/login";
  const res = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: {
      ...(init?.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
      "X-Requested-With": "XMLHttpRequest",
      ...authHeaders(),
      ...(init?.headers ?? {}),
    },
  });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON */
  }
  if (res.ok) {
    // Keep the stored bearer token in sync with the session lifecycle.
    if (isLogin) {
      const token = (data as { token?: string } | null)?.token;
      setAuthToken(token ?? null);
    }
    if (path === "/api/auth/logout") setAuthToken(null);
  } else {
    // A 401 means the presented credentials (token/cookie) were rejected —
    // drop a stale bearer token so the next boot goes through /api/auth/me
    // cleanly instead of replaying an invalid token. (Never touch the token
    // on a failed login attempt: a wrong password is unrelated to it.)
    if (res.status === 401 && !isLogin) setAuthToken(null);
  }
  if (!res.ok) {
    const msg = (data as { error?: string })?.error ?? `Request failed (${res.status})`;
    throw new ApiClientError(msg, res.status, (data as { details?: unknown })?.details);
  }
  return data as T;
}

/**
 * Raw fetch with session headers attached (credentials, CSRF header, Bearer
 * token). Use for requests that bypass api() — FormData uploads, blob
 * downloads, etc. — so they work in embedded/iframe contexts too.
 */
export function authFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: {
      "X-Requested-With": "XMLHttpRequest",
      ...authHeaders(),
      ...(init?.headers ?? {}),
    },
  });
}

/** Authenticated file download (reports) that keeps the session alive. */
export async function downloadFile(path: string, fallbackName = "download.xlsx"): Promise<void> {
  const res = await authFetch(path);
  if (!res.ok) {
    let msg = `Download failed (${res.status})`;
    try {
      const j = await res.json();
      if (j.error) msg = j.error;
    } catch { /* ignore */ }
    throw new ApiClientError(msg, res.status);
  }
  const blob = await res.blob();
  const dispo = res.headers.get("Content-Disposition") ?? "";
  const match = dispo.match(/filename="?([^";]+)"?/);
  const name = match?.[1] ?? fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
