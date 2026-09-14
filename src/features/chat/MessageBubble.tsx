"use client";

import { memo, useState, useEffect, useRef, useCallback } from "react";
import {
  Check,
  CheckCheck,
  Clock3,
  Copy,
  Forward,
  Pencil,
  Pin,
  Reply,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { formatMessageTime, timestampToDate, cn } from "@/lib/utils";
import type { ChatMessage } from "@/types";

const TAPBACKS = ["❤️", "👍", "😂", "!!", "❓"];

interface MessageBubbleProps {
  message: ChatMessage;
  isMine: boolean;
  showAvatar?: boolean;
  peerName?: string;
  peerAvatar?: string | null;
  currentUid?: string;
  isPinned?: boolean;
  replyMessage?: ChatMessage | null;
  onRetry?: (clientId: string) => void;
  onReact?: (messageId: string, emoji: string) => void;
  onDelete?: (messageId: string, forEveryone: boolean) => void;
  onReply?: (message: ChatMessage) => void;
  onEdit?: (message: ChatMessage) => void;
  onPin?: (messageId: string) => void;
  onForward?: (message: ChatMessage) => void;
}

export const MessageBubble = memo(function MessageBubble({
  message,
  isMine,
  showAvatar,
  peerName,
  peerAvatar,
  currentUid,
  isPinned,
  replyMessage,
  onRetry,
  onReact,
  onDelete,
  onReply,
  onEdit,
  onPin,
  onForward,
}: MessageBubbleProps) {
  const [menu, setMenu] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const time = formatMessageTime(timestampToDate(message.createdAt));
  const reactions = Object.entries(message.reactions ?? {}).filter(
    ([, uids]) => uids.length > 0,
  );
  const deleted = !!message.deletedForEveryone;

  /* ---- Click-away & Escape handler to dismiss the menu ---- */
  const closeMenu = useCallback(() => setMenu(false), []);

  useEffect(() => {
    if (!menu) return;

    const onClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        closeMenu();
      }
    };
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMenu();
    };

    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEscape);
    };
  }, [menu, closeMenu]);

  return (
    <div
      ref={wrapperRef}
      className={cn(
        "message-enter group relative flex w-full gap-2",
        isMine ? "justify-end" : "justify-start",
      )}
    >
      {!isMine && showAvatar && (
        <Avatar name={peerName ?? "User"} src={peerAvatar} size="sm" />
      )}
      {!isMine && !showAvatar && <div className="w-8" />}

      <div className="relative max-w-[78%]">
        {menu && !deleted && (
          <div
            className={cn(
              "absolute -top-11 z-10 flex items-center gap-1 rounded-full px-2 py-1.5 shadow-lg",
              "glass-surface border border-[var(--glass-border)]",
              isMine ? "right-0" : "left-0",
            )}
          >
            {onReact &&
              TAPBACKS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className="pressable rounded-full px-1.5 text-base transition hover:scale-125"
                  onClick={() => {
                    onReact(message.id, emoji);
                    setMenu(false);
                  }}
                >
                  {emoji}
                </button>
              ))}
            {onReply && (
              <button
                type="button"
                className="pressable rounded-full p-1 text-[var(--ink-muted)] hover:text-[var(--accent)]"
                title="Reply"
                onClick={() => {
                  onReply(message);
                  setMenu(false);
                }}
              >
                <Reply className="h-3.5 w-3.5" />
              </button>
            )}
            {onEdit && isMine && !message.decryptError && (
              <button
                type="button"
                className="pressable rounded-full p-1 text-[var(--ink-muted)] hover:text-[var(--accent)]"
                title="Edit"
                onClick={() => {
                  onEdit(message);
                  setMenu(false);
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
            {onPin && (
              <button
                type="button"
                className={cn(
                  "pressable rounded-full p-1",
                  isPinned ? "text-[var(--accent)]" : "text-[var(--ink-muted)] hover:text-[var(--accent)]",
                )}
                title={isPinned ? "Unpin" : "Pin"}
                onClick={() => {
                  onPin(message.id);
                  setMenu(false);
                }}
              >
                <Pin className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              type="button"
              className="pressable rounded-full p-1 text-[var(--ink-muted)]"
              title="Copy"
              onClick={() => {
                void navigator.clipboard.writeText(message.text);
                setMenu(false);
              }}
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
            {onForward && !message.decryptError && !deleted && (
              <button
                type="button"
                className="pressable rounded-full p-1 text-[var(--ink-muted)] hover:text-[var(--accent)]"
                title="Forward"
                onClick={() => {
                  onForward(message);
                  setMenu(false);
                }}
              >
                <Forward className="h-3.5 w-3.5" />
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                className="pressable rounded-full p-1 text-[var(--danger)]"
                title="Delete for me"
                onClick={() => {
                  onDelete(message.id, false);
                  setMenu(false);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
            {onDelete && isMine && (
              <button
                type="button"
                className="pressable rounded-full px-1.5 text-[10px] font-medium text-[var(--danger)]"
                title="Delete for everyone"
                onClick={() => {
                  onDelete(message.id, true);
                  setMenu(false);
                }}
              >
                All
              </button>
            )}
          </div>
        )}

        <button
          type="button"
          className={cn(
            "w-full rounded-[22px] px-3.5 py-2.5 text-left text-[15px] leading-relaxed shadow-sm transition",
            isMine
              ? "rounded-br-md text-white"
              : "rounded-bl-md text-[var(--ink)] ring-1 ring-[var(--glass-border)]",
            message.status === "failed" && "opacity-80",
            deleted && "italic opacity-70",
          )}
          style={{
            background: isMine ? "var(--bubble-mine)" : "var(--bubble-theirs)",
          }}
          onDoubleClick={() => !deleted && setMenu((v) => !v)}
          onContextMenu={(e) => {
            e.preventDefault();
            if (!deleted) setMenu(true);
          }}
        >
          {replyMessage && !deleted && (
            <div
              className={cn(
                "mb-1.5 rounded-lg px-2.5 py-1 text-xs border-l-2",
                isMine
                  ? "border-white/80 bg-white/15 text-white/90"
                  : "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--ink)]",
              )}
            >
              <p className="font-semibold text-[10px] opacity-80">
                {replyMessage.senderId === currentUid ? "You" : (peerName ?? "User")}
              </p>
              <p className="truncate">{replyMessage.text}</p>
            </div>
          )}
          <p className="whitespace-pre-wrap break-words">
            {isPinned && !deleted && (
              <Pin className="inline-block mr-1 h-3 w-3 text-[var(--accent)]" />
            )}
            {deleted ? "Message deleted" : linkify(message.text)}
          </p>
          <div
            className={cn(
              "mt-1 flex items-center justify-end gap-1 text-[11px]",
              isMine ? "text-white/75" : "text-[var(--ink-soft)]",
            )}
          >
            {isPinned && <span className="text-[10px] opacity-80">📌</span>}
            {message.editedAt && !deleted && <span>edited</span>}
            <span>{time}</span>
            {isMine && (
              <>
                {message.status === "sending" && <Clock3 className="h-3 w-3" />}
                {message.status === "sent" && <Check className="h-3.5 w-3.5" />}
                {message.status === "delivered" && (
                  <CheckCheck className="h-3.5 w-3.5" />
                )}
                {message.status === "read" && (
                  <CheckCheck className="h-3.5 w-3.5 text-sky-100" />
                )}
                {message.status === "failed" && onRetry && message.clientId && (
                  <span
                    role="button"
                    tabIndex={0}
                    className="inline-flex items-center gap-1 text-rose-100 hover:underline"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRetry(message.clientId!);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") onRetry(message.clientId!);
                    }}
                  >
                    <RotateCcw className="h-3 w-3" />
                    Retry
                  </span>
                )}
              </>
            )}
          </div>
        </button>

        {reactions.length > 0 && !deleted && (
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
                  "pressable rounded-full px-2 py-0.5 text-xs ring-1",
                  currentUid && uids.includes(currentUid)
                    ? "bg-[var(--accent-soft)] ring-[var(--accent)]/40"
                    : "glass-surface ring-[var(--glass-border-soft)]",
                )}
                onClick={() => onReact?.(message.id, emoji)}
              >
                {emoji} {uids.length > 1 ? uids.length : ""}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

function linkify(text: string) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return parts.map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noreferrer"
        className="underline decoration-white/40 underline-offset-2"
        onClick={(e) => e.stopPropagation()}
      >
        {part}
      </a>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}
