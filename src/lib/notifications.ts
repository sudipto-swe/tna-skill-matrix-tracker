/**
 * In-app notification engine (no fake emails).
 * Materialises alert rows from live data: qualification expiry buckets and
 * upcoming training sessions. Email is only mentioned when configured via env.
 */
import { db } from "./db";

const day = 86400_000;

async function dedupe(type: string, entityId: string, windowMs: number): Promise<boolean> {
  const since = new Date(Date.now() - windowMs);
  const existing = await db.notification.findFirst({
    where: { type, entityId, createdAt: { gte: since } },
  });
  return !existing;
}

/**
 * Broadcasts use a STABLE key (type + bucket, never the count) so that a
 * changing count (41 → 40 → …) updates the existing unread alert in place
 * instead of piling up near-duplicate notifications on every refresh.
 */
async function upsertBroadcast(
  key: string,
  data: { audienceRole: string; type: string; severity: string; title: string; message: string; linkView: string }
): Promise<boolean> {
  const existing = await db.notification.findFirst({ where: { entityId: key, type: data.type, readAt: null }, orderBy: { createdAt: "desc" } });
  if (existing) {
    if (existing.title !== data.title || existing.message !== data.message) {
      await db.notification.update({ where: { id: existing.id }, data: { title: data.title, message: data.message, severity: data.severity } });
    }
    return false;
  }
  await db.notification.create({ data: { ...data, entityId: key } });
  return true;
}

export async function refreshAlerts(): Promise<{ created: number }> {
  let created = 0;
  const now = new Date();

  // 1 ─ qualification expiry buckets (plant-wide)
  const quals = await db.qualification.findMany({
    include: { employee: { include: { users: true, department: true } }, competency: true },
    where: { employee: { status: { not: "separated" } } },
  });

  const expired = quals.filter((q) => q.expiresAt < now);
  const expiring7 = quals.filter((q) => q.expiresAt >= now && (q.expiresAt.getTime() - now.getTime()) / day <= 7);
  const expiring30 = quals.filter((q) => q.expiresAt >= now && (q.expiresAt.getTime() - now.getTime()) / day > 7 && (q.expiresAt.getTime() - now.getTime()) / day <= 30);

  // broadcasts for L&D roles
  const broadcasts: { key: string; type: string; severity: string; title: string; message: string }[] = [];
  if (expired.length > 0) {
    broadcasts.push({
      key: "broadcast:expired",
      type: "qualification_expired",
      severity: "critical",
      title: `${expired.length} expired qualification${expired.length > 1 ? "s" : ""}`,
      message: `${expired.length} employees hold expired qualifications. Authorisation to perform related tasks must be suspended until refresher training is completed. Open Qualification Monitoring for details.`,
    });
  }
  if (expiring7.length > 0) {
    broadcasts.push({
      key: "broadcast:expiring7",
      type: "qualification_expiring",
      severity: "high",
      title: `${expiring7.length} qualification${expiring7.length > 1 ? "s" : ""} expiring within 7 days`,
      message: `${expiring7.length} qualifications expire within 7 days. Schedule refresher sessions now.`,
    });
  }
  if (expiring30.length > 0) {
    broadcasts.push({
      key: "broadcast:expiring30",
      type: "qualification_expiring",
      severity: "medium",
      title: `${expiring30.length} qualification${expiring30.length > 1 ? "s" : ""} expiring within 30 days`,
      message: `${expiring30.length} qualifications expire within 30 days. Include them in the next training calendar.`,
    });
  }
  for (const b of broadcasts) {
    for (const role of ["training_officer", "administrator"]) {
      const createdNew = await upsertBroadcast(`${b.key}:${role}`, {
        audienceRole: role, type: b.type, severity: b.severity,
        title: b.title, message: b.message, linkView: "qualifications",
      });
      if (createdNew) created += 1;
    }
  }

  // per-user alerts for their own qualifications
  for (const q of expired) {
    for (const u of q.employee.users) {
      if (!(await dedupe("my_qualification_expired", `${u.id}:${q.id}`, 7 * day))) continue;
      await db.notification.create({
        data: {
          userId: u.id, type: "my_qualification_expired", severity: "critical",
          title: `Your ${q.competency.name} qualification has expired`,
          message: `Your qualification expired on ${q.expiresAt.toISOString().slice(0, 10)}. Contact your supervisor or L&D to arrange refresher training. Related task authorisation is suspended.`,
          linkView: "my-qualifications", entityId: `${u.id}:${q.id}`,
        },
      });
      created += 1;
    }
  }

  // 2 ─ upcoming enrolled sessions (next 7 days) for linked users
  const soon = new Date(now.getTime() + 7 * day);
  const sessions = await db.trainingSession.findMany({
    where: { scheduledDate: { gte: now, lte: soon }, status: { in: ["scheduled", "in_progress"] } },
    include: { enrollments: { include: { employee: { include: { users: true } } } } },
  });
  for (const s of sessions) {
    for (const en of s.enrollments) {
      for (const u of en.employee.users) {
        if (!(await dedupe("session_upcoming", `${u.id}:${s.id}`, 7 * day))) continue;
        await db.notification.create({
          data: {
            userId: u.id, type: "session_upcoming", severity: "info",
            title: `Upcoming training: ${s.title}`,
            message: `You are enrolled in "${s.title}" on ${s.scheduledDate.toISOString().slice(0, 10)} at ${s.startTime} (${s.location}).`,
            linkView: "my-training", entityId: `${u.id}:${s.id}`,
          },
        });
        created += 1;
      }
    }
  }

  return { created };
}
