"use client";

import { useEffect, useState } from "react";
import { Ban, Flag, Moon, Shield, Sun, X } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { useAuth } from "@/features/auth/AuthProvider";
import { useCall } from "@/features/calls/CallProvider";
import { useTheme } from "@/features/theme/ThemeProvider";
import {
  addContact,
  removeContact,
} from "@/services/firebase/contacts";
import { ensureConversation } from "@/services/firebase/chat";
import {
  blockUser,
  reportUser,
} from "@/services/firebase/moderation";
import {
  getPrivacySettings,
  savePrivacySettings,
} from "@/services/firebase/privacy";
import { listDevices, revokeDevice } from "@/services/firebase/devices";
import { cn, formatLastSeen, timestampToDate } from "@/lib/utils";
import type { DeviceRecord, PrivacySettings, UserProfile } from "@/types";
import { useAsyncPeer } from "@/hooks/useAsyncPeer";
import { userFacingMessage } from "@/lib/errors";

interface ProfilePanelProps {
  username: string | null;
  onClose: () => void;
  onOpenConversation: (id: string) => void;
  mode?: "peer" | "settings";
}

export function ProfilePanel({
  username,
  onClose,
  onOpenConversation,
  mode = "peer",
}: ProfilePanelProps) {
  const { profile, updateProfile, uploadAvatarFile, logout } = useAuth();
  const { startCall, supported } = useCall();

  if (mode === "settings" && profile) {
    return (
      <SettingsPanel
        key={profile.uid}
        profile={profile}
        onClose={onClose}
        updateProfile={updateProfile}
        uploadAvatarFile={uploadAvatarFile}
        logout={logout}
      />
    );
  }

  return (
    <PeerPanel
      username={username}
      currentUid={profile?.uid}
      onClose={onClose}
      onOpenConversation={onOpenConversation}
      startCall={startCall}
      supported={supported}
      profile={profile}
    />
  );
}

