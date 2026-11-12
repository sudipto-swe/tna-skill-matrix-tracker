"use client";
import { useEffect, useState } from "react";
import { useAppStore } from "@/store/app-store";
import { api } from "@/lib/api-client";
import { Providers } from "./providers";
import { AppShell } from "./app-shell";
import { LoginView } from "./login-view";
import { Factory } from "lucide-react";
import type { SessionUser } from "@/lib/types";

import { DashboardView } from "./views/dashboard-view";
import { EmployeesView } from "./views/employees-view";
import { EmployeeProfileView } from "./views/employee-profile-view";
import { CompetenciesView } from "./views/competencies-view";
import { SkillMatrixView } from "./views/skill-matrix-view";
import { TnaView } from "./views/tna-view";
import { CalendarView } from "./views/calendar-view";
import { AttendanceView } from "./views/attendance-view";
import { QualificationsView } from "./views/qualifications-view";
import { ReportsView } from "./views/reports-view";
import { UsersView } from "./views/users-view";
import { AuditView } from "./views/audit-view";
import { SettingsView } from "./views/settings-view";

function ViewRouter() {
  const view = useAppStore((s) => s.view);
  switch (view) {
    case "dashboard": return <DashboardView />;
    case "employees": return <EmployeesView />;
    case "employee-profile": return <EmployeeProfileView />;
    case "competencies": return <CompetenciesView />;
    case "skill-matrix": return <SkillMatrixView />;
    case "tna": return <TnaView />;
    case "calendar": return <CalendarView />;
    case "attendance": return <AttendanceView />;
    case "qualifications": return <QualificationsView />;
    case "reports": return <ReportsView />;
    case "users": return <UsersView />;
    case "audit": return <AuditView />;
    case "settings": return <SettingsView />;
    default: return <DashboardView />;
  }
}

export function TnaApp() {
  const setUser = useAppStore((s) => s.setUser);
  const user = useAppStore((s) => s.user);
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api<{ user: SessionUser }>("/api/auth/me")
      .then((res) => { if (!cancelled) setUser(res.user); })
      .catch(() => { if (!cancelled) setUser(null); })
      .finally(() => { if (!cancelled) setBooted(true); });
    return () => { cancelled = true; };
  }, [setUser]);

  if (!booted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-background">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="flex h-12 w-12 animate-pulse items-center justify-center rounded-xl bg-gradient-to-br from-blue-700 to-blue-900 text-white">
            <Factory className="h-6 w-6" aria-hidden />
          </div>
          <p className="text-sm">Loading TNA &amp; Skill Matrix Tracker…</p>
        </div>
      </div>
    );
  }

  return (
    // keying Providers by the user id remounts the React Query client on every
    // login/logout — the previous user's cached data is discarded, so a new
    // session can never see stale data from the previous one.
    <Providers key={user?.userId ?? "anonymous"}>
      {user ? (
        <AppShell>
          <ViewRouter />
        </AppShell>
      ) : (
        <LoginView onLogin={setUser} />
      )}
    </Providers>
  );
}
