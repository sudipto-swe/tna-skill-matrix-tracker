"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, downloadFile, authFetch } from "@/lib/api-client";
import { useAppStore, can } from "@/store/app-store";
import type { OrgData } from "@/lib/types";
import { PageHeader, LoadingGrid, ErrorState } from "../shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  FileSpreadsheet, Download, Upload, FileUp, CheckCircle2, XCircle, FileWarning,
  LayoutGrid, Target, CalendarRange, ClipboardList, ShieldAlert, NotebookPen,
} from "lucide-react";

const REPORTS = [
  { type: "skill-matrix", title: "Employee Skill Matrix", desc: "Employees × competencies with levels, coverage % and colour-coded gaps. Includes legend & summary sheet.", icon: LayoutGrid },
  { type: "tna", title: "Department TNA Report", desc: "Full training-needs detail with reasons, priorities, recommended programs and a summary of the prioritisation model.", icon: Target },
  { type: "training-calendar", title: "Monthly Training Calendar", desc: "Sessions for the selected month with trainer, location, capacity and live seats-free formulas.", icon: CalendarRange },
  { type: "annual-plan", title: "Annual Training Plan", desc: "Programs × months planning matrix for the selected year with per-program session totals.", icon: NotebookPen },
  { type: "attendance", title: "Training Attendance", desc: "Per-session attendance sheet with signature lines — attendance tracked separately from qualification.", icon: ClipboardList },
  { type: "qualification-expiry", title: "Qualification Expiry Report", desc: "All qualifications with days-remaining and expiry buckets (expired / ≤7d / ≤30d / valid).", icon: ShieldAlert },
];

