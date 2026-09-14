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
  setDoc,
  startAfter,
  updateDoc,
  where,
  writeBatch,
  type DocumentSnapshot,
  type Timestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { getDb } from "./client";
import type {
  ChatMessage,
  Conversation,
  EncryptedMessageDoc,
  MessageStatus,
  UserProfile,
} from "@/types";
import { conversationIdFor, MAX_MESSAGE_LENGTH } from "@/lib/utils";
import { MESSAGE_PAGE_SIZE, TYPING_TTL_MS } from "@/lib/constants";
import { messageTextSchema } from "@/lib/validation";
import { AppError, ErrorCode, toAppError } from "@/lib/errors";
import {
  decryptMessageFromPeer,
  encryptMessageForPeer,
  ensureDeviceKeys,
} from "@/services/encryption/e2ee";
import { fetchPublicKeys } from "@/services/encryption/keys";
import { isBlockedEitherWay } from "@/services/firebase/moderation";

function participantInfoFrom(profile: UserProfile) {
  return {
    displayName: profile.displayName,
    username: profile.username,
    avatarUrl: profile.avatarUrl,
    chemmNumber: profile.chemmNumber ?? "",
  };
}

export async function ensureConversation(
  currentUser: UserProfile,
  otherUser: UserProfile,
): Promise<string> {
  if (await isBlockedEitherWay(currentUser.uid, otherUser.uid)) {
    throw new AppError(ErrorCode.BLOCKED);
  }

  const id = conversationIdFor(currentUser.uid, otherUser.uid);
  const ref = doc(getDb(), "conversations", id);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      id,
      participants: [currentUser.uid, otherUser.uid].sort(),
      participantInfo: {
        [currentUser.uid]: participantInfoFrom(currentUser),
        [otherUser.uid]: participantInfoFrom(otherUser),
      },
      lastMessage: null,
      unreadCount: {
        [currentUser.uid]: 0,
        [otherUser.uid]: 0,
      },
      typing: {},
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      e2ee: true,
    });
  }
  return id;
}

export function subscribeToConversations(
  uid: string,
  callback: (conversations: Conversation[]) => void,
): Unsubscribe {
  const q = query(
    collection(getDb(), "conversations"),
    where("participants", "array-contains", uid),
    orderBy("updatedAt", "desc"),
    limit(50),
  );
  return onSnapshot(
    q,
    (snap) => {
      callback(
        snap.docs.map((d) => ({ ...(d.data() as Conversation), id: d.id })),
      );
    },
    () => callback([]),
  );
}

export function subscribeToConversation(
  conversationId: string,
  callback: (conversation: Conversation | null) => void,
): Unsubscribe {
  return onSnapshot(
    doc(getDb(), "conversations", conversationId),
    (snap) => {
      callback(
        snap.exists()
          ? { ...(snap.data() as Conversation), id: snap.id }
          : null,
      );
    },
    () => callback(null),
  );
}

async function decryptDocs(
  docs: EncryptedMessageDoc[],
  myUid: string,
  peerPk: string,
): Promise<ChatMessage[]> {
  const { bundle } = await ensureDeviceKeys(myUid);
  const cacheKey = `${myUid}:${peerPk.slice(0, 16)}`;
  const out: ChatMessage[] = [];
  for (const d of docs) {
    if (d.deletedFor?.[myUid]) continue;
    if (d.deletedForEveryone) {
      out.push({
        id: d.id,
        clientId: d.clientMessageId,
        senderId: d.senderId,
        text: "Message deleted",
        createdAt: d.createdAt,
        status: d.status,
        reactions: d.reactions,
        encrypted: true,
        deletedForEveryone: true,
        editedAt: d.editedAt ?? null,
        replyTo: d.replyTo ?? null,
      });
      continue;
    }
    try {
      const text = await decryptMessageFromPeer(
        { v: d.v, ciphertext: d.ciphertext, nonce: d.nonce },
        bundle.identitySk,
        peerPk,
        cacheKey,
      );
      out.push({
        id: d.id,
        clientId: d.clientMessageId,
        senderId: d.senderId,
        text,
        createdAt: d.createdAt,
        status: d.status,
        reactions: d.reactions,
        encrypted: true,
        editedAt: d.editedAt ?? null,
        replyTo: d.replyTo ?? null,
      });
    } catch {
      out.push({
        id: d.id,
        clientId: d.clientMessageId,
        senderId: d.senderId,
        text: "🔒 Unable to decrypt",
        createdAt: d.createdAt,
        status: d.status,
        reactions: d.reactions,
        encrypted: true,
        decryptError: true,
      });
    }
  }
  return out;
}

