import { NextRequest, NextResponse } from "next/server";
import { handleApi } from "@/lib/api";
import { getSessionUser, SESSION_COOKIE } from "@/lib/auth";
import { audit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  return handleApi(req, { public: true }, async () => {
    const session = await getSessionUser(req);
    if (session) await audit(req, session, "logout", "auth", session.userId);
    const res = NextResponse.json({ ok: true });
    res.cookies.set({ name: SESSION_COOKIE, value: "", httpOnly: true, path: "/", maxAge: 0 });
    return res;
  });
}
