"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { useAppStore, can } from "@/store/app-store";
import type { CompetencyRow, OrgData } from "@/lib/types";
import { PageHeader, LoadingGrid, ErrorState, EmptyState, LevelBadge } from "../shared";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { Search, Plus, ShieldAlert, Star, Pencil, BookOpen, GraduationCap } from "lucide-react";

const CATEGORIES = ["Technical", "Quality", "Safety", "Compliance", "Operational Excellence", "Behavioral"];

export function CompetenciesView() {
  const { user } = useAppStore();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [deptId, setDeptId] = useState("all");
  const [safetyOnly, setSafetyOnly] = useState(false);
  const [detail, setDetail] = useState<CompetencyRow | null>(null);
  const [edit, setEdit] = useState<CompetencyRow | "new" | null>(null);

  const org = useQuery({ queryKey: ["org"], queryFn: () => api<OrgData>("/api/org") });
  const params = new URLSearchParams({ ...(search && { search }), ...(category !== "all" && { category }), ...(deptId !== "all" && { deptId }) });
  const list = useQuery({
    queryKey: ["competencies", params.toString()],
    queryFn: () => api<{ competencies: CompetencyRow[] }>(`/api/competencies?${params.toString()}`),
  });

  const filtered = (list.data?.competencies ?? []).filter((c) => !safetyOnly || c.safetyCritical);
  const canWrite = can(user, "competencies:write");

  return (
    <div className="space-y-4">
      <PageHeader
        title="Competency Framework"
        description="Four-level framework defining what each role must demonstrate — levels, assessment criteria, frequency and validity."
        actions={canWrite ? <Button className="bg-blue-700 hover:bg-blue-800 dark:bg-blue-700" onClick={() => setEdit("new")}><Plus className="h-4 w-4" aria-hidden /> New Competency</Button> : undefined}
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, code…" className="h-9 pl-8" aria-label="Search competencies" />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="h-9 w-52" aria-label="Category"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All categories</SelectItem>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={deptId} onValueChange={setDeptId}>
          <SelectTrigger className="h-9 w-48" aria-label="Department"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All departments</SelectItem>{org.data?.departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Switch checked={safetyOnly} onCheckedChange={setSafetyOnly} aria-label="Safety-critical only" /> Safety-critical only
        </label>
        <span className="ml-auto text-xs text-muted-foreground">{filtered.length} competenc{filtered.length === 1 ? "y" : "ies"}</span>
      </div>

      <Tabs defaultValue="list">
        <TabsList><TabsTrigger value="list">Competency Catalogue</TabsTrigger><TabsTrigger value="matrix">Role Requirements</TabsTrigger></TabsList>

        <TabsContent value="list" className="mt-4">
          {list.isLoading ? <LoadingGrid rows={5} /> : list.error ? <ErrorState message="Failed to load competencies" /> : filtered.length === 0 ? (
            <EmptyState title="No competencies match" message="Adjust the filters." />
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map((c) => (
                <Card key={c.id} className="cursor-pointer transition-shadow hover:shadow-md" onClick={() => setDetail(c)}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-mono text-[11px] text-muted-foreground">{c.code}</p>
                        <p className="mt-0.5 font-semibold leading-tight">{c.name}</p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        {c.safetyCritical && <Badge className="gap-1 bg-red-100 text-red-800 hover:bg-red-100 dark:bg-red-950 dark:text-red-300"><ShieldAlert className="h-3 w-3" aria-hidden /> Safety</Badge>}
                        {c.mandatory && <Badge variant="outline" className="gap-1 text-[10px]"><Star className="h-3 w-3" aria-hidden /> Mandatory</Badge>}
                      </div>
                    </div>
                    <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{c.description}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                      <Badge variant="secondary" className="text-[10px]">{c.category}</Badge>
                      <span>{c.department}</span>
                      <span>· reassess {c.assessmentFrequencyMonths} mo</span>
                      <span>· valid {c.validityMonths} mo</span>
                    </div>
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      Baseline <LevelBadge level={c.baselineLevel} size="sm" /> · required by <span className="font-medium text-foreground">{c.requiredBy.length} role(s)</span>
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="matrix" className="mt-4">
          <RoleRequirementsMatrix />
        </TabsContent>
      </Tabs>

      {/* Detail dialog */}
      {detail && (
        <Dialog open onOpenChange={(o) => !o && setDetail(null)}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2 pr-6">
                {detail.name}
                {detail.safetyCritical && <Badge className="bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"><ShieldAlert className="mr-1 h-3 w-3" aria-hidden />Safety-critical</Badge>}
                {canWrite && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEdit(detail); setDetail(null); }} aria-label="Edit"><Pencil className="h-3.5 w-3.5" aria-hidden /></Button>}
              </DialogTitle>
              <DialogDescription>{detail.code} · {detail.category} · {detail.department}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 text-sm">
              <p className="text-muted-foreground">{detail.description}</p>
              <div>
                <p className="mb-1 font-medium">Assessment criteria</p>
                <p className="rounded-lg bg-muted/50 p-3 text-muted-foreground">{detail.assessmentCriteria}</p>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Baseline level</p><p className="mt-1"><LevelBadge level={detail.baselineLevel} /></p></div>
                <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Frequency</p><p className="mt-1 font-semibold">{detail.assessmentFrequencyMonths} months</p></div>
                <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Validity</p><p className="mt-1 font-semibold">{detail.validityMonths} months</p></div>
                <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Assessments</p><p className="mt-1 font-semibold tabular-nums">{detail.assessmentCount}</p></div>
              </div>
              <div>
                <p className="mb-1.5 font-medium">Required by ({detail.requiredBy.length} roles)</p>
                {detail.requiredBy.length === 0 ? <p className="text-xs text-muted-foreground">Not yet assigned to any role.</p> : (
                  <div className="max-h-44 overflow-y-auto rounded-lg border">
                    <Table>
                      <TableHeader><TableRow className="bg-muted/50 hover:bg-muted/50"><TableHead>Role</TableHead><TableHead>Department</TableHead><TableHead className="text-center">Required Level</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {detail.requiredBy.map((r) => (
                          <TableRow key={r.jobRoleId}>
                            <TableCell className="font-medium">{r.jobRole}</TableCell>
                            <TableCell className="text-muted-foreground">{r.department}</TableCell>
                            <TableCell className="text-center"><LevelBadge level={r.requiredLevel} size="sm" /></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {edit && <CompetencyEditDialog competency={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function RoleRequirementsMatrix() {
  const { user } = useAppStore();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<{ jobRoleId: string; competencyId: string; requiredLevel: number; jobRole: string; competency: string } | null>(null);

  const list = useQuery({ queryKey: ["competencies", "all"], queryFn: () => api<{ competencies: CompetencyRow[] }>("/api/competencies") });
  const comps = list.data?.competencies ?? [];
  const roles = [...new Map(comps.flatMap((c) => c.requiredBy.map((r) => [r.jobRoleId, r] as const))).values()].sort((a, b) => a.jobRole.localeCompare(b.jobRole));
  const canWrite = can(user, "competencies:write");

  const setLevel = useMutation({
    mutationFn: (data: { jobRoleId: string; competencyId: string; requiredLevel: number }) =>
      api("/api/competencies/role-requirements", { method: "PUT", body: JSON.stringify(data) }),
    onSuccess: () => { toast.success("Requirement saved"); void qc.invalidateQueries({ queryKey: ["competencies"] }); void qc.invalidateQueries({ queryKey: ["tna"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const removeLevel = useMutation({
    mutationFn: (data: { jobRoleId: string; competencyId: string }) => {
      const p = new URLSearchParams(data);
      return api(`/api/competencies/role-requirements?${p.toString()}`, { method: "DELETE" });
    },
    onSuccess: () => { toast.success("Requirement removed"); void qc.invalidateQueries({ queryKey: ["competencies"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  if (list.isLoading) return <LoadingGrid rows={5} />;
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">Required competency level per job role. {canWrite ? "Click a level chip to change it; right-click area — use the detail dialog to remove." : "Read-only — editing requires Administrator rights."}</p>
      <div className="max-h-[32rem] overflow-auto rounded-lg border bg-white dark:bg-card">
        <Table>
          <TableHeader className="sticky top-0 z-10">
            <TableRow className="bg-muted/80 backdrop-blur hover:bg-muted/80">
              <TableHead className="sticky left-0 z-20 bg-muted/80 backdrop-blur">Job Role</TableHead>
              {comps.map((c) => (
                <TableHead key={c.id} className="min-w-14 text-center">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className={`cursor-help text-[10px] font-semibold ${c.safetyCritical ? "text-red-600 dark:text-red-400" : ""}`}>{c.code}</span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-48 text-xs">{c.name}{c.safetyCritical ? " (Safety-critical)" : ""}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {roles.map((r) => (
              <TableRow key={r.jobRoleId}>
                <TableCell className="sticky left-0 z-10 bg-white font-medium dark:bg-card">{r.jobRole}<span className="block text-[10px] text-muted-foreground">{r.department}</span></TableCell>
                {comps.map((c) => {
                  const req = c.requiredBy.find((x) => x.jobRoleId === r.jobRoleId);
                  return (
                    <TableCell key={c.id} className="p-1 text-center">
                      {req ? (
                        <button
                          disabled={!canWrite}
                          className={`inline-flex h-6 w-7 items-center justify-center rounded text-[11px] font-bold ${req.requiredLevel >= 4 ? "bg-emerald-600 text-white" : req.requiredLevel === 3 ? "bg-sky-600 text-white" : "bg-slate-500/90 text-white"} ${canWrite ? "hover:ring-2 hover:ring-blue-400" : ""}`}
                          onClick={() => canWrite && setEditing({ jobRoleId: r.jobRoleId, competencyId: c.id, requiredLevel: req.requiredLevel, jobRole: r.jobRole, competency: `${c.code} — ${c.name}` })}
                          title={`${c.name}: L${req.requiredLevel}`}
                        >
                          {req.requiredLevel}
                        </button>
                      ) : (
                        <span className="text-muted-foreground/30">·</span>
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {editing && (
        <Dialog open onOpenChange={(o) => !o && setEditing(null)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader><DialogTitle>Set Required Level</DialogTitle><DialogDescription>{editing.jobRole} → {editing.competency}</DialogDescription></DialogHeader>
            <div className="flex items-center justify-center gap-2">
              {[1, 2, 3, 4].map((l) => (
                <Button key={l} variant={editing.requiredLevel === l ? "default" : "outline"} size="lg" className="h-14 w-14 text-lg font-bold" onClick={() => setEditing({ ...editing, requiredLevel: l })}>{l}</Button>
              ))}
            </div>
            <DialogFooter>
              <Button variant="outline" className="mr-auto text-red-600 hover:text-red-700 dark:text-red-400" onClick={() => { removeLevel.mutate({ jobRoleId: editing.jobRoleId, competencyId: editing.competencyId }); setEditing(null); }}>Remove requirement</Button>
              <Button className="bg-blue-700 hover:bg-blue-800" onClick={() => { setLevel.mutate({ jobRoleId: editing.jobRoleId, competencyId: editing.competencyId, requiredLevel: editing.requiredLevel }); setEditing(null); }}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function CompetencyEditDialog({ competency, onClose }: { competency: CompetencyRow | null; onClose: () => void }) {
  const qc = useQueryClient();
  const org = useQuery({ queryKey: ["org"], queryFn: () => api<OrgData>("/api/org") });
  const [form, setForm] = useState({
    code: competency?.code ?? "", name: competency?.name ?? "", description: competency?.description ?? "",
    category: competency?.category ?? "Technical", departmentId: competency?.departmentId ?? "",
    baselineLevel: String(competency?.baselineLevel ?? 2), assessmentCriteria: competency?.assessmentCriteria ?? "",
    assessmentFrequencyMonths: String(competency?.assessmentFrequencyMonths ?? 12), validityMonths: String(competency?.validityMonths ?? 24),
    safetyCritical: competency?.safetyCritical ?? false, mandatory: competency?.mandatory ?? false,
  });
  const set = (k: string, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        code: form.code, name: form.name, description: form.description, category: form.category,
        departmentId: form.departmentId || null, baselineLevel: Number(form.baselineLevel),
        assessmentCriteria: form.assessmentCriteria,
        assessmentFrequencyMonths: Number(form.assessmentFrequencyMonths), validityMonths: Number(form.validityMonths),
        safetyCritical: form.safetyCritical, mandatory: form.mandatory,
      };
      return competency
        ? api(`/api/competencies/${competency.id}`, { method: "PUT", body: JSON.stringify(payload) })
        : api("/api/competencies", { method: "POST", body: JSON.stringify(payload) });
    },
    onSuccess: () => { toast.success(competency ? "Competency updated" : "Competency created"); void qc.invalidateQueries({ queryKey: ["competencies"] }); onClose(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to save"),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{competency ? "Edit Competency" : "New Competency"}</DialogTitle>
          <DialogDescription>Framework configuration — changes feed the TNA engine immediately.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5"><Label>Code *</Label><Input value={form.code} onChange={(e) => set("code", e.target.value)} placeholder="C-029" disabled={!!competency} /></div>
            <div className="col-span-2 space-y-1.5"><Label>Name *</Label><Input value={form.name} onChange={(e) => set("name", e.target.value)} /></div>
          </div>
          <div className="space-y-1.5"><Label>Description *</Label><Textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={2} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Category *</Label>
              <Select value={form.category} onValueChange={(v) => set("category", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Owning Department</Label>
              <Select value={form.departmentId || "none"} onValueChange={(v) => set("departmentId", v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Plant-wide</SelectItem>
                  {org.data?.departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5"><Label>Assessment Criteria *</Label><Textarea value={form.assessmentCriteria} onChange={(e) => set("assessmentCriteria", e.target.value)} rows={2} /></div>
          <div className="grid grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label>Baseline</Label>
              <Select value={form.baselineLevel} onValueChange={(v) => set("baselineLevel", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{[1, 2, 3, 4].map((l) => <SelectItem key={l} value={String(l)}>L{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Freq (mo)</Label><Input type="number" min={1} max={60} value={form.assessmentFrequencyMonths} onChange={(e) => set("assessmentFrequencyMonths", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Validity (mo)</Label><Input type="number" min={1} max={120} value={form.validityMonths} onChange={(e) => set("validityMonths", e.target.value)} /></div>
            <div className="flex flex-col justify-end gap-2 pb-1">
              <label className="flex items-center gap-1.5 text-xs"><Switch checked={form.safetyCritical} onCheckedChange={(v) => set("safetyCritical", v)} aria-label="Safety critical" /> <ShieldAlert className="h-3.5 w-3.5 text-red-600" aria-hidden /> Safety</label>
              <label className="flex items-center gap-1.5 text-xs"><Switch checked={form.mandatory} onCheckedChange={(v) => set("mandatory", v)} aria-label="Mandatory" /> <BookOpen className="h-3.5 w-3.5 text-blue-700" aria-hidden /> Mandatory</label>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !form.code || !form.name || !form.description || !form.assessmentCriteria} className="bg-blue-700 hover:bg-blue-800">
            {save.isPending ? "Saving…" : competency ? "Save Changes" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
