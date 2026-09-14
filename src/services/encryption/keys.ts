import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { getDb } from "@/services/firebase/client";
import { ensureDeviceKeys, type PublicKeyBundleWire } from "./e2ee";
import type { PublicEncryptionBundle } from "@/types";
import _sodium from "libsodium-wrappers";

async function toPublicWire(uid: string) {
  await _sodium.ready;
  const { publicWire, bundle, created } = await ensureDeviceKeys(uid);
  const signPk = _sodium.to_base64(
    bundle.signPk,
    _sodium.base64_variants.ORIGINAL,
  );
  return {
    wire: { ...publicWire, signPk },
    created,
  };
}

export async function publishPublicKeys(
  uid: string,
): Promise<PublicKeyBundleWire & { signPk: string }> {
  const { wire } = await toPublicWire(uid);

  await setDoc(
    doc(getDb(), "publicKeys", uid),
    {
      uid,
      identityPk: wire.identityPk,
      signedPrekeyPk: wire.signedPrekeyPk,
      signedPrekeySig: wire.signedPrekeySig,
      fingerprint: wire.fingerprint,
      signPk: wire.signPk,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  return wire;
}

export async function fetchPublicKeys(
  uid: string,
): Promise<(PublicEncryptionBundle & { signPk?: string }) | null> {
  const snap = await getDoc(doc(getDb(), "publicKeys", uid));
  if (!snap.exists()) return null;
  return snap.data() as PublicEncryptionBundle & { signPk?: string };
}

export function rememberTrustedFingerprint(
  peerUid: string,
  fingerprint: string,
): void {
  if (typeof window === "undefined") return;
  const key = `chemm_trusted_fp_${peerUid}`;
  window.localStorage.setItem(key, fingerprint);
}

export function getTrustedFingerprint(peerUid: string): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(`chemm_trusted_fp_${peerUid}`);
}

export function clearTrustedFingerprint(peerUid: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(`chemm_trusted_fp_${peerUid}`);
}
