"use client";

import { useEffect, useState } from "react";
import { Check, UserPlus, X } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/features/auth/AuthProvider";
import {
  acceptContactRequestAndAdd,
  respondToContactRequest,
  subscribeIncomingContactRequests,
} from "@/services/firebase/moderation";
import type { ContactRequest } from "@/types";
import { userFacingMessage } from "@/lib/errors";

export function ContactRequestsInbox() {
  const { profile } = useAuth();
  const [requests, setRequests] = useState<ContactRequest[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    return subscribeIncomingContactRequests(profile.uid, setRequests);
  }, [profile]);

  if (!profile || requests.length === 0) return null;

  return (
    <div className="mx-2 mb-2 space-y-1 rounded-2xl bg-[var(--accent-soft)] p-2 ring-1 ring-[var(--accent)]/20">
      <p className="px-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--accent)]">
        Requests · {requests.length}
      </p>
      {error && (
        <p className="px-1 text-xs text-[var(--danger)]" role="alert">
          {error}
        </p>
      )}
      {requests.map((r) => (
        <div
          key={r.id}
          className="flex items-center gap-2 rounded-xl bg-[var(--glass-strong)] px-2 py-2"
        >
          <Avatar
            name={r.fromDisplayName}
            src={r.fromAvatarUrl}
            size="sm"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold">{r.fromDisplayName}</p>
            <p className="truncate text-[10px] text-[var(--ink-soft)]">
              @{r.fromUsername} · {r.fromChemmNumber}
            </p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            disabled={busyId === r.id}
            aria-label="Accept"
            onClick={async () => {
              setBusyId(r.id);
              setError(null);
              try {
                await acceptContactRequestAndAdd(r.id, profile.uid);
              } catch (err) {
                setError(userFacingMessage(err));
              } finally {
                setBusyId(null);
              }
            }}
          >
            <Check className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={busyId === r.id}
            aria-label="Reject"
            onClick={async () => {
              setBusyId(r.id);
              setError(null);
              try {
                await respondToContactRequest(r.id, profile.uid, false);
              } catch (err) {
                setError(userFacingMessage(err));
              } finally {
                setBusyId(null);
              }
            }}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <p className="flex items-center gap-1 px-1 pt-1 text-[10px] text-[var(--ink-soft)]">
        <UserPlus className="h-3 w-3" />
        Accept to add as contact
      </p>
    </div>
  );
}
