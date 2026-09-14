import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { getDb } from "./client";
import { getUserById } from "./users";
import type { Contact } from "@/types";
import { friendlyError } from "@/lib/utils";
import { isBlockedEitherWay } from "./moderation";
import { AppError, ErrorCode } from "@/lib/errors";

export function subscribeToContacts(
  uid: string,
  callback: (contacts: Contact[]) => void,
): Unsubscribe {
  const q = query(
    collection(getDb(), "contacts", uid, "items"),
    orderBy("addedAt", "desc"),
  );
  return onSnapshot(
    q,
    (snap) => {
      callback(snap.docs.map((d) => ({ ...(d.data() as Contact), uid: d.id })));
    },
    () => callback([]),
  );
}

export async function addContact(
  currentUid: string,
  contactUid: string,
): Promise<void> {
  if (currentUid === contactUid) {
    throw new Error("You can't add yourself.");
  }
  if (await isBlockedEitherWay(currentUid, contactUid)) {
    throw new AppError(ErrorCode.BLOCKED);
  }
  const profile = await getUserById(contactUid);
  if (!profile) throw new Error("User not found.");

  try {
    await setDoc(doc(getDb(), "contacts", currentUid, "items", contactUid), {
      uid: contactUid,
      chemmNumber: profile.chemmNumber ?? "",
      addedAt: serverTimestamp(),
      displayName: profile.displayName,
      username: profile.username,
      avatarUrl: profile.avatarUrl,
      status: "accepted",
    });
  } catch (error) {
    throw new Error(friendlyError(error, "Could not add contact."));
  }
}

/** Refresh cached contact display fields from publicProfiles. */
export async function refreshContact(
  currentUid: string,
  contactUid: string,
): Promise<void> {
  const profile = await getUserById(contactUid);
  if (!profile) return;
  await setDoc(
    doc(getDb(), "contacts", currentUid, "items", contactUid),
    {
      displayName: profile.displayName,
      username: profile.username,
      avatarUrl: profile.avatarUrl,
      chemmNumber: profile.chemmNumber ?? "",
    },
    { merge: true },
  );
}

export async function removeContact(
  currentUid: string,
  contactUid: string,
): Promise<void> {
  try {
    await deleteDoc(doc(getDb(), "contacts", currentUid, "items", contactUid));
  } catch (error) {
    throw new Error(friendlyError(error, "Could not remove contact."));
  }
}

export async function isContact(
  currentUid: string,
  contactUid: string,
): Promise<boolean> {
  const snap = await getDoc(
    doc(getDb(), "contacts", currentUid, "items", contactUid),
  );
  return snap.exists();
}
