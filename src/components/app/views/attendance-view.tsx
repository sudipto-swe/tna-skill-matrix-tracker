"use client";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, downloadFile, authFetch } from "@/lib/api-client";
import { useAppStore, can } from "@/store/app-store";
import type { TrainingSessionRow, SessionDetail } from "@/lib/types";
import { PageHeader, LoadingGrid, ErrorState, EmptyState, SessionStatusBadge, fmtDate } from "../shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ClipboardCheck, Save, Download, Upload, CheckCheck } from "lucide-react";

interface DraftRecord { status: string; qualified: boolean; remarks: string }

export function AttendanceView() {
  const { user, selectedSessionId, openSession } = useAppStore();
  const qc = useQueryClient();
  const [pickedSessionId, setPickedSessionId] = useState<string>("");
  const [draft, setDraft] = useState<Record<string, DraftRecord>>({});
  const [dirty, setDirty] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const canWrite = can(user, "attendance:write");

  const sessions = useQuery({
    queryKey: ["sessions", "attendance"],
    queryFn: () => api<{ sessions: TrainingSessionRow[] }>("/api/training/sessions"),
  });

  // derived default (no effect needed): store selection → first available session
  const sessionId = pickedSessionId || selectedSessionId || sessions.data?.sessions[0]?.id || "";

  const detail = useQuery({
    queryKey: ["session", sessionId],
    queryFn: () => api<SessionDetail>(`/api/training/sessions/${sessionId}`),
    enabled: !!sessionId,
  });

  // reset the draft whenever the loaded session data changes (React "adjust state during render" pattern)
  const [prevRoster, setPrevRoster] = useState<SessionDetail | null>(null);
  if (detail.data && detail.data !== prevRoster) {
    setPrevRoster(detail.data);
    const d: Record<string, DraftRecord> = {};
    for (const r of detail.data.roster) {
      d[r.employeeId] = { status: r.status ?? "present", qualified: r.qualified ?? false, remarks: r.remarks ?? "" };
    }
    setDraft(d);
    setDirty(false);
  }

  const stats = useMemo(() => {
    const records = Object.values(draft);
    const present = records.filter((r) => r.status === "present").length;
    const qualified = records.filter((r) => r.qualified).length;
    return {
      total: records.length,
      present,
      absent: records.filter((r) => r.status === "absent").length,
      excused: records.filter((r) => r.status === "excused").length,
      qualified,
      rate: records.length ? Math.round((present / records.length) * 100) : 0,
    };
  }, [draft]);

  const save = useMutation({
    mutationFn: () =>
      api<{ saved: number; attendancePct: number }>("/api/attendance", {
        method: "PUT",
        body: JSON.stringify({
          sessionId,
          records: Object.entries(draft).map(([employeeId, r]) => ({ employeeId, status: r.status, qualified: r.qualified, remarks: r.remarks || null })),
        }),
      }),
    onSuccess: (r) => {
      toast.success("Attendance saved", { description: `${r.saved} records · ${r.attendancePct}% present` });
      setDirty(false);
      void qc.invalidateQueries({ queryKey: ["session", sessionId] });
      void qc.invalidateQueries({ queryKey: ["sessions"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to save"),
  });

  if (sessions.isLoading) return <LoadingGrid rows={6} />;
  if (sessions.error) return <ErrorState message="Failed to load sessions" />;

  const upcoming = sessions.data?.sessions ?? [];
  if (upcoming.length === 0) {
    return (
      <div className="space-y-4">
        <PageHeader title="Attendance Management" description="Register attendance and qualification outcomes per training session." />
        <EmptyState title="No training sessions yet" message="Schedule sessions in the Training Calendar first." />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Attendance Management"
        description="Attendance (participation) is tracked separately from qualification — an employee can attend without qualifying."
        actions={
          <>
            {canWrite && (
              <>
                <Button variant="outline" onClick={() => setBulkOpen(true)}><Upload className="h-4 w-4" aria-hidden /> Bulk Upload CSV</Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setDraft((d) => Object.fromEntries(Object.entries(d).map(([k, v]) => [k, { ...v, status: "present" }])));
                    setDirty(true);
                    toast.info("All marked present — review and save");
                  }}
                >
                  <CheckCheck className="h-4 w-4" aria-hidden /> Mark All Present
                </Button>
              </>
            )}
            {can(user, "reports:generate") && sessionId && (
              <Button variant="outline" onClick={() => void downloadFile(`/api/reports/attendance?sessionId=${sessionId}`).catch((e) => toast.error(e.message))}>
                <Download className="h-4 w-4" aria-hidden /> Export Sheet
              </Button>
            )}
            {canWrite && dirty && (
              <Button className="bg-blue-700 hover:bg-blue-800 dark:bg-blue-700" onClick={() => save.mutate()} disabled={save.isPending}>
                <Save className="h-4 w-4" aria-hidden /> {save.isPending ? "Saving…" : "Save Attendance"}
              </Button>
            )}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Select value={sessionId} onValueChange={(v) => { setPickedSessionId(v); openSession(v, "attendance"); }}>
          <SelectTrigger className="h-9 w-full sm:w-[26rem]" aria-label="Select session"><SelectValue placeholder="Select a training session" /></SelectTrigger>
          <SelectContent>
            {upcoming.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {fmtDate(s.date)} · {s.title} ({s.code}) — {s.status.replace("_", " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {detail.data && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <SessionStatusBadge status={detail.data.session.status} />
            <Badge variant="outline">{detail.data.roster.length} enrolled</Badge>
            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">{stats.rate}% present</Badge>
            {stats.qualified > 0 && <Badge variant="outline" className="bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300">{stats.qualified} qualified</Badge>}
            {stats.absent > 0 && <Badge variant="outline" className="bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300">{stats.absent} absent</Badge>}
          </div>
        )}
      </div>

      {detail.isLoading ? (
        <LoadingGrid rows={6} />
      ) : detail.error ? (
        <ErrorState message={detail.error instanceof Error ? detail.error.message : "Failed to load"} />
      ) : !detail.data || detail.data.roster.length === 0 ? (
        <EmptyState title="No enrolments for this session" message="Enroll employees from the Training Calendar first." />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-white dark:bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead>Employee</TableHead>
                <TableHead className="hidden md:table-cell">Department</TableHead>
                <TableHead className="hidden lg:table-cell">Shift</TableHead>
                <TableHead className="text-center">Attendance</TableHead>
                <TableHead className="text-center">Qualified</TableHead>
                <TableHead className="hidden md:table-cell">Remarks</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detail.data.roster.map((r) => {
                const d = draft[r.employeeId] ?? { status: "present", qualified: false, remarks: "" };
                const isSaved = r.status !== null;
                return (
                  <TableRow key={r.enrollmentId}>
                    <TableCell>
                      <p className="font-medium">{r.employeeName}</p>
                      <p className="font-mono text-[10px] text-muted-foreground">{r.employeeCode} {isSaved && <span className="font-sans text-emerald-600">· saved</span>}</p>
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground md:table-cell">{r.department}</TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">{r.shift}</TableCell>
                    <TableCell className="text-center">
                      {canWrite ? (
                        <Select value={d.status} onValueChange={(v) => { setDraft((x) => ({ ...x, [r.employeeId]: { ...d, status: v } })); setDirty(true); }}>
                          <SelectTrigger className="h-8 w-28" aria-label={`Attendance for ${r.employeeName}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="present">Present</SelectItem>
                            <SelectItem value="absent">Absent</SelectItem>
                            <SelectItem value="excused">Excused</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-sm">{d.status}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={d.qualified}
                        disabled={!canWrite || d.status !== "present"}
                        onCheckedChange={(v) => { setDraft((x) => ({ ...x, [r.employeeId]: { ...d, qualified: v } })); setDirty(true); }}
                        aria-label={`Qualified: ${r.employeeName}`}
                      />
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {canWrite ? (
                        <Input
                          value={d.remarks}
                          onChange={(e) => { setDraft((x) => ({ ...x, [r.employeeId]: { ...d, remarks: e.target.value } })); setDirty(true); }}
                          placeholder="Trainer remarks…"
                          className="h-8 w-56"
                          aria-label={`Remarks for ${r.employeeName}`}
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">{d.remarks || "—"}</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {bulkOpen && sessionId && <BulkUploadDialog sessionId={sessionId} onClose={() => setBulkOpen(false)} />}
    </div>
  );
}

function BulkUploadDialog({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<{ saved: number; parseErrors: { line: number; error: string }[] } | null>(null);

  const upload = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      fd.append("sessionId", sessionId);
      fd.append("file", file!);
      const res = await authFetch("/api/attendance/bulk", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      return data as { saved: number; parseErrors: { line: number; error: string }[] };
    },
    onSuccess: (r) => {
      setResult(r);
      toast.success(`${r.saved} record(s) imported`);
      void qc.invalidateQueries({ queryKey: ["session", sessionId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Upload failed"),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Bulk Attendance Upload</DialogTitle>
          <DialogDescription>
            CSV columns: <code className="rounded bg-muted px-1">employeeCode,status,qualified,remarks</code> — status ∈ present|absent|excused, qualified ∈ yes|no. Only enrolled employees are accepted.
          </DialogDescription>
        </DialogHeader>
        <Input type="file" accept=".csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} aria-label="CSV file" />
        {result && (
          <div className="rounded-lg border p-3 text-sm">
            <p className="font-medium">{result.saved} record(s) saved.</p>
            {result.parseErrors.length > 0 && (
              <>
                <p className="mt-1 text-xs font-semibold text-red-600">Rejected rows:</p>
                <ul className="mt-1 max-h-32 overflow-y-auto text-xs text-muted-foreground">
                  {result.parseErrors.map((e, i) => <li key={i}>Line {e.line}: {e.error}</li>)}
                </ul>
              </>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={() => upload.mutate()} disabled={!file || upload.isPending} className="bg-blue-700 hover:bg-blue-800">
            <Upload className="mr-1 h-4 w-4" aria-hidden /> {upload.isPending ? "Uploading…" : "Upload"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
