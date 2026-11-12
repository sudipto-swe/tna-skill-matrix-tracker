"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, downloadFile } from "@/lib/api-client";
import { useAppStore, can } from "@/store/app-store";
import type { QualificationRow, OrgData, CompetencyRow, EmployeeListResponse } from "@/lib/types";
import { PageHeader, LoadingGrid, ErrorState, EmptyState, StatCard, fmtDate } from "../shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Download, ShieldAlert, ShieldCheck, Clock, AlertOctagon, Plus, RefreshCcw } from "lucide-react";

const BUCKETS = [
  { id: "all", label: "All" },
  { id: "expired", label: "Expired" },
  { id: "expiring_7", label: "Expiring ≤ 7 days" },
  { id: "expiring_30", label: "Expiring ≤ 30 days" },
  { id: "valid", label: "Valid" },
];

export function QualificationsView() {
  const { user, qualificationFilter, setQualificationFilter } = useAppStore();
  const [deptId, setDeptId] = useState("all");
  const [competencyId, setCompetencyId] = useState("all");
  const [search, setSearch] = useState("");
  const [issueOpen, setIssueOpen] = useState(false);
  const isEmployee = user?.roleCode === "employee";

  const org = useQuery({ queryKey: ["org"], queryFn: () => api<OrgData>("/api/org"), enabled: !isEmployee });
  const comps = useQuery({
    queryKey: ["competencies", "safety"],
    queryFn: () => api<{ competencies: CompetencyRow[] }>("/api/competencies"),
    enabled: !isEmployee,
  });
  const safetyComps = (comps.data?.competencies ?? []).filter((c) => c.safetyCritical);

  const params = new URLSearchParams({
    bucket: qualificationFilter,
    ...(deptId !== "all" && { deptId }),
    ...(competencyId !== "all" && { competencyId }),
    ...(search && { search }),
  });
  const quals = useQuery({
    queryKey: ["qualifications", params.toString()],
    queryFn: () => api<{ qualifications: QualificationRow[]; counts: { expired: number; expiring_7: number; expiring_30: number; valid: number } }>(`/api/qualifications?${params.toString()}`),
  });

  const counts = quals.data?.counts;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Qualification Monitoring"
        description="Safety-critical authorisations with configurable validity. Expired qualifications suspend task authorisation until refresher completion."
        actions={
          <>
            {can(user, "reports:generate") && (
              <Button variant="outline" onClick={() => void downloadFile(`/api/reports/qualification-expiry?${deptId !== "all" ? `deptId=${deptId}` : ""}`).catch((e) => toast.error(e.message))}>
                <Download className="h-4 w-4" aria-hidden /> Export Report
              </Button>
            )}
            {can(user, "qualifications:write") && (
              <Button className="bg-blue-700 hover:bg-blue-800 dark:bg-blue-700" onClick={() => setIssueOpen(true)}><Plus className="h-4 w-4" aria-hidden /> Issue / Renew</Button>
            )}
          </>
        }
      />

      {counts && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Expired" value={counts.expired} sub="Authorisation suspended" icon={<AlertOctagon className="h-5 w-5" aria-hidden />} tone={counts.expired ? "critical" : "success"} onClick={() => setQualificationFilter("expired")} />
          <StatCard label="Expiring ≤ 7 days" value={counts.expiring_7} sub="Book refreshers now" icon={<Clock className="h-5 w-5" aria-hidden />} tone={counts.expiring_7 ? "warning" : "default"} onClick={() => setQualificationFilter("expiring_7")} />
          <StatCard label="Expiring ≤ 30 days" value={counts.expiring_30} sub="Add to calendar" icon={<RefreshCcw className="h-5 w-5" aria-hidden />} tone={counts.expiring_30 ? "warning" : "default"} onClick={() => setQualificationFilter("expiring_30")} />
          <StatCard label="Valid" value={counts.valid} sub="Within validity" icon={<ShieldCheck className="h-5 w-5" aria-hidden />} tone="success" onClick={() => setQualificationFilter("valid")} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Select value={qualificationFilter} onValueChange={setQualificationFilter}>
          <SelectTrigger className="h-9 w-44" aria-label="Bucket"><SelectValue /></SelectTrigger>
          <SelectContent>{BUCKETS.map((b) => <SelectItem key={b.id} value={b.id}>{b.label}</SelectItem>)}</SelectContent>
        </Select>
        {!isEmployee && (
          <>
            <Select value={deptId} onValueChange={setDeptId}>
              <SelectTrigger className="h-9 w-44" aria-label="Department"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">All departments</SelectItem>{org.data?.departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={competencyId} onValueChange={setCompetencyId}>
              <SelectTrigger className="h-9 w-64" aria-label="Qualification"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">All qualifications</SelectItem>{safetyComps.map((c) => <SelectItem key={c.id} value={c.id}>{c.code} — {c.name}</SelectItem>)}</SelectContent>
            </Select>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Employee / qualification…" className="h-9 w-56" aria-label="Search" />
          </>
        )}
      </div>

      {quals.isLoading ? (
        <LoadingGrid rows={6} />
      ) : quals.error ? (
        <ErrorState message={quals.error instanceof Error ? quals.error.message : "Failed to load"} />
      ) : (quals.data?.qualifications.length ?? 0) === 0 ? (
        <EmptyState title="No qualification records" message="Nothing matches the current filter." />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-white dark:bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead>Employee</TableHead>
                {!isEmployee && <TableHead className="hidden md:table-cell">Department</TableHead>}
                <TableHead>Qualification</TableHead>
                <TableHead className="hidden lg:table-cell">Certificate</TableHead>
                <TableHead>Issued</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead className="text-center">Days Left</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {quals.data?.qualifications.map((q) => (
                <TableRow key={q.id} className={q.bucket === "expired" ? "bg-red-50/50 dark:bg-red-950/20" : ""}>
                  <TableCell><p className="font-medium">{q.employeeName}</p><p className="font-mono text-[10px] text-muted-foreground">{q.employeeCode}</p></TableCell>
                  {!isEmployee && <TableCell className="hidden text-sm text-muted-foreground md:table-cell">{q.department}</TableCell>}
                  <TableCell>
                    <p className="max-w-52 truncate text-sm font-medium">{q.competencyName}</p>
                    <p className="text-[10px] text-muted-foreground">{q.competencyCode}{q.safetyCritical && <span className="ml-1 font-bold text-red-600 dark:text-red-400">SAFETY</span>}</p>
                  </TableCell>
                  <TableCell className="hidden font-mono text-xs text-muted-foreground lg:table-cell">{q.certificateRef ?? "—"}</TableCell>
                  <TableCell className="text-sm">{fmtDate(q.issuedAt)}</TableCell>
                  <TableCell className="text-sm">{fmtDate(q.expiresAt)}</TableCell>
                  <TableCell className={`text-center text-sm font-bold tabular-nums ${q.daysRemaining < 0 ? "text-red-600 dark:text-red-400" : q.daysRemaining <= 30 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                    {q.daysRemaining < 0 ? q.daysRemaining : q.daysRemaining}
                  </TableCell>
                  <TableCell>
                    {q.bucket === "expired" ? <span className="inline-flex items-center gap-1 rounded-md bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800 dark:bg-red-950 dark:text-red-300"><ShieldAlert className="h-3 w-3" aria-hidden /> Expired</span>
                      : q.bucket === "expiring_7" ? <span className="rounded-md bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-800 dark:bg-orange-950 dark:text-orange-300">≤ 7 days</span>
                      : q.bucket === "expiring_30" ? <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">≤ 30 days</span>
                      : <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">Valid</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {issueOpen && <IssueQualificationDialog onClose={() => setIssueOpen(false)} />}
    </div>
  );
}

function IssueQualificationDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [competencyId, setCompetencyId] = useState("");
  const [issuedAt, setIssuedAt] = useState(new Date().toISOString().slice(0, 10));
  const [expiresAt, setExpiresAt] = useState("");
  const [certificateRef, setCertificateRef] = useState("");

  const employees = useQuery({
    queryKey: ["employees", "qual", search],
    queryFn: () => api<EmployeeListResponse>(`/api/employees?pageSize=10${search ? `&search=${encodeURIComponent(search)}` : ""}`),
  });
  const comps = useQuery({ queryKey: ["competencies", "safety-all"], queryFn: () => api<{ competencies: CompetencyRow[] }>("/api/competencies") });
  const safetyComps = (comps.data?.competencies ?? []).filter((c) => c.safetyCritical);

  // auto-suggest expiry from competency validity
  const selectedComp = safetyComps.find((c) => c.id === competencyId);
  function onCompChange(id: string) {
    setCompetencyId(id);
    const c = safetyComps.find((x) => x.id === id);
    if (c) {
      const d = new Date(issuedAt);
      d.setMonth(d.getMonth() + c.validityMonths);
      setExpiresAt(d.toISOString().slice(0, 10));
    }
  }

  const save = useMutation({
    mutationFn: () =>
      api("/api/qualifications", {
        method: "POST",
        body: JSON.stringify({
          employeeId, competencyId,
          issuedAt: new Date(issuedAt).toISOString(), expiresAt: new Date(expiresAt).toISOString(),
          certificateRef: certificateRef || null,
        }),
      }),
    onSuccess: () => {
      toast.success("Qualification issued / renewed");
      void qc.invalidateQueries({ queryKey: ["qualifications"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to save"),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Issue / Renew Qualification</DialogTitle>
          <DialogDescription>Creates or replaces the qualification record for an employee × safety competency pair.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="qemp">Employee *</Label>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger id="qemp"><SelectValue placeholder="Select employee" /></SelectTrigger>
              <SelectContent>
                <div className="p-1"><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="h-8" /></div>
                {employees.data?.employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.name} ({e.employeeCode}) — {e.department}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Qualification (safety-critical) *</Label>
            <Select value={competencyId} onValueChange={onCompChange}>
              <SelectTrigger><SelectValue placeholder="Select qualification" /></SelectTrigger>
              <SelectContent>{safetyComps.map((c) => <SelectItem key={c.id} value={c.id}>{c.code} — {c.name} (validity {c.validityMonths} mo)</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5"><Label htmlFor="qi">Issued *</Label><Input id="qi" type="date" value={issuedAt} onChange={(e) => { setIssuedAt(e.target.value); if (selectedComp) { const d = new Date(e.target.value); d.setMonth(d.getMonth() + selectedComp.validityMonths); setExpiresAt(d.toISOString().slice(0, 10)); } }} /></div>
            <div className="space-y-1.5"><Label htmlFor="qe">Expires *</Label><Input id="qe" type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="qc">Certificate</Label><Input id="qc" value={certificateRef} onChange={(e) => setCertificateRef(e.target.value)} placeholder="CERT-…" /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !employeeId || !competencyId || !issuedAt || !expiresAt} className="bg-blue-700 hover:bg-blue-800">
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
