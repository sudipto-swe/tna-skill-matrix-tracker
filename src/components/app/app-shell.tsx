"use client";
import { useMemo, useState, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import { api } from "@/lib/api-client";
import { useAppStore, can, type ViewId } from "@/store/app-store";
import type { NotificationRow, EmployeeListResponse } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";
import {
  LayoutDashboard, Users, Grid3x3, BookOpen, Target, CalendarDays, ClipboardCheck,
  ShieldAlert, FileSpreadsheet, UserCog, ScrollText, Settings, Factory, Bell, BellRing,
  LogOut, Menu, Moon, Sun, Search, RefreshCw, CheckCheck, ChevronsUpDown,
} from "lucide-react";
import { fmtDate } from "./shared";

interface NavItem { id: ViewId; label: string; icon: typeof LayoutDashboard; visible: (perms: string[]) => boolean }
interface NavGroup { label: string; items: NavItem[] }

const any = (...perms: string[]) => (p: string[]) => perms.some((x) => p.includes(x));

const NAV_GROUPS: NavGroup[] = [
  { label: "Overview", items: [{ id: "dashboard", label: "Dashboard", icon: LayoutDashboard, visible: any("dashboard:view") }] },
  {
    label: "Workforce",
    items: [
      { id: "employees", label: "Employees", icon: Users, visible: any("employees:read:all", "employees:read:dept", "employees:read:self") },
      { id: "skill-matrix", label: "Skill Matrix", icon: Grid3x3, visible: any("skillmatrix:read:all", "skillmatrix:read:dept") },
    ],
  },
  { label: "Competency", items: [{ id: "competencies", label: "Framework", icon: BookOpen, visible: any("competencies:read") }] },
  {
    label: "Training",
    items: [
      { id: "tna", label: "Needs Analysis", icon: Target, visible: any("tna:read:all", "tna:read:dept", "tna:read:self") },
      { id: "calendar", label: "Calendar", icon: CalendarDays, visible: any("training:read") },
      { id: "attendance", label: "Attendance", icon: ClipboardCheck, visible: any("attendance:read") },
    ],
  },
  { label: "Compliance", items: [{ id: "qualifications", label: "Qualifications", icon: ShieldAlert, visible: any("qualifications:read:all", "qualifications:read:dept", "qualifications:read:self") }] },
  {
    label: "Administration",
    items: [
      { id: "reports", label: "Reports & Imports", icon: FileSpreadsheet, visible: any("reports:generate", "import:execute") },
      { id: "users", label: "User Management", icon: UserCog, visible: any("users:manage") },
      { id: "audit", label: "Audit Logs", icon: ScrollText, visible: any("audit:read") },
      { id: "settings", label: "Settings", icon: Settings, visible: any("settings:read") },
    ],
  },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { user, view, setView, setUser } = useAppStore();
  const { theme, setTheme } = useTheme();
  const qc = useQueryClient();
  const [mobileNav, setMobileNav] = useState(false);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

  const groups = useMemo(
    () => NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => i.visible(user?.permissions ?? [])) })).filter((g) => g.items.length > 0),
    [user?.permissions]
  );

  const notifications = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api<{ notifications: NotificationRow[]; unread: number }>("/api/notifications"),
    refetchInterval: 120_000,
  });

  const refreshAlerts = useMutation({
    mutationFn: () => api<{ created: number }>("/api/notifications/refresh", { method: "POST" }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ["notifications"] });
      toast.success(`Alerts refreshed`, { description: `${r.created} new notification(s) generated from live data.` });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to refresh"),
  });

  const markAllRead = useMutation({
    mutationFn: () => api("/api/notifications", { method: "PATCH", body: JSON.stringify({ all: true }) }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const searchResults = useQuery({
    queryKey: ["emp-search", search],
    queryFn: () => api<EmployeeListResponse>(`/api/employees?search=${encodeURIComponent(search)}&pageSize=8`),
    enabled: search.trim().length >= 2,
  });

  if (!user) return null;

  async function logout() {
    try { await api("/api/auth/logout", { method: "POST" }); } catch { /* ignore */ }
    setUser(null);
    toast.success("Signed out");
  }

  const initials = user.name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();

  const SidebarContent = (
    <>
      <div className="flex items-center gap-2.5 px-4 pb-5 pt-1">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-800 text-white shadow-md">
          <Factory className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold leading-tight text-white">TNA &amp; Skill Matrix</p>
          <p className="truncate text-[11px] text-slate-400">Competency Management</p>
        </div>
      </div>
      <nav aria-label="Main navigation" className="flex-1 space-y-4 overflow-y-auto px-3 pb-4">
        {groups.map((g) => (
          <div key={g.label}>
            <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">{g.label}</p>
            <ul className="space-y-0.5">
              {g.items.map((item) => {
                const active = view === item.id;
                return (
                  <li key={item.id}>
                    <button
                      onClick={() => { setView(item.id); setMobileNav(false); }}
                      aria-current={active ? "page" : undefined}
                      className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors ${
                        active
                          ? "bg-blue-600/90 font-medium text-white shadow-md"
                          : "text-slate-300 hover:bg-white/10 hover:text-white"
                      }`}
                    >
                      <item.icon className="h-4 w-4 shrink-0" aria-hidden />
                      <span className="truncate">{item.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="border-t border-white/10 px-4 py-3">
        <p className="text-[11px] leading-relaxed text-slate-400">
          Signed in as <span className="font-medium text-slate-200">{user.name}</span>
          <br />
          <span className="inline-flex items-center gap-1">
            <Badge variant="outline" className="mt-1 border-white/20 bg-white/5 text-[10px] font-medium text-slate-200">{user.roleName}</Badge>
            {user.departmentName && <span className="mt-1 text-[10px] text-slate-500">· {user.departmentName}</span>}
          </span>
        </p>
      </div>
    </>
  );

  return (
    <div className="bg-slate-50 dark:bg-background">
      <div className="flex">
        {/* Desktop sidebar */}
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-gradient-to-b from-[#0b1f35] to-[#10293f] lg:flex" aria-label="Sidebar">
          {SidebarContent}
        </aside>

        {/* Main column */}
        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          {/* Topbar */}
          <header className="sticky top-0 z-30 border-b bg-white/95 backdrop-blur dark:bg-background/95">
            <div className="flex h-14 items-center gap-2 px-3 md:px-5">
              {/* Mobile nav */}
              <Sheet open={mobileNav} onOpenChange={setMobileNav}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu">
                    <Menu className="h-5 w-5" aria-hidden />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-64 border-0 bg-gradient-to-b from-[#0b1f35] to-[#10293f] p-0">
                  <SheetTitle className="sr-only">Navigation menu</SheetTitle>
                  <div className="flex h-full flex-col pt-5">{SidebarContent}</div>
                </SheetContent>
              </Sheet>

              {/* Global employee search */}
              {can(user, "employees:read:all") || can(user, "employees:read:dept") ? (
                <div className="relative w-full max-w-xs">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  <Input
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setSearchOpen(true); }}
                    onFocus={() => setSearchOpen(true)}
                    onBlur={() => setTimeout(() => setSearchOpen(false), 200)}
                    placeholder="Search…"
                    className="h-9 pl-8"
                    aria-label="Search employees"
                  />
                  {searchOpen && search.trim().length >= 2 && (
                    <div className="absolute left-0 top-10 z-40 w-80 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-lg border bg-white shadow-xl dark:bg-popover">
                      {searchResults.isLoading ? (
                        <p className="px-3 py-3 text-xs text-muted-foreground">Searching…</p>
                      ) : (searchResults.data?.employees.length ?? 0) === 0 ? (
                        <p className="px-3 py-3 text-xs text-muted-foreground">No employees found.</p>
                      ) : (
                        <ul className="max-h-72 overflow-y-auto">
                          {searchResults.data?.employees.map((e) => (
                            <li key={e.id}>
                              <button
                                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-accent"
                                onClick={() => { useAppStore.getState().openEmployee(e.id); setSearch(""); setSearchOpen(false); }}
                              >
                                <span className="min-w-0">
                                  <span className="block truncate font-medium">{e.name}</span>
                                  <span className="block truncate text-xs text-muted-foreground">{e.employeeCode} · {e.jobRole}</span>
                                </span>
                                <span className="ml-2 shrink-0 text-[10px] text-muted-foreground">{e.department}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <p className="truncate text-sm font-medium text-muted-foreground">TNA &amp; Skill Matrix Tracker</p>
              )}

              <div className="ml-auto flex items-center gap-1">
                {/* Notifications */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="icon" className="relative" aria-label={`Notifications (${notifications.data?.unread ?? 0} unread)`}>
                      {(notifications.data?.unread ?? 0) > 0 ? <BellRing className="h-5 w-5 text-blue-700 dark:text-blue-400" aria-hidden /> : <Bell className="h-5 w-5" aria-hidden />}
                      {(notifications.data?.unread ?? 0) > 0 && (
                        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
                          {notifications.data!.unread > 99 ? "99+" : notifications.data!.unread}
                        </span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-96 p-0">
                    <div className="flex items-center justify-between border-b px-3 py-2">
                      <p className="text-sm font-semibold">Notifications</p>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => refreshAlerts.mutate()} disabled={refreshAlerts.isPending} title="Regenerate alerts from live data">
                          <RefreshCw className={`mr-1 h-3 w-3 ${refreshAlerts.isPending ? "animate-spin" : ""}`} aria-hidden /> Refresh
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => markAllRead.mutate()} disabled={(notifications.data?.unread ?? 0) === 0}>
                          <CheckCheck className="mr-1 h-3 w-3" aria-hidden /> Mark all read
                        </Button>
                      </div>
                    </div>
                    <ScrollArea className="h-80">
                      {(notifications.data?.notifications.length ?? 0) === 0 ? (
                        <p className="px-3 py-8 text-center text-xs text-muted-foreground">No notifications. Click “Refresh” to generate alerts from current data.</p>
                      ) : (
                        <ul className="divide-y">
                          {notifications.data?.notifications.map((n) => (
                            <li key={n.id} className={`px-3 py-2.5 ${n.readAt ? "opacity-60" : ""}`}>
                              <div className="flex items-start gap-2">
                                <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${n.severity === "critical" ? "bg-red-500" : n.severity === "high" ? "bg-orange-500" : n.severity === "medium" ? "bg-amber-500" : "bg-sky-500"}`} aria-hidden />
                                <div className="min-w-0">
                                  <p className="text-[13px] font-medium leading-snug">{n.title}</p>
                                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.message}</p>
                                  <p className="mt-1 text-[10px] text-muted-foreground">{fmtDate(n.createdAt)}</p>
                                </div>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </ScrollArea>
                  </PopoverContent>
                </Popover>

                {/* Theme toggle */}
                <Button variant="ghost" size="icon" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label="Toggle theme">
                  {theme === "dark" ? <Sun className="h-5 w-5" aria-hidden /> : <Moon className="h-5 w-5" aria-hidden />}
                </Button>

                {/* User menu */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="h-10 gap-2 px-2">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-blue-700 text-xs font-semibold text-white">{initials}</AvatarFallback>
                      </Avatar>
                      <span className="hidden min-w-0 text-left md:block">
                        <span className="block max-w-32 truncate text-sm font-medium leading-tight">{user.name}</span>
                        <span className="block text-[11px] leading-tight text-muted-foreground">{user.roleName}</span>
                      </span>
                      <ChevronsUpDown className="hidden h-3.5 w-3.5 text-muted-foreground md:block" aria-hidden />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-60">
                    <DropdownMenuLabel>
                      <p className="text-sm font-medium">{user.name}</p>
                      <p className="text-xs font-normal text-muted-foreground">{user.email}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{user.roleName}{user.employeeCode ? ` · ${user.employeeCode}` : ""}</p>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {user.employeeId && (
                      <DropdownMenuItem onClick={() => useAppStore.getState().openEmployee(user.employeeId!)}>
                        <Users className="mr-2 h-4 w-4" aria-hidden /> My competency profile
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={() => setView("settings")}>
                      <Settings className="mr-2 h-4 w-4" aria-hidden /> Settings
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={logout} className="text-red-600 focus:text-red-600 dark:text-red-400 dark:focus:text-red-400">
                      <LogOut className="mr-2 h-4 w-4" aria-hidden /> Sign out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </header>

          {/* View content */}
          <main className="mx-auto w-full max-w-[1440px] flex-1 px-3 py-5 md:px-6 md:py-6" aria-live="polite">
            <AnimatePresence mode="wait">
              <motion.div
                key={view + (view === "employee-profile" ? `-${useAppStore.getState().selectedEmployeeId}` : "")}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </main>

          {/* Sticky footer — inside the main column so it never floats below the viewport */}
          <footer className="mt-auto border-t bg-white dark:bg-background">
            <div className="mx-auto flex max-w-[1440px] flex-col items-center justify-between gap-1 px-4 py-3 text-center text-xs text-muted-foreground md:flex-row md:text-left">
              <p>
                <span className="font-medium text-foreground">TNA &amp; Skill Matrix Tracker</span> · v1.0.0 · Portfolio simulation — synthetic data only, not affiliated with any real company
              </p>
              <p>Rule-based prioritisation model · Configure in Settings</p>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
