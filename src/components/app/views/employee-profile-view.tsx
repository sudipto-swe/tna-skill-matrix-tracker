"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { useAppStore, can } from "@/store/app-store";
import type { EmployeeDetailResponse, CompetencyRow, OrgData } from "@/lib/types";
import { PageHeader, LevelBadge, PriorityBadge, TnaStatusBadge, LoadingGrid, ErrorState, EmptyState, fmtDate } from "../shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { ArrowLeft, ClipboardCheck, CalendarDays, ShieldAlert, Award } from "lucide-react";

export function EmployeeProfileView() {
  const { selectedEmployeeId, user, setView } = useAppStore();
  const qc = useQueryClient();
  const [assessOpen, setAssessOpen] = useState(false);

  const detail = useQuery({
    queryKey: ["employee", selectedEmployeeId],
    queryFn: () => api<EmployeeDetailResponse>(`/api/employees/${selectedEmployeeId}`),
    enabled: !!selectedEmployeeId,
  });

  if (!selectedEmployeeId) return <EmptyState title="No employee selected" message="Go back to the directory and pick an employee." action={<Button variant="outline" onClick={() => setView("employees")}>Open directory</Button>} />;
  if (detail.isLoading) return <LoadingGrid rows={6} />;
  if (detail.error) return <ErrorState message={detail.error instanceof Error ? detail.error.message : "Failed to load profile"} />;
  const d = detail.data!;
  const e = d.employee;
  const openNeeds = d.needs.filter((n) => n.priority !== "none");
  const coverage = d.needs.length ? Math.round((d.needs.filter((n) => n.status === "compliant").length / d.needs.length) * 100) : 0;

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={() => setView("employees")} className="-ml-2">
        <ArrowLeft className="mr-1 h-4 w-4" aria-hidden /> Back to directory
      </Button>

      {/* Header card */}
      <Card>
        <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center">
          <Avatar className="h-16 w-16">
            <AvatarFallback className="bg-gradient-to-br from-blue-700 to-blue-900 text-lg font-bold text-white">
              {e.name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold">{e.name}</h2>
              <Badge variant="outline" className="font-mono text-xs">{e.employeeCode}</Badge>
              <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-300">{e.jobRole}</Badge>
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">{e.designation} · {e.department}{e.productionArea ? ` · ${e.productionArea}` : ""}</p>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
              <span>Shift: <span className="font-medium text-foreground">{e.shift}</span></span>
              <span>Category: <span className="font-medium text-foreground">{e.category}</span></span>
              <span>Joined: <span className="font-medium text-foreground">{fmtDate(e.joiningDate)}</span></span>
              <span>Supervisor: <span className="font-medium text-foreground">{e.supervisorName ?? "—"}</span></span>
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-center gap-1 rounded-xl border px-5 py-3">
            <span className="text-2xl font-bold tabular-nums text-blue-700 dark:text-blue-400">{coverage}%</span>
            <span className="text-[11px] text-muted-foreground">Competency compliance</span>
          </div>
        </CardContent>
      </Card>

      {/* Quick stats */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="flex items-center justify-between p-4">
          <div><p className="text-xs uppercase text-muted-foreground">Requirements</p><p className="text-2xl font-semibold tabular-nums">{d.needs.length}</p><p className="text-xs text-muted-foreground">competencies required by role</p></div>
          <ClipboardCheck className="h-5 w-5 text-blue-700 dark:text-blue-400" aria-hidden />
        </CardContent></Card>
        <Card><CardContent className="flex items-center justify-between p-4">
          <div><p className="text-xs uppercase text-muted-foreground">Open Needs</p><p className={`text-2xl font-semibold tabular-nums ${openNeeds.length ? "text-amber-600 dark:text-amber-400" : ""}`}>{openNeeds.length}</p><p className="text-xs text-muted-foreground">gaps, expired &amp; unassessed</p></div>
          <CalendarDays className="h-5 w-5 text-amber-600 dark:text-amber-400" aria-hidden />
        </CardContent></Card>
        <Card><CardContent className="flex items-center justify-between p-4">
          <div><p className="text-xs uppercase text-muted-foreground">Critical</p><p className={`text-2xl font-semibold tabular-nums ${openNeeds.some((n) => n.priority === "critical") ? "text-red-600 dark:text-red-400" : ""}`}>{openNeeds.filter((n) => n.priority === "critical").length}</p><p className="text-xs text-muted-foreground">safety-critical / expired quals</p></div>
          <ShieldAlert className="h-5 w-5 text-red-600 dark:text-red-400" aria-hidden />
        </CardContent></Card>
      </div>

      {/* Competency profile */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
          <div>
            <CardTitle className="text-base">Competency Profile — Required vs Current</CardTitle>
            <p className="text-xs text-muted-foreground">Gap = required level − current level. “Not Assessed” is an explicit state (≠ Level 1).</p>
          </div>
          {can(user, "assessments:write") && (
            <Button size="sm" className="bg-blue-700 hover:bg-blue-800 dark:bg-blue-700" onClick={() => setAssessOpen(true)}>
              <Award className="mr-1 h-4 w-4" aria-hidden /> Record Assessment
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead>Competency</TableHead>
                  <TableHead className="text-center">Required</TableHead>
                  <TableHead className="text-center">Current</TableHead>
                  <TableHead className="text-center">Gap</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-center">Priority</TableHead>
                  <TableHead className="hidden lg:table-cell">Last Assessed</TableHead>
                  <TableHead className="hidden xl:table-cell">Recommended Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.needs.map((n) => (
                  <TableRow key={n.competencyId} className={n.priority === "critical" ? "bg-red-50/50 dark:bg-red-950/20" : ""}>
                    <TableCell>
                      <p className="font-medium leading-tight">{n.competencyName}</p>
                      <p className="text-xs text-muted-foreground">{n.competencyCode} · {n.category}{n.safetyCritical && <span className="ml-1 font-bold text-red-600 dark:text-red-400">SAFETY</span>}</p>
                      {n.reasons.length > 0 && <p className="mt-0.5 text-xs italic text-muted-foreground" title={n.reasons.join(" • ")}>{n.reasons[0]}</p>}
                    </TableCell>
                    <TableCell className="text-center"><LevelBadge level={n.requiredLevel} size="sm" /></TableCell>
                    <TableCell className="text-center"><LevelBadge level={n.currentLevel} size="sm" /></TableCell>
                    <TableCell className={`text-center font-semibold tabular-nums ${n.gap && n.gap > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}>{n.gap === null ? "—" : n.gap > 0 ? `+${n.gap}` : "0"}</TableCell>
                    <TableCell><TnaStatusBadge status={n.status} /></TableCell>
                    <TableCell className="text-center"><PriorityBadge priority={n.priority} /></TableCell>
                    <TableCell className="hidden text-center text-xs text-muted-foreground lg:table-cell">{fmtDate(n.lastAssessedAt)}</TableCell>
                    <TableCell className="hidden max-w-64 text-xs text-muted-foreground xl:table-cell">{n.priority === "none" ? "—" : n.recommendedAction}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Qualifications */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Qualifications</CardTitle></CardHeader>
          <CardContent>
            {d.qualifications.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No qualification records.</p>
            ) : (
              <ul className="space-y-2">
                {d.qualifications.map((q) => (
                  <li key={q.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{q.competency}</p>
                      <p className="text-xs text-muted-foreground">{q.certificateRef ?? "No certificate ref"} · issued {fmtDate(q.issuedAt)}</p>
                    </div>
                    <span className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-medium ${q.expired ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"}`}>
                      {q.expired ? "Expired" : "Valid"} · {fmtDate(q.expiresAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Training history */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Training History</CardTitle></CardHeader>
          <CardContent>
            {d.trainingHistory.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No training enrolments yet.</p>
            ) : (
              <div className="max-h-72 overflow-y-auto">
                <ul className="space-y-2">
                  {d.trainingHistory.map((t) => (
                    <li key={t.sessionId} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{t.title}</p>
                        <p className="text-xs text-muted-foreground">{fmtDate(t.date)} · {t.category}</p>
                      </div>
                      <span className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-medium ${
                        t.attendance === "present" ? (t.qualified ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300")
                        : t.attendance === "absent" ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                        : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                      }`}>
                        {t.attendance === "present" ? (t.qualified ? "Qualified" : "Attended") : t.attendance === "absent" ? "Absent" : t.attendance === "excused" ? "Excused" : "Enrolled"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Assessment history */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Assessment History</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="max-h-80 overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0">
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead>Competency</TableHead>
                  <TableHead className="text-center">Level</TableHead>
                  <TableHead>Assessed By</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="hidden md:table-cell">Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.assessments.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">No assessments recorded.</TableCell></TableRow>
                ) : d.assessments.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.competency}</TableCell>
                    <TableCell className="text-center"><LevelBadge level={a.level} size="sm" /></TableCell>
                    <TableCell>{a.assessedBy}</TableCell>
                    <TableCell className="text-sm">{fmtDate(a.assessedAt)}</TableCell>
                    <TableCell className="hidden max-w-72 truncate text-xs text-muted-foreground md:table-cell">{a.notes ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {assessOpen && (
        <AssessDialog
          employeeId={e.id}
          employeeName={e.name}
          competencies={d.needs.map((n) => ({ id: n.competencyId, name: `${n.competencyCode} — ${n.competencyName}`, current: n.currentLevel, required: n.requiredLevel }))}
          onClose={() => setAssessOpen(false)}
          onSaved={() => { setAssessOpen(false); void qc.invalidateQueries({ queryKey: ["employee", selectedEmployeeId] }); void qc.invalidateQueries({ queryKey: ["dashboard"] }); void qc.invalidateQueries({ queryKey: ["tna"] }); }}
        />
      )}
    </div>
  );
}

export function AssessDialog({
  employeeId, employeeName, competencies, onClose, onSaved,
}: {
  employeeId: string; employeeName: string;
  competencies: { id: string; name: string; current: number | null; required: number }[];
  onClose: () => void; onSaved: () => void;
}) {
  const [competencyId, setCompetencyId] = useState(competencies[0]?.id ?? "");
  const [level, setLevel] = useState("3");
  const [notes, setNotes] = useState("");
  const selected = competencies.find((c) => c.id === competencyId);

  const save = useMutation({
    mutationFn: () => api("/api/assessments", { method: "POST", body: JSON.stringify({ employeeId, competencyId, level: Number(level), notes: notes || null }) }),
    onSuccess: () => { toast.success("Assessment recorded", { description: `${employeeName} — ${selected?.name}` }); onSaved(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to save"),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record Assessment</DialogTitle>
          <DialogDescription>For {employeeName}. The new record becomes the current level; history is preserved.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Competency</Label>
            <Select value={competencyId} onValueChange={setCompetencyId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {competencies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} {c.current !== null ? `(current L${c.current})` : "(not assessed)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selected && <p className="text-xs text-muted-foreground">Required level: L{selected.required} — {["", "Awareness", "Basic", "Competent", "Advanced"][selected.required]}</p>}
          </div>
          <div className="space-y-2">
            <Label>Assessed Level</Label>
            <RadioGroup value={level} onValueChange={setLevel} className="grid grid-cols-2 gap-2">
              {[
                [1, "Awareness", "Understands basics, needs supervision"],
                [2, "Basic", "Routine tasks with guidance"],
                [3, "Competent", "Independent performance"],
                [4, "Advanced", "Troubleshoots & guides others"],
              ].map(([v, name, desc]) => (
                <Label key={v} htmlFor={`lv-${v}`} className="flex cursor-pointer items-start gap-2 rounded-lg border p-3 font-normal hover:border-blue-400 dark:hover:border-blue-600 has-[button[data-state=checked]]:border-blue-600 has-[button[data-state=checked]]:bg-blue-50 dark:has-[button[data-state=checked]]:bg-blue-950/40">
                  <RadioGroupItem id={`lv-${v}`} value={String(v)} className="mt-0.5" />
                  <span>
                    <span className="block text-sm font-medium">L{v} · {name}</span>
                    <span className="block text-xs text-muted-foreground">{desc}</span>
                  </span>
                </Label>
              ))}
            </RadioGroup>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="anotes">Notes</Label>
            <Textarea id="anotes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observation context, evidence…" rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !competencyId} className="bg-blue-700 hover:bg-blue-800">
            {save.isPending ? "Saving…" : "Save Assessment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
