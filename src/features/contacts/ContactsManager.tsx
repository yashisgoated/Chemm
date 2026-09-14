"use client";

import { useEffect, useMemo, useState } from "react";
import {
  MessageSquare,
  Phone,
  Search,
  Trash2,
  UserCheck,
  UserPlus,
  UserRound,
  UserX,
  X,
} from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { GlassPanel } from "@/components/ui/Glass";
import { useAuth } from "@/features/auth/AuthProvider";
import { useCall } from "@/features/calls/CallProvider";
import {
  removeContact,
  subscribeToContacts,
} from "@/services/firebase/contacts";
import {
  acceptContactRequestAndAdd,
  respondToContactRequest,
  subscribeBlockedUsers,
  subscribeIncomingContactRequests,
  unblockUser,
} from "@/services/firebase/moderation";
import { ensureConversation } from "@/services/firebase/chat";
import { getUserById } from "@/services/firebase/users";
import type { Contact, ContactRequest, UserProfile } from "@/types";

type ContactTab = "all" | "online" | "requests" | "blocked";

interface ContactsManagerProps {
  onOpenConversation: (conversationId: string) => void;
  onOpenProfile: (username: string) => void;
  onAddUser: () => void;
}

export function ContactsManager({
  onOpenConversation,
  onOpenProfile,
  onAddUser,
}: ContactsManagerProps) {
  const { profile } = useAuth();
  const { startCall, supported } = useCall();
  const [tab, setTab] = useState<ContactTab>("all");
  const [filter, setFilter] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [requests, setRequests] = useState<ContactRequest[]>([]);
  const [blockedUids, setBlockedUids] = useState<string[]>([]);
  const [blockedProfiles, setBlockedProfiles] = useState<Record<string, UserProfile>>({});
  const [contactToRemove, setContactToRemove] = useState<Contact | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    const unsubContacts = subscribeToContacts(profile.uid, setContacts);
    const unsubRequests = subscribeIncomingContactRequests(profile.uid, setRequests);
    const unsubBlocked = subscribeBlockedUsers(profile.uid, setBlockedUids);

    return () => {
      unsubContacts();
      unsubRequests();
      unsubBlocked();
    };
  }, [profile]);

  useEffect(() => {
    if (blockedUids.length === 0) {
      setBlockedProfiles({});
      return;
    }
    let active = true;
    void Promise.all(
      blockedUids.map(async (uid) => {
        const u = await getUserById(uid);
        return { uid, user: u };
      }),
    ).then((items) => {
      if (!active) return;
      const map: Record<string, UserProfile> = {};
      items.forEach((it) => {
        if (it.user) map[it.uid] = it.user;
      });
      setBlockedProfiles(map);
    });
    return () => {
      active = false;
    };
  }, [blockedUids]);

  const filteredContacts = useMemo(() => {
    const q = filter.trim().toLowerCase();
    let list = contacts;
    if (tab === "online") {
      list = contacts;
    }
    if (!q) return list;
    return list.filter(
      (c) =>
        c.displayName.toLowerCase().includes(q) ||
        c.username.toLowerCase().includes(q) ||
        (c.chemmNumber ?? "").toLowerCase().includes(q),
    );
  }, [contacts, filter, tab]);

  const handleStartChat = async (contact: Contact) => {
    if (!profile) return;
    const peer: UserProfile = {
      uid: contact.uid,
      email: "",
      chemmNumber: contact.chemmNumber ?? "",
      username: contact.username,
      displayName: contact.displayName,
      avatarUrl: contact.avatarUrl,
      bio: "",
      createdAt: null,
      lastSeen: null,
      isOnline: false,
      searchUsername: contact.username,
      encryptionFingerprint: null,
    };
    const cid = await ensureConversation(profile, peer);
    onOpenConversation(cid);
  };

  const handleStartCall = async (contact: Contact) => {
    const fullUser = await getUserById(contact.uid);
    if (fullUser) {
      void startCall(fullUser);
    }
  };

  const handleConfirmRemove = async () => {
    if (!profile || !contactToRemove) return;
    setIsRemoving(true);
    try {
      await removeContact(profile.uid, contactToRemove.uid);
      setContactToRemove(null);
    } finally {
      setIsRemoving(false);
    }
  };

  const handleAcceptRequest = async (requestId: string) => {
    if (!profile) return;
    setActionBusy(requestId);
    try {
      await acceptContactRequestAndAdd(requestId, profile.uid);
    } finally {
      setActionBusy(null);
    }
  };

  const handleRejectRequest = async (requestId: string) => {
    if (!profile) return;
    setActionBusy(requestId);
    try {
      await respondToContactRequest(requestId, profile.uid, false);
    } finally {
      setActionBusy(null);
    }
  };

  const handleUnblock = async (blockedUid: string) => {
    if (!profile) return;
    setActionBusy(blockedUid);
    try {
      await unblockUser(profile.uid, blockedUid);
    } finally {
      setActionBusy(null);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--background)]">
      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-[var(--glass-border-soft)] p-4 md:px-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-2xl font-semibold text-[var(--ink)]">
              Contacts
            </h2>
            <p className="text-xs text-[var(--ink-muted)]">
              {contacts.length} saved contact{contacts.length === 1 ? "" : "s"}
            </p>
          </div>
          <Button onClick={onAddUser} className="pressable gap-1.5" size="sm">
            <UserPlus className="h-4 w-4" />
            Add Contact
          </Button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-soft)]" />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search by name, username, or CHEMM Number"
            className="pl-9 text-sm"
          />
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-1 rounded-xl bg-[var(--glass)] p-1 ring-1 ring-[var(--glass-border-soft)]">
          <TabBtn
            active={tab === "all"}
            label={`All (${contacts.length})`}
            onClick={() => setTab("all")}
          />
          <TabBtn
            active={tab === "requests"}
            label={`Requests ${requests.length > 0 ? `(${requests.length})` : ""}`}
            badge={requests.length > 0 ? requests.length : undefined}
            onClick={() => setTab("requests")}
          />
          <TabBtn
            active={tab === "blocked"}
            label={`Blocked (${blockedUids.length})`}
            onClick={() => setTab("blocked")}
          />
        </div>
      </div>

      {/* Main List */}
      <div className="subtle-scroll flex-1 space-y-2 overflow-y-auto p-4 md:px-6">
        {tab === "all" && (
          <>
            {filteredContacts.length === 0 ? (
              <div className="py-16 text-center">
                <UserRound className="mx-auto h-10 w-10 text-[var(--ink-soft)]" />
                <p className="mt-3 font-display text-base font-medium text-[var(--ink)]">
                  {filter ? "No contacts match that filter" : "No contacts yet"}
                </p>
                <p className="mt-1 text-xs text-[var(--ink-muted)]">
                  Connect using a permanent CHEMM Number or username.
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-4"
                  onClick={onAddUser}
                >
                  <UserPlus className="h-4 w-4" />
                  Add your first contact
                </Button>
              </div>
            ) : (
              filteredContacts.map((contact) => (
                <div
                  key={contact.uid}
                  className="glass-surface flex items-center justify-between gap-3 rounded-2xl p-3 transition hover:border-[var(--glass-border)]"
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    onClick={() => onOpenProfile(contact.username)}
                  >
                    <Avatar
                      name={contact.displayName}
                      src={contact.avatarUrl}
                      size="md"
                    />
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-[var(--ink)]">
                        {contact.displayName}
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-[var(--ink-muted)]">
                        <span>@{contact.username}</span>
                        {contact.chemmNumber && (
                          <span className="rounded bg-[var(--accent-soft)] px-1.5 py-0.2 text-[10px] font-mono text-[var(--accent)]">
                            {contact.chemmNumber}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>

                  <div className="flex items-center gap-1.5">
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Send message"
                      onClick={() => void handleStartChat(contact)}
                      className="pressable text-[var(--accent)]"
                    >
                      <MessageSquare className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Start voice call"
                      disabled={!supported}
                      onClick={() => void handleStartCall(contact)}
                      className="pressable text-[var(--accent)]"
                    >
                      <Phone className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Remove contact"
                      onClick={() => setContactToRemove(contact)}
                      className="pressable text-[var(--danger)] hover:bg-[var(--danger)]/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </>
        )}

        {tab === "requests" && (
          <>
            {requests.length === 0 ? (
              <div className="py-16 text-center">
                <UserCheck className="mx-auto h-10 w-10 text-[var(--ink-soft)]" />
                <p className="mt-3 font-display text-base font-medium text-[var(--ink)]">
                  No pending contact requests
                </p>
                <p className="mt-1 text-xs text-[var(--ink-muted)]">
                  When someone adds you by CHEMM Number, requests appear here.
                </p>
              </div>
            ) : (
              requests.map((req) => (
                <div
                  key={req.id}
                  className="glass-surface flex items-center justify-between gap-3 rounded-2xl p-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar
                      name={req.fromDisplayName}
                      src={req.fromAvatarUrl}
                      size="md"
                    />
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-[var(--ink)]">
                        {req.fromDisplayName}
                      </p>
                      <p className="truncate text-xs text-[var(--ink-muted)]">
                        @{req.fromUsername} · {req.fromChemmNumber}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      size="sm"
                      disabled={actionBusy === req.id}
                      onClick={() => void handleAcceptRequest(req.id)}
                      className="pressable"
                    >
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={actionBusy === req.id}
                      onClick={() => void handleRejectRequest(req.id)}
                      className="pressable text-[var(--ink-muted)]"
                    >
                      Decline
                    </Button>
                  </div>
                </div>
              ))
            )}
          </>
        )}

        {tab === "blocked" && (
          <>
            {blockedUids.length === 0 ? (
              <div className="py-16 text-center">
                <UserX className="mx-auto h-10 w-10 text-[var(--ink-soft)]" />
                <p className="mt-3 font-display text-base font-medium text-[var(--ink)]">
                  No blocked users
                </p>
                <p className="mt-1 text-xs text-[var(--ink-muted)]">
                  Users you block cannot message or call you.
                </p>
              </div>
            ) : (
              blockedUids.map((uid) => {
                const blockedUser = blockedProfiles[uid];
                return (
                  <div
                    key={uid}
                    className="glass-surface flex items-center justify-between gap-3 rounded-2xl p-3"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar
                        name={blockedUser?.displayName ?? "User"}
                        src={blockedUser?.avatarUrl}
                        size="md"
                      />
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-[var(--ink)]">
                          {blockedUser?.displayName ?? "Blocked user"}
                        </p>
                        <p className="truncate text-xs text-[var(--ink-muted)]">
                          {blockedUser?.username ? `@${blockedUser.username}` : uid}
                        </p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={actionBusy === uid}
                      onClick={() => void handleUnblock(uid)}
                      className="pressable"
                    >
                      Unblock
                    </Button>
                  </div>
                );
              })
            )}
          </>
        )}
      </div>

      {/* Confirmation Modal for Contact Removal */}
      {contactToRemove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <GlassPanel className="fade-up w-full max-w-sm p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold text-[var(--ink)]">
                Remove contact?
              </h3>
              <button
                type="button"
                onClick={() => setContactToRemove(null)}
                className="text-[var(--ink-soft)] hover:text-[var(--ink)]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-2 text-sm text-[var(--ink-muted)]">
              Are you sure you want to remove{" "}
              <strong className="text-[var(--ink)]">
                {contactToRemove.displayName}
              </strong>{" "}
              from your contacts? Your conversation history will remain safe.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => setContactToRemove(null)}
                disabled={isRemoving}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => void handleConfirmRemove()}
                disabled={isRemoving}
                className="bg-[var(--danger)] text-white hover:bg-[var(--danger)]/90"
              >
                {isRemoving ? "Removing…" : "Remove"}
              </Button>
            </div>
          </GlassPanel>
        </div>
      )}
    </div>
  );
}

function TabBtn({
  active,
  label,
  badge,
  onClick,
}: {
  active: boolean;
  label: string;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`pressable relative flex-1 rounded-lg py-1.5 text-xs font-medium transition ${
        active
          ? "bg-[var(--glass-strong)] text-[var(--accent)] shadow-sm"
          : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
      }`}
    >
      {label}
      {badge !== undefined && (
        <span className="ml-1 rounded-full bg-sky-500 px-1.5 py-0.2 text-[9px] font-bold text-white">
          {badge}
        </span>
      )}
    </button>
  );
}
