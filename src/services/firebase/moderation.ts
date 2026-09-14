import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { getDb } from "./client";
import { AppError, ErrorCode } from "@/lib/errors";
import type { ContactRequest, ContactRequestStatus } from "@/types";

export async function isBlockedEitherWay(a: string, b: string): Promise<boolean> {
  const [ab, ba] = await Promise.all([
    getDoc(doc(getDb(), "blocks", a, "users", b)),
    getDoc(doc(getDb(), "blocks", b, "users", a)),
  ]);
  return ab.exists() || ba.exists();
}

export async function blockUser(blockerUid: string, blockedUid: string): Promise<void> {
  if (blockerUid === blockedUid) throw new AppError(ErrorCode.VALIDATION_ERROR);
  await setDoc(doc(getDb(), "blocks", blockerUid, "users", blockedUid), {
    blockedUid,
    createdAt: serverTimestamp(),
  });
  // Reject pending requests both ways
  await rejectOpenRequests(blockerUid, blockedUid);
}

export async function unblockUser(blockerUid: string, blockedUid: string): Promise<void> {
  const { deleteDoc } = await import("firebase/firestore");
  await deleteDoc(doc(getDb(), "blocks", blockerUid, "users", blockedUid));
}

export function subscribeBlockedUsers(
  uid: string,
  callback: (blockedUids: string[]) => void,
): Unsubscribe {
  const q = collection(getDb(), "blocks", uid, "users");
  return onSnapshot(
    q,
    (snap) => {
      callback(snap.docs.map((d) => d.id));
    },
    () => callback([]),
  );
}

async function rejectOpenRequests(a: string, b: string) {
  const q1 = query(
    collection(getDb(), "contactRequests"),
    where("fromUid", "==", a),
    where("toUid", "==", b),
    where("status", "==", "pending"),
    limit(5),
  );
  const q2 = query(
    collection(getDb(), "contactRequests"),
    where("fromUid", "==", b),
    where("toUid", "==", a),
    where("status", "==", "pending"),
    limit(5),
  );
  const [s1, s2] = await Promise.all([getDocs(q1), getDocs(q2)]);
  await Promise.all(
    [...s1.docs, ...s2.docs].map((d) =>
      updateDoc(d.ref, { status: "rejected" satisfies ContactRequestStatus, updatedAt: serverTimestamp() }),
    ),
  );
}

export async function sendContactRequest(input: {
  from: {
    uid: string;
    displayName: string;
    username: string;
    chemmNumber: string;
    avatarUrl: string | null;
  };
  toUid: string;
}): Promise<string> {
  if (input.from.uid === input.toUid) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, "Cannot add yourself");
  }
  if (await isBlockedEitherWay(input.from.uid, input.toUid)) {
    throw new AppError(ErrorCode.BLOCKED);
  }

  const existing = await getDocs(
    query(
      collection(getDb(), "contactRequests"),
      where("fromUid", "==", input.from.uid),
      where("toUid", "==", input.toUid),
      where("status", "==", "pending"),
      limit(1),
    ),
  );
  if (!existing.empty) throw new AppError(ErrorCode.CONFLICT, "Request already pending");

  const ref = doc(collection(getDb(), "contactRequests"));
  await setDoc(ref, {
    id: ref.id,
    fromUid: input.from.uid,
    toUid: input.toUid,
    status: "pending" satisfies ContactRequestStatus,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    fromDisplayName: input.from.displayName,
    fromUsername: input.from.username,
    fromChemmNumber: input.from.chemmNumber,
    fromAvatarUrl: input.from.avatarUrl,
  });
  return ref.id;
}

export async function respondToContactRequest(
  requestId: string,
  uid: string,
  accept: boolean,
): Promise<void> {
  const ref = doc(getDb(), "contactRequests", requestId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new AppError(ErrorCode.USER_NOT_FOUND);
  const data = snap.data() as ContactRequest;
  if (data.toUid !== uid) throw new AppError(ErrorCode.FORBIDDEN);
  await updateDoc(ref, {
    status: (accept ? "accepted" : "rejected") satisfies ContactRequestStatus,
    updatedAt: serverTimestamp(),
  });
}

export async function reportUser(input: {
  reporterUid: string;
  reportedUid: string;
  reason: string;
}): Promise<void> {
  if (input.reporterUid === input.reportedUid) {
    throw new AppError(ErrorCode.VALIDATION_ERROR);
  }
  const ref = doc(collection(getDb(), "reports"));
  await setDoc(ref, {
    id: ref.id,
    reporterUid: input.reporterUid,
    reportedUid: input.reportedUid,
    reason: input.reason.slice(0, 500),
    createdAt: serverTimestamp(),
  });
}

export async function listIncomingContactRequests(
  uid: string,
): Promise<ContactRequest[]> {
  const q = query(
    collection(getDb(), "contactRequests"),
    where("toUid", "==", uid),
    where("status", "==", "pending"),
    limit(40),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ ...(d.data() as ContactRequest), id: d.id }));
}

export function subscribeIncomingContactRequests(
  uid: string,
  callback: (requests: ContactRequest[]) => void,
): Unsubscribe {
  const q = query(
    collection(getDb(), "contactRequests"),
    where("toUid", "==", uid),
    where("status", "==", "pending"),
    limit(40),
  );
  return onSnapshot(
    q,
    (snap) => {
      callback(
        snap.docs.map((d) => ({ ...(d.data() as ContactRequest), id: d.id })),
      );
    },
    () => callback([]),
  );
}

export async function acceptContactRequestAndAdd(
  requestId: string,
  uid: string,
): Promise<void> {
  await respondToContactRequest(requestId, uid, true);
  const snap = await getDoc(doc(getDb(), "contactRequests", requestId));
  if (!snap.exists()) return;
  const data = snap.data() as ContactRequest;
  const { addContact } = await import("./contacts");
  await addContact(uid, data.fromUid);
}
