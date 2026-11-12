"use client";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { useAppStore } from "@/store/app-store";
import type { DashboardResponse } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader, StatCard, PriorityBadge, LoadingGrid, ErrorState, fmtDate, CHART_COLORS } from "../shared";
import {
  Users, ClipboardCheck, Target, AlertTriangle, CalendarClock, ShieldAlert, TrendingUp, BadgeCheck,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, AreaChart, Area, Line, ComposedChart,
} from "recharts";

export function DashboardView() {
  const user = useAppStore((s) => s.user);
  const setView = useAppStore((s) => s.setView);
  const setQualificationFilter = useAppStore((s) => s.setQualificationFilter);

  const { data, isLoading, error } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api<DashboardResponse>("/api/dashboard"),
  });

  if (isLoading) return <div className="space-y-4"><LoadingGrid rows={6} /></div>;
  if (error) return <ErrorState message={error instanceof Error ? error.message : "Failed to load dashboard"} />;
  if (!data) return null;

  // ── Employee personal dashboard ─────────────────────────────────────────────
  if (data.personal) {
    const myNeeds = data.needs ?? [];
    const open = myNeeds.filter((n) => n.priority !== "none");
    return (
      <div className="space-y-5">
        <PageHeader
          title={`Welcome, ${(data.employee?.name ?? user?.name ?? "").replace(/^(Md\.|Mohammad|Mst\.|Mrs\.|Mr\.)\s+/i, "").split(" ")[0]}`}
          description="Your personal competency profile, development needs and training schedule."
        />
        {!data.employee ? (
          <ErrorState message="Your account is not linked to an employee record. Please contact HR." />
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Competency Requirements" value={myNeeds.length} sub="Required by my role" icon={<Target className="h-5 w-5" aria-hidden />} tone="info" />
              <StatCard label="Open Development Needs" value={open.length} sub="Gaps, expired & unassessed" icon={<AlertTriangle className="h-5 w-5" aria-hidden />} tone={open.length > 0 ? "warning" : "success"} />
              <StatCard label="Critical Needs" value={open.filter((n) => n.priority === "critical").length} sub="Safety-critical / expired quals" icon={<ShieldAlert className="h-5 w-5" aria-hidden />} tone={open.some((n) => n.priority === "critical") ? "critical" : "success"} />
              <StatCard label="Upcoming Training" value={data.upcomingSessions?.length ?? 0} sub="Sessions you're enrolled in" icon={<CalendarClock className="h-5 w-5" aria-hidden />} tone="info" />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">My Development Needs</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <div className="max-h-96 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-muted/80 backdrop-blur text-xs uppercase text-muted-foreground">
                        <tr><th className="px-4 py-2 text-left font-medium">Competency</th><th className="px-2 py-2 text-center font-medium">Req</th><th className="px-2 py-2 text-center font-medium">Cur</th><th className="px-4 py-2 text-left font-medium">Priority</th></tr>
                      </thead>
                      <tbody>
                        {open.length === 0 ? (
                          <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No open needs — competency profile is compliant.</td></tr>
                        ) : open.map((n, i) => (
                          <tr key={i} className="border-t">
                            <td className="px-4 py-2">
                              <p className="font-medium leading-tight">{n.competencyName}{n.safetyCritical && <span className="ml-1 text-[10px] font-bold text-red-600">SAFETY</span>}</p>
                              <p className="text-xs text-muted-foreground">{n.reasons[0]}</p>
                            </td>
                            <td className="px-2 py-2 text-center tabular-nums">{n.requiredLevel}</td>
                            <td className="px-2 py-2 text-center tabular-nums">{n.currentLevel ?? "—"}</td>
                            <td className="px-4 py-2"><PriorityBadge priority={n.priority} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-4">
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-base">My Upcoming Training</CardTitle></CardHeader>
                  <CardContent>
                    {(data.upcomingSessions?.length ?? 0) === 0 ? (
                      <p className="py-4 text-center text-sm text-muted-foreground">No scheduled sessions.</p>
                    ) : (
                      <ul className="space-y-2">
                        {data.upcomingSessions?.map((s) => (
                          <li key={s.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">{s.title}</p>
                              <p className="text-xs text-muted-foreground">{fmtDate(s.date)} · {s.startTime} · {s.location}</p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-base">My Qualifications</CardTitle></CardHeader>
                  <CardContent>
                    {(data.qualifications?.length ?? 0) === 0 ? (
                      <p className="py-4 text-center text-sm text-muted-foreground">No qualification records.</p>
                    ) : (
                      <ul className="space-y-2">
                        {data.qualifications?.map((q) => (
                          <li key={q.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
                            <p className="min-w-0 truncate text-sm font-medium">{q.competency}</p>
                            <span className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-medium ${
                              q.bucket === "expired" ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                              : q.bucket === "expiring_30" ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                              : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                            }`}>
                              {q.bucket === "expired" ? "Expired" : q.bucket === "expiring_30" ? "Expiring soon" : "Valid"} · {fmtDate(q.expiresAt)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  // ── Management dashboard ────────────────────────────────────────────────────
  const k = data.kpis!;
  const s = data.tnaSummary!;
  const priorityData = [
    { name: "Critical", value: s.byPriority.critical, color: CHART_COLORS.red },
    { name: "High", value: s.byPriority.high, color: CHART_COLORS.orange },
    { name: "Medium", value: s.byPriority.medium, color: CHART_COLORS.amber },
    { name: "None (compliant)", value: s.byPriority.none, color: CHART_COLORS.emerald },
  ].filter((p) => p.value > 0);
  const deptData = [...s.byDepartment].sort((a, b) => a.coveragePct - b.coveragePct);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Executive Dashboard"
        description={`${data.scope} · Competency coverage, training needs and compliance at a glance.`}
      />

      {/* KPI row */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Employees" value={k.totalEmployees} sub={`${k.assessmentCoveragePct}% with assessments`} icon={<Users className="h-5 w-5" aria-hidden />} />
        <StatCard label="Competency Compliance" value={`${k.complianceRatePct}%`} sub={`${s.compliantSlots} of ${s.totalSlots} required slots`} icon={<BadgeCheck className="h-5 w-5" aria-hidden />} tone={k.complianceRatePct >= 60 ? "success" : k.complianceRatePct >= 40 ? "warning" : "critical"} onClick={() => setView("skill-matrix")} />
        <StatCard label="Identified Skill Gaps" value={k.identifiedSkillGaps} sub={`${s.gapSlots} level gaps · ${s.notAssessedSlots} unassessed`} icon={<Target className="h-5 w-5" aria-hidden />} tone="warning" onClick={() => setView("tna")} />
        <StatCard label="Critical Training Needs" value={k.criticalTrainingNeeds} sub="Safety-critical & expired quals" icon={<AlertTriangle className="h-5 w-5" aria-hidden />} tone={k.criticalTrainingNeeds > 0 ? "critical" : "success"} onClick={() => setView("tna")} />
        <StatCard label="Upcoming Sessions (30d)" value={k.upcomingSessions} sub="Scheduled & in progress" icon={<CalendarClock className="h-5 w-5" aria-hidden />} tone="info" onClick={() => setView("calendar")} />
        <StatCard label="Overdue Qualifications" value={k.overdueQualifications} sub="Expired — authorisation suspended" icon={<ShieldAlert className="h-5 w-5" aria-hidden />} tone={k.overdueQualifications > 0 ? "critical" : "success"} onClick={() => setQualificationFilter("expired")} />
        <StatCard label="Assessments Recorded" value={`${s.totalSlots - s.notAssessedSlots}/${s.totalSlots}`} sub="Slots with an assessment history" icon={<ClipboardCheck className="h-5 w-5" aria-hidden />} />
        <StatCard label="Attendance Rate (6 mo)" value={`${data.trend?.length ? Math.round(data.trend.reduce((a, t) => a + t.attendanceRate, 0) / data.trend.length) : 0}%`} sub="Across completed sessions" icon={<TrendingUp className="h-5 w-5" aria-hidden />} tone="info" />
      </div>

      {/* Charts row 1 */}
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="min-w-0 lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Competency Coverage by Department</CardTitle>
            <p className="text-xs text-muted-foreground">Share of required competency slots fully achieved (click bars in Skill Matrix for detail).</p>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={deptData} margin={{ top: 5, right: 10, left: -18, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="departmentName" tick={{ fontSize: 11 }} interval={0} angle={-18} textAnchor="end" height={55} />
                <YAxis tick={{ fontSize: 11 }} unit="%" domain={[0, 100]} />
                <Tooltip formatter={(v: number, n: string) => [n === "coveragePct" ? `${v}%` : v, n === "coveragePct" ? "Coverage" : n]} />
                <Bar dataKey="coveragePct" radius={[4, 4, 0, 0]} fill={CHART_COLORS.blue} maxBarSize={42} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="min-w-0 lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Training Needs by Priority</CardTitle>
            <p className="text-xs text-muted-foreground">Rule-based prioritisation — configurable in Settings.</p>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={priorityData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2} label={(e) => e.value} labelLine={false}>
                  {priorityData.map((p) => <Cell key={p.name} fill={p.color} />)}
                </Pie>
                <Tooltip />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Charts row 2 */}
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="min-w-0 lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Training Delivery Trend (6 months)</CardTitle>
            <p className="text-xs text-muted-foreground">Completed sessions and attendance rate.</p>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data.trend} margin={{ top: 5, right: 10, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="l" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11 }} unit="%" domain={[0, 100]} />
                <Tooltip />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Bar yAxisId="l" dataKey="sessions" name="Sessions" fill={CHART_COLORS.navy} radius={[4, 4, 0, 0]} maxBarSize={28} />
                <Line yAxisId="r" dataKey="attendanceRate" name="Attendance %" stroke={CHART_COLORS.emerald} strokeWidth={2} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="min-w-0 lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Top Competency Gaps</CardTitle>
            <p className="text-xs text-muted-foreground">Where training investment is needed most.</p>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {data.topGaps?.map((g) => (
                <li key={g.code} className="flex items-center gap-3">
                  <span className="w-16 shrink-0 text-xs font-semibold text-muted-foreground">{g.code}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{g.competency}</span>
                    <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <span className="block h-full rounded-full bg-gradient-to-r from-blue-600 to-blue-400" style={{ width: `${Math.min(100, (g.gaps / (data.topGaps![0]?.gaps || 1)) * 100)}%` }} />
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-sm font-semibold tabular-nums">{g.gaps}</span>
                    {g.critical > 0 && <span className="block text-[10px] font-medium text-red-600 dark:text-red-400">{g.critical} critical</span>}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* Lists row */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Critical Alerts — Immediate Action</CardTitle>
            <p className="text-xs text-muted-foreground">Highest-severity training needs across scope.</p>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-80 overflow-y-auto">
              {(data.criticalNeeds?.length ?? 0) === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-muted-foreground">No critical needs. Well done.</p>
              ) : (
                <ul className="divide-y">
                  {data.criticalNeeds?.map((n, i) => (
                    <li key={i} className="px-4 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="min-w-0 truncate text-sm font-medium">{n.employee}</p>
                        <span className="shrink-0 text-xs text-muted-foreground">{n.department}</span>
                      </div>
                      <p className="break-words text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{n.competency}</span> — {n.reasons[0]}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Upcoming Training Sessions</CardTitle>
            <p className="text-xs text-muted-foreground">Next 30 days · capacity utilisation shown.</p>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-80 overflow-y-auto">
              {(data.upcomingSessionsList?.length ?? 0) === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-muted-foreground">No sessions scheduled in the next 30 days.</p>
              ) : (
                <ul className="divide-y">
                  {data.upcomingSessionsList?.map((s) => (
                    <li key={s.id} className="flex items-center gap-3 px-4 py-2.5">
                      <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                        <span className="text-[10px] font-semibold uppercase leading-none">{new Date(s.date).toLocaleString("en", { month: "short" })}</span>
                        <span className="text-sm font-bold leading-none">{new Date(s.date).getDate()}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{s.title}</p>
                        <p className="truncate text-xs text-muted-foreground">{s.startTime} · {s.location} · {s.department}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-xs font-semibold tabular-nums">{s.enrolled}/{s.capacity}</p>
                        <p className="text-[10px] text-muted-foreground">enrolled</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
