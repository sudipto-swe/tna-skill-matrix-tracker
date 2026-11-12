"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, downloadFile } from "@/lib/api-client";
import { useAppStore, can } from "@/store/app-store";
import type { EmployeeListResponse, OrgData } from "@/lib/types";
import { PageHeader, LoadingGrid, ErrorState, EmptyState, EmployeeStatusBadge, fmtDate } from "../shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { toast } from "sonner";
import { Search, UserPlus, Download, FileUp, Loader2 } from "lucide-react";

export function EmployeesView() {
  const { user, openEmployee, setView } = useAppStore();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [deptId, setDeptId] = useState("all");
  const [roleId, setRoleId] = useState("all");
  const [shift, setShift] = useState("all");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [addOpen, setAddOpen] = useState(false);
  const pageSize = 12;

  const org = useQuery({ queryKey: ["org"], queryFn: () => api<OrgData>("/api/org") });

  const params = new URLSearchParams({
    search, page: String(page), pageSize: String(pageSize),
    ...(deptId !== "all" && { deptId }),
    ...(roleId !== "all" && { roleId }),
    ...(shift !== "all" && { shift }),
    ...(status !== "all" && { status }),
  });
  const list = useQuery({
    queryKey: ["employees", params.toString()],
    queryFn: () => api<EmployeeListResponse>(`/api/employees?${params.toString()}`),
  });

  const totalPages = Math.max(1, Math.ceil((list.data?.total ?? 0) / pageSize));
  const visibleRoles = (org.data?.jobRoles ?? []).filter((r) => deptId === "all" || r.departmentId === deptId);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Employee Directory"
        description={user?.roleCode === "employee" ? "Your employee record." : "Synthetic manufacturing workforce — click a row to open the competency profile."}
        actions={
          <>
            {can(user, "employees:write") && (
              <Button onClick={() => setAddOpen(true)} className="bg-blue-700 hover:bg-blue-800 dark:bg-blue-700 dark:hover:bg-blue-600">
                <UserPlus className="h-4 w-4" aria-hidden /> Add Employee
              </Button>
            )}
            {can(user, "import:execute") && (
              <Button variant="outline" onClick={() => setView("reports")}>
                <FileUp className="h-4 w-4" aria-hidden /> Import
              </Button>
            )}
            {can(user, "reports:generate") && (
              <Button variant="outline" onClick={() => void downloadFile("/api/reports/skill-matrix").catch((e) => toast.error(e.message))}>
                <Download className="h-4 w-4" aria-hidden /> Export Matrix
              </Button>
            )}
          </>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Name, code, designation…" className="h-9 pl-8" aria-label="Search employees" />
        </div>
        <Select value={deptId} onValueChange={(v) => { setDeptId(v); setRoleId("all"); setPage(1); }}>
          <SelectTrigger className="h-9 w-44" aria-label="Filter department"><SelectValue placeholder="Department" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All departments</SelectItem>
            {org.data?.departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={roleId} onValueChange={(v) => { setRoleId(v); setPage(1); }}>
          <SelectTrigger className="h-9 w-56" aria-label="Filter job role"><SelectValue placeholder="Job role" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All job roles</SelectItem>
            {visibleRoles.map((r) => <SelectItem key={r.id} value={r.id}>{r.title}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={shift} onValueChange={(v) => { setShift(v); setPage(1); }}>
          <SelectTrigger className="h-9 w-32" aria-label="Filter shift"><SelectValue placeholder="Shift" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All shifts</SelectItem>
            {org.data?.shifts.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
          <SelectTrigger className="h-9 w-36" aria-label="Filter status"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {org.data?.statuses.filter((s) => s !== "separated").map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="ml-auto text-xs text-muted-foreground">{list.data ? `${list.data.total} employee(s)` : ""}</span>
      </div>

      {list.isLoading ? (
        <LoadingGrid rows={8} />
      ) : list.error ? (
        <ErrorState message={list.error instanceof Error ? list.error.message : "Failed to load"} />
      ) : (list.data?.employees.length ?? 0) === 0 ? (
        <EmptyState title="No employees found" message="Adjust the filters or add a new employee record." />
      ) : (
        <div className="rounded-lg border bg-white dark:bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead className="w-24">Code</TableHead>
                <TableHead>Employee</TableHead>
                <TableHead className="hidden md:table-cell">Department</TableHead>
                <TableHead className="hidden lg:table-cell">Job Role</TableHead>
                <TableHead className="hidden sm:table-cell">Shift</TableHead>
                <TableHead className="hidden xl:table-cell">Joined</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.data?.employees.map((e) => (
                <TableRow key={e.id} className="cursor-pointer" onClick={() => openEmployee(e.id)}>
                  <TableCell className="font-mono text-xs">{e.employeeCode}</TableCell>
                  <TableCell>
                    <p className="font-medium">{e.name}</p>
                    <p className="text-xs text-muted-foreground">{e.designation}</p>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{e.department}</TableCell>
                  <TableCell className="hidden lg:table-cell">{e.jobRole}</TableCell>
                  <TableCell className="hidden sm:table-cell">{e.shift}</TableCell>
                  <TableCell className="hidden xl:table-cell">{fmtDate(e.joiningDate)}</TableCell>
                  <TableCell><EmployeeStatusBadge status={e.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {totalPages > 1 && (
        <Pagination>
          <PaginationContent>
            <PaginationItem><PaginationPrevious href="#" onClick={(e) => { e.preventDefault(); setPage((p) => Math.max(1, p - 1)); }} aria-disabled={page === 1} className={page === 1 ? "pointer-events-none opacity-50" : ""} /></PaginationItem>
            <PaginationItem className="px-3 text-sm text-muted-foreground">Page {page} of {totalPages}</PaginationItem>
            <PaginationItem><PaginationNext href="#" onClick={(e) => { e.preventDefault(); setPage((p) => Math.min(totalPages, p + 1)); }} aria-disabled={page === totalPages} className={page === totalPages ? "pointer-events-none opacity-50" : ""} /></PaginationItem>
          </PaginationContent>
        </Pagination>
      )}

      {addOpen && <AddEmployeeDialog onClose={() => setAddOpen(false)} onCreated={() => { setAddOpen(false); void qc.invalidateQueries({ queryKey: ["employees"] }); }} />}
    </div>
  );
}

function AddEmployeeDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const org = useQuery({ queryKey: ["org"], queryFn: () => api<OrgData>("/api/org") });
  const [form, setForm] = useState({
    employeeCode: "", name: "", jobRoleId: "", productionAreaId: "", designation: "",
    joiningDate: new Date().toISOString().slice(0, 10), status: "active", supervisorName: "", shift: "General", category: "Permanent",
  });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const selectedRole = org.data?.jobRoles.find((r) => r.id === form.jobRoleId);
  const areas = (org.data?.departments.find((d) => d.id === selectedRole?.departmentId)?.areas ?? []);

  const create = useMutation({
    mutationFn: () =>
      api("/api/employees", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          productionAreaId: form.productionAreaId || null,
          supervisorName: form.supervisorName || null,
          joiningDate: new Date(form.joiningDate).toISOString(),
        }),
      }),
    onSuccess: () => { toast.success("Employee created"); onCreated(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to create"),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Employee</DialogTitle>
          <DialogDescription>Synthetic record — department is derived from the selected job role.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label htmlFor="ecode">Employee Code *</Label><Input id="ecode" value={form.employeeCode} onChange={(e) => set("employeeCode", e.target.value)} placeholder="SE-3001" /></div>
            <div className="space-y-1.5"><Label htmlFor="joindate">Joining Date *</Label><Input id="joindate" type="date" value={form.joiningDate} onChange={(e) => set("joiningDate", e.target.value)} /></div>
          </div>
          <div className="space-y-1.5"><Label htmlFor="ename">Full Name *</Label><Input id="ename" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Md. Sample Rahman" /></div>
          <div className="space-y-1.5">
            <Label>Job Role *</Label>
            <Select value={form.jobRoleId} onValueChange={(v) => { set("jobRoleId", v); set("productionAreaId", ""); }}>
              <SelectTrigger><SelectValue placeholder="Select job role" /></SelectTrigger>
              <SelectContent>{org.data?.jobRoles.map((r) => <SelectItem key={r.id} value={r.id}>{r.title} — {r.departmentName}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {areas.length > 0 && (
            <div className="space-y-1.5">
              <Label>Production Area</Label>
              <Select value={form.productionAreaId} onValueChange={(v) => set("productionAreaId", v)}>
                <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {areas.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5"><Label htmlFor="desig">Designation *</Label><Input id="desig" value={form.designation} onChange={(e) => set("designation", e.target.value)} placeholder="Machine Operator II" /></div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Shift *</Label>
              <Select value={form.shift} onValueChange={(v) => set("shift", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{org.data?.shifts.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Category *</Label>
              <Select value={form.category} onValueChange={(v) => set("category", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{org.data?.categories.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => set("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["active", "probation", "on_leave", "notice_period"].map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5"><Label htmlFor="sup">Supervisor</Label><Input id="sup" value={form.supervisorName} onChange={(e) => set("supervisorName", e.target.value)} placeholder="Name of supervisor" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending || !form.employeeCode || !form.name || !form.jobRoleId || !form.designation} className="bg-blue-700 hover:bg-blue-800">
            {create.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden />} Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
