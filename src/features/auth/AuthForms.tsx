"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { GlassPanel } from "@/components/ui/Glass";
import { useAuth } from "@/features/auth/AuthProvider";
import { useTheme } from "@/features/theme/ThemeProvider";
import { APP_NAME, APP_TAGLINE } from "@/lib/constants";
import { friendlyError } from "@/lib/utils";

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#EA4335"
        d="M12 10.2v3.6h5.1c-.2 1.2-1.5 3.6-5.1 3.6-3.1 0-5.6-2.5-5.6-5.6S8.9 6.2 12 6.2c1.8 0 3 .7 3.7 1.4l2.5-2.4C16.7 3.7 14.5 2.8 12 2.8 6.9 2.8 2.8 6.9 2.8 12S6.9 21.2 12 21.2c5.2 0 8.6-3.6 8.6-8.7 0-.6-.1-1-.2-1.5H12z"
      />
    </svg>
  );
}

export function LoginForm() {
  const { login, loginGoogle, resetPassword, configured } = useAuth();
  const { resolved, toggle } = useTheme();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await login(email, password);
      router.replace("/");
    } catch (err) {
      setError(friendlyError(err, "Could not sign in."));
    } finally {
      setLoading(false);
    }
  };

  const onGoogle = async () => {
    setGoogleLoading(true);
    setError(null);
    try {
      await loginGoogle();
      router.replace("/");
    } catch (err) {
      setError(friendlyError(err, "Google sign-in failed. Check popup settings."));
    } finally {
      setGoogleLoading(false);
    }
  };

  const onResetSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!resetEmail.trim()) return;
    setResetLoading(true);
    setError(null);
    try {
      await resetPassword(resetEmail);
      setResetSent(true);
    } catch (err) {
      setError(friendlyError(err, "Could not send reset email."));
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <AuthShell onToggleTheme={toggle} theme={resolved}>
      <GlassPanel className="fade-up w-full max-w-md p-8">
        <h1 className="font-display text-3xl font-semibold">
          {showReset ? "Reset password" : "Welcome back"}
        </h1>
        <p className="mt-2 text-sm text-[var(--ink-muted)]">
          {showReset
            ? "Enter your email and we'll send a password recovery link."
            : "Sign in to continue calling and messaging."}
        </p>

        {!configured && (
          <p className="mt-4 rounded-2xl bg-amber-500/10 px-3 py-2 text-sm text-amber-600 ring-1 ring-amber-500/20">
            Firebase is not configured. Add your{" "}
            <code className="text-xs">.env.local</code> keys to continue.
          </p>
        )}

        {showReset ? (
          <form className="mt-6 space-y-3" onSubmit={onResetSubmit}>
            <Input
              type="email"
              placeholder="Your account email"
              value={resetEmail}
              onChange={(e) => setResetEmail(e.target.value)}
              required
              autoFocus
            />
            {resetSent && (
              <p className="rounded-xl bg-emerald-500/10 px-3 py-2 text-xs text-emerald-500 ring-1 ring-emerald-500/20">
                Password reset link sent! Check your inbox.
              </p>
            )}
            {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
            <Button
              type="submit"
              className="pressable w-full"
              disabled={resetLoading || !resetEmail.trim()}
            >
              {resetLoading ? "Sending link…" : "Send reset email"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => {
                setShowReset(false);
                setError(null);
                setResetSent(false);
              }}
            >
              Back to sign in
            </Button>
          </form>
        ) : (
          <>
            <Button
              type="button"
              variant="secondary"
              className="pressable mt-6 w-full"
              disabled={!configured || googleLoading || loading}
              onClick={() => void onGoogle()}
            >
              <GoogleIcon className="h-4 w-4" />
              {googleLoading ? "Connecting…" : "Continue with Google"}
            </Button>

            <div className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-wider text-[var(--ink-soft)]">
              <span className="h-px flex-1 bg-[var(--glass-border)]" />
              or email
              <span className="h-px flex-1 bg-[var(--glass-border)]" />
            </div>

            <form className="space-y-3" onSubmit={onSubmit}>
              <Input
                type="email"
                autoComplete="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <Input
                type="password"
                autoComplete="current-password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  className="text-xs text-[var(--ink-muted)] hover:text-[var(--accent)] hover:underline"
                  onClick={() => {
                    setResetEmail(email);
                    setShowReset(true);
                    setError(null);
                  }}
                >
                  Forgot password?
                </button>
              </div>
              {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
              <Button
                type="submit"
                className="pressable w-full"
                disabled={loading || googleLoading || !configured}
              >
                {loading ? "Signing in…" : "Sign in"}
              </Button>
            </form>

            <p className="mt-5 text-center text-sm text-[var(--ink-muted)]">
              New here?{" "}
              <Link href="/signup" className="font-medium text-[var(--accent)] hover:underline">
                Create an account
              </Link>
            </p>
          </>
        )}
      </GlassPanel>
    </AuthShell>
  );
}

export function SignupForm() {
  const { signup, loginGoogle, configured } = useAuth();
  const { resolved, toggle } = useTheme();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await signup({ email, password, username, displayName });
      router.replace("/");
    } catch (err) {
      setError(friendlyError(err, "Could not create account."));
    } finally {
      setLoading(false);
    }
  };

  const onGoogle = async () => {
    setGoogleLoading(true);
    setError(null);
    try {
      await loginGoogle();
      router.replace("/");
    } catch (err) {
      setError(friendlyError(err, "Google sign-up failed."));
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <AuthShell onToggleTheme={toggle} theme={resolved}>
      <GlassPanel className="fade-up w-full max-w-md p-8">
        <h1 className="font-display text-3xl font-semibold">Join {APP_NAME}</h1>
        <p className="mt-2 text-sm text-[var(--ink-muted)]">
          Create your profile to start chatting.
        </p>

        <Button
          type="button"
          variant="secondary"
          className="pressable mt-6 w-full"
          disabled={!configured || googleLoading || loading}
          onClick={() => void onGoogle()}
        >
          <GoogleIcon className="h-4 w-4" />
          {googleLoading ? "Connecting…" : "Continue with Google"}
        </Button>

        <div className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-wider text-[var(--ink-soft)]">
          <span className="h-px flex-1 bg-[var(--glass-border)]" />
          or email
          <span className="h-px flex-1 bg-[var(--glass-border)]" />
        </div>

        <form className="space-y-3" onSubmit={onSubmit}>
          <Input
            placeholder="Display name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            maxLength={40}
          />
          <Input
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase())}
            required
            minLength={3}
            maxLength={20}
            pattern="[a-z0-9_]{3,20}"
          />
          <Input
            type="email"
            autoComplete="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            type="password"
            autoComplete="new-password"
            placeholder="Password (min 6)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
          {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
          <Button
            type="submit"
            className="pressable w-full"
            disabled={loading || googleLoading || !configured}
          >
            {loading ? "Creating…" : "Create account"}
          </Button>
        </form>
        <p className="mt-5 text-center text-sm text-[var(--ink-muted)]">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-[var(--accent)] hover:underline">
            Sign in
          </Link>
        </p>
      </GlassPanel>
    </AuthShell>
  );
}

