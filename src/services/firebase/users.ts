import {
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
  startAt,
  endAt,
  updateDoc,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { getDb, getFirebaseStorage } from "./client";
import type { PublicUserPreview, UserProfile } from "@/types";
import {
  compressImage,
  normalizeUsername,
  validateDisplayName,
  validateUsername,
  friendlyError,
} from "@/lib/utils";

function toPublicPreview(
  data: Record<string, unknown> & { uid: string },
): PublicUserPreview {
  return {
    uid: data.uid,
    chemmNumber: (data.chemmNumber as string) ?? "",
    username: (data.username as string) ?? "",
    displayName: (data.displayName as string) ?? "",
    avatarUrl: (data.avatarUrl as string | null) ?? null,
    isOnline: !!data.isOnline,
    lastSeen: (data.lastSeen as PublicUserPreview["lastSeen"]) ?? null,
    encryptionFingerprint:
      (data.encryptionFingerprint as string | null) ?? null,
  };
}

function previewAsProfile(p: PublicUserPreview, bio = ""): UserProfile {
  return {
    uid: p.uid,
    chemmNumber: p.chemmNumber,
    email: "",
    username: p.username,
    displayName: p.displayName,
    avatarUrl: p.avatarUrl,
    bio,
    createdAt: null,
    lastSeen: p.lastSeen,
    isOnline: p.isOnline,
    searchUsername: p.username,
    encryptionFingerprint: p.encryptionFingerprint,
  };
}

/** Sync discoverable fields to publicProfiles (never email). */
export async function syncPublicProfile(
  profile: Pick<
    UserProfile,
    | "uid"
    | "chemmNumber"
    | "username"
    | "displayName"
    | "avatarUrl"
    | "bio"
    | "isOnline"
    | "lastSeen"
    | "encryptionFingerprint"
  >,
): Promise<void> {
  await setDoc(
    doc(getDb(), "publicProfiles", profile.uid),
    {
      uid: profile.uid,
      chemmNumber: profile.chemmNumber,
      username: profile.username,
      searchUsername: profile.username,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl ?? null,
      bio: profile.bio ?? "",
      isOnline: !!profile.isOnline,
      lastSeen: profile.lastSeen ?? serverTimestamp(),
      encryptionFingerprint: profile.encryptionFingerprint ?? null,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export function subscribeToUser(
  uid: string,
  callback: (profile: UserProfile | null) => void,
  opts?: { self?: boolean },
): Unsubscribe {
  // Own private doc for self; publicProfiles for peers (no email)
  const path = opts?.self ? ["users", uid] : ["publicProfiles", uid];
  return onSnapshot(
    doc(getDb(), path[0]!, path[1]!),
    (snap) => {
      if (!snap.exists()) {
        callback(null);
        return;
      }
      const data = snap.data();
      if (opts?.self) {
        callback(data as UserProfile);
      } else {
        callback(previewAsProfile(toPublicPreview({ ...data, uid })));
      }
    },
    () => callback(null),
  );
}

export async function getUserById(uid: string): Promise<UserProfile | null> {
  // Prefer public profile (readable by any signed-in user)
  const pub = await getDoc(doc(getDb(), "publicProfiles", uid));
  if (pub.exists()) {
    return previewAsProfile(toPublicPreview({ ...pub.data(), uid }));
  }

  // Fallback: only works for self under tightened rules
  const snap = await getDoc(doc(getDb(), "users", uid));
  return snap.exists() ? (snap.data() as UserProfile) : null;
}

export async function getOwnUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(doc(getDb(), "users", uid));
  return snap.exists() ? (snap.data() as UserProfile) : null;
}

export async function getUserByUsername(
  username: string,
): Promise<UserProfile | null> {
  const normalized = normalizeUsername(username);
  const usernameSnap = await getDoc(doc(getDb(), "usernames", normalized));
  if (!usernameSnap.exists()) return null;
  const uid = usernameSnap.data().uid as string;
  return getUserById(uid);
}

export async function searchUsersByUsername(
  term: string,
  limitCount = 12,
): Promise<UserProfile[]> {
  const normalized = normalizeUsername(term);
  if (normalized.length < 1) return [];

  const q = query(
    collection(getDb(), "publicProfiles"),
    orderBy("searchUsername"),
    startAt(normalized),
    endAt(`${normalized}\uf8ff`),
    limit(limitCount),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) =>
    previewAsProfile(toPublicPreview({ ...d.data(), uid: d.id })),
  );
}

export async function updateUserProfile(
  uid: string,
  updates: Partial<Pick<UserProfile, "displayName" | "bio" | "avatarUrl">>,
): Promise<void> {
  if (updates.displayName !== undefined) {
    const err = validateDisplayName(updates.displayName);
    if (err) throw new Error(err);
    updates.displayName = updates.displayName.trim();
  }
  if (updates.bio !== undefined) {
    updates.bio = updates.bio.trim().slice(0, 160);
  }
  try {
    await updateDoc(doc(getDb(), "users", uid), {
      ...updates,
      lastSeen: serverTimestamp(),
    });
    await setDoc(
      doc(getDb(), "publicProfiles", uid),
      { ...updates, updatedAt: serverTimestamp() },
      { merge: true },
    );
  } catch (error) {
    throw new Error(friendlyError(error, "Could not update profile."));
  }
}

export async function uploadAvatar(uid: string, file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Please choose an image file.");
  }
  if (file.size > 8 * 1024 * 1024) {
    throw new Error("Image must be under 8MB.");
  }
  try {
    const blob = await compressImage(file);
    const storageRef = ref(getFirebaseStorage(), `avatars/${uid}.jpg`);
    await uploadBytes(storageRef, blob, { contentType: "image/jpeg" });
    const url = await getDownloadURL(storageRef);
    await updateDoc(doc(getDb(), "users", uid), {
      avatarUrl: url,
      lastSeen: serverTimestamp(),
    });
    await setDoc(
      doc(getDb(), "publicProfiles", uid),
      { avatarUrl: url, updatedAt: serverTimestamp() },
      { merge: true },
    );
    return url;
  } catch (error) {
    throw new Error(friendlyError(error, "Could not upload avatar."));
  }
}

export async function setPresence(
  uid: string,
  isOnline: boolean,
): Promise<void> {
  await setDoc(
    doc(getDb(), "users", uid),
    {
      isOnline,
      lastSeen: serverTimestamp(),
    },
    { merge: true },
  );
  await setDoc(
    doc(getDb(), "publicProfiles", uid),
    {
      isOnline,
      lastSeen: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export function subscribeToUsersByIds(
  uids: string[],
  callback: (users: Record<string, UserProfile>) => void,
): Unsubscribe {
  if (uids.length === 0) {
    callback({});
    return () => undefined;
  }

  const unique = [...new Set(uids)].slice(0, 30);
  const q = query(
    collection(getDb(), "publicProfiles"),
    where("uid", "in", unique),
  );
  return onSnapshot(
    q,
    (snap) => {
      const map: Record<string, UserProfile> = {};
      snap.docs.forEach((d) => {
        const preview = toPublicPreview({ ...d.data(), uid: d.id });
        map[preview.uid] = previewAsProfile(preview);
      });
      callback(map);
    },
    () => callback({}),
  );
}

export { validateUsername, normalizeUsername };
