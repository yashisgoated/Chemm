import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { getDb } from "./client";
import type {
  CallEndReason,
  CallHistoryItem,
  CallSignaling,
  CallStatus,
  IceCandidateDoc,
  UserProfile,
} from "@/types";
import { friendlyError } from "@/lib/utils";
import { STALE_CALL_MS } from "@/lib/constants";

function profileLite(profile: UserProfile) {
  return {
    displayName: profile.displayName,
    username: profile.username,
    avatarUrl: profile.avatarUrl,
    chemmNumber: profile.chemmNumber ?? "",
  };
}

export async function createCall(input: {
  caller: UserProfile;
  callee: UserProfile;
  offer: RTCSessionDescriptionInit;
}): Promise<string> {
  try {
    const active = await findActiveCallForUser(input.callee.uid);
    if (active) {
      throw new Error("User is busy on another call.");
    }

    const ref = await addDoc(collection(getDb(), "calls"), {
      callerId: input.caller.uid,
      calleeId: input.callee.uid,
      status: "ringing" satisfies CallStatus,
      offer: input.offer,
      answer: null,
      callerInfo: profileLite(input.caller),
      calleeInfo: profileLite(input.callee),
      createdAt: serverTimestamp(),
      answeredAt: null,
      endedAt: null,
      durationSeconds: 0,
      endReason: null,
    });
    return ref.id;
  } catch (error) {
    throw new Error(friendlyError(error, "Could not start call."));
  }
}

export async function findActiveCallForUser(
  uid: string,
): Promise<CallSignaling | null> {
  const statuses: CallStatus[] = ["ringing", "connecting", "connected"];
  const asCaller = query(
    collection(getDb(), "calls"),
    where("callerId", "==", uid),
    where("status", "in", statuses),
    limit(1),
  );
  const asCallee = query(
    collection(getDb(), "calls"),
    where("calleeId", "==", uid),
    where("status", "in", statuses),
    limit(1),
  );
  const [callerSnap, calleeSnap] = await Promise.all([
    getDocs(asCaller),
    getDocs(asCallee),
  ]);
  const docSnap = callerSnap.docs[0] ?? calleeSnap.docs[0];
  if (!docSnap) return null;
  return { ...(docSnap.data() as CallSignaling), id: docSnap.id };
}

export function subscribeToIncomingCalls(
  uid: string,
  callback: (call: CallSignaling | null) => void,
): Unsubscribe {
  const q = query(
    collection(getDb(), "calls"),
    where("calleeId", "==", uid),
    where("status", "==", "ringing"),
    limit(3),
  );
  return onSnapshot(
    q,
    (snap) => {
      const first = snap.docs[0];
      callback(first ? { ...(first.data() as CallSignaling), id: first.id } : null);
    },
    () => callback(null),
  );
}

export function subscribeToCall(
  callId: string,
  callback: (call: CallSignaling | null) => void,
): Unsubscribe {
  return onSnapshot(
    doc(getDb(), "calls", callId),
    (snap) => {
      callback(snap.exists() ? ({ ...(snap.data() as CallSignaling), id: snap.id }) : null);
    },
    () => callback(null),
  );
}

export async function updateCallStatus(
  callId: string,
  status: CallStatus,
  extra: Partial<{
    endReason: CallEndReason | null;
    offer: RTCSessionDescriptionInit | null;
    answer: RTCSessionDescriptionInit | null;
    durationSeconds: number;
  }> = {},
): Promise<void> {
  await updateDoc(doc(getDb(), "calls", callId), { status, ...extra });
}

export async function setCallAnswer(
  callId: string,
  answer: RTCSessionDescriptionInit,
): Promise<void> {
  await updateDoc(doc(getDb(), "calls", callId), {
    answer,
    status: "connecting" satisfies CallStatus,
    answeredAt: serverTimestamp(),
  });
}

export async function addIceCandidate(
  callId: string,
  from: string,
  candidate: RTCIceCandidateInit,
): Promise<void> {
  await addDoc(collection(getDb(), "calls", callId, "iceCandidates"), {
    candidate,
    from,
    createdAt: serverTimestamp(),
  });
}

