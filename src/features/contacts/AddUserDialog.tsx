"use client";

import { useState } from "react";
import { Copy, MessageCircle, UserPlus, X } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/features/auth/AuthProvider";
import {
  lookupByChemmNumber,
  searchUsersLimited,
} from "@/services/firebase/chemmLookup";
import { addContact } from "@/services/firebase/contacts";
import { ensureConversation } from "@/services/firebase/chat";
import { sendContactRequest } from "@/services/firebase/moderation";
import { userFacingMessage } from "@/lib/errors";
import type { PublicUserPreview, UserProfile } from "@/types";
import { formatLastSeen, timestampToDate } from "@/lib/utils";

interface AddUserDialogProps {
  open: boolean;
  onClose: () => void;
  onOpenConversation: (id: string) => void;
}

export function AddUserDialog({
  open,
  onClose,
  onOpenConversation,
}: AddUserDialogProps) {
  const { profile } = useAuth();
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<PublicUserPreview | null>(null);
  const [results, setResults] = useState<PublicUserPreview[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const search = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setResults([]);
    try {
      if (query.trim().toUpperCase().startsWith("CHEMM-")) {
        const user = await lookupByChemmNumber(query);
        if (user.uid === profile?.uid) {
          setError("That’s your own CHEMM Number.");
        } else {
          setResult(user);
        }
      } else {
        const list = await searchUsersLimited(query, profile?.uid);
        setResults(list);
        if (list.length === 0) setError("No users found.");
      }
    } catch (err) {
      setError(userFacingMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const toProfile = (u: PublicUserPreview): UserProfile => ({
    uid: u.uid,
    chemmNumber: u.chemmNumber,
    email: "",
    username: u.username,
    displayName: u.displayName,
    avatarUrl: u.avatarUrl,
    bio: "",
    createdAt: null,
    lastSeen: u.lastSeen,
    isOnline: u.isOnline,
    searchUsername: u.username,
    encryptionFingerprint: u.encryptionFingerprint,
  });

  const startChat = async (u: PublicUserPreview) => {
    if (!profile) return;
    setBusy(true);
    try {
      const id = await ensureConversation(profile, toProfile(u));
      onOpenConversation(id);
      onClose();
    } catch (err) {
      setError(userFacingMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const add = async (u: PublicUserPreview) => {
    if (!profile) return;
    setBusy(true);
    try {
      await addContact(profile.uid, u.uid);
      await sendContactRequest({
        from: {
          uid: profile.uid,
          displayName: profile.displayName,
          username: profile.username,
          chemmNumber: profile.chemmNumber,
          avatarUrl: profile.avatarUrl,
        },
        toUid: u.uid,
      }).catch(() => undefined);
      setError(null);
    } catch (err) {
      setError(userFacingMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const preview = result;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="glass-panel fade-up relative w-full max-w-md p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold">Add User</h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5" />
          </Button>
        </div>

        {profile?.chemmNumber && (
          <div className="mb-4 rounded-2xl bg-[var(--accent-soft)] px-3 py-3 text-sm ring-1 ring-[var(--accent)]/20">
            <p className="text-xs font-medium uppercase tracking-wider text-[var(--ink-soft)]">
              Your CHEMM Number
            </p>
            <div className="mt-1 flex items-center justify-between gap-2">
              <code className="font-display text-lg font-semibold tracking-wide text-[var(--accent)]">
                {profile.chemmNumber}
              </code>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void navigator.clipboard.writeText(profile.chemmNumber)}
              >
                <Copy className="h-3.5 w-3.5" />
                Copy
              </Button>
            </div>
          </div>
        )}

        <label className="block text-xs font-medium text-[var(--ink-muted)]">
          CHEMM Number or username
          <div className="mt-1 flex gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="CHEMM-7K4X92"
              onKeyDown={(e) => {
                if (e.key === "Enter") void search();
              }}
              className="flex-1"
              autoFocus
            />
            <Button onClick={() => void search()} disabled={loading}>
              {loading ? "…" : "Find"}
            </Button>
          </div>
        </label>

        {error && (
          <p className="mt-3 text-sm text-[var(--danger)]" role="alert">
            {error}
          </p>
        )}

        {preview && (
          <UserCard
            user={preview}
            busy={busy}
            onAdd={() => void add(preview)}
            onChat={() => void startChat(preview)}
          />
        )}

        {results.map((u) => (
          <UserCard
            key={u.uid}
            user={u}
            busy={busy}
            onAdd={() => void add(u)}
            onChat={() => void startChat(u)}
          />
        ))}
      </div>
    </div>
  );
}

function UserCard({
  user,
  busy,
  onAdd,
  onChat,
}: {
  user: PublicUserPreview;
  busy: boolean;
  onAdd: () => void;
  onChat: () => void;
}) {
  return (
    <div className="mt-4 rounded-2xl bg-[var(--glass)] p-4 ring-1 ring-[var(--glass-border-soft)]">
      <div className="flex items-center gap-3">
        <Avatar
          name={user.displayName}
          src={user.avatarUrl}
          online={user.isOnline}
          size="lg"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-[var(--ink)]">
            {user.displayName}
          </p>
          <p className="truncate text-xs text-[var(--ink-muted)]">
            @{user.username} · {user.chemmNumber}
          </p>
          <p className="text-[11px] text-[var(--ink-soft)]">
            {formatLastSeen(user.isOnline, timestampToDate(user.lastSeen))}
          </p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <Button
          variant="secondary"
          className="flex-1"
          disabled={busy}
          onClick={onAdd}
        >
          <UserPlus className="h-4 w-4" />
          Add
        </Button>
        <Button className="flex-1" disabled={busy} onClick={onChat}>
          <MessageCircle className="h-4 w-4" />
          Chat
        </Button>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="mt-2 w-full"
        onClick={() => void navigator.clipboard.writeText(user.chemmNumber)}
      >
        <Copy className="h-3.5 w-3.5" />
        Copy CHEMM Number
      </Button>
    </div>
  );
}