function SettingsPanel({
  profile,
  onClose,
  updateProfile,
  uploadAvatarFile,
  logout,
}: {
  profile: UserProfile;
  onClose: () => void;
  updateProfile: (
    updates: Partial<Pick<UserProfile, "displayName" | "bio">>,
  ) => Promise<void>;
  uploadAvatarFile: (file: File) => Promise<void>;
  logout: () => Promise<void>;
}) {
  const { mode, resolved, setMode, toggle } = useTheme();
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [bio, setBio] = useState(profile.bio ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [privacy, setPrivacy] = useState<PrivacySettings | null>(null);
  const [devices, setDevices] = useState<DeviceRecord[]>([]);

  useEffect(() => {
    void getPrivacySettings(profile.uid).then(setPrivacy);
    void listDevices(profile.uid).then(setDevices);
  }, [profile.uid]);

  return (
    <PanelShell title="Profile" onClose={onClose}>
      <div className="flex flex-col items-center gap-3">
        <Avatar name={profile.displayName} src={profile.avatarUrl} size="xl" />
        <label className="cursor-pointer text-sm font-medium text-[var(--accent)] hover:underline">
          Change avatar
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void uploadAvatarFile(file);
            }}
          />
        </label>
      </div>
      <label className="mt-6 block text-xs font-medium text-[var(--ink-muted)]">
        Display name
        <Input
          className="mt-1"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
      </label>
      <label className="mt-4 block text-xs font-medium text-[var(--ink-muted)]">
        Bio
        <Textarea
          className="mt-1"
          rows={3}
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          maxLength={160}
        />
      </label>
      <p className="mt-3 text-xs text-[var(--ink-soft)]">Username: @{profile.username}</p>
      <p className="mt-1 text-xs text-[var(--ink-soft)]">CHEMM: {profile.chemmNumber}</p>
      {profile.encryptionFingerprint && (
        <p className="mt-1 break-all font-mono text-[10px] text-[var(--ink-soft)]">
          Fingerprint: {profile.encryptionFingerprint.slice(0, 32)}…
        </p>
      )}
      {error && <p className="mt-2 text-sm text-[var(--danger)]">{error}</p>}

      <div className="mt-6 space-y-2">
        <p className="text-xs font-medium uppercase tracking-wider text-[var(--ink-soft)]">
          Appearance
        </p>
        <div className="grid grid-cols-3 gap-2">
          {(["light", "dark", "system"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                "pressable rounded-xl py-2 text-xs font-medium capitalize ring-1",
                mode === m
                  ? "bg-[var(--accent-soft)] text-[var(--accent)] ring-[var(--accent)]/30"
                  : "glass-surface text-[var(--ink-muted)] ring-[var(--glass-border-soft)]",
              )}
            >
              {m}
            </button>
          ))}
        </div>
        <Button variant="secondary" className="pressable w-full" onClick={toggle}>
          {resolved === "dark" ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
          Quick toggle {resolved === "dark" ? "light" : "dark"}
        </Button>
      </div>

      {privacy && (
        <div className="mt-6 space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-[var(--ink-soft)]">
            Privacy
          </p>
          {(
            [
              ["showOnline", "Show online status"],
              ["showLastSeen", "Show last seen"],
              ["readReceipts", "Send read receipts"],
            ] as const
          ).map(([key, label]) => (
            <label
              key={key}
              className="flex items-center justify-between gap-2 rounded-xl bg-[var(--glass)] px-3 py-2 text-sm ring-1 ring-[var(--glass-border-soft)]"
            >
              {label}
              <input
                type="checkbox"
                checked={privacy[key]}
                onChange={(e) => {
                  const next = { ...privacy, [key]: e.target.checked };
                  setPrivacy(next);
                  void savePrivacySettings(profile.uid, { [key]: e.target.checked });
                }}
              />
            </label>
          ))}
          <label className="block text-xs font-medium text-[var(--ink-muted)]">
            Who can message
            <select
              className="mt-1 w-full rounded-xl bg-[var(--glass)] px-3 py-2 text-sm ring-1 ring-[var(--glass-border-soft)]"
              value={privacy.whoCanMessage}
              onChange={(e) => {
                const whoCanMessage = e.target.value as PrivacySettings["whoCanMessage"];
                setPrivacy({ ...privacy, whoCanMessage });
                void savePrivacySettings(profile.uid, { whoCanMessage });
              }}
            >
              <option value="everyone">Everyone</option>
              <option value="contacts">Contacts only</option>
            </select>
          </label>
          <label className="block text-xs font-medium text-[var(--ink-muted)]">
            Who can call
            <select
              className="mt-1 w-full rounded-xl bg-[var(--glass)] px-3 py-2 text-sm ring-1 ring-[var(--glass-border-soft)]"
              value={privacy.whoCanCall}
              onChange={(e) => {
                const whoCanCall = e.target.value as PrivacySettings["whoCanCall"];
                setPrivacy({ ...privacy, whoCanCall });
                void savePrivacySettings(profile.uid, { whoCanCall });
              }}
            >
              <option value="everyone">Everyone</option>
              <option value="contacts">Contacts only</option>
            </select>
          </label>
        </div>
      )}

      <div className="mt-6 space-y-2">
        <p className="text-xs font-medium uppercase tracking-wider text-[var(--ink-soft)]">
          Devices
        </p>
        {devices.map((d) => (
          <div
            key={d.deviceId}
            className="flex items-center justify-between gap-2 rounded-xl bg-[var(--glass)] px-3 py-2 text-sm ring-1 ring-[var(--glass-border-soft)]"
          >
            <div className="min-w-0">
              <p className="truncate font-medium">{d.label}</p>
              <p className="truncate text-[10px] text-[var(--ink-soft)]">
                {d.platform} · {d.deviceId.slice(0, 8)}…
              </p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                void revokeDevice(profile.uid, d.deviceId).then(() =>
                  listDevices(profile.uid).then(setDevices),
                );
              }}
            >
              Revoke
            </Button>
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-col gap-2">
        <Button
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            setError(null);
            try {
              await updateProfile({ displayName, bio });
            } catch (err) {
              setError(err instanceof Error ? err.message : "Save failed");
            } finally {
              setSaving(false);
            }
          }}
        >
          Save changes
        </Button>
        <Button
          variant="ghost"
          onClick={() => window.location.assign("/admin")}
        >
          <Shield className="h-4 w-4" />
          Admin panel
        </Button>
        <Button variant="secondary" onClick={() => void logout()}>
          Log out
        </Button>
      </div>
    </PanelShell>
  );
}

