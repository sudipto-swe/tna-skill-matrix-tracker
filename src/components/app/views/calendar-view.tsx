"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, downloadFile } from "@/lib/api-client";
import { useAppStore, can } from "@/store/app-store";
import type { TrainingSessionRow, ProgramRow, OrgData, SessionDetail } from "@/lib/types";
import { PageHeader, LoadingGrid, ErrorState, EmptyState, SessionStatusBadge, fmtDate } from "../shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Download, Users, ClipboardCheck, FileSpreadsheet, MapPin, User as UserIcon, Clock } from "lucide-react";
import { addMonths, format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameDay, isSameMonth, parseISO } from "date-fns";

export function CalendarView() {
  const { user, openSession, calendarMonth, setCalendarMonth } = useAppStore();
  const [tab, setTab] = useState<"month" | "week" | "table">("month");
  const [weekAnchor, setWeekAnchor] = useState(new Date());
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const canWrite = can(user, "training:write");

  const monthDate = parseISO(`${calendarMonth}-01`);
  const from = tab === "week" ? startOfWeek(weekAnchor, { weekStartsOn: 1 }) : startOfMonth(monthDate);
  const to = tab === "week" ? endOfWeek(weekAnchor, { weekStartsOn: 1 }) : endOfMonth(monthDate);

  const sessions = useQuery({
    queryKey: ["sessions", from.toISOString(), to.toISOString()],
    queryFn: () => api<{ sessions: TrainingSessionRow[] }>(`/api/training/sessions?from=${from.toISOString()}&to=${to.toISOString()}`),
  });
  const tableSessions = useQuery({
    queryKey: ["sessions", "table", statusFilter],
    queryFn: () => api<{ sessions: TrainingSessionRow[] }>(`/api/training/sessions${statusFilter !== "all" ? `?status=${statusFilter}` : ""}`),
  });

  const list = sessions.data?.sessions ?? [];

  // month grid cells
  const gridStart = startOfWeek(startOfMonth(monthDate), { weekStartsOn: 1 });
  const gridEnd = endOfWeek(endOfMonth(monthDate), { weekStartsOn: 1 });
  const days: Date[] = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) days.push(d);

  const weekDays: Date[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) weekDays.push(d);

  function shiftMonth(delta: number) {
    setCalendarMonth(format(addMonths(monthDate, delta), "yyyy-MM"));
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Training Calendar"
        description="Annual and monthly training schedule — duplicate bookings and capacity conflicts are blocked server-side."
        actions={
          <>
            {can(user, "reports:generate") && (
              <>
                <Button variant="outline" onClick={() => void downloadFile(`/api/reports/training-calendar?month=${calendarMonth}`).catch((e) => toast.error(e.message))}>
                  <Download className="h-4 w-4" aria-hidden /> Month XLSX
                </Button>
                <Button variant="outline" onClick={() => void downloadFile(`/api/reports/annual-plan?year=${monthDate.getFullYear()}`).catch((e) => toast.error(e.message))}>
                  <FileSpreadsheet className="h-4 w-4" aria-hidden /> Annual Plan
                </Button>
              </>
            )}
            {canWrite && <Button className="bg-blue-700 hover:bg-blue-800 dark:bg-blue-700" onClick={() => setScheduleOpen(true)}><Plus className="h-4 w-4" aria-hidden /> Schedule Session</Button>}
          </>
        }
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <div className="flex flex-wrap items-center gap-2">
          <TabsList>
            <TabsTrigger value="month" className="text-xs">Month</TabsTrigger>
            <TabsTrigger value="week" className="text-xs">Week</TabsTrigger>
            <TabsTrigger value="table" className="text-xs">Table</TabsTrigger>
          </TabsList>
          {tab !== "table" && (
            <div className="ml-auto flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => (tab === "month" ? shiftMonth(-1) : setWeekAnchor(addDays(weekAnchor, -7)))} aria-label="Previous">
                <ChevronLeft className="h-4 w-4" aria-hidden />
              </Button>
              <span className="min-w-40 text-center text-sm font-semibold">
                {tab === "month" ? format(monthDate, "MMMM yyyy") : `${format(from, "dd MMM")} – ${format(to, "dd MMM yyyy")}`}
              </span>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => (tab === "month" ? shiftMonth(1) : setWeekAnchor(addDays(weekAnchor, 7)))} aria-label="Next">
                <ChevronRight className="h-4 w-4" aria-hidden />
              </Button>
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => { const n = new Date(); setCalendarMonth(format(n, "yyyy-MM")); setWeekAnchor(n); }}>Today</Button>
            </div>
          )}
          {tab === "table" && (
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="ml-auto h-9 w-40" aria-label="Status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {["scheduled", "in_progress", "completed", "cancelled"].map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* MONTH */}
        <TabsContent value="month" className="mt-4">
          {sessions.isLoading ? <LoadingGrid rows={6} /> : (
            <div className="overflow-hidden rounded-lg border bg-white dark:bg-card">
              <div className="grid grid-cols-7 border-b bg-muted/50 text-center text-xs font-semibold text-muted-foreground">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="py-2">{d}</div>)}
              </div>
              <div className="grid grid-cols-7">
                {days.map((day) => {
                  const daySessions = list.filter((s) => isSameDay(new Date(s.date), day));
                  const isToday = isSameDay(day, new Date());
                  const inMonth = isSameMonth(day, monthDate);
                  return (
                    <div key={day.toISOString()} className={`min-h-24 border-b border-r p-1.5 ${!inMonth ? "bg-muted/30 text-muted-foreground/50" : ""} ${isToday ? "bg-blue-50/70 dark:bg-blue-950/30" : ""}`}>
                      <p className={`mb-1 text-right text-xs font-semibold ${isToday ? "text-blue-700 dark:text-blue-400" : ""}`}>{format(day, "d")}</p>
                      <div className="space-y-1">
                        {daySessions.slice(0, 3).map((s) => (
                          <button key={s.id} onClick={() => setDetailId(s.id)} className="block w-full truncate rounded bg-blue-100 px-1.5 py-0.5 text-left text-[10px] font-medium text-blue-900 hover:bg-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:hover:bg-blue-900" title={`${s.title} · ${s.startTime} · ${s.location}`}>
                            {s.startTime} {s.title}
                          </button>
                        ))}
                        {daySessions.length > 3 && <p className="pl-1 text-[10px] text-muted-foreground">+{daySessions.length - 3} more</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </TabsContent>

        {/* WEEK */}
        <TabsContent value="week" className="mt-4">
          <div className="space-y-3">
            {weekDays.map((day) => {
              const daySessions = list.filter((s) => isSameDay(new Date(s.date), day));
              return (
                <div key={day.toISOString()} className={`rounded-lg border bg-white p-3 dark:bg-card ${isSameDay(day, new Date()) ? "ring-2 ring-blue-300 dark:ring-blue-800" : ""}`}>
                  <p className="mb-2 text-sm font-semibold">
                    {format(day, "EEEE, dd MMMM")} <span className="ml-1 text-xs font-normal text-muted-foreground">({daySessions.length} session{daySessions.length === 1 ? "" : "s"})</span>
                  </p>
                  {daySessions.length === 0 ? (
                    <p className="py-1 text-xs text-muted-foreground">No sessions scheduled.</p>
                  ) : (
                    <ul className="space-y-2">
                      {daySessions.map((s) => <SessionRow key={s.id} s={s} onOpen={() => setDetailId(s.id)} />)}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </TabsContent>

        {/* TABLE */}
        <TabsContent value="table" className="mt-4">
          {tableSessions.isLoading ? <LoadingGrid rows={6} /> : (tableSessions.data?.sessions.length ?? 0) === 0 ? (
            <EmptyState title="No sessions" message="Schedule a training session to get started." />
          ) : (
            <div className="overflow-x-auto rounded-lg border bg-white dark:bg-card">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead>Date</TableHead><TableHead>Training</TableHead><TableHead className="hidden md:table-cell">Trainer</TableHead>
                    <TableHead className="hidden lg:table-cell">Location</TableHead><TableHead>Dept</TableHead><TableHead className="text-center">Enrolled</TableHead><TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tableSessions.data?.sessions.map((s) => (
                    <TableRow key={s.id} className="cursor-pointer" onClick={() => setDetailId(s.id)}>
                      <TableCell className="whitespace-nowrap text-sm">{fmtDate(s.date)}<span className="block text-xs text-muted-foreground">{s.startTime}</span></TableCell>
                      <TableCell><p className="max-w-64 truncate font-medium">{s.title}</p><p className="text-xs text-muted-foreground">{s.code} · {s.category}</p></TableCell>
                      <TableCell className="hidden max-w-40 truncate text-sm md:table-cell">{s.trainer}</TableCell>
                      <TableCell className="hidden text-sm lg:table-cell">{s.location}</TableCell>
                      <TableCell className="text-xs">{s.targetDepartment}</TableCell>
                      <TableCell className="text-center text-sm tabular-nums">
                        <span className={s.enrolled >= s.capacity ? "font-bold text-red-600 dark:text-red-400" : ""}>{s.enrolled}</span>/{s.capacity}
                      </TableCell>
                      <TableCell><SessionStatusBadge status={s.status} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {scheduleOpen && <ScheduleSessionDialog onClose={() => setScheduleOpen(false)} />}
      {detailId && <SessionDetailDialog sessionId={detailId} onClose={() => setDetailId(null)} onRecordAttendance={(id) => { setDetailId(null); openSession(id, "attendance"); }} />}
    </div>
  );
}

function SessionRow({ s, onOpen }: { s: TrainingSessionRow; onOpen: () => void }) {
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 hover:bg-slate-50 dark:hover:bg-accent/50">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="rounded bg-blue-700 px-1.5 py-0.5 text-[11px] font-bold text-white">{s.startTime}</span>
        <div className="min-w-0">
          <button onClick={onOpen} className="block max-w-80 truncate text-left text-sm font-medium hover:underline">{s.title}</button>
          <p className="flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
            <span className="inline items-center gap-1"><UserIcon className="mr-0.5 inline h-3 w-3" aria-hidden />{s.trainer}</span>
            <span className="inline items-center gap-1"><MapPin className="mr-0.5 inline h-3 w-3" aria-hidden />{s.location}</span>
            <span className="inline items-center gap-1"><Clock className="mr-0.5 inline h-3 w-3" aria-hidden />{s.durationHours}h</span>
          </p>
        </div>
      </div>
      <Badge variant="secondary" className="text-[10px]">{s.targetDepartment}</Badge>
      <span className="text-xs tabular-nums text-muted-foreground">{s.enrolled}/{s.capacity}</span>
      <SessionStatusBadge status={s.status} />
    </li>
  );
}

function ScheduleSessionDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const org = useQuery({ queryKey: ["org"], queryFn: () => api<OrgData>("/api/org") });
  const programs = useQuery({ queryKey: ["programs"], queryFn: () => api<{ programs: ProgramRow[] }>("/api/training/programs") });
  const [form, setForm] = useState({
    programId: "", title: "", scheduledDate: new Date().toISOString().slice(0, 10), startTime: "09:00",
    durationHours: "4", location: "Training Room A", trainer: "", capacity: "16", targetDepartmentId: "", notes: "",
  });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const program = programs.data?.programs.find((p) => p.id === form.programId);

  const create = useMutation({
    mutationFn: () =>
      api("/api/training/sessions", {
        method: "POST",
        body: JSON.stringify({
          programId: form.programId, title: form.title, scheduledDate: new Date(`${form.scheduledDate}T00:00:00`).toISOString(),
          startTime: form.startTime, durationHours: Number(form.durationHours), location: form.location,
          trainer: form.trainer, capacity: Number(form.capacity), targetDepartmentId: form.targetDepartmentId || null, notes: form.notes || null,
        }),
      }),
    onSuccess: () => {
      toast.success("Session scheduled");
      void qc.invalidateQueries({ queryKey: ["sessions"] });
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to schedule"),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Schedule Training Session</DialogTitle>
          <DialogDescription>Duplicate titles on the same day/location and trainer double-booking are rejected automatically.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label>Program *</Label>
            <Select value={form.programId} onValueChange={(v) => {
              set("programId", v);
              const p = programs.data?.programs.find((x) => x.id === v);
              if (p) { set("title", p.title); set("durationHours", String(p.durationHours)); }
            }}>
              <SelectTrigger><SelectValue placeholder="Select program" /></SelectTrigger>
              <SelectContent>{programs.data?.programs.filter((p) => p.active).map((p) => <SelectItem key={p.id} value={p.id}>{p.code} — {p.title}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label htmlFor="stitle">Title *</Label><Input id="stitle" value={form.title} onChange={(e) => set("title", e.target.value)} /></div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5"><Label htmlFor="sdate">Date *</Label><Input id="sdate" type="date" value={form.scheduledDate} onChange={(e) => set("scheduledDate", e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="stime">Start *</Label><Input id="stime" type="time" value={form.startTime} onChange={(e) => set("startTime", e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="sdur">Hours *</Label><Input id="sdur" type="number" min={0.5} max={12} step={0.5} value={form.durationHours} onChange={(e) => set("durationHours", e.target.value)} /></div>
          </div>
          <div className="space-y-1.5"><Label htmlFor="sloc">Location *</Label><Input id="sloc" value={form.location} onChange={(e) => set("location", e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="strain">Trainer *</Label><Input id="strain" value={form.trainer} onChange={(e) => set("trainer", e.target.value)} placeholder="Name (role)" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label htmlFor="scap">Capacity *</Label><Input id="scap" type="number" min={1} max={200} value={form.capacity} onChange={(e) => set("capacity", e.target.value)} /></div>
            <div className="space-y-1.5">
              <Label>Target Department</Label>
              <Select value={form.targetDepartmentId || "none"} onValueChange={(v) => set("targetDepartmentId", v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Plant-wide</SelectItem>
                  {org.data?.departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5"><Label htmlFor="snotes">Notes</Label><Textarea id="snotes" value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} /></div>
          {program?.competency && <p className="rounded bg-muted/60 p-2 text-xs text-muted-foreground">Linked competency: {program.competency} — enrolment targets should come from the TNA gap list.</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending || !form.programId || !form.title || !form.trainer} className="bg-blue-700 hover:bg-blue-800">
            {create.isPending ? "Scheduling…" : "Schedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SessionDetailDialog({
  sessionId, onClose, onRecordAttendance,
}: { sessionId: string; onClose: () => void; onRecordAttendance?: (id: string) => void }) {
  const qc = useQueryClient();
  const { user } = useAppStore();
  const [enrollOpen, setEnrollOpen] = useState(false);
  const canWrite = can(user, "training:write");

  const detail = useQuery({
    queryKey: ["session", sessionId],
    queryFn: () => api<SessionDetail>(`/api/training/sessions/${sessionId}`),
  });

  const updateStatus = useMutation({
    mutationFn: (status: string) => api(`/api/training/sessions/${sessionId}`, { method: "PUT", body: JSON.stringify({ status }) }),
    onSuccess: () => { toast.success("Status updated"); void qc.invalidateQueries({ queryKey: ["session", sessionId] }); void qc.invalidateQueries({ queryKey: ["sessions"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  if (detail.isLoading) return <Dialog open onOpenChange={(o) => !o && onClose()}><DialogContent><DialogHeader className="sr-only"><DialogTitle>Loading session</DialogTitle><DialogDescription>Fetching session details and roster.</DialogDescription></DialogHeader><LoadingGrid rows={3} /></DialogContent></Dialog>;
  if (detail.error || !detail.data) return <Dialog open onOpenChange={(o) => !o && onClose()}><DialogContent><DialogHeader className="sr-only"><DialogTitle>Failed to load session</DialogTitle></DialogHeader><ErrorState message="Failed to load session" /></DialogContent></Dialog>;

  const { session, roster, attendanceRecorded } = detail.data;
  const present = roster.filter((r) => r.status === "present").length;
  const qualified = roster.filter((r) => r.qualified).length;

  return (
    <>
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2 pr-6">{session.title} <SessionStatusBadge status={session.status} /></DialogTitle>
            <DialogDescription>{session.code} · {session.programCode} · {session.category}</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div><p className="text-xs text-muted-foreground">Date</p><p className="font-medium">{fmtDate(session.date)}</p></div>
            <div><p className="text-xs text-muted-foreground">Time</p><p className="font-medium">{session.startTime} · {session.durationHours}h</p></div>
            <div><p className="text-xs text-muted-foreground">Location</p><p className="font-medium">{session.location}</p></div>
            <div><p className="text-xs text-muted-foreground">Trainer</p><p className="font-medium">{session.trainer}</p></div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="secondary">{session.targetDepartment}</Badge>
            <Badge variant="outline">{roster.length}/{session.capacity} enrolled</Badge>
            {attendanceRecorded > 0 && <Badge variant="outline" className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">{present}/{attendanceRecorded} present · {qualified} qualified</Badge>}
          </div>
          {canWrite && (
            <div className="flex flex-wrap gap-2">
              {session.status === "scheduled" && (
                <>
                  <Button size="sm" className="bg-blue-700 hover:bg-blue-800" onClick={() => setEnrollOpen(true)}><Users className="mr-1 h-4 w-4" aria-hidden /> Enroll Employees</Button>
                  <Button size="sm" variant="outline" onClick={() => updateStatus.mutate("in_progress")}>Start (in progress)</Button>
                  <Button size="sm" variant="outline" onClick={() => updateStatus.mutate("cancelled")} className="text-red-600 hover:text-red-700 dark:text-red-400">Cancel session</Button>
                </>
              )}
              {(session.status === "in_progress" || session.status === "completed" || new Date(session.date) < new Date()) && onRecordAttendance && (
                <Button size="sm" variant="outline" onClick={() => onRecordAttendance(sessionId)}><ClipboardCheck className="mr-1 h-4 w-4" aria-hidden /> Record Attendance</Button>
              )}
            </div>
          )}
          <div>
            <p className="mb-1.5 text-sm font-semibold">Enrolment roster ({roster.length})</p>
            {roster.length === 0 ? (
              <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">Nobody enrolled yet.</p>
            ) : (
              <div className="max-h-64 overflow-y-auto rounded-lg border">
                <Table>
                  <TableHeader className="sticky top-0"><TableRow className="bg-muted/50 hover:bg-muted/50"><TableHead>Employee</TableHead><TableHead className="hidden sm:table-cell">Department</TableHead><TableHead className="text-center">Attendance</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {roster.map((r) => (
                      <TableRow key={r.enrollmentId}>
                        <TableCell><p className="font-medium">{r.employeeName}</p><p className="font-mono text-[10px] text-muted-foreground">{r.employeeCode}</p></TableCell>
                        <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">{r.department}</TableCell>
                        <TableCell className="text-center text-xs">
                          {r.status === null ? <span className="text-muted-foreground">—</span>
                            : r.status === "present" ? <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">{r.qualified ? "Qualified" : "Present"}</span>
                            : r.status === "absent" ? <span className="rounded bg-red-100 px-1.5 py-0.5 font-medium text-red-800 dark:bg-red-950 dark:text-red-300">Absent</span>
                            : <span className="rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">Excused</span>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
      {enrollOpen && <EnrollDialog sessionId={sessionId} capacity={session.capacity} enrolled={roster.length} alreadyEnrolled={new Set(roster.map((r) => r.employeeId))} onClose={() => setEnrollOpen(false)} />}
    </>
  );
}

function EnrollDialog({
  sessionId, capacity, enrolled, alreadyEnrolled, onClose,
}: { sessionId: string; capacity: number; enrolled: number; alreadyEnrolled: Set<string>; onClose: () => void }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [deptId, setDeptId] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const remaining = capacity - enrolled;

  const org = useQuery({ queryKey: ["org"], queryFn: () => api<OrgData>("/api/org") });
  const employees = useQuery({
    queryKey: ["employees", "enroll-pool", deptId, search],
    queryFn: () => api<{ employees: { id: string; employeeCode: string; name: string; department: string; jobRole: string }[] }>(`/api/employees?pageSize=100${deptId !== "all" ? `&deptId=${deptId}` : ""}${search ? `&search=${encodeURIComponent(search)}` : ""}`),
  });

  const enroll = useMutation({
    mutationFn: () => api<{ created: number; warnings: string[] }>("/api/training/sessions/" + sessionId + "/enroll", { method: "POST", body: JSON.stringify({ employeeIds: [...selected] }) }),
    onSuccess: (r) => {
      toast.success(`${r.created} employee(s) enrolled`);
      r.warnings.forEach((w) => toast.warning(w));
      void qc.invalidateQueries({ queryKey: ["session", sessionId] });
      void qc.invalidateQueries({ queryKey: ["sessions"] });
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to enroll"),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Enroll Employees</DialogTitle>
          <DialogDescription>{enrolled}/{capacity} enrolled — {remaining} seat(s) free. Already-enrolled employees are disabled.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="h-9 w-44" aria-label="Search employees" />
          <Select value={deptId} onValueChange={setDeptId}>
            <SelectTrigger className="h-9 w-40" aria-label="Department"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All departments</SelectItem>{org.data?.departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
          </Select>
          <span className="ml-auto self-center text-xs text-muted-foreground">{selected.size} selected (max {remaining})</span>
        </div>
        <div className="max-h-72 overflow-y-auto rounded-lg border">
          {employees.isLoading ? <p className="p-4 text-sm text-muted-foreground">Loading…</p> : (
            <ul className="divide-y">
              {employees.data?.employees.map((e) => {
                const isEnrolled = alreadyEnrolled.has(e.id);
                const checked = selected.has(e.id);
                return (
                  <li key={e.id}>
                    <label className={`flex cursor-pointer items-center gap-3 px-3 py-2 text-sm ${isEnrolled ? "opacity-40" : "hover:bg-slate-50 dark:hover:bg-accent/50"}`}>
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-blue-700"
                        disabled={isEnrolled}
                        checked={checked}
                        onChange={() => setSelected((s) => { const n = new Set(s); if (n.has(e.id)) n.delete(e.id); else if (n.size < remaining) n.add(e.id); return n; })}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{e.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">{e.employeeCode} · {e.department} · {e.jobRole}</span>
                      </span>
                      {isEnrolled && <Badge variant="outline" className="text-[10px]">Enrolled</Badge>}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={() => enroll.mutate()} disabled={selected.size === 0 || enroll.isPending} className="bg-blue-700 hover:bg-blue-800">
            Enroll {selected.size > 0 ? `(${selected.size})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
