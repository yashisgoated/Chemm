"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import {
  Check,
  Copy,
  Forward,
  Info,
  Reply,
  SendHorizonal,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";
import { useAuth } from "@/features/auth/AuthProvider";
import {
  sendGroupMessage,
  subscribeToGroupMessages,
  reactToGroupMessage,
  deleteGroupMessage,
  setGroupTyping,
} from "@/services/firebase/groupChat";
import {
  getGroupMeta,
  subscribeGroupMembers,
} from "@/services/firebase/groups";
import { MessageForwardDialog } from "./MessageForwardDialog";
import { formatMessageTime, randomId, timestampToDate, cn } from "@/lib/utils";
import type { GroupMember, GroupMessage, GroupMeta } from "@/types";

const TAPBACKS = ["❤️", "👍", "😂", "🔥", "🎉", "👏"];

interface GroupConversationViewProps {
  groupId: string;
  onOpenGroupSettings?: () => void;
}

export function GroupConversationView({
  groupId,
  onOpenGroupSettings,
}: GroupConversationViewProps) {
  const { profile } = useAuth();
  const [group, setGroup] = useState<GroupMeta | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [replyingTo, setReplyingTo] = useState<GroupMessage | null>(null);
  const [forwardingText, setForwardingText] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const typingTimer = useRef<number | null>(null);

  // Subscribe to group data and messages
  useEffect(() => {
    let active = true;
    getGroupMeta(groupId).then((meta) => {
      if (active) setGroup(meta);
    });

    const unsubMembers = subscribeGroupMembers(groupId, (m) => {
      if (active) setMembers(m);
    });

    const unsubMessages = subscribeToGroupMessages(groupId, (msgs) => {
      if (!active) return;
      setMessages(msgs);
      if (stickToBottomRef.current && listRef.current) {
        requestAnimationFrame(() => {
          if (listRef.current) {
            listRef.current.scrollTop = listRef.current.scrollHeight;
          }
        });
      }
    });

    return () => {
      active = false;
      unsubMembers();
      unsubMessages();
      if (profile) void setGroupTyping(groupId, profile.uid, false);
    };
  }, [groupId, profile]);

  const handleScroll = () => {
    if (!listRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = listRef.current;
    stickToBottomRef.current = scrollHeight - (scrollTop + clientHeight) < 80;
  };

  const handleDraftChange = (text: string) => {
    setDraft(text);
    if (!profile) return;
    void setGroupTyping(groupId, profile.uid, true);

    if (typingTimer.current) window.clearTimeout(typingTimer.current);
    typingTimer.current = window.setTimeout(() => {
      void setGroupTyping(groupId, profile.uid, false);
    }, 2000);
  };

  const handleSend = async (e?: FormEvent) => {
    e?.preventDefault();
    const clean = draft.trim();
    if (!clean || !profile || sending) return;

    setSending(true);
    try {
      if (typingTimer.current) window.clearTimeout(typingTimer.current);
      void setGroupTyping(groupId, profile.uid, false);

      await sendGroupMessage({
        groupId,
        sender: profile,
        text: clean,
        clientId: randomId(),
        replyTo: replyingTo?.id,
      });

      setDraft("");
      setReplyingTo(null);
      stickToBottomRef.current = true;
      if (listRef.current) {
        listRef.current.scrollTop = listRef.current.scrollHeight;
      }
    } catch (err) {
      console.error("Failed to send group message:", err);
      alert("Failed to send message. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const replyMap = new Map(messages.map((m) => [m.id, m]));

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--glass-border-soft)] bg-[var(--sidebar)] px-6 py-3 backdrop-blur-xl">
        <button
          type="button"
          onClick={onOpenGroupSettings}
          className="flex items-center gap-3 text-left hover:opacity-80 transition"
        >
          <Avatar
            name={group?.name ?? "Group"}
            src={group?.avatarUrl}
            size="md"
          />
          <div>
            <h2 className="font-display text-base font-semibold text-[var(--ink)]">
              {group?.name ?? "Group"}
            </h2>
            <p className="text-xs text-[var(--ink-muted)]">
              {members.length} {members.length === 1 ? "member" : "members"}
            </p>
          </div>
        </button>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={onOpenGroupSettings}
            aria-label="Group info"
          >
            <Info className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Message List */}
      <div
        ref={listRef}
        onScroll={handleScroll}
        className="subtle-scroll flex-1 overflow-y-auto px-4 py-4 space-y-3"
      >
        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center text-center">
            <p className="text-sm text-[var(--ink-muted)]">
              No messages in this group yet. Say hello!
            </p>
          </div>
        )}

        {messages.map((msg) => {
          if (msg.type === "system") {
            return (
              <div key={msg.id} className="flex justify-center my-2">
                <span className="rounded-full bg-[var(--glass-strong)] px-3 py-1 text-[11px] font-medium text-[var(--ink-muted)] ring-1 ring-[var(--glass-border-soft)] shadow-sm">
                  {msg.text}
                </span>
              </div>
            );
          }

          const isMine = msg.senderId === profile?.uid;
          const repliedMsg = msg.replyTo ? replyMap.get(msg.replyTo) : null;

          return (
            <GroupMessageBubble
              key={msg.id}
              message={msg}
              isMine={isMine}
              repliedMessage={repliedMsg}
              currentUid={profile?.uid}
              onReact={(emoji) =>
                profile && reactToGroupMessage(groupId, msg.id, profile.uid, emoji)
              }
              onReply={() => setReplyingTo(msg)}
              onForward={() => setForwardingText(msg.text)}
              onDelete={() =>
                profile &&
                deleteGroupMessage({
                  groupId,
                  messageId: msg.id,
                  uid: profile.uid,
                  forEveryone: true,
                })
              }
            />
          );
        })}
      </div>

      {/* Replying banner */}
      {replyingTo && (
        <div className="flex items-center justify-between border-t border-[var(--glass-border-soft)] bg-[var(--glass-strong)] px-4 py-2 text-xs">
          <div className="flex items-center gap-2 overflow-hidden">
            <Reply className="h-3.5 w-3.5 text-[var(--accent)] shrink-0" />
            <span className="font-semibold text-[var(--ink)] shrink-0">
              {replyingTo.senderDisplayName}:
            </span>
            <span className="truncate text-[var(--ink-muted)]">
              {replyingTo.text}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setReplyingTo(null)}
            className="text-[var(--ink-soft)] hover:text-[var(--ink)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Composer */}
      <form
        onSubmit={handleSend}
        className="flex items-end gap-2 border-t border-[var(--glass-border-soft)] bg-[var(--sidebar)] p-4 backdrop-blur-xl"
      >
        <Textarea
          value={draft}
          onChange={(e) => handleDraftChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Message ${group?.name ?? "group"}…`}
          rows={1}
          className="max-h-32 min-h-[44px] resize-none py-2.5 text-sm"
        />
        <Button
          type="submit"
          size="icon"
          disabled={sending || !draft.trim()}
          className="h-11 w-11 shrink-0 rounded-2xl"
          aria-label="Send message"
        >
          <SendHorizonal className="h-5 w-5" />
        </Button>
      </form>

      {/* Forward Dialog */}
      {forwardingText && (
        <MessageForwardDialog
          messageText={forwardingText}
          onClose={() => setForwardingText(null)}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Group Message Bubble                                              */
/* ------------------------------------------------------------------ */

function GroupMessageBubble({
  message,
  isMine,
  repliedMessage,
  currentUid,
  onReact,
  onReply,
  onForward,
  onDelete,
}: {
  message: GroupMessage;
  isMine: boolean;
  repliedMessage?: GroupMessage | null;
  currentUid?: string;
  onReact: (emoji: string) => void;
  onReply: () => void;
  onForward: () => void;
  onDelete: () => void;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const time = formatMessageTime(timestampToDate(message.createdAt));
  const isDeleted = !!message.deletedForEveryone;

  const reactions = Object.entries(message.reactions ?? {}).filter(
    ([, uids]) => uids.length > 0,
  );

  // Close context menu on outside click or Escape
  useEffect(() => {
    if (!showMenu) return;
    const onClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowMenu(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onEscape as unknown as EventListener);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEscape as unknown as EventListener);
    };
  }, [showMenu]);

  return (
    <div
      ref={wrapperRef}
      className={cn(
        "group relative flex w-full gap-2",
        isMine ? "justify-end" : "justify-start",
      )}
    >
      {!isMine && (
        <Avatar
          name={message.senderDisplayName}
          src={message.senderAvatarUrl}
          size="sm"
          className="mt-1 shrink-0"
        />
      )}

      <div className={cn("max-w-[75%] flex flex-col", isMine ? "items-end" : "items-start")}>
        {!isMine && (
          <p className="mb-0.5 ml-2 text-[11px] font-semibold text-[var(--accent)]">
            {message.senderDisplayName}
          </p>
        )}

        <div className="relative">
          {/* Action trigger menu on hover */}
          <div
            className={cn(
              "absolute -top-7 z-10 hidden items-center gap-1 rounded-full bg-[var(--sidebar)] px-1.5 py-0.5 shadow-md ring-1 ring-[var(--glass-border-soft)] group-hover:flex",
              isMine ? "right-0" : "left-0",
              showMenu && "flex",
            )}
          >
            {/* Quick reactions */}
            {TAPBACKS.slice(0, 4).map((emoji) => (
              <button
                key={emoji}
                type="button"
                className="rounded-full px-1 py-0.5 text-xs hover:scale-125 transition"
                onClick={() => onReact(emoji)}
              >
                {emoji}
              </button>
            ))}

            <span className="h-3 w-px bg-[var(--glass-border-soft)]" />

            <button
              type="button"
              className="rounded-full p-1 text-[var(--ink-muted)] hover:text-[var(--ink)]"
              title="Reply"
              onClick={onReply}
            >
              <Reply className="h-3.5 w-3.5" />
            </button>

            <button
              type="button"
              className="rounded-full p-1 text-[var(--ink-muted)] hover:text-[var(--ink)]"
              title="Forward"
              onClick={onForward}
            >
              <Forward className="h-3.5 w-3.5" />
            </button>

            <button
              type="button"
              className="rounded-full p-1 text-[var(--ink-muted)] hover:text-[var(--ink)]"
              title="Copy"
              onClick={() => void navigator.clipboard.writeText(message.text)}
            >
              <Copy className="h-3.5 w-3.5" />
            </button>

            {isMine && !isDeleted && (
              <button
                type="button"
                className="rounded-full p-1 text-rose-500 hover:bg-rose-500/10"
                title="Delete for everyone"
                onClick={onDelete}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Bubble body */}
          <div
            className={cn(
              "rounded-2xl px-4 py-2.5 shadow-sm text-sm break-words",
              isMine
                ? "bg-[var(--accent)] text-white rounded-br-sm"
                : "bg-[var(--glass-strong)] text-[var(--ink)] ring-1 ring-[var(--glass-border-soft)] rounded-bl-sm",
            )}
          >
            {/* Replied snippet if any */}
            {repliedMessage && (
              <div
                className={cn(
                  "mb-1.5 rounded-lg p-1.5 text-xs border-l-2 opacity-90",
                  isMine
                    ? "bg-black/10 border-white text-white/90"
                    : "bg-black/5 border-[var(--accent)] text-[var(--ink-muted)]",
                )}
              >
                <p className="font-semibold text-[10px]">
                  {repliedMessage.senderDisplayName}
                </p>
                <p className="truncate line-clamp-1">{repliedMessage.text}</p>
              </div>
            )}

            <p className="leading-relaxed">
              {isDeleted ? (
                <span className="italic opacity-70">Message deleted</span>
              ) : (
                message.text
              )}
            </p>

            <div
              className={cn(
                "mt-1 flex items-center justify-end gap-1 text-[10px]",
                isMine ? "text-white/70" : "text-[var(--ink-soft)]",
              )}
            >
              <span>{time}</span>
              {isMine && <Check className="h-3 w-3 inline" />}
            </div>
          </div>
        </div>

        {/* Reactions underneath */}
        {reactions.length > 0 && !isDeleted && (
          <div
            className={cn(
              "mt-1 flex flex-wrap gap-1",
              isMine ? "justify-end" : "justify-start",
            )}
          >
            {reactions.map(([emoji, uids]) => (
              <button
                key={emoji}
                type="button"
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs ring-1 transition",
                  currentUid && uids.includes(currentUid)
                    ? "bg-[var(--accent-soft)] ring-[var(--accent)]/40 text-[var(--accent)]"
                    : "glass-surface ring-[var(--glass-border-soft)] text-[var(--ink)]",
                )}
                onClick={() => onReact(emoji)}
              >
                {emoji} {uids.length > 1 ? uids.length : ""}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
