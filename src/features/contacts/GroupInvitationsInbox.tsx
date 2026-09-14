"use client";

import { useEffect, useState } from "react";
import { Check, Users, X } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/features/auth/AuthProvider";
import {
  respondToGroupInvitation,
  subscribeGroupInvitations,
} from "@/services/firebase/groups";
import type { GroupInvitation } from "@/types";
import { userFacingMessage } from "@/lib/errors";

export function GroupInvitationsInbox() {
  const { profile } = useAuth();
  const [invitations, setInvitations] = useState<GroupInvitation[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    return subscribeGroupInvitations(profile.uid, setInvitations);
  }, [profile]);

  if (invitations.length === 0) return null;

  const respond = async (inv: GroupInvitation, accept: boolean) => {
    if (!profile) return;
    setBusy(inv.id);
    setError(null);
    try {
      await respondToGroupInvitation(inv.id, profile.uid, accept);
    } catch (err) {
      setError(userFacingMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-4 mb-3 space-y-2 rounded-2xl bg-gradient-to-br from-[var(--accent-soft)] to-transparent p-3 ring-1 ring-[var(--accent)]/20">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--accent)]">
        <Users className="h-3.5 w-3.5" />
        Group invitations · {invitations.length}
      </div>
      {error && (
        <p className="text-xs text-[var(--danger)]" role="alert">
          {error}
        </p>
      )}
      {invitations.map((inv) => (
        <div
          key={inv.id}
          className="flex items-center gap-3 rounded-xl bg-[var(--glass)] px-3 py-2 ring-1 ring-[var(--glass-border-soft)]"
        >
          <Avatar
            name={inv.groupName}
            src={inv.groupAvatarUrl}
            size="sm"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-[var(--ink)]">
              {inv.groupName}
            </p>
            <p className="truncate text-[10px] text-[var(--ink-muted)]">
              Invited by {inv.invitedByDisplayName}
            </p>
          </div>
          <div className="flex shrink-0 gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 text-emerald-600 hover:bg-emerald-50"
              disabled={busy === inv.id}
              onClick={() => void respond(inv, true)}
              aria-label="Accept"
            >
              <Check className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 text-[var(--danger)] hover:bg-rose-50"
              disabled={busy === inv.id}
              onClick={() => void respond(inv, false)}
              aria-label="Decline"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
