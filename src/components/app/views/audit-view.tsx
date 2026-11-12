"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { AuditRow } from "@/lib/types";
import { PageHeader, LoadingGrid, ErrorState, EmptyState, fmtDate } from "../shared";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { ScrollText } from "lucide-react";

const ACTION_COLORS: Record<string, string> = {
  login: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  login_failed: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  logout: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  create: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  update: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  delete: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  export: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
  import: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  issue: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  seed: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

export function AuditView() {
  const [user, setUser] = useState("");
  const [action, setAction] = useState("all");
  const [entity, setEntity] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);

  const params = new URLSearchParams({
    page: String(page),
    ...(user && { user }),
    ...(action !== "all" && { action }),
    ...(entity !== "all" && { entity }),
    ...(from && { from }),
    ...(to && { to }),
  });

  const data = useQuery({
    queryKey: ["audit", params.toString()],
    queryFn: () => api<{ logs: AuditRow[]; total: number; page: number; pageSize: number; actions: string[]; entities: string[] }>(`/api/audit-logs?${params.toString()}`),
  });

  const totalPages = Math.max(1, Math.ceil((data.data?.total ?? 0) / (data.data?.pageSize ?? 25)));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Audit Logs"
        description="Immutable trail of authentication events, data changes, exports and imports — who did what, when and from where."
      />

      <div className="flex flex-wrap items-center gap-2">
        <Input value={user} onChange={(e) => { setUser(e.target.value); setPage(1); }} placeholder="Filter by user…" className="h-9 w-44" aria-label="Filter by user" />
        <Select value={action} onValueChange={(v) => { setAction(v); setPage(1); }}>
          <SelectTrigger className="h-9 w-36" aria-label="Action"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All actions</SelectItem>{data.data?.actions.map((a) => <SelectItem key={a} value={a}>{a.replace("_", " ")}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={entity} onValueChange={(v) => { setEntity(v); setPage(1); }}>
          <SelectTrigger className="h-9 w-44" aria-label="Entity"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All entities</SelectItem>{data.data?.entities.map((e) => <SelectItem key={e} value={e}>{e.replace("_", " ")}</SelectItem>)}</SelectContent>
        </Select>
        <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="h-9 w-36" aria-label="From date" />
        <span className="text-xs text-muted-foreground">to</span>
        <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="h-9 w-36" aria-label="To date" />
        <span className="ml-auto text-xs text-muted-foreground">{data.data ? `${data.data.total} event(s)` : ""}</span>
      </div>

      {data.isLoading ? <LoadingGrid rows={8} /> : data.error ? <ErrorState message="Failed to load audit logs" /> : (data.data?.logs.length ?? 0) === 0 ? (
        <EmptyState title="No audit events" message="Events appear as users interact with the system." />
      ) : (
        <div className="rounded-lg border bg-white dark:bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead>Time</TableHead><TableHead>User</TableHead><TableHead className="hidden md:table-cell">Role</TableHead>
                <TableHead>Action</TableHead><TableHead>Entity</TableHead><TableHead className="hidden lg:table-cell">Details</TableHead><TableHead className="hidden xl:table-cell">IP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.data?.logs.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="whitespace-nowrap text-sm">{fmtDate(l.createdAt)}<span className="block text-xs text-muted-foreground">{new Date(l.createdAt).toLocaleTimeString()}</span></TableCell>
                  <TableCell className="text-sm font-medium">{l.userName}</TableCell>
                  <TableCell className="hidden text-xs text-muted-foreground md:table-cell">{l.roleCode?.replace(/_/g, " ") ?? "—"}</TableCell>
                  <TableCell><Badge className={`text-[10px] ${ACTION_COLORS[l.action] ?? ""}`}>{l.action.replace("_", " ")}</Badge></TableCell>
                  <TableCell className="text-xs">
                    <span className="inline-flex items-center gap-1"><ScrollText className="h-3 w-3 text-muted-foreground" aria-hidden />{l.entity.replace(/_/g, " ")}</span>
                    {l.entityId && <span className="block font-mono text-[10px] text-muted-foreground">{l.entityId.slice(0, 12)}…</span>}
                  </TableCell>
                  <TableCell className="hidden max-w-96 truncate text-xs text-muted-foreground lg:table-cell" title={l.details ?? ""}>{l.details ?? "—"}</TableCell>
                  <TableCell className="hidden font-mono text-xs text-muted-foreground xl:table-cell">{l.ip ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {totalPages > 1 && (
        <Pagination>
          <PaginationContent>
            <PaginationItem><PaginationPrevious href="#" onClick={(e) => { e.preventDefault(); setPage((p) => Math.max(1, p - 1)); }} className={page === 1 ? "pointer-events-none opacity-50" : ""} /></PaginationItem>
            <PaginationItem className="px-3 text-sm text-muted-foreground">Page {page} of {totalPages}</PaginationItem>
            <PaginationItem><PaginationNext href="#" onClick={(e) => { e.preventDefault(); setPage((p) => Math.min(totalPages, p + 1)); }} className={page === totalPages ? "pointer-events-none opacity-50" : ""} /></PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );
}