export function subscribeToMessages(
  conversationId: string,
  myUid: string,
  peerUid: string,
  callback: (messages: ChatMessage[]) => void,
  pageSize = MESSAGE_PAGE_SIZE,
): Unsubscribe {
  let cancelled = false;
  let unsubSnap: Unsubscribe | null = null;

  void fetchPublicKeys(peerUid).then((peerKeys) => {
    if (cancelled || !peerKeys?.identityPk) {
      callback([]);
      return;
    }
    const q = query(
      collection(getDb(), "conversations", conversationId, "messages"),
      orderBy("createdAt", "desc"),
      limit(pageSize),
    );
    unsubSnap = onSnapshot(
      q,
      (snap) => {
        void (async () => {
          const docs = snap.docs
            .map((d) => ({ ...(d.data() as EncryptedMessageDoc), id: d.id }))
            .reverse();
          callback(await decryptDocs(docs, myUid, peerKeys.identityPk));
        })();
      },
      () => callback([]),
    );
  });

  return () => {
    cancelled = true;
    unsubSnap?.();
  };
}

export async function loadOlderMessages(
  conversationId: string,
  oldestDoc: DocumentSnapshot,
  myUid: string,
  peerUid: string,
  pageSize = MESSAGE_PAGE_SIZE,
): Promise<{ messages: ChatMessage[]; lastDoc: DocumentSnapshot | null }> {
  const peerKeys = await fetchPublicKeys(peerUid);
  if (!peerKeys?.identityPk) return { messages: [], lastDoc: null };

  const q = query(
    collection(getDb(), "conversations", conversationId, "messages"),
    orderBy("createdAt", "desc"),
    startAfter(oldestDoc),
    limit(pageSize),
  );
  const snap = await getDocs(q);
  const docs = snap.docs
    .map((d) => ({ ...(d.data() as EncryptedMessageDoc), id: d.id }))
    .reverse();
  const messages = await decryptDocs(docs, myUid, peerKeys.identityPk);
  const lastDoc = snap.docs.length ? snap.docs[snap.docs.length - 1]! : null;
  return { messages, lastDoc };
}

export async function sendMessage(input: {
  conversationId: string;
  senderId: string;
  otherUid: string;
  text: string;
  clientId: string;
  replyTo?: string | null;
}): Promise<string> {
  const parsed = messageTextSchema.safeParse(input.text);
  if (!parsed.success) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      parsed.error.issues[0]?.message,
    );
  }
  if (await isBlockedEitherWay(input.senderId, input.otherUid)) {
    throw new AppError(ErrorCode.BLOCKED);
  }

  const text = parsed.data.slice(0, MAX_MESSAGE_LENGTH);

  try {
    const existing = await getDocs(
      query(
        collection(getDb(), "conversations", input.conversationId, "messages"),
        where("clientMessageId", "==", input.clientId),
        limit(1),
      ),
    );
    if (!existing.empty) return existing.docs[0]!.id;

    const peerKeys = await fetchPublicKeys(input.otherUid);
    if (!peerKeys?.identityPk) {
      throw new AppError(
        ErrorCode.ENCRYPTION_ERROR,
        "Recipient has no public keys",
      );
    }
    const me = await ensureDeviceKeys(input.senderId);
    const payload = await encryptMessageForPeer(
      text,
      me.bundle.identitySk,
      peerKeys.identityPk,
      `${input.senderId}:${peerKeys.identityPk.slice(0, 16)}`,
    );

    const messageDoc = await addDoc(
      collection(getDb(), "conversations", input.conversationId, "messages"),
      {
        conversationId: input.conversationId,
        senderId: input.senderId,
        clientMessageId: input.clientId,
        ciphertext: payload.ciphertext,
        nonce: payload.nonce,
        v: payload.v,
        createdAt: serverTimestamp(),
        status: "sent" satisfies MessageStatus,
        replyTo: input.replyTo ?? null,
      },
    );

    const convRef = doc(getDb(), "conversations", input.conversationId);
    const convSnap = await getDoc(convRef);
    const unread =
      (convSnap.data()?.unreadCount as Record<string, number>) ?? {};

    await updateDoc(convRef, {
      lastMessage: {
        type: "text",
        senderId: input.senderId,
        createdAt: serverTimestamp(),
        previewCipher: payload.ciphertext.slice(0, 24),
      },
      updatedAt: serverTimestamp(),
      [`unreadCount.${input.otherUid}`]: (unread[input.otherUid] ?? 0) + 1,
      [`unreadCount.${input.senderId}`]: 0,
      [`typing.${input.senderId}`]: 0,
    });

    return messageDoc.id;
  } catch (error) {
    throw toAppError(error, ErrorCode.MESSAGE_SEND_FAILED);
  }
}

export async function markMessagesDelivered(
  conversationId: string,
  messageIds: string[],
): Promise<void> {
  if (messageIds.length === 0) return;
  const batch = writeBatch(getDb());
  messageIds.slice(0, 400).forEach((id) => {
    batch.update(
      doc(getDb(), "conversations", conversationId, "messages", id),
      { status: "delivered" satisfies MessageStatus },
    );
  });
  await batch.commit();
}

