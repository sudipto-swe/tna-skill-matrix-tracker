"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import { Factory, Loader2, Lock, ShieldCheck, GraduationCap, UserCog, User, BarChart3 } from "lucide-react";
import type { SessionUser } from "@/lib/types";

const DEMO_ACCOUNTS = [
  { role: "Administrator", email: "admin@tna-demo.com", password: "Admin@1234", icon: ShieldCheck, desc: "Full system access" },
  { role: "Training Officer", email: "training@tna-demo.com", password: "Training@1234", icon: GraduationCap, desc: "TNA, training & reports" },
  { role: "Dept. Supervisor", email: "supervisor@tna-demo.com", password: "Supervisor@1234", icon: UserCog, desc: "Production dept scope" },
  { role: "Employee", email: "employee@tna-demo.com", password: "Employee@1234", icon: User, desc: "Self-service profile" },
];

export function LoginView({ onLogin }: { onLogin: (user: SessionUser) => void }) {
  const [email, setEmail] = useState("admin@tna-demo.com");
  const [password, setPassword] = useState("Admin@1234");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e?: React.FormEvent, creds?: { email: string; password: string }) {
    e?.preventDefault();
    const em = creds?.email ?? email;
    const pw = creds?.password ?? password;
    setLoading(true);
    setError(null);
    try {
      const res = await api<{ user: SessionUser }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: em, password: pw }),
      });
      toast.success(`Welcome, ${res.user.name}`, { description: `Signed in as ${res.user.roleName}` });
      onLogin(res.user);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Sign-in failed";
      setError(msg);
      toast.error("Sign-in failed", { description: msg });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 dark:bg-background">
      <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-8 px-4 py-10 lg:grid-cols-2 lg:gap-14">
        {/* Brand panel */}
        <section className="order-2 lg:order-1">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-blue-700 to-blue-900 text-white shadow-lg">
              <Factory className="h-6 w-6" aria-hidden />
            </div>
            <div>
              <p className="text-lg font-bold leading-tight text-foreground">Training Needs Analysis</p>
              <p className="text-sm text-muted-foreground">&amp; Skill Matrix Tracker</p>
            </div>
          </div>
          <h1 className="text-3xl font-bold leading-tight tracking-tight text-foreground md:text-4xl">
            Workforce competency, <span className="text-blue-700 dark:text-blue-400">evidence-based training decisions.</span>
          </h1>
          <p className="mt-4 max-w-lg text-muted-foreground">
            Maintain competency records, evaluate skill levels against role requirements, identify gaps automatically,
            and build a training calendar that closes them — with management-ready reports.
          </p>
          <ul className="mt-6 grid max-w-lg gap-2 text-sm text-muted-foreground sm:grid-cols-2">
            {[
              "4-level competency framework",
              "Automatic TNA & prioritisation",
              "Qualification expiry alerts",
              "Excel reports & imports",
            ].map((f) => (
              <li key={f} className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-blue-700 dark:text-blue-400" aria-hidden /> {f}
              </li>
            ))}
          </ul>
          <p className="mt-8 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
            Portfolio simulation — all employee and company data is synthetic. Not affiliated with any real company.
          </p>
        </section>

        {/* Login card */}
        <section className="order-1 lg:order-2">
          <Card className="border shadow-xl shadow-slate-200/50 dark:shadow-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Lock className="h-5 w-5 text-blue-700 dark:text-blue-400" aria-hidden /> Sign in
              </CardTitle>
              <CardDescription>Use a demo account below or your credentials.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={submit} className="space-y-4" noValidate>
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@tna-demo.com" required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password">Password</Label>
                  <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
                </div>
                {error && (
                  <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
                    {error}
                  </p>
                )}
                <Button type="submit" className="w-full bg-blue-700 hover:bg-blue-800 dark:bg-blue-700 dark:hover:bg-blue-600" disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Lock className="h-4 w-4" aria-hidden />}
                  Sign in
                </Button>
              </form>

              <div className="mt-5 border-t pt-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Demo accounts (click to sign in)</p>
                <div className="grid gap-2">
                  {DEMO_ACCOUNTS.map((a) => (
                    <button
                      key={a.email}
                      type="button"
                      onClick={() => { setEmail(a.email); setPassword(a.password); void submit(undefined, { email: a.email, password: a.password }); }}
                      className="flex items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors hover:border-blue-300 hover:bg-blue-50/60 dark:hover:border-blue-800 dark:hover:bg-blue-950/40"
                      disabled={loading}
                    >
                      <a.icon className="h-4 w-4 shrink-0 text-blue-700 dark:text-blue-400" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium leading-tight">{a.role}</span>
                        <span className="block truncate text-xs text-muted-foreground">{a.email} · {a.desc}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </section>
      </main>
      <footer className="mt-auto border-t bg-white py-3 text-center text-xs text-muted-foreground dark:bg-background">
        Training Needs Analysis &amp; Skill Matrix Tracker · Portfolio simulation v1.0 · Synthetic data only
      </footer>
    </div>
  );
}