function PeerPanel({
  username,
  currentUid,
  onClose,
  onOpenConversation,
  startCall,
  supported,
  profile,
}: {
  username: string | null;
  currentUid?: string;
  onClose: () => void;
  onOpenConversation: (id: string) => void;
  startCall: (user: UserProfile) => Promise<void>;
  supported: boolean;
  profile: UserProfile | null;
}) {
  const { peer, inContacts, setInContacts, loading } = useAsyncPeer(
    username,
    currentUid,
  );
  const [modError, setModError] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [busy, setBusy] = useState(false);

  if (!username || loading) {
    return (
      <PanelShell title="Profile" onClose={onClose}>
        <p className="text-sm text-slate-500">Loading profile…</p>
      </PanelShell>
    );
  }

  if (!peer) {
    return (
      <PanelShell title="Profile" onClose={onClose}>
        <p className="text-sm text-slate-500">User not found.</p>
      </PanelShell>
    );
  }

  return (
    <PanelShell title="Profile" onClose={onClose}>
      <div className="flex flex-col items-center text-center">
        <Avatar
          name={peer.displayName}
          src={peer.avatarUrl}
          online={peer.isOnline}
          size="xl"
        />
        <h3 className="mt-4 font-display text-2xl font-semibold text-slate-900">
          {peer.displayName}
        </h3>
        <p className="text-sm text-slate-500">@{peer.username}</p>
        {peer.chemmNumber && (
          <p className="mt-1 text-xs text-[var(--ink-soft)]">{peer.chemmNumber}</p>
        )}
        <p className="mt-2 text-xs text-slate-400">
          {formatLastSeen(peer.isOnline, timestampToDate(peer.lastSeen))}
        </p>
        {peer.bio && <p className="mt-4 text-sm text-slate-600">{peer.bio}</p>}
        {peer.encryptionFingerprint && (
          <p className="mt-3 max-w-full break-all font-mono text-[10px] text-[var(--ink-soft)]">
            Safety number · {peer.encryptionFingerprint.slice(0, 40)}…
          </p>
        )}
      </div>
      {modError && (
        <p className="mt-3 text-center text-sm text-[var(--danger)]" role="alert">
          {modError}
        </p>
      )}
      <div className="mt-8 flex flex-col gap-2">
        <Button
          onClick={async () => {
            if (!profile) return;
            const id = await ensureConversation(profile, peer);
            onOpenConversation(id);
          }}
        >
          Message
        </Button>
        <Button
          variant="secondary"
          disabled={!supported}
          onClick={() => void startCall(peer)}
        >
          Voice call
        </Button>
        {profile && (
          <Button
            variant="ghost"
            onClick={async () => {
              if (inContacts) {
                await removeContact(profile.uid, peer.uid);
                setInContacts(false);
              } else {
                await addContact(profile.uid, peer.uid);
                setInContacts(true);
              }
            }}
          >
            {inContacts ? "Remove contact" : "Add contact"}
          </Button>
        )}
        {profile && (
          <>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setModError(null);
                try {
                  await blockUser(profile.uid, peer.uid);
                  setModError("User blocked. They can no longer contact you.");
                } catch (err) {
                  setModError(userFacingMessage(err));
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Ban className="h-4 w-4" />
              Block
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => setReportOpen((v) => !v)}
            >
              <Flag className="h-4 w-4" />
              Report
            </Button>
            {reportOpen && (
              <div className="space-y-2 rounded-2xl bg-[var(--glass)] p-3 ring-1 ring-[var(--glass-border-soft)]">
                <Textarea
                  rows={3}
                  placeholder="Why are you reporting this user?"
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  maxLength={500}
                />
                <Button
                  disabled={busy || reportReason.trim().length < 3}
                  onClick={async () => {
                    setBusy(true);
                    setModError(null);
                    try {
                      await reportUser({
                        reporterUid: profile.uid,
                        reportedUid: peer.uid,
                        reason: reportReason,
                      });
                      setReportOpen(false);
                      setReportReason("");
                      setModError("Report submitted. Thank you.");
                    } catch (err) {
                      setModError(userFacingMessage(err));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Submit report
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </PanelShell>
  );
}

function PanelShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 w-full flex-col border-l border-[var(--glass-border-soft)] bg-[var(--sidebar)] backdrop-blur-2xl">
      <div className="flex items-center justify-between px-4 py-4">
        <h2 className="font-display text-lg font-semibold">{title}</h2>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
          <X className="h-5 w-5" />
        </Button>
      </div>
      <div className="subtle-scroll flex-1 overflow-y-auto px-4 pb-6">{children}</div>
    </div>
  );
}