export async function markConversationRead(
  conversationId: string,
  uid: string,
  otherUid: string,
): Promise<void> {
  await updateDoc(doc(getDb(), "conversations", conversationId), {
    [`unreadCount.${uid}`]: 0,
  });

  const q = query(
    collection(getDb(), "conversations", conversationId, "messages"),
    orderBy("createdAt", "desc"),
    limit(40),
  );
  const snap = await getDocs(q);
  const batch = writeBatch(getDb());
  let ops = 0;
  snap.docs.forEach((d) => {
    const data = d.data() as EncryptedMessageDoc;
    if (data.senderId === otherUid && data.status !== "read") {
      batch.update(d.ref, { status: "read" satisfies MessageStatus });
      ops += 1;
    }
  });
  if (ops > 0) await batch.commit();
}

export async function setTyping(
  conversationId: string,
  uid: string,
  isTyping: boolean,
): Promise<void> {
  await updateDoc(doc(getDb(), "conversations", conversationId), {
    [`typing.${uid}`]: isTyping ? Date.now() : 0,
  });
}

export async function reactToMessage(
  conversationId: string,
  messageId: string,
  uid: string,
  emoji: string,
): Promise<void> {
  const ref = doc(
    getDb(),
    "conversations",
    conversationId,
    "messages",
    messageId,
  );
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data() as EncryptedMessageDoc;
  const reactions = { ...(data.reactions ?? {}) };
  const set = new Set(reactions[emoji] ?? []);
  if (set.has(uid)) set.delete(uid);
  else set.add(uid);
  if (set.size === 0) delete reactions[emoji];
  else reactions[emoji] = [...set];
  await updateDoc(ref, { reactions });
}

/** Soft-delete: for me (hide) or for everyone (sender only). */
export async function deleteMessage(input: {
  conversationId: string;
  messageId: string;
  uid: string;
  forEveryone?: boolean;
}): Promise<void> {
  const ref = doc(
    getDb(),
    "conversations",
    input.conversationId,
    "messages",
    input.messageId,
  );
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data() as EncryptedMessageDoc;

  if (input.forEveryone) {
    if (data.senderId !== input.uid) {
      throw new AppError(ErrorCode.FORBIDDEN, "Only the sender can delete for everyone");
    }
    await updateDoc(ref, {
      deletedForEveryone: true,
      ciphertext: "DELETED",
      nonce: "DELETED",
      v: data.v,
    });
    return;
  }

  await updateDoc(ref, {
    [`deletedFor.${input.uid}`]: true,
  });
}

export async function editMessage(input: {
  conversationId: string;
  messageId: string;
  senderId: string;
  otherUid: string;
  text: string;
}): Promise<void> {
  const parsed = messageTextSchema.safeParse(input.text);
  if (!parsed.success) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      parsed.error.issues[0]?.message,
    );
  }

  const ref = doc(
    getDb(),
    "conversations",
    input.conversationId,
    "messages",
    input.messageId,
  );
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data() as EncryptedMessageDoc;
  if (data.senderId !== input.senderId) {
    throw new AppError(ErrorCode.FORBIDDEN);
  }
  if (data.deletedForEveryone) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, "Cannot edit deleted message");
  }

  const peerKeys = await fetchPublicKeys(input.otherUid);
  if (!peerKeys?.identityPk) {
    throw new AppError(ErrorCode.ENCRYPTION_ERROR);
  }
  const me = await ensureDeviceKeys(input.senderId);
  const payload = await encryptMessageForPeer(
    parsed.data.slice(0, MAX_MESSAGE_LENGTH),
    me.bundle.identitySk,
    peerKeys.identityPk,
    `${input.senderId}:${peerKeys.identityPk.slice(0, 16)}`,
  );
  await updateDoc(ref, {
    ciphertext: payload.ciphertext,
    nonce: payload.nonce,
    v: payload.v,
    editedAt: serverTimestamp(),
  });
}

export async function togglePinMessage(
  conversationId: string,
  messageId: string,
): Promise<boolean> {
  const convRef = doc(getDb(), "conversations", conversationId);
  const snap = await getDoc(convRef);
  if (!snap.exists()) return false;
  const currentPinned: string[] = snap.data()?.pinnedMessageIds ?? [];
  const isPinned = currentPinned.includes(messageId);
  const nextPinned = isPinned
    ? currentPinned.filter((id) => id !== messageId)
    : [...currentPinned, messageId];
  await updateDoc(convRef, {
    pinnedMessageIds: nextPinned,
    updatedAt: serverTimestamp(),
  });
  return !isPinned;
}

export function isTypingActive(
  typingMap: Record<string, number> | undefined,
  uid: string,
  now = Date.now(),
): boolean {
  const ts = typingMap?.[uid] ?? 0;
  return ts > 0 && now - ts < TYPING_TTL_MS;
}

export type { Timestamp };
