"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { useAppStore } from "@/store/app-store";
import type { UserRow, RoleRow, EmployeeListResponse } from "@/lib/types";
import { PageHeader, LoadingGrid, ErrorState, fmtDate } from "../shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { UserPlus, KeyRound, ShieldCheck } from "lucide-react";

export function UsersView() {
  const qc = useQueryClient();
  const { user: me } = useAppStore();
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<UserRow | null>(null);

  const list = useQuery({
    queryKey: ["users"],
    queryFn: () => api<{ users: UserRow[]; roles: RoleRow[] }>("/api/users"),
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="User Management"
        description="Application accounts, role assignment and password resets. Role permissions are enforced server-side on every API call."
        actions={<Button className="bg-blue-700 hover:bg-blue-800 dark:bg-blue-700" onClick={() => setCreateOpen(true)}><UserPlus className="h-4 w-4" aria-hidden /> New User</Button>}
      />

      {/* Permission matrix */}
      {list.data && (
        <div className="rounded-lg border bg-white p-4 dark:bg-card">
          <p className="mb-3 flex items-center gap-1.5 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-blue-700 dark:text-blue-400" aria-hidden /> Role permission matrix (enforced in the backend)</p>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead>Capability</TableHead>
                  {list.data.roles.map((r) => <TableHead key={r.id} className="text-center">{r.name}</TableHead>)}
                </TableRow>
              </TableHeader>
              <TableBody>
                {[
                  { label: "View all employees", perms: ["employees:read:all"] },
                  { label: "View own department", perms: ["employees:read:dept"] },
                  { label: "Employee self-service", perms: ["employees:read:self"] },
                  { label: "Manage employees & imports", perms: ["employees:write", "import:execute"] },
                  { label: "Configure competency framework", perms: ["competencies:write"] },
                  { label: "Record assessments", perms: ["assessments:write"] },
                  { label: "Skill matrix & TNA (plant)", perms: ["skillmatrix:read:all", "tna:read:all"] },
                  { label: "Skill matrix & TNA (dept)", perms: ["skillmatrix:read:dept", "tna:read:dept"] },
                  { label: "Schedule training & enrol", perms: ["training:write"] },
                  { label: "Record attendance", perms: ["attendance:write"] },
                  { label: "Issue / renew qualifications", perms: ["qualifications:write"] },
                  { label: "Generate reports", perms: ["reports:generate"] },
                  { label: "Manage users", perms: ["users:manage"] },
                  { label: "View audit logs", perms: ["audit:read"] },
                  { label: "Edit TNA rules / settings", perms: ["settings:write"] },
                ].map((row) => (
                  <TableRow key={row.label}>
                    <TableCell className="text-sm">{row.label}</TableCell>
                    {list.data.roles.map((r) => {
                      const ok = row.perms.some((p) => r.permissions.includes(p));
                      return (
                        <TableCell key={r.id} className="text-center">
                          {ok ? <span className="text-emerald-600 dark:text-emerald-400" aria-label="yes">✓</span> : <span className="text-muted-foreground/40" aria-label="no">—</span>}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {list.isLoading ? <LoadingGrid rows={5} /> : list.error ? <ErrorState message="Failed to load users" /> : (
        <div className="rounded-lg border bg-white dark:bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead>User</TableHead><TableHead>Role</TableHead><TableHead>Linked Employee</TableHead>
                <TableHead className="hidden md:table-cell">Last Login</TableHead><TableHead className="text-center">Status</TableHead><TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.data?.users.map((u) => (
                <TableRow key={u.id} className={u.status === "disabled" ? "opacity-60" : ""}>
                  <TableCell>
                    <p className="font-medium">{u.name} {u.id === me?.userId && <span className="text-xs text-muted-foreground">(you)</span>}</p>
                    <p className="text-xs text-muted-foreground">{u.email}</p>
                  </TableCell>
                  <TableCell><Badge variant="outline" className="bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-300">{u.roleName}</Badge></TableCell>
                  <TableCell className="text-sm text-muted-foreground">{u.employee ? `${u.employee.name} (${u.employee.code})` : "—"}</TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground md:table-cell">{u.lastLoginAt ? fmtDate(u.lastLoginAt) : "Never"}</TableCell>
                  <TableCell className="text-center">
                    <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${u.status === "active" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : "bg-slate-200 text-slate-700 dark:bg-slate-800"}`}>{u.status}</span>
                  </TableCell>
                  <TableCell className="text-right"><Button variant="outline" size="sm" onClick={() => setEditUser(u)}>Manage</Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {createOpen && <UserEditDialog roles={list.data?.roles ?? []} user={null} onClose={() => setCreateOpen(false)} />}
      {editUser && <UserEditDialog roles={list.data?.roles ?? []} user={editUser} onClose={() => setEditUser(null)} />}
    </div>
  );
}

function UserEditDialog({ roles, user, onClose }: { roles: RoleRow[]; user: UserRow | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [password, setPassword] = useState("");
  const [roleId, setRoleId] = useState(user?.roleId ?? roles[0]?.id ?? "");
  const [employeeId, setEmployeeId] = useState(user?.employee?.id ?? "none");
  const [status, setStatus] = useState(user?.status ?? "active");
  const [empSearch, setEmpSearch] = useState("");

  const employees = useQuery({
    queryKey: ["employees", "link", empSearch],
    queryFn: () => api<EmployeeListResponse>(`/api/employees?pageSize=10${empSearch ? `&search=${encodeURIComponent(empSearch)}` : ""}`),
    enabled: !!user || true,
  });

  const save = useMutation({
    mutationFn: () => {
      if (user) {
        const payload: Record<string, unknown> = { name, roleId };
        if (employeeId !== "none") payload.employeeId = employeeId; else payload.employeeId = null;
        if (status !== user.status) payload.status = status;
        if (password) payload.password = password;
        return api(`/api/users/${user.id}`, { method: "PUT", body: JSON.stringify(payload) });
      }
      return api("/api/users", {
        method: "POST",
        body: JSON.stringify({ email, name, password, roleId, employeeId: employeeId === "none" ? null : employeeId }),
      });
    },
    onSuccess: () => {
      toast.success(user ? "User updated" : "User created");
      void qc.invalidateQueries({ queryKey: ["users"] });
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{user ? `Manage ${user.email}` : "Create User"}</DialogTitle>
          <DialogDescription>{user ? "Change role, linked employee, status or reset the password." : "New account with a server-side role."}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          {!user && (
            <div className="space-y-1.5"><Label htmlFor="uemail">Email *</Label><Input id="uemail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@tna-demo.com" /></div>
          )}
          <div className="space-y-1.5"><Label htmlFor="uname">Name *</Label><Input id="uname" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label>Role *</Label>
            <Select value={roleId} onValueChange={setRoleId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{roles.map((r) => <SelectItem key={r.id} value={r.id}>{r.name} — {r.description}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Link to Employee (optional)</Label>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not linked</SelectItem>
                <div className="p-1"><Input value={empSearch} onChange={(e) => setEmpSearch(e.target.value)} placeholder="Search…" className="h-8" /></div>
                {employees.data?.employees
                  .filter((e) => !(user?.employee && e.id === user.employee.id))
                  .map((e) => <SelectItem key={e.id} value={e.id}>{e.name} ({e.employeeCode}) — {e.department}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {user && (
            <label className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
              <span>Account active {status === user.status ? "" : "(changed)"}</span>
              <Switch checked={status === "active"} onCheckedChange={(v) => setStatus(v ? "active" : "disabled")} aria-label="Account active" />
            </label>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="upass">{user ? "Reset password (optional)" : "Password *"}</Label>
            <Input id="upass" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={user ? "Leave blank to keep" : "Min 8 characters"} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !name || !roleId || (!user && (!email || password.length < 8))} className="bg-blue-700 hover:bg-blue-800">
            <KeyRound className="mr-1 h-4 w-4" aria-hidden /> {user ? "Save Changes" : "Create User"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
