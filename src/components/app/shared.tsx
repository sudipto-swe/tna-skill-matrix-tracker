"use client";
/** Shared UI atoms for the TNA application (navy/blue enterprise design system). */
import { type ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Inbox } from "lucide-react";
import { format, parseISO } from "date-fns";

export const CHART_COLORS = {
  navy: "#1e3a5f",
  blue: "#2563eb",
  sky: "#0ea5e9",
  amber: "#f59e0b",
  orange: "#f97316",
  red: "#ef4444",
  emerald: "#10b981",
  slate: "#94a3b8",
  violet: "#8b5cf6",
};

export const LEVEL_NAMES: Record<number, string> = { 1: "Awareness", 2: "Basic", 3: "Competent", 4: "Advanced" };

export function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  try {
    return format(typeof d === "string" ? parseISO(d) : d, "dd MMM yyyy");
  } catch {
    return "—";
  }
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground md:text-2xl">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({
  label, value, sub, icon, tone = "default", onClick,
}: {
  label: string; value: ReactNode; sub?: string; icon?: ReactNode;
  tone?: "default" | "critical" | "warning" | "success" | "info";
  onClick?: () => void;
}) {
  const tones: Record<string, string> = {
    default: "text-foreground",
    critical: "text-red-600 dark:text-red-400",
    warning: "text-amber-600 dark:text-amber-400",
    success: "text-emerald-600 dark:text-emerald-400",
    info: "text-blue-700 dark:text-blue-400",
  };
  const iconTones: Record<string, string> = {
    default: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    critical: "bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-400",
    warning: "bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400",
    success: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400",
    info: "bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400",
  };
  return (
    <Card
      className={`${onClick ? "cursor-pointer transition-shadow hover:shadow-md" : ""}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === "Enter" && onClick() : undefined}
    >
      <CardContent className="flex items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <p title={typeof label === "string" ? label : undefined} className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className={`mt-1 text-2xl font-semibold tabular-nums ${tones[tone]}`}>{value}</p>
          {sub && <p title={typeof sub === "string" ? sub : undefined} className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</p>}
        </div>
        {icon && <div className={`rounded-lg p-2 ${iconTones[tone]}`}>{icon}</div>}
      </CardContent>
    </Card>
  );
}

/** Competency level badge 1–4 (or Not Assessed). */
export function LevelBadge({ level, size = "md" }: { level: number | null; size?: "sm" | "md" }) {
  if (level === null || level === undefined) {
    return <span className={`inline-flex items-center rounded-md border border-dashed bg-slate-50 font-medium text-slate-500 dark:bg-slate-900 ${size === "sm" ? "px-1.5 py-0 text-[10px]" : "px-2 py-0.5 text-xs"}`}>N/A</span>;
  }
  const styles: Record<number, string> = {
    1: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
    2: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
    3: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
    4: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  };
  return (
    <span className={`inline-flex items-center rounded-md font-semibold ${styles[level]} ${size === "sm" ? "px-1.5 py-0 text-[10px]" : "px-2 py-0.5 text-xs"}`}>
      L{level} · {LEVEL_NAMES[level]}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: string }) {
  const map: Record<string, { cls: string; label: string }> = {
    critical: { cls: "bg-red-100 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-900", label: "CRITICAL" },
    high: { cls: "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-900", label: "HIGH" },
    medium: { cls: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900", label: "MEDIUM" },
    low: { cls: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-900 dark:text-slate-300", label: "LOW" },
    none: { cls: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-900 dark:text-slate-400", label: "NONE" },
  };
  const m = map[priority] ?? map.none;
  return <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-bold tracking-wide ${m.cls}`}>{m.label}</span>;
}

export function TnaStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    not_assessed: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    gap: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
    assessment_expired: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
    expiring_soon: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300",
    expired_qualification: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
    compliant: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  };
  const labels: Record<string, string> = {
    not_assessed: "Not Assessed", gap: "Gap", assessment_expired: "Assessment Expired",
    expiring_soon: "Expiring Soon", expired_qualification: "Expired Qualification", compliant: "Achieved",
  };
  return <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${map[status] ?? map.not_assessed}`}>{labels[status] ?? status}</span>;
}

export function EmployeeStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
    probation: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
    on_leave: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
    notice_period: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
    separated: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-400",
  };
  const labels: Record<string, string> = { active: "Active", probation: "Probation", on_leave: "On Leave", notice_period: "Notice Period", separated: "Separated" };
  return <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${map[status] ?? ""}`}>{labels[status] ?? status}</span>;
}

export function SessionStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    scheduled: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
    in_progress: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
    completed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
    cancelled: "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  };
  return <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium capitalize ${map[status] ?? ""}`}>{status.replace("_", " ")}</span>;
}

/** Skill-matrix cell chip. */
export function ComplianceChip({ compliance, level }: { compliance: string; level: number | null }) {
  const cls: Record<string, string> = {
    achieved: "bg-emerald-600 text-white",
    gap1: "bg-amber-400 text-amber-950",
    gap2: "bg-orange-500 text-white",
    gap3: "bg-red-600 text-white",
    not_assessed: "bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-500",
    expired: "bg-violet-500 text-white",
    expiring: "bg-yellow-300 text-yellow-950",
  };
  return (
    <span className={`inline-flex h-6 w-7 items-center justify-center rounded text-[11px] font-bold ${cls[compliance] ?? "bg-slate-200"}`} title={`Compliance: ${compliance}`}>
      {level === null ? "–" : level}
    </span>
  );
}

export function EmptyState({ title, message, action }: { title: string; message?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-12 text-center">
      <Inbox className="h-8 w-8 text-muted-foreground/60" aria-hidden />
      <p className="mt-3 text-sm font-medium text-foreground">{title}</p>
      {message && <p className="mt-1 max-w-md text-xs text-muted-foreground">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div>{message}</div>
    </div>
  );
}

export function LoadingGrid({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

export function Legend({ items }: { items: { cls: string; label: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span className={`inline-block h-3 w-3 rounded-sm ${i.cls}`} aria-hidden />
          {i.label}
        </span>
      ))}
    </div>
  );
}
