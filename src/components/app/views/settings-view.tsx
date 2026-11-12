"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { useAppStore, can } from "@/store/app-store";
import type { SettingsData, TnaPriority } from "@/lib/types";
import { PageHeader, LoadingGrid, ErrorState } from "../shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import { Save, SlidersHorizontal, BellRing, Info, Database, MailWarning } from "lucide-react";

const PRIORITIES: TnaPriority[] = ["critical", "high", "medium", "low"];
const RULE_LABELS: { key: keyof SettingsData["tnaRules"]; label: string; help: string }[] = [
  { key: "expiredMandatoryQualification", label: "Expired mandatory qualification", help: "Safety/mandatory qualification past its expiry date" },
  { key: "safetyCriticalGap", label: "Safety-critical competency gap (≥1 level)", help: "Any gap on a safety-critical competency" },
  { key: "notAssessedSafety", label: "Unassessed safety-critical competency", help: "No assessment record for a safety competency" },
  { key: "gapTwoPlus", label: "Gap of two or more levels", help: "Non-safety competency, gap ≥ 2" },
  { key: "gapOne", label: "Gap of exactly one level", help: "Non-safety competency, gap = 1" },
  { key: "notAssessed", label: "Unassessed competency (non-safety)", help: "Baseline assessment required" },
  { key: "assessmentExpiredSafety", label: "Assessment beyond frequency (safety)", help: "Reassessment overdue on safety competency" },
  { key: "assessmentExpired", label: "Assessment beyond frequency", help: "Reassessment overdue, level currently meets requirement" },
];

