"use client";

import { memo, useEffect, useState } from "react";
import {
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Volume2,
  Minimize2,
} from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { useCall } from "./CallProvider";
import { useAuth } from "@/features/auth/AuthProvider";
import { statusLabel } from "./callStateMachine";
import { cn, formatCallDuration } from "@/lib/utils";

export const CallOverlay = memo(function CallOverlay() {
  const { profile } = useAuth();
  const {
    uiState,
    remoteProfile,
    muted,
    error,
    durationSeconds,
    acceptCall,
    declineCall,
    cancelCall,
    hangup,
    toggleMute,
    clearError,
  } = useCall();
  const [minimized, setMinimized] = useState(false);

  useEffect(() => {
    if (uiState === "idle" || uiState === "ended" || uiState === "failed") {
      setMinimized(false);
    }
  }, [uiState]);

  if (uiState === "idle") return null;

  const name = remoteProfile?.displayName ?? "Unknown";
  const avatar = remoteProfile?.avatarUrl;
  const isIncoming = uiState === "ringing";
  const isLive = ["connecting", "connected", "reconnecting", "outgoing"].includes(
    uiState,
  );
  const merged = uiState === "connected" || uiState === "reconnecting";

  // Dynamic Island mini pill while connected
  if (minimized && (uiState === "connected" || uiState === "reconnecting")) {
    return (
      <button
        type="button"
        onClick={() => setMinimized(false)}
        className="island-enter fixed left-1/2 top-3 z-[60] flex -translate-x-1/2 items-center gap-3 rounded-full bg-black px-4 py-2 text-white shadow-[0_20px_60px_rgba(0,0,0,0.45)] ring-1 ring-white/10"
      >
        <span className="relative flex h-2 w-2">
          <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/70" />
          <span className="relative h-2 w-2 rounded-full bg-emerald-400" />
        </span>
        <Avatar name={name} src={avatar} size="sm" />
        <span className="text-sm font-medium tracking-tight">
          {formatCallDuration(durationSeconds)}
        </span>
        <Phone className="h-4 w-4 text-emerald-400" />
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(10,132,255,0.28),transparent_45%),radial-gradient(circle_at_80%_80%,rgba(100,210,255,0.18),transparent_40%)] backdrop-blur-2xl" />
      <div
        className="absolute inset-0 bg-black/35 dark:bg-black/55"
        data-theme-overlay
      />

      <div className="glass-panel specular relative w-full max-w-lg overflow-hidden px-6 py-10 text-center md:px-10 md:py-12">
        <div className="pointer-events-none absolute -left-20 top-0 h-56 w-56 rounded-full bg-[var(--accent)]/20 blur-3xl" />
        <div className="pointer-events-none absolute -right-16 bottom-0 h-48 w-48 rounded-full bg-[var(--accent-2)]/20 blur-3xl" />

        {uiState === "connected" && (
          <button
            type="button"
            onClick={() => setMinimized(true)}
            className="absolute right-4 top-4 rounded-full p-2 text-[var(--ink-muted)] transition hover:bg-white/10"
            aria-label="Minimize call"
          >
            <Minimize2 className="h-4 w-4" />
          </button>
        )}

        {/* Apple Duo–style dual orb stage */}
        <div className="relative mx-auto mb-8 flex h-48 w-48 items-center justify-center md:h-56 md:w-56">
          {(isIncoming || uiState === "outgoing" || uiState === "connecting") && (
            <>
              <span className="pulse-ring absolute inset-6 rounded-full bg-[var(--accent)]/25" />
              <span
                className="pulse-ring absolute inset-2 rounded-full bg-[var(--accent-2)]/20"
                style={{ animationDelay: "0.55s" }}
              />
            </>
          )}

          {!merged && (
            <>
              <div className="duo-orbit absolute">
                <Avatar
                  name={profile?.displayName ?? "You"}
                  src={profile?.avatarUrl}
                  size="lg"
                  className="scale-90 opacity-90"
                />
              </div>
              <div className="duo-orbit-rev absolute">
                <Avatar name={name} src={avatar} size="lg" className="scale-90" />
              </div>
            </>
          )}

          {merged && (
            <div className="duo-merge call-glow relative">
              <Avatar name={name} src={avatar} size="xl" />
              <div className="absolute -bottom-1 -right-1 rounded-full ring-2 ring-black/20">
                <Avatar
                  name={profile?.displayName ?? "You"}
                  src={profile?.avatarUrl}
                  size="sm"
                />
              </div>
            </div>
          )}

          {!merged && (isIncoming || uiState === "outgoing") && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-3 w-3 rounded-full bg-[var(--accent)] shadow-[0_0_24px_var(--accent)]" />
            </div>
          )}
        </div>

        <h2 className="fade-up relative font-display text-3xl font-semibold tracking-tight md:text-4xl">
          {name}
        </h2>
        <p className="fade-up stagger-1 relative mt-2 text-sm text-[var(--ink-muted)]">
          {uiState === "connected"
            ? formatCallDuration(durationSeconds)
            : statusLabel(uiState)}
        </p>

        {error && (
          <p className="relative mt-3 text-sm text-[var(--danger)]">
            {error}{" "}
            <button type="button" className="underline" onClick={clearError}>
              dismiss
            </button>
          </p>
        )}

        <div className="fade-up stagger-2 relative mt-10 flex items-center justify-center gap-4">
          {isIncoming && (
            <>
              <Button
                variant="danger"
                size="lg"
                className="pressable min-w-28 rounded-full"
                onClick={() => void declineCall()}
              >
                <PhoneOff className="h-5 w-5" />
                Decline
              </Button>
              <Button
                variant="success"
                size="lg"
                className="pressable min-w-28 rounded-full animate-[pulse-ring_2s_ease_infinite]"
                onClick={() => void acceptCall()}
              >
                <Phone className="h-5 w-5" />
                Accept
              </Button>
            </>
          )}

          {uiState === "outgoing" && (
            <Button
              variant="danger"
              size="lg"
              className="pressable rounded-full"
              onClick={() => void cancelCall()}
            >
              <PhoneOff className="h-5 w-5" />
              Cancel
            </Button>
          )}

          {["connecting", "connected", "reconnecting"].includes(uiState) && (
            <>
              <Button
                variant="secondary"
                size="icon"
                className={cn(
                  "pressable rounded-full",
                  muted && "bg-[var(--danger)]/20 text-[var(--danger)]",
                )}
                aria-label={muted ? "Unmute" : "Mute"}
                onClick={toggleMute}
              >
                {muted ? (
                  <MicOff className="h-5 w-5" />
                ) : (
                  <Mic className="h-5 w-5" />
                )}
              </Button>
              <Button
                variant="secondary"
                size="icon"
                className="pressable rounded-full"
                aria-label="Audio output"
                title="System audio output"
              >
                <Volume2 className="h-5 w-5" />
              </Button>
              <Button
                variant="danger"
                size="icon"
                className="pressable rounded-full"
                onClick={() => void hangup()}
              >
                <PhoneOff className="h-5 w-5" />
              </Button>
            </>
          )}
        </div>

        {isLive && (
          <p className="fade-up stagger-3 mt-6 text-[11px] uppercase tracking-[0.2em] text-[var(--ink-soft)]">
            End-to-end peer audio · WebRTC
          </p>
        )}
      </div>
    </div>
  );
});