export function CompleteProfileForm() {
  const { user, completeSetup, logout } = useAuth();
  const { resolved, toggle } = useTheme();

  const suggestedUsername = () => {
    if (!user) return "";
    const fromEmail = user.email ? user.email.split("@")[0] : "";
    const raw = (fromEmail || user.displayName || "")
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "_")
      .slice(0, 15);
    return raw.length >= 3 ? raw : `chemm_${Math.floor(1000 + Math.random() * 9000)}`;
  };

  const [username, setUsername] = useState(suggestedUsername);
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await completeSetup({ username, displayName });
    } catch (err) {
      setError(friendlyError(err, "Could not finish setup."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell onToggleTheme={toggle} theme={resolved}>
      <GlassPanel className="fade-up w-full max-w-md p-8">
        <h1 className="font-display text-3xl font-semibold">Choose your identity</h1>
        <p className="mt-2 text-sm text-[var(--ink-muted)]">
          Pick a username and display name. We’ll assign your permanent CHEMM Number.
        </p>
        {user?.email && (
          <p className="mt-3 text-xs text-[var(--ink-soft)]">Signed in as {user.email}</p>
        )}
        <form className="mt-6 space-y-3" onSubmit={onSubmit}>
          <Input
            placeholder="Display name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            maxLength={40}
            autoFocus
          />
          <Input
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase())}
            required
            minLength={3}
            maxLength={20}
            pattern="[a-z0-9_]{3,20}"
          />
          {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
          <Button type="submit" className="pressable w-full" disabled={loading}>
            {loading ? "Saving…" : "Continue"}
          </Button>
        </form>
        <Button
          variant="ghost"
          className="mt-3 w-full"
          onClick={() => void logout()}
        >
          Use a different account
        </Button>
      </GlassPanel>
    </AuthShell>
  );
}

function AuthShell({
  children,
  onToggleTheme,
  theme,
}: {
  children: React.ReactNode;
  onToggleTheme: () => void;
  theme: "light" | "dark";
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <button
        type="button"
        onClick={onToggleTheme}
        className="pressable absolute right-4 top-4 glass-surface inline-flex h-10 w-10 items-center justify-center rounded-full"
        aria-label="Toggle theme"
      >
        {mounted ? (
          theme === "dark" ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )
        ) : (
          <span className="h-4 w-4 inline-block" />
        )}
      </button>
      <div className="fade-up mb-8 text-center">
        <p className="font-display text-5xl font-semibold tracking-tight">{APP_NAME}</p>
        <p className="mt-2 text-sm text-[var(--ink-muted)]">{APP_TAGLINE}</p>
      </div>
      {children}
    </div>
  );
}