export function SettingsView() {
  const { user } = useAppStore();
  const qc = useQueryClient();
  const canWrite = can(user, "settings:write");
  const [rules, setRules] = useState<SettingsData["tnaRules"] | null>(null);
  const [thresholds, setThresholds] = useState<SettingsData["alertThresholds"] | null>(null);

  const settings = useQuery({ queryKey: ["settings"], queryFn: () => api<SettingsData>("/api/settings") });

  // seed editable state from server data ("adjust state during render" pattern — no effect)
  const [prevSettings, setPrevSettings] = useState<SettingsData | null>(null);
  if (settings.data && settings.data !== prevSettings) {
    setPrevSettings(settings.data);
    setRules(settings.data.tnaRules);
    setThresholds(settings.data.alertThresholds);
  }

  const save = useMutation({
    mutationFn: () => api("/api/settings", { method: "PUT", body: JSON.stringify({ tnaRules: rules, alertThresholds: thresholds }) }),
    onSuccess: () => {
      toast.success("Settings saved", { description: "TNA engine rules updated — new priorities apply immediately." });
      void qc.invalidateQueries({ queryKey: ["settings"] });
      void qc.invalidateQueries({ queryKey: ["tna"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to save"),
  });

  if (settings.isLoading) return <LoadingGrid rows={4} />;
  if (settings.error) return <ErrorState message="Failed to load settings" />;
  if (!settings.data || !rules || !thresholds) return null;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Settings"
        description="TNA prioritisation model, alert thresholds and system information. Changes apply instantly and are audit-logged."
        actions={canWrite ? (
          <Button className="bg-blue-700 hover:bg-blue-800 dark:bg-blue-700" onClick={() => save.mutate()} disabled={save.isPending}>
            <Save className="h-4 w-4" aria-hidden /> {save.isPending ? "Saving…" : "Save Settings"}
          </Button>
        ) : undefined}
      />

      <Alert>
        <Info className="h-4 w-4" aria-hidden />
        <AlertTitle>Model disclosure</AlertTitle>
        <AlertDescription>
          The TNA prioritisation model is a transparent, rule-based mapping that reflects standard manufacturing L&amp;D practice.
          It is <b>not a scientifically validated psychometric instrument</b> — weights are configurable so your organisation can tune them,
          and every generated recommendation exposes its reasons for audit.
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* TNA rules */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><SlidersHorizontal className="h-4 w-4 text-blue-700 dark:text-blue-400" aria-hidden /> TNA Prioritisation Rules</CardTitle>
            <CardDescription>Map each finding to a priority. Highest severity wins when several rules fire.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {RULE_LABELS.map((r) => (
              <div key={r.key as string} className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{r.label}</p>
                  <p className="text-xs text-muted-foreground">{r.help}</p>
                </div>
                <Select value={rules[r.key] as string} onValueChange={(v) => setRules({ ...rules, [r.key]: v as TnaPriority })} disabled={!canWrite}>
                  <SelectTrigger className="h-8 w-32" aria-label={r.label}><SelectValue /></SelectTrigger>
                  <SelectContent>{PRIORITIES.map((p) => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            ))}
            <div className="flex items-center justify-between border-t pt-3">
              <div>
                <p className="text-sm font-medium">Qualification “expiring soon” window</p>
                <p className="text-xs text-muted-foreground">Days before expiry that trigger a refresher need</p>
              </div>
              <Select value={String(rules.expiringSoonDays)} onValueChange={(v) => setRules({ ...rules, expiringSoonDays: Number(v) })} disabled={!canWrite}>
                <SelectTrigger className="h-8 w-24" aria-label="Expiring soon window"><SelectValue /></SelectTrigger>
                <SelectContent>{[14, 30, 45, 60, 90].map((d) => <SelectItem key={d} value={String(d)}>{d} days</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Default assessment validity</p>
                <p className="text-xs text-muted-foreground">Used when a competency has no explicit frequency</p>
              </div>
              <Select value={String(rules.assessmentValidityDefaultMonths)} onValueChange={(v) => setRules({ ...rules, assessmentValidityDefaultMonths: Number(v) })} disabled={!canWrite}>
                <SelectTrigger className="h-8 w-24" aria-label="Default validity"><SelectValue /></SelectTrigger>
                <SelectContent>{[12, 18, 24, 36].map((d) => <SelectItem key={d} value={String(d)}>{d} months</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Alerts + system */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><BellRing className="h-4 w-4 text-blue-700 dark:text-blue-400" aria-hidden /> Alert Thresholds</CardTitle>
              <CardDescription>In-app alerts are generated from live data — no fake notifications.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <label className="flex items-center justify-between">
                <span className="text-sm">Alert on qualifications expiring ≤ 7 days</span>
                <Switch checked={thresholds.within7Days} onCheckedChange={(v) => setThresholds({ ...thresholds, within7Days: v })} disabled={!canWrite} aria-label="7 day alerts" />
              </label>
              <label className="flex items-center justify-between">
                <span className="text-sm">Alert on qualifications expiring ≤ 30 days</span>
                <Switch checked={thresholds.within30Days} onCheckedChange={(v) => setThresholds({ ...thresholds, within30Days: v })} disabled={!canWrite} aria-label="30 day alerts" />
              </label>
              <label className="flex items-center justify-between">
                <span className="text-sm">Email notifications</span>
                <Switch checked={thresholds.emailEnabled} onCheckedChange={(v) => setThresholds({ ...thresholds, emailEnabled: v })} disabled={!canWrite || !settings.data.emailNotifications.enabled} aria-label="Email notifications" />
              </label>
              {!settings.data.emailNotifications.enabled && (
                <p className="flex items-start gap-1.5 rounded bg-muted/60 p-2 text-xs text-muted-foreground">
                  <MailWarning className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  {settings.data.emailNotifications.note} Configure SMTP_HOST, SMTP_PORT, SMTP_USER and SMTP_PASS environment variables to enable.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><Database className="h-4 w-4 text-blue-700 dark:text-blue-400" aria-hidden /> System</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Application</span><span className="font-medium">TNA &amp; Skill Matrix Tracker v1.0.0</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Framework</span><span className="font-medium">Next.js 16 · TypeScript · Prisma</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Database</span><span className="font-medium">SQLite (sandbox) — PostgreSQL-ready schema</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Data</span><span className="font-medium">Synthetic — portfolio simulation</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Health endpoint</span><span className="font-mono text-xs">/api/health</span></div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
