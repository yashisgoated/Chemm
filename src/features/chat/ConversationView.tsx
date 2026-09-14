"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { Pencil, Phone, Pin, Reply, SendHorizonal, X } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";
import { MessageBubble } from "./MessageBubble";
import { MessageForwardDialog } from "./MessageForwardDialog";
import { useAuth } from "@/features/auth/AuthProvider";
import { useCall } from "@/features/calls/CallProvider";
import {
  deleteMessage,
  editMessage,
  isTypingActive,
  loadOlderMessages,
  markConversationRead,
  markMessagesDelivered,
  reactToMessage,
  sendMessage,
  setTyping,
  subscribeToConversation,
  subscribeToMessages,
  togglePinMessage,
} from "@/services/firebase/chat";
import { getUserById } from "@/services/firebase/users";
import {
  formatLastSeen,
  getOtherParticipant,
  timestampToDate,
} from "@/lib/utils";
import type { ChatMessage, Conversation, UserProfile } from "@/types";
import { MESSAGE_PAGE_SIZE } from "@/lib/constants";
import type { DocumentSnapshot } from "firebase/firestore";
import { doc, getDoc } from "firebase/firestore";
import { getDb } from "@/services/firebase/client";

interface ConversationViewProps {
  conversationId: string | null;
  onOpenProfile?: (username: string) => void;
}

export function ConversationView({
  conversationId,
  onOpenProfile,
}: ConversationViewProps) {
  if (!conversationId) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-8 text-center">
        <div className="glass-panel max-w-md px-8 py-10">
          <p className="font-display text-2xl font-semibold text-[var(--ink)]">
            Select a conversation
          </p>
          <p className="mt-2 text-sm text-[var(--ink-muted)]">
            Add someone with their CHEMM Number, or open a recent chat.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ActiveConversation
      key={conversationId}
      conversationId={conversationId}
      onOpenProfile={onOpenProfile}
    />
  );
}