export function subscribeToIceCandidates(
  callId: string,
  excludeFrom: string,
  callback: (candidates: IceCandidateDoc[]) => void,
): Unsubscribe {
  const q = query(collection(getDb(), "calls", callId, "iceCandidates"));
  const seen = new Set<string>();
  return onSnapshot(
    q,
    (snap) => {
      const fresh: IceCandidateDoc[] = [];
      snap.docChanges().forEach((change) => {
        if (change.type !== "added") return;
        if (seen.has(change.doc.id)) return;
        seen.add(change.doc.id);
        const data = change.doc.data() as Omit<IceCandidateDoc, "id">;
        if (data.from === excludeFrom) return;
        fresh.push({ ...data, id: change.doc.id });
      });
      if (fresh.length) callback(fresh);
    },
    () => undefined,
  );
}

export async function endCall(input: {
  callId: string;
  status: CallStatus;
  endReason: CallEndReason;
  durationSeconds?: number;
  caller: UserProfile;
  callee: UserProfile;
}): Promise<void> {
  const callRef = doc(getDb(), "calls", input.callId);
  const snap = await getDoc(callRef);
  if (!snap.exists()) return;
  const existing = snap.data() as CallSignaling;
  if (["ended", "declined", "missed", "failed", "cancelled"].includes(existing.status)) {
    await cleanupIceCandidates(input.callId);
    return;
  }

  await updateDoc(callRef, {
    status: input.status,
    endReason: input.endReason,
    endedAt: serverTimestamp(),
    durationSeconds: input.durationSeconds ?? 0,
    offer: null,
    answer: null,
  });

  await Promise.all([
    writeCallHistory(input.caller.uid, {
      id: input.callId,
      peerId: input.callee.uid,
      peerDisplayName: input.callee.displayName,
      peerUsername: input.callee.username,
      peerChemmNumber: input.callee.chemmNumber ?? "",
      peerAvatarUrl: input.callee.avatarUrl,
      direction: "outgoing",
      status: input.status,
      durationSeconds: input.durationSeconds ?? 0,
      createdAt: existing.createdAt,
      endReason: input.endReason,
    }),
    writeCallHistory(input.callee.uid, {
      id: input.callId,
      peerId: input.caller.uid,
      peerDisplayName: input.caller.displayName,
      peerUsername: input.caller.username,
      peerChemmNumber: input.caller.chemmNumber ?? "",
      peerAvatarUrl: input.caller.avatarUrl,
      direction: "incoming",
      status: input.status,
      durationSeconds: input.durationSeconds ?? 0,
      createdAt: existing.createdAt,
      endReason: input.endReason,
    }),
    cleanupIceCandidates(input.callId),
  ]);
}

async function writeCallHistory(
  uid: string,
  item: CallHistoryItem,
): Promise<void> {
  await setDoc(doc(getDb(), "callHistory", uid, "items", item.id), {
    ...item,
    createdAt: item.createdAt ?? serverTimestamp(),
  });
}

export async function cleanupIceCandidates(callId: string): Promise<void> {
  const snap = await getDocs(collection(getDb(), "calls", callId, "iceCandidates"));
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
}

export function subscribeToCallHistory(
  uid: string,
  callback: (items: CallHistoryItem[]) => void,
): Unsubscribe {
  const q = query(
    collection(getDb(), "callHistory", uid, "items"),
    orderBy("createdAt", "desc"),
    limit(40),
  );
  return onSnapshot(
    q,
    (snap) => {
      callback(snap.docs.map((d) => ({ ...(d.data() as CallHistoryItem), id: d.id })));
    },
    () => callback([]),
  );
}

export async function cleanupStaleCalls(uid: string): Promise<void> {
  const active = await findActiveCallForUser(uid);
  if (!active?.createdAt) return;
  const created =
    typeof active.createdAt.toDate === "function"
      ? active.createdAt.toDate().getTime()
      : (active.createdAt as unknown as { seconds?: number }).seconds
        ? ((active.createdAt as unknown as { seconds: number }).seconds * 1000)
        : 0;
  if (created && Date.now() - created > STALE_CALL_MS && active.status === "ringing") {
    await updateCallStatus(active.id, "missed", {
      endReason: "timeout",
      offer: null,
      answer: null,
    });
    await cleanupIceCandidates(active.id);
  }
}
