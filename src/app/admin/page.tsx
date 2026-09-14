"use client";

import { useEffect, useState } from "react";
import { Shield } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/features/auth/AuthProvider";
import { authHeaders } from "@/lib/apiAuth";

interface Overview {
  ok: boolean;
  admin: { uid: string; roles: string[]; permissions: string[] };
  stats: { usersApprox: number; openReports: number };
  recentReports: Array<{
    id: string;
    reporterUid: string;
    reportedUid: string;
    reason: string;
    createdAt: number | null;
  }>;
}

/**
 * Admin foundation UI. Access is enforced server-side via /api/admin/overview.
 * Seed roles with Firebase Admin SDK — never from the client.
 */
export default function AdminPage() {
  const { profile, user } = useAuth();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setError("Sign in required.");
      setLoading(false);
      return;
    }
    void (async () => {
      try {
        const res = await fetch("/api/admin/overview", {
          headers: await authHeaders(),
        });
        const body = await res.json();
        if (!res.ok) {
          setError(body?.message ?? "Access denied.");
          return;
        }
        setData(body as Overview);
      } catch {
        setError("Could not load admin overview.");
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  return (
    <div className="mx-auto min-h-dvh max-w-3xl px-4 py-10">
      <div className="glass-panel p-6">
        <div className="flex items-center gap-3">
          <Shield className="h-6 w-6 text-[var(--accent)]" />
          <div>
            <h1 className="font-display text-2xl font-semibold">Admin</h1>
            <p className="text-sm text-[var(--ink-muted)]">
              Server-verified roles only · {profile?.displayName ?? "Guest"}
            </p>
          </div>
        </div>

        {loading && (
          <p className="mt-8 text-sm text-[var(--ink-muted)]">Checking access…</p>
        )}
        {error && (
          <div className="mt-8 rounded-2xl bg-[var(--danger)]/10 px-4 py-3 text-sm text-[var(--danger)]">
            {error}
            <p className="mt-2 text-xs opacity-80">
              Grant access by writing{" "}
              <code className="rounded bg-black/10 px-1">adminRoles/&#123;uid&#125;</code>{" "}
              with Admin SDK (roles: OWNER).
            </p>
          </div>
        )}

        {data && (
          <div className="mt-8 space-y-6">
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Users (approx)" value={String(data.stats.usersApprox)} />
              <Stat label="Recent reports" value={String(data.stats.openReports)} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-soft)]">
                Your roles
              </p>
              <p className="mt-1 text-sm">{data.admin.roles.join(", ") || "—"}</p>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--ink-soft)]">
                Reports inbox
              </p>
              {data.recentReports.length === 0 ? (
                <p className="text-sm text-[var(--ink-muted)]">No reports yet.</p>
              ) : (
                <ul className="space-y-2">
                  {data.recentReports.map((r) => (
                    <li
                      key={r.id}
                      className="rounded-xl bg-[var(--glass)] px-3 py-2 text-sm ring-1 ring-[var(--glass-border-soft)]"
                    >
                      <p className="font-medium">{r.reason}</p>
                      <p className="text-[11px] text-[var(--ink-soft)]">
                        {r.reporterUid.slice(0, 8)}… → {r.reportedUid.slice(0, 8)}…
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <Button variant="secondary" onClick={() => window.location.assign("/")}>
              Back to app
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-[var(--glass)] px-4 py-3 ring-1 ring-[var(--glass-border-soft)]">
      <p className="text-[10px] uppercase tracking-wider text-[var(--ink-soft)]">
        {label}
      </p>
      <p className="font-display text-2xl font-semibold">{value}</p>
    </div>
  );
}
