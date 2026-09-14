import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from "firebase/firestore";
import { getDb } from "./client";
import type { GroupMessage, MessageStatus, UserProfile } from "@/types";
import { MAX_MESSAGE_LENGTH } from "@/lib/utils";
import { messageTextSchema } from "@/lib/validation";
import { AppError, ErrorCode } from "@/lib/errors";

const GROUP_MESSAGE_PAGE_SIZE = 50;

/* ------------------------------------------------------------------ */
/*  Send                                                              */
/* ------------------------------------------------------------------ */

export async function sendGroupMessage(input: {
  groupId: string;
  sender: UserProfile;
  text: string;
  clientId: string;
  replyTo?: string | null;
}): Promise<string> {
  const parsed = messageTextSchema.safeParse(input.text);
  if (!parsed.success) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, parsed.error.issues[0]?.message);
  }
  const text = parsed.data.slice(0, MAX_MESSAGE_LENGTH);

  // Deduplicate by clientId
  const existing = await getDocs(
    query(
      collection(getDb(), "groups", input.groupId, "messages"),
      where("clientMessageId", "==", input.clientId),
      limit(1),
    ),
  );
  if (!existing.empty) return existing.docs[0]!.id;

  const msgDoc = await addDoc(
    collection(getDb(), "groups", input.groupId, "messages"),
    {
      groupId: input.groupId,
      senderId: input.sender.uid,
      senderDisplayName: input.sender.displayName,
      senderAvatarUrl: input.sender.avatarUrl ?? null,
      text,
      type: "text",
      clientMessageId: input.clientId,
      createdAt: serverTimestamp(),
      status: "sent" satisfies MessageStatus,
      replyTo: input.replyTo ?? null,
    },
  );

  // Update group lastMessage / updatedAt
  await updateDoc(doc(getDb(), "groups", input.groupId), {
    updatedAt: serverTimestamp(),
  });

  return msgDoc.id;
}

/* ------------------------------------------------------------------ */
/*  System messages (join/leave/rename)                               */
/* ------------------------------------------------------------------ */

export async function sendSystemMessage(
  groupId: string,
  text: string,
): Promise<void> {
  await addDoc(collection(getDb(), "groups", groupId, "messages"), {
    groupId,
    senderId: "system",
    senderDisplayName: "System",
    senderAvatarUrl: null,
    text,
    type: "system",
    clientMessageId: `sys_${Date.now()}`,
    createdAt: serverTimestamp(),
    status: "sent" satisfies MessageStatus,
  });
  await updateDoc(doc(getDb(), "groups", groupId), {
    updatedAt: serverTimestamp(),
  });
}

/* ------------------------------------------------------------------ */
/*  Subscribe                                                         */
/* ------------------------------------------------------------------ */

export function subscribeToGroupMessages(
  groupId: string,
  callback: (messages: GroupMessage[]) => void,
  pageSize = GROUP_MESSAGE_PAGE_SIZE,
): Unsubscribe {
  const q = query(
    collection(getDb(), "groups", groupId, "messages"),
    orderBy("createdAt", "desc"),
    limit(pageSize),
  );
  return onSnapshot(
    q,
    (snap) => {
      const msgs = snap.docs
        .map((d) => ({ ...(d.data() as GroupMessage), id: d.id }))
        .reverse();
      callback(msgs);
    },
    () => callback([]),
  );
}

/* ------------------------------------------------------------------ */
/*  Reactions                                                         */
/* ------------------------------------------------------------------ */

export async function reactToGroupMessage(
  groupId: string,
  messageId: string,
  uid: string,
  emoji: string,
): Promise<void> {
  const ref = doc(getDb(), "groups", groupId, "messages", messageId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data() as GroupMessage;
  const reactions = { ...(data.reactions ?? {}) };
  const set = new Set(reactions[emoji] ?? []);
  if (set.has(uid)) set.delete(uid);
  else set.add(uid);
  if (set.size === 0) delete reactions[emoji];
  else reactions[emoji] = [...set];
  await updateDoc(ref, { reactions });
}

/* ------------------------------------------------------------------ */
/*  Delete                                                            */
/* ------------------------------------------------------------------ */

export async function deleteGroupMessage(input: {
  groupId: string;
  messageId: string;
  uid: string;
  forEveryone?: boolean;
}): Promise<void> {
  const ref = doc(getDb(), "groups", input.groupId, "messages", input.messageId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data() as GroupMessage;

  if (input.forEveryone) {
    if (data.senderId !== input.uid) {
      throw new AppError(ErrorCode.FORBIDDEN, "Only the sender can delete for everyone");
    }
    await updateDoc(ref, {
      deletedForEveryone: true,
      text: "Message deleted",
    });
    return;
  }
  // Personal hide not implemented for group messages — only "for everyone" for now
  await updateDoc(ref, { deletedForEveryone: true, text: "Message deleted" });
}

/* ------------------------------------------------------------------ */
/*  Typing                                                            */
/* ------------------------------------------------------------------ */

export async function setGroupTyping(
  groupId: string,
  uid: string,
  isTyping: boolean,
): Promise<void> {
  await updateDoc(doc(getDb(), "groups", groupId), {
    [`typing.${uid}`]: isTyping ? Date.now() : 0,
  });
}
