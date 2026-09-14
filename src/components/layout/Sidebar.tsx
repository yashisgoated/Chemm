"use client";

import { useEffect, useMemo, useState } from "react";
import {
  LogOut,
  MessageSquarePlus,
  Moon,
  Phone,
  Search,
  Settings,
  Sun,
  UserPlus,
  Users,
} from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/features/auth/AuthProvider";
import { useTheme } from "@/features/theme/ThemeProvider";
import { ContactRequestsInbox } from "@/features/contacts/ContactRequestsInbox";
import { GroupInvitationsInbox } from "@/features/contacts/GroupInvitationsInbox";
import {
  addContact,
  removeContact,
  subscribeToContacts,
} from "@/services/firebase/contacts";
import { searchUsersByUsername } from "@/services/firebase/users";
import {
  ensureConversation,
  subscribeToConversations,
} from "@/services/firebase/chat";
import { subscribeToCallHistory } from "@/services/firebase/calls";
import { subscribeMyGroups } from "@/services/firebase/groups";
import {
  cn,
  debounce,
  formatCallDuration,
  formatRelativeTime,
  getOtherParticipant,
  timestampToDate,
} from "@/lib/utils";
import { APP_NAME, SEARCH_DEBOUNCE_MS } from "@/lib/constants";
import type {
  CallHistoryItem,
  Contact,
  Conversation,
  GroupMeta,
  UserProfile,
} from "@/types";

type Tab = "chats" | "contacts" | "calls";

interface SidebarProps {
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onOpenSettings: () => void;
  onAddUser: () => void;
  onCreateGroup?: () => void;
  onOpenProfile?: (username: string) => void;
  onOpenContacts?: () => void;
  mobileOpen?: boolean;
}