function ActiveConversation({
  conversationId,
  onOpenProfile,
}: {
  conversationId: string;
  onOpenProfile?: (username: string) => void;
}) {
  const { profile } = useAuth();
  const { startCall, supported } = useCall();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [peer, setPeer] = useState<UserProfile | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);
  const [forwardingText, setForwardingText] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [oldestSnap, setOldestSnap] = useState<DocumentSnapshot | null>(null);
  const [optimistic, setOptimistic] = useState<ChatMessage[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const typingTimer = useRef<number | null>(null);

  const otherUid = useMemo(() => {
    if (!conversation || !profile) return null;
    return getOtherParticipant(conversation.participants, profile.uid);
  }, [conversation, profile]);

  useEffect(() => {
    const unsub = subscribeToConversation(conversationId, setConversation);
    return unsub;
  }, [conversationId]);

  useEffect(() => {
    if (!profile?.uid || !otherUid) return;
    const unsub = subscribeToMessages(
      conversationId,
      profile.uid,
      otherUid,
      (live) => {
        setMessages(live);
        if (live.length > 0) {
          const oldestId = live[0]!.id;
          void getDoc(
            doc(getDb(), "conversations", conversationId, "messages", oldestId),
          ).then((snap) => setOldestSnap(snap));
          setHasMore(live.length >= MESSAGE_PAGE_SIZE);
        } else {
          setHasMore(false);
        }
      },
    );
    return unsub;
  }, [conversationId, profile?.uid, otherUid]);

  useEffect(() => {
    if (!otherUid) return;
    let cancelled = false;
    void getUserById(otherUid).then((u) => {
      if (!cancelled) setPeer(u);
    });
    return () => {
      cancelled = true;
    };
  }, [otherUid]);

  useEffect(() => {
    if (!profile || !otherUid) return;
    void markConversationRead(conversationId, profile.uid, otherUid);

    const incoming = messages.filter(
      (m) =>
        m.senderId === otherUid &&
        (m.status === "sent" || m.status === "delivered"),
    );
    if (incoming.length) {
      void markMessagesDelivered(
        conversationId,
        incoming.map((m) => m.id),
      );
    }
  }, [conversationId, messages, otherUid, profile]);

  const mergedMessages = useMemo(() => {
    const byClient = new Set(
      messages.map((m) => m.clientId).filter(Boolean) as string[],
    );
    const pending = optimistic.filter(
      (o) => o.clientId && !byClient.has(o.clientId),
    );
    return [...messages, ...pending];
  }, [messages, optimistic]);

  const messagesById = useMemo(() => {
    const map = new Map<string, ChatMessage>();
    mergedMessages.forEach((m) => map.set(m.id, m));
    return map;
  }, [mergedMessages]);

  const pinnedMessages = useMemo(() => {
    const pinnedSet = new Set(conversation?.pinnedMessageIds ?? []);
    return mergedMessages.filter((m) => pinnedSet.has(m.id));
  }, [conversation?.pinnedMessageIds, mergedMessages]);

  useEffect(() => {
    if (!stickToBottomRef.current || !listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [mergedMessages, conversationId]);

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distance < 80;
    if (el.scrollTop < 60 && hasMore && !loadingOlder) {
      void loadMore();
    }
  };

  const loadMore = async () => {
    if (!oldestSnap || loadingOlder || !profile || !otherUid) return;
    setLoadingOlder(true);
    const el = listRef.current;
    const prevHeight = el?.scrollHeight ?? 0;
    try {
      const { messages: older, lastDoc } = await loadOlderMessages(
        conversationId,
        oldestSnap,
        profile.uid,
        otherUid,
      );
      if (older.length === 0) {
        setHasMore(false);
      } else {
        setMessages((prev) => {
          const ids = new Set(prev.map((m) => m.id));
          return [...older.filter((m) => !ids.has(m.id)), ...prev];
        });
        if (lastDoc) setOldestSnap(lastDoc);
        setHasMore(older.length >= MESSAGE_PAGE_SIZE);
        requestAnimationFrame(() => {
          if (!el) return;
          el.scrollTop = el.scrollHeight - prevHeight;
        });
      }
    } finally {
      setLoadingOlder(false);
    }
  };

  const emitTyping = useCallback(
    (value: boolean) => {
      if (!profile) return;
      void setTyping(conversationId, profile.uid, value);
    },
    [conversationId, profile],
  );

  const onDraftChange = (value: string) => {
    setDraft(value);
    emitTyping(true);
    if (typingTimer.current) window.clearTimeout(typingTimer.current);
    typingTimer.current = window.setTimeout(() => emitTyping(false), 1200);
  };

  const submit = async () => {
    if (!profile || !otherUid) return;
    const text = draft;
    if (!text.trim() || sending) return;

    if (editingMessage) {
      setSending(true);
      try {
        await editMessage({
          conversationId,
          messageId: editingMessage.id,
          senderId: profile.uid,
          otherUid,
          text: text.trim(),
        });
        setEditingMessage(null);
        setDraft("");
      } finally {
        setSending(false);
      }
      return;
    }

    const clientId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `c_${Date.now()}`;

    const replyId = replyingTo?.id ?? null;
    const optimisticMsg: ChatMessage = {
      id: clientId,
      clientId,
      senderId: profile.uid,
      text: text.trim(),
      createdAt: null,
      status: "sending",
      replyTo: replyId,
    };

    setOptimistic((prev) => [...prev, optimisticMsg]);
    setDraft("");
    setReplyingTo(null);
    emitTyping(false);
    stickToBottomRef.current = true;
    setSending(true);

    try {
      await sendMessage({
        conversationId,
        senderId: profile.uid,
        otherUid,
        text,
        clientId,
        replyTo: replyId,
      });
      setOptimistic((prev) => prev.filter((m) => m.clientId !== clientId));
    } catch {
      setOptimistic((prev) =>
        prev.map((m) =>
          m.clientId === clientId ? { ...m, status: "failed" } : m,
        ),
      );
    } finally {
      setSending(false);
    }
  };

  const retry = async (clientId: string) => {
    const failed = optimistic.find((m) => m.clientId === clientId);
    if (!failed || !profile || !otherUid) return;
    setOptimistic((prev) =>
      prev.map((m) =>
        m.clientId === clientId ? { ...m, status: "sending" } : m,
      ),
    );
    try {
      await sendMessage({
        conversationId,
        senderId: profile.uid,
        otherUid,
        text: failed.text,
        clientId,
      });
      setOptimistic((prev) => prev.filter((m) => m.clientId !== clientId));
    } catch {
      setOptimistic((prev) =>
        prev.map((m) =>
          m.clientId === clientId ? { ...m, status: "failed" } : m,
        ),
      );
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  };

  const peerTyping =
    conversation && otherUid
      ? isTypingActive(conversation.typing, otherUid)
      : false;

  const displayName =
    peer?.displayName ??
    (otherUid ? conversation?.participantInfo?.[otherUid]?.displayName : null) ??
    "User";
  const username =
    peer?.username ??
    (otherUid ? conversation?.participantInfo?.[otherUid]?.username : null) ??
    "";
  const avatar =
    peer?.avatarUrl ??
    (otherUid ? conversation?.participantInfo?.[otherUid]?.avatarUrl : null);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-[var(--glass-border-soft)] px-4 py-3 md:px-6">
        <button
          type="button"
          className="flex min-w-0 items-center gap-3 text-left"
          onClick={() => username && onOpenProfile?.(username)}
        >
          <Avatar
            name={displayName}
            src={avatar}
            online={peer?.isOnline}
            size="md"
          />
          <div className="min-w-0">
            <p className="truncate font-display text-base font-semibold text-[var(--ink)]">
              {displayName}
            </p>
            <p className="truncate text-xs text-[var(--ink-muted)]">
              {peerTyping
                ? "Typing…"
                : formatLastSeen(
                    !!peer?.isOnline,
                    timestampToDate(peer?.lastSeen),
                  )}
            </p>
          </div>
        </button>
        <Button
          variant="secondary"
          size="icon"
          aria-label="Start voice call"
          disabled={!peer || !supported}
          onClick={() => peer && void startCall(peer)}
        >
          <Phone className="h-5 w-5 text-[var(--accent)]" />
        </Button>
      </header>

      <div className="flex items-center justify-center gap-1.5 border-b border-[var(--glass-border-soft)] bg-[var(--accent-soft)]/40 px-3 py-1.5 text-[11px] font-medium text-[var(--accent)]">
        <span aria-hidden>🔒</span>
        End-to-end encrypted
        {peer?.chemmNumber && (
          <span className="text-[var(--ink-soft)]">· {peer.chemmNumber}</span>
        )}
      </div>

      {pinnedMessages.length > 0 && (
        <div className="flex items-center justify-between border-b border-[var(--glass-border-soft)] bg-[var(--glass)] px-4 py-1.5 text-xs text-[var(--ink)]">
          <div className="flex min-w-0 items-center gap-2">
            <Pin className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
            <span className="font-semibold text-[11px] text-[var(--accent)]">Pinned:</span>
            <span className="truncate text-[11px] text-[var(--ink-muted)]">
              {pinnedMessages[pinnedMessages.length - 1]!.text}
            </span>
          </div>
          <span className="shrink-0 text-[10px] text-[var(--ink-soft)]">
            {pinnedMessages.length} pinned
          </span>
        </div>
      )}

      <div
        ref={listRef}
        onScroll={onScroll}
        className="subtle-scroll flex-1 space-y-2 overflow-y-auto px-3 py-4 md:px-6"
      >
        {loadingOlder && (
          <p className="py-2 text-center text-xs text-[var(--ink-soft)]">Loading…</p>
        )}
        {mergedMessages.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-[var(--ink-muted)]">
              Messages are end-to-end encrypted. Only you and {displayName} can read them.
            </p>
          </div>
        )}
        {mergedMessages.map((message, index) => {
          const prev = mergedMessages[index - 1];
          const showAvatar = !prev || prev.senderId !== message.senderId;
          const day = timestampToDate(message.createdAt);
          const prevDay = timestampToDate(prev?.createdAt);
          const showDate =
            !prevDay ||
            !day ||
            day.toDateString() !== prevDay.toDateString();
          return (
            <div key={message.id}>
              {showDate && day && (
                <p className="my-3 text-center text-[11px] font-medium uppercase tracking-wider text-[var(--ink-soft)]">
                  {day.toLocaleDateString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
                </p>
              )}
              <MessageBubble
                message={message}
                isMine={message.senderId === profile?.uid}
                showAvatar={showAvatar}
                peerName={displayName}
                peerAvatar={avatar}
                currentUid={profile?.uid}
                isPinned={Boolean(conversation?.pinnedMessageIds?.includes(message.id))}
                replyMessage={message.replyTo ? messagesById.get(message.replyTo) : null}
                onRetry={retry}
                onReact={(messageId, emoji) => {
                  if (!profile) return;
                  void reactToMessage(
                    conversationId,
                    messageId,
                    profile.uid,
                    emoji,
                  );
                }}
                onReply={(msg) => {
                  setReplyingTo(msg);
                  setEditingMessage(null);
                }}
                onEdit={(msg) => {
                  setEditingMessage(msg);
                  setReplyingTo(null);
                  setDraft(msg.text);
                }}
                onPin={(messageId) => {
                  void togglePinMessage(conversationId, messageId);
                }}
                onDelete={(messageId, forEveryone) => {
                  if (!profile) return;
                  void deleteMessage({
                    conversationId,
                    messageId,
                    uid: profile.uid,
                    forEveryone,
                  });
                }}
                onForward={(msg) => setForwardingText(msg.text)}
              />
            </div>
          );
        })}
        {peerTyping && (
          <div className="flex items-center gap-2 pl-10 text-xs text-[var(--ink-muted)]">
            <span className="inline-flex gap-1 rounded-full bg-[var(--bubble-theirs)] px-2.5 py-1.5 ring-1 ring-[var(--glass-border-soft)]">
              <span className="typing-dot h-1.5 w-1.5 rounded-full bg-[var(--ink-muted)]" />
              <span className="typing-dot h-1.5 w-1.5 rounded-full bg-[var(--ink-muted)]" />
              <span className="typing-dot h-1.5 w-1.5 rounded-full bg-[var(--ink-muted)]" />
            </span>
            {displayName} is typing…
          </div>
        )}
      </div>

      <form
        className="border-t border-white/40 p-3 md:p-4"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          void submit();
        }}
      >
        {replyingTo && (
          <div className="mb-2 flex items-center justify-between rounded-xl bg-[var(--glass-strong)] px-3 py-1.5 text-xs ring-1 ring-[var(--accent)]/30">
            <div className="flex min-w-0 items-center gap-2">
              <Reply className="h-3.5 w-3.5 text-[var(--accent)]" />
              <span className="font-semibold text-[var(--accent)]">
                Replying to {replyingTo.senderId === profile?.uid ? "yourself" : displayName}:
              </span>
              <span className="truncate text-[var(--ink-muted)]">{replyingTo.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setReplyingTo(null)}
              className="p-1 text-[var(--ink-soft)] hover:text-[var(--ink)]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        {editingMessage && (
          <div className="mb-2 flex items-center justify-between rounded-xl bg-[var(--glass-strong)] px-3 py-1.5 text-xs ring-1 ring-[var(--accent)]/30">
            <div className="flex min-w-0 items-center gap-2">
              <Pencil className="h-3.5 w-3.5 text-[var(--accent)]" />
              <span className="font-semibold text-[var(--accent)]">Editing message</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setEditingMessage(null);
                setDraft("");
              }}
              className="p-1 text-[var(--ink-soft)] hover:text-[var(--ink)]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        <div className="glass-surface flex items-end gap-2 p-2">
          <Textarea
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={editingMessage ? "Edit message" : "Message"}
            rows={1}
            className="max-h-32 min-h-[44px] flex-1 border-0 bg-transparent shadow-none backdrop-blur-0 focus:ring-0"
          />
          <Button
            type="submit"
            size="icon"
            disabled={!draft.trim() || sending}
            aria-label={editingMessage ? "Save edit" : "Send message"}
          >
            <SendHorizonal className="h-5 w-5" />
          </Button>
        </div>
      </form>

      {forwardingText && (
        <MessageForwardDialog
          messageText={forwardingText}
          onClose={() => setForwardingText(null)}
        />
      )}
    </div>
  );
}
