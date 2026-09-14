import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { getDb } from "./client";
import type { PrivacySettings } from "@/types";

const DEFAULTS: Omit<PrivacySettings, "uid" | "updatedAt"> = {
  whoCanMessage: "everyone",
  whoCanCall: "everyone",
  showLastSeen: true,
  showOnline: true,
  readReceipts: true,
};

export async function getPrivacySettings(uid: string): Promise<PrivacySettings> {
  const snap = await getDoc(doc(getDb(), "privacySettings", uid));
  if (!snap.exists()) {
    return { uid, ...DEFAULTS, updatedAt: null };
  }
  return { ...DEFAULTS, ...(snap.data() as PrivacySettings), uid };
}

export async function savePrivacySettings(
  uid: string,
  updates: Partial<Omit<PrivacySettings, "uid" | "updatedAt">>,
): Promise<PrivacySettings> {
  const next: PrivacySettings = {
    ...(await getPrivacySettings(uid)),
    ...updates,
    uid,
    updatedAt: null,
  };
  await setDoc(
    doc(getDb(), "privacySettings", uid),
    {
      ...updates,
      uid,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  return next;
}