export function Sidebar({
  activeConversationId,
  onSelectConversation,
  onOpenSettings,
  onAddUser,
  onCreateGroup,
  onOpenProfile,
  onOpenContacts,
}: SidebarProps) {
  const { profile, logout } = useAuth();
  const { resolved, toggle } = useTheme();
  const [tab, setTab] = useState<Tab>("chats");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserProfile[]>([]);
  const [searching, setSearching] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [groups, setGroups] = useState<GroupMeta[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [calls, setCalls] = useState<CallHistoryItem[]>([]);
  const [contactBusy, setContactBusy] = useState<string | null>(null);
  const [contactFilter, setContactFilter] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!profile) return;
    const unsubs = [
      subscribeToConversations(profile.uid, setConversations),
      subscribeToContacts(profile.uid, setContacts),
      subscribeToCallHistory(profile.uid, setCalls),
      subscribeMyGroups(profile.uid, setGroups),
    ];
    return () => unsubs.forEach((u) => u());
  }, [profile]);

  const runSearch = useMemo(
    () =>
      debounce(async (term: string) => {
        if (!term.trim()) {
          setResults([]);
          setSearching(false);
          return;
        }
        setSearching(true);
        try {
          const users = await searchUsersByUsername(term);
          setResults(users.filter((u) => u.uid !== profile?.uid));
        } finally {
          setSearching(false);
        }
      }, SEARCH_DEBOUNCE_MS),
    [profile?.uid],
  );

  useEffect(() => {
    runSearch(query);
  }, [query, runSearch]);

  const openChatWith = async (user: UserProfile) => {
    if (!profile) return;
    const id = await ensureConversation(profile, user);
    onSelectConversation(id);
    setQuery("");
    setResults([]);
    setTab("chats");
  };

  const contactIds = useMemo(
    () => new Set(contacts.map((c) => c.uid)),
    [contacts],
  );

  const filteredContacts = useMemo(() => {
    const q = contactFilter.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter(
      (c) =>
        c.displayName.toLowerCase().includes(q) ||
        c.username.toLowerCase().includes(q) ||
        (c.chemmNumber ?? "").toLowerCase().includes(q),
    );
  }, [contacts, contactFilter]);

  const openChatWithContact = async (c: Contact) => {
    if (!profile) return;
    const peer: UserProfile = {
      uid: c.uid,
      email: "",
      chemmNumber: c.chemmNumber ?? "",
      username: c.username,
      displayName: c.displayName,
      avatarUrl: c.avatarUrl,
      bio: "",
      createdAt: null,
      lastSeen: null,
      isOnline: false,
      searchUsername: c.username,
      encryptionFingerprint: null,
    };
    const id = await ensureConversation(profile, peer);
    onSelectConversation(id);
    setTab("chats");
  };

  const handleRemoveContact = async (contactUid: string) => {
    if (!profile) return;
    setContactBusy(contactUid);
    try {
      await removeContact(profile.uid, contactUid);
    } finally {
      setContactBusy(null);
    }
  };

  return (
    <aside className="flex h-full min-h-0 w-full flex-col border-r border-[var(--glass-border-soft)] bg-[var(--sidebar)] backdrop-blur-2xl">
      <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-4">
        <div>
          <div className="flex items-center gap-2">
            <p className="font-display text-xl font-semibold tracking-tight">
              {APP_NAME}
            </p>
          </div>
          <p className="text-[11px] text-[var(--ink-soft)]">Voice · Messages</p>
        </div>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggle}
            aria-label="Toggle theme"
            className="pressable"
          >
            {mounted ? (
              resolved === "dark" ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )
            ) : (
              <span className="h-4 w-4 inline-block" />
            )}
          </Button>
          <Button variant="ghost" size="icon" onClick={onOpenSettings} aria-label="Settings" className="pressable">
            <Settings className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => void logout()}
            aria-label="Log out"
            className="pressable"
          >
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </div>

      <div className="px-4 pb-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-soft)]" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search username"
            className="pl-9"
            aria-label="Search users"
          />
        </div>
        <Button
          variant="secondary"
          className="pressable mt-2 w-full"
          onClick={onAddUser}
        >
          <UserPlus className="h-4 w-4" />
          Add by CHEMM Number
        </Button>
        {onCreateGroup && (
          <Button
            variant="ghost"
            className="pressable mt-1 w-full"
            onClick={onCreateGroup}
          >
            <Users className="h-4 w-4" />
            New group
          </Button>
        )}
        {profile?.chemmNumber && (
          <p className="mt-2 text-center text-[10px] tracking-wide text-[var(--ink-soft)]">
            You · {profile.chemmNumber}
          </p>
        )}
      </div>

      {query.trim() ? (
        <div className="subtle-scroll flex-1 space-y-1 overflow-y-auto px-2 pb-4">
          <p className="px-2 py-1 text-xs font-medium uppercase tracking-wide text-slate-400">
            {searching ? "Searching…" : "People"}
          </p>
          {results.map((user) => (
            <div
              key={user.uid}
              className="flex items-center gap-2 rounded-2xl px-2 py-2 hover:bg-white/45"
            >
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
                onClick={() => void openChatWith(user)}
              >
                <Avatar
                  name={user.displayName}
                  src={user.avatarUrl}
                  online={user.isOnline}
                  size="md"
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">
                    {user.displayName}
                  </p>
                  <p className="truncate text-xs text-slate-500">@{user.username}</p>
                </div>
              </button>
              {profile && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    void (contactIds.has(user.uid)
                      ? removeContact(profile.uid, user.uid)
                      : addContact(profile.uid, user.uid))
                  }
                >
                  {contactIds.has(user.uid) ? "Remove" : "Add"}
                </Button>
              )}
            </div>
          ))}
          {!searching && results.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-slate-450 text-slate-500">
              No users found
            </p>
          )}
        </div>
      ) : (
        <>
          <ContactRequestsInbox />
          <GroupInvitationsInbox />
          <div className="mx-4 mb-2 grid grid-cols-3 gap-1 rounded-2xl bg-[var(--glass)] p-1 ring-1 ring-[var(--glass-border)]">
            {(
              [
                ["chats", MessageSquarePlus, "Chats"],
                ["contacts", Users, "Contacts"],
                ["calls", Phone, "Calls"],
              ] as const
            ).map(([key, Icon, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={cn(
                  "pressable flex items-center justify-center gap-1 rounded-xl py-2 text-xs font-medium transition",
                  tab === key
                    ? "bg-[var(--glass-strong)] text-[var(--accent)] shadow-sm"
                    : "text-[var(--ink-muted)] hover:text-[var(--ink)]",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>

          <div className="subtle-scroll flex-1 overflow-y-auto px-2 pb-4">
            {tab === "chats" && groups.length > 0 && (
              <div className="mb-2">
                <p className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-soft)]">
                  Groups ({groups.length})
                </p>
                {groups.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => onSelectConversation(g.id)}
                    className={cn(
                      "pressable mb-1 flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left transition",
                      activeConversationId === g.id
                        ? "bg-[var(--glass-strong)] shadow-sm ring-1 ring-[var(--accent)]/25"
                        : "hover:bg-[var(--glass)]",
                    )}
                  >
                    <Avatar
                      name={g.name}
                      src={g.avatarUrl}
                      size="md"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold text-[var(--ink)]">
                          {g.name}
                        </p>
                        {g.updatedAt && (
                          <span className="shrink-0 text-[10px] text-[var(--ink-soft)]">
                            {formatRelativeTime(timestampToDate(g.updatedAt))}
                          </span>
                        )}
                      </div>
                      <p className="truncate text-xs text-[var(--ink-muted)]">
                        {g.description || `${g.memberCount ?? g.memberUids.length} members`}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {tab === "chats" && conversations.length > 0 && groups.length > 0 && (
              <p className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-soft)]">
                Direct Messages
              </p>
            )}

            {tab === "chats" &&
              conversations.map((c) => {
                if (!profile) return null;
                const other = getOtherParticipant(c.participants, profile.uid);
                const info = c.participantInfo?.[other];
                const unread = c.unreadCount?.[profile.uid] ?? 0;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => onSelectConversation(c.id)}
                    className={cn(
                      "pressable mb-1 flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left transition",
                      activeConversationId === c.id
                        ? "bg-[var(--glass-strong)] shadow-sm ring-1 ring-[var(--accent)]/25"
                        : "hover:bg-[var(--glass)]",
                    )}
                  >
                    <Avatar
                      name={info?.displayName ?? "User"}
                      src={info?.avatarUrl}
                      size="md"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold text-slate-800">
                          {info?.displayName ?? "User"}
                        </p>
                        <span className="shrink-0 text-[10px] text-slate-400">
                          {formatRelativeTime(timestampToDate(c.updatedAt))}
                        </span>
                      </div>
                      <p className="truncate text-xs text-slate-500">
                        {c.lastMessage
                          ? c.lastMessage.type === "call"
                            ? "Voice call"
                            : "🔒 Encrypted message"
                          : "No messages yet"}
                      </p>
                    </div>
                    {unread > 0 && (
                      <span className="rounded-full bg-sky-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                        {unread > 99 ? "99+" : unread}
                      </span>
                    )}
                  </button>
                );
              })}

            {tab === "chats" && conversations.length === 0 && groups.length === 0 && (
              <Empty label="No conversations yet. Search a username or create a group to start." />
            )}

            {tab === "contacts" && (
              <div className="mb-2 px-2">
                <Input
                  value={contactFilter}
                  onChange={(e) => setContactFilter(e.target.value)}
                  placeholder="Filter contacts"
                  aria-label="Filter contacts"
                  className="text-sm"
                />
                <div className="flex items-center justify-between px-1 pt-1.5">
                  <p className="text-[10px] text-[var(--ink-soft)]">
                    {contacts.length} contact{contacts.length === 1 ? "" : "s"}
                  </p>
                  {onOpenContacts && (
                    <button
                      type="button"
                      onClick={onOpenContacts}
                      className="text-[11px] font-medium text-[var(--accent)] hover:underline"
                    >
                      Manage all →
                    </button>
                  )}
                </div>
              </div>
            )}

            {tab === "contacts" &&
              filteredContacts.map((c) => (
                <div
                  key={c.uid}
                  className="mb-1 flex items-center gap-1 rounded-2xl px-2 py-2 hover:bg-[var(--glass)]"
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    onClick={() => void openChatWithContact(c)}
                  >
                    <Avatar name={c.displayName} src={c.avatarUrl} size="md" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[var(--ink)]">
                        {c.displayName}
                      </p>
                      <p className="truncate text-xs text-[var(--ink-muted)]">
                        @{c.username}
                        {c.chemmNumber ? ` · ${c.chemmNumber}` : ""}
                      </p>
                    </div>
                  </button>
                  <div className="flex shrink-0 flex-col gap-0.5">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-[10px]"
                      onClick={() => {
                        onOpenProfile?.(c.username);
                      }}
                    >
                      View
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-[10px] text-[var(--danger)]"
                      disabled={contactBusy === c.uid}
                      onClick={() => void handleRemoveContact(c.uid)}
                    >
                      {contactBusy === c.uid ? "…" : "Remove"}
                    </Button>
                  </div>
                </div>
              ))}

            {tab === "contacts" && contacts.length === 0 && (
              <Empty label="No contacts yet. Use Add by CHEMM Number or search a username." />
            )}
            {tab === "contacts" &&
              contacts.length > 0 &&
              filteredContacts.length === 0 && (
                <Empty label="No contacts match that filter." />
              )}

            {tab === "calls" &&
              calls.map((call) => (
                <div
                  key={call.id}
                  className="mb-1 flex items-center gap-3 rounded-2xl px-2 py-2.5"
                >
                  <Avatar
                    name={call.peerDisplayName}
                    src={call.peerAvatarUrl}
                    size="md"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-800">
                      {call.peerDisplayName}
                    </p>
                    <p
                      className={cn(
                        "truncate text-xs",
                        call.status === "missed" || call.status === "declined"
                          ? "text-rose-500"
                          : "text-slate-500",
                      )}
                    >
                      {call.direction === "incoming" ? "Incoming" : "Outgoing"} ·{" "}
                      {call.status}
                      {call.durationSeconds > 0
                        ? ` · ${formatCallDuration(call.durationSeconds)}`
                        : ""}
                    </p>
                  </div>
                  <span className="text-[10px] text-slate-400">
                    {formatRelativeTime(timestampToDate(call.createdAt))}
                  </span>
                </div>
              ))}

            {tab === "calls" && calls.length === 0 && (
              <Empty label="Call history will appear here." />
            )}
          </div>
        </>
      )}

      {profile && (
        <div className="mt-auto border-t border-white/40 p-3">
          <button
            type="button"
            onClick={onOpenSettings}
            className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 hover:bg-white/45"
          >
            <Avatar
              name={profile.displayName}
              src={profile.avatarUrl}
              online
              size="md"
            />
            <div className="min-w-0 text-left">
              <p className="truncate text-sm font-semibold text-slate-800">
                {profile.displayName}
              </p>
              <p className="truncate text-xs text-slate-500">@{profile.username}</p>
            </div>
          </button>
        </div>
      )}
    </aside>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <p className="px-3 py-10 text-center text-sm leading-relaxed text-slate-500">
      {label}
    </p>
  );
}
