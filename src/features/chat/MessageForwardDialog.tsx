"use client";

import { useEffect, useState } from "react";
import { Forward, Search, Users, X } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { GlassPanel } from "@/components/ui/Glass";
import { useAuth } from "@/features/auth/AuthProvider";
import {
  subscribeToConversations,
  sendMessage,
} from "@/services/firebase/chat";
import { subscribeMyGroups } from "@/services/firebase/groups";
import { sendGroupMessage } from "@/services/firebase/groupChat";
import { getOtherParticipant, randomId } from "@/lib/utils";
import type { Conversation, GroupMeta } from "@/types";

interface MessageForwardDialogProps {
  messageText: string;
  onClose: () => void;
  onForwarded?: (destinationId: string) => void;
}

export function MessageForwardDialog({
  messageText,
  onClose,
  onForwarded,
}: MessageForwardDialogProps) {
  const { profile } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [groups, setGroups] = useState<GroupMeta[]>([]);
  const [query, setQuery] = useState("");
  const [forwarding, setForwarding] = useState(false);
  const [sentDestination, setSentDestination] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    const unsubChats = subscribeToConversations(profile.uid, setConversations);
    const unsubGroups = subscribeMyGroups(profile.uid, setGroups);

    return () => {
      unsubChats();
      unsubGroups();
    };
  }, [profile]);

  const handleForwardToConversation = async (convId: string, peerUid: string) => {
    if (!profile || forwarding) return;
    try {
      setForwarding(true);
      await sendMessage({
        conversationId: convId,
        senderId: profile.uid,
        otherUid: peerUid,
        text: messageText,
        clientId: randomId(),
      });
      setSentDestination(convId);
      onForwarded?.(convId);
      setTimeout(onClose, 600);
    } catch (err) {
      console.error("Failed to forward:", err);
      alert("Could not forward message. Please try again.");
      setForwarding(false);
    }
  };

  const handleForwardToGroup = async (groupId: string) => {
    if (!profile || forwarding) return;
    try {
      setForwarding(true);
      await sendGroupMessage({
        groupId,
        sender: profile,
        text: messageText,
        clientId: randomId(),
      });
      setSentDestination(groupId);
      onForwarded?.(groupId);
      setTimeout(onClose, 600);
    } catch (err) {
      console.error("Failed to forward to group:", err);
      alert("Could not forward message to group. Please try again.");
      setForwarding(false);
    }
  };

  // Filter lists based on query
  const q = query.toLowerCase().trim();

  const filteredConversations = conversations.filter((c) => {
    if (!profile) return false;
    const other = getOtherParticipant(c.participants, profile.uid);
    const info = c.participantInfo?.[other];
    return (
      info?.displayName?.toLowerCase().includes(q) ||
      info?.username?.toLowerCase().includes(q)
    );
  });

  const filteredGroups = groups.filter((g) =>
    g.name.toLowerCase().includes(q),
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
      <GlassPanel className="w-full max-w-md overflow-hidden rounded-3xl p-6 shadow-2xl">
        <div className="flex items-center justify-between pb-3 border-b border-[var(--glass-border-soft)]">
          <div className="flex items-center gap-2">
            <Forward className="h-5 w-5 text-[var(--accent)]" />
            <h3 className="font-display text-lg font-semibold text-[var(--ink)]">
              Forward Message
            </h3>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close dialog"
            className="h-8 w-8"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Message preview snippet */}
        <div className="my-3 rounded-xl bg-[var(--glass-strong)] p-3 text-xs italic text-[var(--ink-muted)] border-l-2 border-[var(--accent)] line-clamp-3">
          "{messageText}"
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-soft)]" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats or groups…"
            className="pl-9 text-xs"
            autoFocus
          />
        </div>

        {/* List */}
        <div className="subtle-scroll max-h-60 overflow-y-auto space-y-1 pr-1">
          {/* Groups Section */}
          {filteredGroups.length > 0 && (
            <div>
              <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-soft)]">
                Groups
              </p>
              {filteredGroups.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  disabled={forwarding}
                  onClick={() => void handleForwardToGroup(g.id)}
                  className="flex w-full items-center justify-between gap-3 rounded-xl p-2 text-left hover:bg-[var(--glass)] transition"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar name={g.name} src={g.avatarUrl} size="sm" />
                    <p className="truncate text-xs font-medium text-[var(--ink)]">
                      {g.name}
                    </p>
                  </div>
                  {sentDestination === g.id ? (
                    <span className="text-xs text-emerald-500 font-semibold">Sent!</span>
                  ) : (
                    <span className="text-xs text-[var(--accent)]">Send</span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Direct Chats Section */}
          {filteredConversations.length > 0 && (
            <div>
              <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-soft)]">
                Direct Chats
              </p>
              {filteredConversations.map((c) => {
                if (!profile) return null;
                const otherUid = getOtherParticipant(c.participants, profile.uid);
                const info = c.participantInfo?.[otherUid];
                return (
                  <button
                    key={c.id}
                    type="button"
                    disabled={forwarding}
                    onClick={() => void handleForwardToConversation(c.id, otherUid)}
                    className="flex w-full items-center justify-between gap-3 rounded-xl p-2 text-left hover:bg-[var(--glass)] transition"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar
                        name={info?.displayName ?? "User"}
                        src={info?.avatarUrl}
                        size="sm"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-[var(--ink)]">
                          {info?.displayName ?? "User"}
                        </p>
                        <p className="truncate text-[10px] text-[var(--ink-muted)]">
                          @{info?.username ?? "user"}
                        </p>
                      </div>
                    </div>
                    {sentDestination === c.id ? (
                      <span className="text-xs text-emerald-500 font-semibold">Sent!</span>
                    ) : (
                      <span className="text-xs text-[var(--accent)]">Send</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {filteredGroups.length === 0 && filteredConversations.length === 0 && (
            <p className="py-6 text-center text-xs text-[var(--ink-muted)]">
              No chats or groups match your search.
            </p>
          )}
        </div>
      </GlassPanel>
    </div>
  );
}
