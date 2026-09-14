"use client";

import { useMemo, useState } from "react";
import { Plus, Users, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/features/auth/AuthProvider";
import { createGroup } from "@/services/firebase/groups";
import { subscribeToContacts } from "@/services/firebase/contacts";
import { lookupByChemmNumber } from "@/services/firebase/chemmLookup";
import { useEffect } from "react";
import type { Contact, UserProfile } from "@/types";
import { userFacingMessage } from "@/lib/errors";
import { getUserById } from "@/services/firebase/users";

interface CreateGroupDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (groupId: string) => void;
}

export function CreateGroupDialog({
  open,
  onClose,
  onCreated,
}: CreateGroupDialogProps) {
  const { profile } = useAuth();
  const [name, setName] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [chemmInput, setChemmInput] = useState("");
  const [chemmBusy, setChemmBusy] = useState(false);
  const [customMembers, setCustomMembers] = useState<Contact[]>([]);

  useEffect(() => {
    if (!profile || !open) return;
    return subscribeToContacts(profile.uid, setContacts);
  }, [profile, open]);

  const allContacts = useMemo(() => {
    const map = new Map<string, Contact>();
    contacts.forEach((c) => map.set(c.uid, c));
    customMembers.forEach((c) => map.set(c.uid, c));
    return Array.from(map.values());
  }, [contacts, customMembers]);

  const canCreate = name.trim().length > 0 && selected.size >= 1;

  const selectedList = useMemo(() => [...selected], [selected]);

  const handleAddByChemm = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = chemmInput.trim().toUpperCase();
    if (!clean || !profile) return;
    try {
      setChemmBusy(true);
      setError(null);
      const user = await lookupByChemmNumber(clean);
      if (user.uid === profile.uid) {
        setError("You are already the group creator.");
        return;
      }
      setSelected((prev) => new Set([...prev, user.uid]));
      setCustomMembers((prev) => {
        if (prev.some((c) => c.uid === user.uid)) return prev;
        return [
          ...prev,
          {
            uid: user.uid,
            displayName: user.displayName,
            username: user.username,
            avatarUrl: user.avatarUrl,
            chemmNumber: user.chemmNumber,
            addedAt: null,
            status: "accepted",
          },
        ];
      });
      setChemmInput("");
    } catch (err) {
      setError(userFacingMessage(err));
    } finally {
      setChemmBusy(false);
    }
  };

  if (!open) return null;

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
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-[var(--accent)]" />
            <h2 className="font-display text-xl font-semibold">New group</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5" />
          </Button>
        </div>

        <p className="mb-3 text-xs text-[var(--ink-muted)]">
          Group chat foundation — create a group and collaborate seamlessly.
        </p>

        <label className="block text-xs font-medium text-[var(--ink-muted)]">
          Group name
          <Input
            className="mt-1"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={64}
            placeholder="Team standup"
            autoFocus
          />
        </label>

        <form onSubmit={handleAddByChemm} className="mt-3 flex gap-2">
          <Input
            value={chemmInput}
            onChange={(e) => setChemmInput(e.target.value.toUpperCase())}
            placeholder="Add by CHEMM Number…"
            className="text-xs font-mono"
          />
          <Button
            type="submit"
            size="sm"
            variant="secondary"
            disabled={chemmBusy || !chemmInput.trim()}
            className="shrink-0"
          >
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </form>

        <p className="mb-2 mt-4 text-xs font-medium uppercase tracking-wider text-[var(--ink-soft)]">
          Members ({selected.size} selected)
        </p>
        <div className="max-h-48 space-y-1 overflow-y-auto">
          {allContacts.length === 0 && (
            <p className="text-sm text-[var(--ink-muted)]">
              Add members by CHEMM Number above or select from contacts.
            </p>
          )}
          {allContacts.map((c) => {
            const on = selected.has(c.uid);
            return (
              <button
                key={c.uid}
                type="button"
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm ring-1 ${
                  on
                    ? "bg-[var(--accent-soft)] ring-[var(--accent)]/30"
                    : "bg-[var(--glass)] ring-[var(--glass-border-soft)]"
                }`}
                onClick={() => {
                  setSelected((prev) => {
                    const next = new Set(prev);
                    if (next.has(c.uid)) next.delete(c.uid);
                    else next.add(c.uid);
                    return next;
                  });
                }}
              >
                <span className="truncate font-medium">{c.displayName}</span>
                <span className="text-xs text-[var(--ink-soft)]">
                  {on ? "Selected" : "Add"}
                </span>
              </button>
            );
          })}
        </div>

        {error && (
          <p className="mt-3 text-sm text-[var(--danger)]" role="alert">
            {error}
          </p>
        )}

        <Button
          className="mt-4 w-full"
          disabled={!canCreate || busy || !profile}
          onClick={async () => {
            if (!profile) return;
            setBusy(true);
            setError(null);
            try {
              const memberProfiles: UserProfile[] = [];
              for (const uid of selectedList) {
                const u = await getUserById(uid);
                if (u) memberProfiles.push(u);
              }
              const id = await createGroup({
                creator: profile,
                name,
                memberUids: selectedList,
                memberProfiles,
              });
              onCreated(id);
              onClose();
              setName("");
              setSelected(new Set());
            } catch (err) {
              setError(userFacingMessage(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Creating…" : "Create group"}
        </Button>
      </div>
    </div>
  );
}
