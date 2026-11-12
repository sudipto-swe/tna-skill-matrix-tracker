"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, downloadFile } from "@/lib/api-client";
import { useAppStore, can } from "@/store/app-store";
import type { MatrixResponse, OrgData } from "@/lib/types";
import { PageHeader, LoadingGrid, ErrorState, EmptyState, ComplianceChip, Legend, LEVEL_NAMES } from "../shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { Search, Download, Grid3x3 } from "lucide-react";

export function SkillMatrixView() {
  const { user, openEmployee } = useAppStore();
  const [search, setSearch] = useState("");
  const [deptId, setDeptId] = useState("all");
  const [roleId, setRoleId] = useState("all");
  const [shift, setShift] = useState("all");
  const [category, setCategory] = useState("all");
  const [mode, setMode] = useState<"compliance" | "levels">("compliance");

  const org = useQuery({ queryKey: ["org"], queryFn: () => api<OrgData>("/api/org") });
  const params = new URLSearchParams({
    ...(search && { search }),
    ...(deptId !== "all" && { deptId }),
    ...(roleId !== "all" && { roleId }),
    ...(shift !== "all" && { shift }),
    ...(category !== "all" && { category }),
  });
  const matrix = useQuery({
    queryKey: ["skill-matrix", params.toString()],
    queryFn: () => api<MatrixResponse>(`/api/skill-matrix?${params.toString()}`),
  });

  const visibleRoles = (org.data?.jobRoles ?? []).filter((r) => deptId === "all" || r.departmentId === deptId);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Skill Matrix"
        description={`${matrix.data?.scope ?? "…"} · Employees × competencies — required vs current, colour-coded. Click a row for the full profile.`}
        actions={can(user, "reports:generate") ? (
          <Button variant="outline" onClick={() => void downloadFile(`/api/reports/skill-matrix?${params.toString()}`).catch((e) => toast.error(e.message))}>
            <Download className="h-4 w-4" aria-hidden /> Export XLSX
          </Button>
        ) : undefined}
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-56">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find employee…" className="h-9 pl-8" aria-label="Find employee" />
        </div>
        <Select value={deptId} onValueChange={(v) => { setDeptId(v); setRoleId("all"); }}>
          <SelectTrigger className="h-9 w-44" aria-label="Department"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All departments</SelectItem>{org.data?.departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={roleId} onValueChange={setRoleId}>
          <SelectTrigger className="h-9 w-56" aria-label="Job role"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All job roles</SelectItem>{visibleRoles.map((r) => <SelectItem key={r.id} value={r.id}>{r.title}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={shift} onValueChange={setShift}>
          <SelectTrigger className="h-9 w-32" aria-label="Shift"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All shifts</SelectItem>{org.data?.shifts.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="h-9 w-52" aria-label="Competency category"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All competency categories</SelectItem>{org.data?.competencyCategories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
        </Select>
        <Tabs value={mode} onValueChange={(v) => setMode(v as "compliance" | "levels")} className="ml-auto">
          <TabsList className="h-9">
            <TabsTrigger value="compliance" className="text-xs"><Grid3x3 className="mr-1 h-3.5 w-3.5" aria-hidden /> Compliance</TabsTrigger>
            <TabsTrigger value="levels" className="text-xs">Levels</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Legend */}
      {mode === "compliance" ? (
        <Legend items={[
          { cls: "bg-emerald-600", label: "Achieved" },
          { cls: "bg-amber-400", label: "Gap: 1 level" },
          { cls: "bg-orange-500", label: "Gap: 2 levels" },
          { cls: "bg-red-600", label: "Gap: 3+ levels" },
          { cls: "bg-slate-200 dark:bg-slate-700", label: "Not assessed (≠ L1)" },
          { cls: "bg-violet-500", label: "Expired assessment/qual" },
          { cls: "bg-yellow-300", label: "Expiring soon" },
        ]} />
      ) : (
        <Legend items={[
          { cls: "bg-rose-200", label: "L1 Awareness" },
          { cls: "bg-amber-200", label: "L2 Basic" },
          { cls: "bg-sky-200", label: "L3 Competent" },
          { cls: "bg-emerald-200", label: "L4 Advanced" },
          { cls: "bg-slate-200 dark:bg-slate-700", label: "Not assessed" },
        ]} />
      )}

      {matrix.isLoading ? (
        <LoadingGrid rows={8} />
      ) : matrix.error ? (
        <ErrorState message={matrix.error instanceof Error ? matrix.error.message : "Failed to load matrix"} />
      ) : (matrix.data?.rows.length ?? 0) === 0 ? (
        <EmptyState title="No employees match" message="Adjust the filters." />
      ) : (
        <>
          <div className="overflow-auto rounded-lg border bg-white dark:bg-card" style={{ maxHeight: "70vh" }}>
            <Table>
              <TableHeader className="sticky top-0 z-10">
                <TableRow className="bg-muted/80 backdrop-blur hover:bg-muted/80">
                  <TableHead className="sticky left-0 z-20 min-w-40 bg-muted/80 backdrop-blur">Employee</TableHead>
                  <TableHead className="hidden min-w-24 bg-muted/80 md:table-cell">Job Role</TableHead>
                  {matrix.data!.competencies.map((c) => (
                    <TableHead key={c.id} className="min-w-14 px-1 text-center">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className={`cursor-help text-[10px] font-bold ${c.safetyCritical ? "text-red-600 dark:text-red-400" : ""}`}>{c.code}</span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-52 text-xs">
                            <p className="font-semibold">{c.name}</p>
                            <p className="text-muted-foreground">{c.category}{c.safetyCritical ? " · Safety-critical" : ""}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableHead>
                  ))}
                  <TableHead className="min-w-20 bg-muted/80 text-center">Coverage</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {matrix.data!.rows.map((row) => (
                  <TableRow key={row.employeeId} className="cursor-pointer" onClick={() => openEmployee(row.employeeId)}>
                    <TableCell className="sticky left-0 z-10 bg-white font-medium dark:bg-card">
                      {row.employeeName}
                      <span className="block font-mono text-[10px] text-muted-foreground">{row.employeeCode}</span>
                    </TableCell>
                    <TableCell className="hidden max-w-40 truncate text-xs text-muted-foreground md:table-cell">{row.jobRole}</TableCell>
                    {matrix.data!.competencies.map((c) => {
                      const cell = row.cells[c.id];
                      return (
                        <TableCell key={c.id} className="px-1 py-1 text-center">
                          {cell ? (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex">
                                    {mode === "compliance"
                                      ? <ComplianceChip compliance={cell.compliance} level={cell.level} />
                                      : (
                                        <span className={`inline-flex h-6 w-7 items-center justify-center rounded text-[11px] font-bold ${
                                          cell.level === null ? "bg-slate-200 text-slate-500 dark:bg-slate-800"
                                          : cell.level === 1 ? "bg-rose-200 text-rose-900"
                                          : cell.level === 2 ? "bg-amber-200 text-amber-900"
                                          : cell.level === 3 ? "bg-sky-200 text-sky-900"
                                          : "bg-emerald-200 text-emerald-900"
                                        }`}>{cell.level ?? "–"}</span>
                                      )}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs">
                                  <p className="font-semibold">{c.name}</p>
                                  <p>Required: L{cell.required} · Current: {cell.level === null ? "Not assessed" : `L${cell.level} (${LEVEL_NAMES[cell.level]})`}</p>
                                  {cell.level !== null && cell.required - cell.level > 0 && <p className="text-red-500">Gap: {cell.required - cell.level} level(s)</p>}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : (
                            <span className="text-muted-foreground/30">·</span>
                          )}
                        </TableCell>
                      );
                    })}
                    <TableCell className="text-center">
                      <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-bold tabular-nums ${
                        row.coveragePct >= 80 ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                        : row.coveragePct >= 50 ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                        : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                      }`}>{row.coveragePct}%</span>
                      <span className="mt-0.5 block text-[10px] text-muted-foreground">{row.gaps} open</span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Competency summary */}
          <div className="rounded-lg border bg-white p-4 dark:bg-card">
            <p className="mb-3 text-sm font-semibold">Competency Coverage Summary</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {matrix.data!.compSummary.map((c) => (
                <div key={c.competencyId} className="rounded-lg border px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="min-w-0 truncate text-xs font-semibold" title={c.name}>{c.code} · {c.name}</p>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {c.requiredSlots} slots · {c.assessedPct}% assessed · avg {c.avgLevel ?? "—"}
                  </p>
                  <p className="text-[11px]">
                    <span className="font-medium text-amber-700 dark:text-amber-400">{c.gaps} gap(s)</span>
                    <span className="text-muted-foreground"> · {c.notAssessed} unassessed</span>
                  </p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
