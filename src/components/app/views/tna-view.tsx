"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, downloadFile } from "@/lib/api-client";
import { useAppStore, can } from "@/store/app-store";
import type { TnaResponse, OrgData } from "@/lib/types";
import { PageHeader, LoadingGrid, ErrorState, EmptyState, PriorityBadge, TnaStatusBadge, LevelBadge, StatCard, fmtDate } from "../shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { Download, FileSpreadsheet, Printer, Info, Target, AlertTriangle, RefreshCcw, ClipboardList } from "lucide-react";

type Scope = "individual" | "department" | "role" | "critical" | "refresher";

export function TnaView() {
  const { user, openEmployee } = useAppStore();
  const [scope, setScope] = useState<Scope>("individual");
  const [deptId, setDeptId] = useState("all");
  const [roleId, setRoleId] = useState("all");
  const [priority, setPriority] = useState("all");
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const isEmployee = user?.roleCode === "employee";

  const org = useQuery({ queryKey: ["org"], queryFn: () => api<OrgData>("/api/org") });
  const params = new URLSearchParams({
    scope,
    ...(deptId !== "all" && { deptId }),
    ...(roleId !== "all" && { roleId }),
    ...(priority !== "all" && { priority }),
    ...(category !== "all" && { category }),
    ...(search && { search }),
  });
  const tna = useQuery({
    queryKey: ["tna", params.toString()],
    queryFn: () => api<TnaResponse>(`/api/tna?${params.toString()}`),
  });

  const exportParams = new URLSearchParams({
    ...(deptId !== "all" && { deptId }),
    ...(priority !== "all" && { priority }),
  });

  const needs = tna.data?.needs ?? [];
  const s = tna.data?.summary;

  function printReport() {
    window.print();
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={isEmployee ? "My Development Plan" : "Training Needs Analysis"}
        description={`${tna.data?.scopeLabel ?? "…"} · Gap = required − current level. Priorities follow the configurable rule model — every recommendation shows its reasons.`}
        actions={
          can(user, "reports:generate") ? (
            <>
              <Button variant="outline" onClick={() => void downloadFile(`/api/reports/tna?${exportParams.toString()}`).catch((e) => toast.error(e.message))}>
                <FileSpreadsheet className="h-4 w-4" aria-hidden /> XLSX
              </Button>
              <Button variant="outline" onClick={() => void downloadFile(`/api/reports/tna?${exportParams.toString()}&format=csv`).catch((e) => toast.error(e.message))}>
                <Download className="h-4 w-4" aria-hidden /> CSV
              </Button>
              <Button variant="outline" onClick={printReport}>
                <Printer className="h-4 w-4" aria-hidden /> Print / PDF
              </Button>
            </>
          ) : undefined
        }
      />

      {/* Rule model disclosure */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="-ml-2 text-xs text-muted-foreground">
            <Info className="mr-1 h-3.5 w-3.5" aria-hidden /> How are priorities calculated?
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-96 text-xs" align="start">
          <p className="mb-2 font-semibold text-sm">Rule-based prioritisation model</p>
          <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
            <li>Expired <b>mandatory/safety qualification</b> → <span className="font-bold text-red-600">Critical</span></li>
            <li><b>Safety-critical</b> competency with any gap → <span className="font-bold text-red-600">Critical</span></li>
            <li>Unassessed safety-critical competency → <span className="font-bold text-red-600">Critical</span></li>
            <li>Gap of <b>two or more levels</b> → <span className="font-bold text-orange-600">High</span></li>
            <li>Gap of <b>one level</b> → <span className="font-bold text-amber-600">Medium</span></li>
            <li>Unassessed (non-safety) → <span className="font-bold text-orange-600">High</span></li>
            <li>Assessment older than the reassessment frequency → <span className="font-bold text-amber-600">Medium</span> (High if safety)</li>
            <li>Qualification expiring ≤ {tna.data?.rules.expiringSoonDays ?? 30} days → <span className="font-bold text-orange-600">High</span> (mandatory) / <span className="font-bold text-amber-600">Medium</span></li>
          </ul>
          <p className="mt-2 rounded bg-muted p-2 text-[11px] text-muted-foreground">
            Transparent, configurable weights (Settings). Not a scientifically validated instrument — it reflects standard L&D practice for manufacturing competency governance.
          </p>
        </PopoverContent>
      </Popover>

      {!isEmployee && s && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Open Training Needs" value={needs.length} sub="Across current filters" icon={<Target className="h-5 w-5" aria-hidden />} tone="info" />
          <StatCard label="Critical" value={s.byPriority.critical} sub="Immediate action (≤7 days)" icon={<AlertTriangle className="h-5 w-5" aria-hidden />} tone={s.byPriority.critical ? "critical" : "success"} />
          <StatCard label="High" value={s.byPriority.high} sub="Within 30 days" icon={<AlertTriangle className="h-5 w-5" aria-hidden />} tone="warning" />
          <StatCard label="Refresher Required" value={s.expiredQualificationSlots + s.expiringQualificationSlots} sub={`${s.expiredQualificationSlots} expired · ${s.expiringQualificationSlots} expiring`} icon={<RefreshCcw className="h-5 w-5" aria-hidden />} tone="warning" />
        </div>
      )}

      {/* Filters (management roles) */}
      {!isEmployee && (
        <div className="flex flex-wrap items-center gap-2">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Employee or competency…" className="h-9 w-56" aria-label="Search needs" />
          <Select value={deptId} onValueChange={(v) => { setDeptId(v); setRoleId("all"); }}>
            <SelectTrigger className="h-9 w-44" aria-label="Department"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All departments</SelectItem>{org.data?.departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={roleId} onValueChange={setRoleId}>
            <SelectTrigger className="h-9 w-56" aria-label="Job role"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All job roles</SelectItem>{(org.data?.jobRoles ?? []).filter((r) => deptId === "all" || r.departmentId === deptId).map((r) => <SelectItem key={r.id} value={r.id}>{r.title}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger className="h-9 w-36" aria-label="Priority"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All priorities</SelectItem>
              {["critical", "high", "medium", "low"].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="h-9 w-52" aria-label="Category"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All categories</SelectItem>{org.data?.competencyCategories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      )}

      <Tabs value={isEmployee ? "individual" : scope} onValueChange={(v) => setScope(v as Scope)}>
        {!isEmployee && (
          <TabsList className="flex-wrap">
            <TabsTrigger value="individual" className="text-xs">Individual Needs</TabsTrigger>
            <TabsTrigger value="department" className="text-xs">Department Summary</TabsTrigger>
            <TabsTrigger value="role" className="text-xs">Role-wise Gaps</TabsTrigger>
            <TabsTrigger value="critical" className="text-xs">Critical Gaps</TabsTrigger>
            <TabsTrigger value="refresher" className="text-xs">Refresher Requirements</TabsTrigger>
          </TabsList>
        )}

        {tna.isLoading ? (
          <div className="mt-4"><LoadingGrid rows={6} /></div>
        ) : tna.error ? (
          <div className="mt-4"><ErrorState message={tna.error instanceof Error ? tna.error.message : "Failed to load"} /></div>
        ) : (
          <>
            {/* Individual / Critical / Refresher — table views */}
            {(["individual", "critical", "refresher"] as Scope[]).map((sc) => (
              <TabsContent key={sc} value={sc} className="mt-4">
                {needs.length === 0 ? (
                  <EmptyState title={sc === "critical" ? "No critical training needs" : sc === "refresher" ? "No refresher training required" : "No training needs identified"} message="Nothing matches the current filters — the workforce meets its competency requirements in this scope." />
                ) : (
                  <div className="overflow-x-auto rounded-lg border bg-white dark:bg-card">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50 hover:bg-muted/50">
                          <TableHead>Employee</TableHead>
                          <TableHead className="hidden md:table-cell">Competency</TableHead>
                          <TableHead className="hidden sm:table-cell">Role / Dept</TableHead>
                          <TableHead className="text-center">Req</TableHead>
                          <TableHead className="text-center">Cur</TableHead>
                          <TableHead className="text-center">Gap</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-center">Priority</TableHead>
                          <TableHead className="hidden lg:table-cell">Target</TableHead>
                          <TableHead className="hidden xl:table-cell">Reason</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {needs.map((n, i) => (
                          <TableRow key={`${n.employeeId}-${n.competencyId}-${i}`} className={`cursor-pointer ${n.priority === "critical" ? "bg-red-50/40 dark:bg-red-950/20" : ""}`} onClick={() => openEmployee(n.employeeId)}>
                            <TableCell>
                              <p className="font-medium leading-tight">{n.employeeName}</p>
                              <p className="font-mono text-[10px] text-muted-foreground">{n.employeeCode}</p>
                            </TableCell>
                            <TableCell className="hidden md:table-cell">
                              <p className="max-w-52 truncate text-sm font-medium" title={n.competencyName}>{n.competencyName}</p>
                              <p className="text-[10px] text-muted-foreground">{n.competencyCode} · {n.category}{n.safetyCritical && <span className="font-bold text-red-600 dark:text-red-400"> · SAFETY</span>}</p>
                            </TableCell>
                            <TableCell className="hidden max-w-44 text-xs text-muted-foreground sm:table-cell"><p className="truncate">{n.jobRoleTitle}</p><p>{n.departmentName}</p></TableCell>
                            <TableCell className="text-center"><LevelBadge level={n.requiredLevel} size="sm" /></TableCell>
                            <TableCell className="text-center"><LevelBadge level={n.currentLevel} size="sm" /></TableCell>
                            <TableCell className={`text-center text-sm font-bold tabular-nums ${n.gap && n.gap > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}>{n.gap === null ? "—" : n.gap > 0 ? `+${n.gap}` : "0"}</TableCell>
                            <TableCell><TnaStatusBadge status={n.status} /></TableCell>
                            <TableCell className="text-center"><PriorityBadge priority={n.priority} /></TableCell>
                            <TableCell className="hidden text-center text-xs lg:table-cell">{n.dueDate ? fmtDate(n.dueDate) : "—"}</TableCell>
                            <TableCell className="hidden max-w-72 xl:table-cell">
                              <p className="truncate text-xs text-muted-foreground" title={n.reasons.join(" • ")}>{n.reasons[0]}</p>
                              <p className="truncate text-[11px] text-blue-700 dark:text-blue-400" title={n.recommendedAction}>{n.recommendedAction}</p>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>
            ))}

            {/* Department summary */}
            <TabsContent value="department" className="mt-4">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">Department Competency Coverage</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50 hover:bg-muted/50">
                        <TableHead>Department</TableHead><TableHead className="text-center">Employees</TableHead><TableHead className="text-center">Required Slots</TableHead>
                        <TableHead className="text-center">Compliant</TableHead><TableHead className="text-center">Gaps</TableHead><TableHead className="text-center">Critical</TableHead><TableHead className="text-center">Coverage</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(s?.byDepartment ?? []).map((d) => (
                        <TableRow key={d.departmentId}>
                          <TableCell className="font-medium">{d.departmentName}</TableCell>
                          <TableCell className="text-center tabular-nums">{d.employees}</TableCell>
                          <TableCell className="text-center tabular-nums">{d.slots}</TableCell>
                          <TableCell className="text-center tabular-nums text-emerald-700 dark:text-emerald-400">{d.compliant}</TableCell>
                          <TableCell className="text-center tabular-nums text-amber-700 dark:text-amber-400">{d.gaps}</TableCell>
                          <TableCell className="text-center tabular-nums text-red-600 dark:text-red-400">{d.critical}</TableCell>
                          <TableCell className="text-center">
                            <span className={`inline-block min-w-12 rounded px-1.5 py-0.5 text-xs font-bold tabular-nums ${d.coveragePct >= 60 ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : d.coveragePct >= 40 ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"}`}>{d.coveragePct}%</span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Role-wise gaps */}
            <TabsContent value="role" className="mt-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Role-wise Competency Gap Report</CardTitle>
                  <p className="text-xs text-muted-foreground">Open needs per job role — sorted by critical severity.</p>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50 hover:bg-muted/50">
                        <TableHead>Job Role</TableHead><TableHead>Department</TableHead><TableHead className="text-center">Employees</TableHead>
                        <TableHead className="text-center">Required Slots</TableHead><TableHead className="text-center">Open Needs</TableHead>
                        <TableHead className="text-center">Critical</TableHead><TableHead className="text-center">Needs / Employee</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(tna.data?.byRole ?? []).map((r) => (
                        <TableRow key={r.jobRoleId} className={r.critical > 0 ? "bg-red-50/40 dark:bg-red-950/20" : ""}>
                          <TableCell className="font-medium">{r.jobRole}</TableCell>
                          <TableCell className="text-muted-foreground">{r.department}</TableCell>
                          <TableCell className="text-center tabular-nums">{r.employees}</TableCell>
                          <TableCell className="text-center tabular-nums">{r.slots}</TableCell>
                          <TableCell className="text-center tabular-nums text-amber-700 dark:text-amber-400">{r.gaps}</TableCell>
                          <TableCell className="text-center tabular-nums text-red-600 dark:text-red-400">{r.critical}</TableCell>
                          <TableCell className="text-center tabular-nums">{r.avgGap}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
          </>
        )}
      </Tabs>

      {/* Print-friendly detailed section */}
      <div className="hidden print:block">
        <h2>Training Needs Analysis — Detailed Findings</h2>
        <p>Scope: {tna.data?.scopeLabel} · Generated: {new Date().toLocaleString()} · By: {user?.name}</p>
        <p className="italic">Rule-based prioritisation model — see Methods note in the application Settings.</p>
      </div>

      {needs.length > 0 && (
        <p className="text-xs text-muted-foreground">
          <ClipboardList className="mr-1 inline h-3.5 w-3.5" aria-hidden />
          {needs.length} finding(s) shown. Recommendations reference the linked training program where one exists.
        </p>
      )}
    </div>
  );
}
