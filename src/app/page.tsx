"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/features/auth/AuthProvider";
import { AppShell } from "@/components/layout/AppShell";
import { CompleteProfileForm } from "@/features/auth/AuthForms";
import Link from "next/link";

export default function HomePage() {
  const { user, profile, loading, configured, needsProfileSetup } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && configured && !user) {
      router.replace("/login");
    }
  }, [configured, loading, router, user]);

  if (!configured) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-6">
        <div className="glass-panel fade-up max-w-lg p-8">
          <h1 className="font-display text-2xl font-semibold">Configure Firebase</h1>
          <p className="mt-3 text-sm leading-relaxed text-[var(--ink-muted)]">
            Add your Firebase web config to <code>.env.local</code>, enable Email/Password
            and Google sign-in in the Firebase console, then restart the dev server.
          </p>
          <Link
            href="/login"
            className="mt-6 inline-block text-sm font-medium text-[var(--accent)] hover:underline"
          >
            Go to sign in
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <div className="glass-panel fade-up px-8 py-6 text-sm text-[var(--ink-muted)]">
          Loading Chemm…
        </div>
      </div>
    );
  }

  if (user && needsProfileSetup) {
    return <CompleteProfileForm />;
  }

  if (!user || !profile) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <div className="glass-panel fade-up px-8 py-6 text-sm text-[var(--ink-muted)]">
          Loading Chemm…
        </div>
      </div>
    );
  }

  return <AppShell />;
}
