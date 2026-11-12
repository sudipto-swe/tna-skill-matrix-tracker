import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSeededSafe } from "@/lib/ensure-seed";

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    // Self-healing probe: an empty database (e.g. after an environment reset)
    // is re-seeded here so the app is never served without its demo dataset.
    const seed = await ensureSeededSafe();
    return NextResponse.json({
      status: "ok",
      database: "connected",
      users: seed?.users ?? 0,
      seeded: seed?.seeded ?? false,
      time: new Date().toISOString(),
      app: "TNA & Skill Matrix Tracker",
    });
  } catch {
    return NextResponse.json({ status: "degraded", database: "unavailable", time: new Date().toISOString() }, { status: 503 });
  }
}