export function ReportsView() {
  const { user } = useAppStore();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [deptId, setDeptId] = useState("all");
  const [sessionId, setSessionId] = useState("all");
  const [importOpen, setImportOpen] = useState(false);
  const org = useQuery({ queryKey: ["org"], queryFn: () => api<OrgData>("/api/org") });

  const sessions = useQuery({
    queryKey: ["sessions", "reports"],
    queryFn: () => api<{ sessions: { id: string; code: string; title: string; date: string }[] }>("/api/training/sessions"),
  });

  function download(type: string, format: "xlsx" | "csv") {
    const p = new URLSearchParams({ format });
    if (deptId !== "all") p.set("deptId", deptId);
    if (type === "training-calendar") p.set("month", month);
    if (type === "annual-plan") p.set("year", year);
    if (type === "attendance") {
      if (sessionId === "all") { toast.error("Select a session for the attendance report."); return; }
      p.set("sessionId", sessionId);
    }
    void downloadFile(`/api/reports/${type}?${p.toString()}`).catch((e) => toast.error(e.message));
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Reports & Imports"
        description="Management-ready Excel workbooks with formatted headers, filters, colour coding and summary sheets. CSV available for every report; TNA and Skill Matrix also print cleanly to PDF."
        actions={can(user, "import:execute") ? (
          <Button className="bg-blue-700 hover:bg-blue-800 dark:bg-blue-700" onClick={() => setImportOpen(true)}>
            <FileUp className="h-4 w-4" aria-hidden /> Import Employees
          </Button>
        ) : undefined}
      />

      {/* Global report filters */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-white p-3 dark:bg-card">
        <Label className="text-sm text-muted-foreground">Filters:</Label>
        <Select value={deptId} onValueChange={setDeptId}>
          <SelectTrigger className="h-9 w-44" aria-label="Department"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All departments</SelectItem>{org.data?.departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
        </Select>
        <div className="flex items-center gap-1.5">
          <Label htmlFor="rep-month" className="text-xs text-muted-foreground">Calendar month:</Label>
          <Input id="rep-month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="h-9 w-36" />
        </div>
        <div className="flex items-center gap-1.5">
          <Label htmlFor="rep-year" className="text-xs text-muted-foreground">Plan year:</Label>
          <Input id="rep-year" type="number" min={2023} max={2035} value={year} onChange={(e) => setYear(e.target.value)} className="h-9 w-24" />
        </div>
        <div className="flex items-center gap-1.5">
          <Label className="text-xs text-muted-foreground">Session (attendance):</Label>
          <Select value={sessionId} onValueChange={setSessionId}>
            <SelectTrigger className="h-9 w-72" aria-label="Session"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Select a session…</SelectItem>
              {sessions.data?.sessions.map((s) => <SelectItem key={s.id} value={s.id}>{s.code} — {s.title}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button
          variant="outline"
          className="ml-auto"
          onClick={() => void downloadFile("/api/reports/employee-import-template").catch((e) => toast.error(e.message))}
        >
          <Download className="h-4 w-4" aria-hidden /> Import Template
        </Button>
      </div>

      {/* Report cards */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {REPORTS.map((r) => (
          <Card key={r.type} className="flex flex-col">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <span className="rounded-lg bg-blue-50 p-1.5 text-blue-700 dark:bg-blue-950 dark:text-blue-400"><r.icon className="h-4 w-4" aria-hidden /></span>
                {r.title}
              </CardTitle>
              <CardDescription className="min-h-10 text-xs">{r.desc}</CardDescription>
            </CardHeader>
            <CardContent className="mt-auto flex gap-2">
              <Button size="sm" className="flex-1 bg-blue-700 hover:bg-blue-800 dark:bg-blue-700" onClick={() => download(r.type, "xlsx")}>
                <FileSpreadsheet className="mr-1 h-4 w-4" aria-hidden /> XLSX
              </Button>
              <Button size="sm" variant="outline" className="flex-1" onClick={() => download(r.type, "csv")}>
                <Download className="mr-1 h-4 w-4" aria-hidden /> CSV
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Alert>
        <FileWarning className="h-4 w-4" aria-hidden />
        <AlertTitle>Every export is audit-logged</AlertTitle>
        <AlertDescription>
          Report generation is recorded in the audit trail with user, scope and format. Exports contain synthetic data only.
        </AlertDescription>
      </Alert>

      {importOpen && <ImportWizard onClose={() => setImportOpen(false)} />}
    </div>
  );
}

interface ImportPreviewResponse {
  fileName: string; total: number; validCount: number; invalidCount: number;
  preview: { employeeCode: string; name: string; department: string; jobRole: string; designation: string; joiningDate: string; status: string; shift: string; category: string }[];
  invalidPreview: { row: number; employeeCode: string; errors: string[] }[];
  departments: string[]; jobRoles: string[];
}

function ImportWizard({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const [committing, setCommitting] = useState(false);

  const runPreview = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      fd.append("file", file!);
      const res = await authFetch("/api/import/preview", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Preview failed");
      return data as ImportPreviewResponse;
    },
    onSuccess: (d) => { setPreview(d); setStep(2); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Preview failed"),
  });

  const commit = useMutation({
    mutationFn: () => api<{ created: number; failed: { employeeCode: string; error: string }[]; total: number }>("/api/import/commit", {
      method: "POST",
      body: JSON.stringify({ rows: preview!.preview.map((p) => ({ ...p, productionArea: null, supervisor: null })) }),
    }),
    onSuccess: (r) => {
      setCommitting(false);
      setStep(3);
      toast.success(`Imported ${r.created} employee(s)`);
      void qc.invalidateQueries({ queryKey: ["employees"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e) => { setCommitting(false); toast.error(e instanceof Error ? e.message : "Import failed"); },
  });

  // note: commit only imports the rows shown in preview (validated ones)
  const validRows = preview?.preview ?? [];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import Employees — {step === 1 ? "Upload" : step === 2 ? "Validate Preview" : "Summary"}</DialogTitle>
          <DialogDescription>
            {step === 1 && "Upload the Excel/CSV template. Nothing is saved until you confirm the preview."}
            {step === 2 && `${preview?.total ?? 0} rows read — ${preview?.validCount ?? 0} valid, ${preview?.invalidCount ?? 0} rejected. Only valid rows will be imported.`}
            {step === 3 && "Import complete."}
          </DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4">
            <div className="flex items-center justify-center rounded-lg border border-dashed p-8">
              <div className="text-center">
                <Upload className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
                <p className="mt-2 text-sm text-muted-foreground">CSV or XLSX (max 2 MB, 500 rows)</p>
                <Input
                  type="file"
                  accept=".csv,.xlsx"
                  className="mx-auto mt-3 max-w-xs"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  aria-label="Employee import file"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Required columns: Employee Code, Employee Name, Department, Job Role, Designation, Joining Date (YYYY-MM-DD),
              Employment Status, Shift, Employment Category. Optional: Production Area, Supervisor. Download the template for exact formats and validation lists.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => void downloadFile("/api/reports/employee-import-template").catch((e) => toast.error(e.message))}>
                <Download className="mr-1 h-4 w-4" aria-hidden /> Template
              </Button>
              <Button className="bg-blue-700 hover:bg-blue-800" disabled={!file || runPreview.isPending} onClick={() => runPreview.mutate()}>
                {runPreview.isPending ? "Validating…" : "Validate File"}
              </Button>
            </div>
          </div>
        )}

        {step === 2 && preview && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm">
              <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">{preview.validCount} valid</Badge>
              <Badge className="bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300">{preview.invalidCount} rejected</Badge>
              <span className="text-xs text-muted-foreground">{preview.fileName}</span>
            </div>

            {preview.invalidCount > 0 && (
              <div className="max-h-40 overflow-y-auto rounded-lg border border-red-200 dark:border-red-900">
                <ul className="divide-y text-xs">
                  {preview.invalidPreview.map((r) => (
                    <li key={r.row} className="flex items-start gap-2 px-3 py-2">
                      <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600" aria-hidden />
                      <span><b>Row {r.row} ({r.employeeCode}):</b> {r.errors.join("; ")}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {preview.validCount > 0 && (
              <div className="max-h-64 overflow-y-auto rounded-lg border">
                <Table>
                  <TableHeader className="sticky top-0">
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableHead>Code</TableHead><TableHead>Name</TableHead><TableHead>Dept</TableHead><TableHead>Role</TableHead><TableHead>Joined</TableHead><TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.preview.map((r, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-mono text-xs">{r.employeeCode}</TableCell>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell className="text-sm">{r.department}</TableCell>
                        <TableCell className="text-sm">{r.jobRole}</TableCell>
                        <TableCell className="text-sm">{r.joiningDate}</TableCell>
                        <TableCell className="text-sm">{r.status}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
              <Button
                className="bg-blue-700 hover:bg-blue-800"
                disabled={preview.validCount === 0 || commit.isPending}
                onClick={() => { setCommitting(true); commit.mutate(); }}
              >
                {commit.isPending ? "Importing…" : `Import ${preview.validCount} Employee(s)`}
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4 py-4 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" aria-hidden />
            <p className="text-sm">
              <b>{preview?.validCount ?? 0}</b> employee record(s) were imported successfully. Rejected rows were skipped — fix them in the file and re-upload if needed.
            </p>
            <div className="flex justify-center gap-2">
              <Button variant="outline" onClick={onClose}>Close</Button>
              <Button variant="outline" onClick={() => { setStep(1); setFile(null); setPreview(null); }}>Import Another File</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
