/**
 * E2EE using libsodium (NaCl) — mature, audited cryptography.
 *
 * Conversation messages:
 *   shared = crypto_box_beforenm(peerIdentityPk, myIdentitySk)
 *          = crypto_box_beforenm(myIdentityPk, peerIdentitySk)  // same DH
 *   ciphertext = crypto_secretbox_easy(plaintext, nonce, shared)
 *
 * This is the documented NaCl precomputation API (not a custom protocol).
 * Server/admins never receive plaintext or private keys.
 *
 * Per-message nonces provide uniqueness. Session rekey: publish new identity
 * rotation events (key-change warnings) when users regenerate device keys.
 */

import _sodium from "libsodium-wrappers";
import { AppError, ErrorCode } from "@/lib/errors";

export const E2EE_VERSION = 1;

export interface DeviceKeyBundle {
  identitySk: Uint8Array;
  identityPk: Uint8Array;
  signSk: Uint8Array;
  signPk: Uint8Array;
  signedPrekeySk: Uint8Array;
  signedPrekeyPk: Uint8Array;
  signedPrekeySig: Uint8Array;
}

export interface PublicKeyBundleWire {
  identityPk: string;
  signedPrekeyPk: string;
  signedPrekeySig: string;
  fingerprint: string;
}

export interface EncryptedPayload {
  v: number;
  ciphertext: string;
  nonce: string;
}

const DB_NAME = "chemm_e2ee_v1";
const STORE = "keys";
const sharedCache = new Map<string, Uint8Array>();

async function ready() {
  await _sodium.ready;
  return _sodium;
}

function b64(bytes: Uint8Array): string {
  return _sodium.to_base64(bytes, _sodium.base64_variants.ORIGINAL);
}

function fromB64(s: string): Uint8Array {
  return _sodium.from_base64(s, _sodium.base64_variants.ORIGINAL);
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(uid: string): Promise<Record<string, string> | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(uid);
    req.onsuccess = () => resolve((req.result as Record<string, string>) ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(uid: string, value: Record<string, string>): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, uid);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function fingerprintFromIdentityPk(
  identityPk: Uint8Array,
  sodium: typeof _sodium,
): string {
  const key = new Uint8Array(sodium.crypto_generichash_KEYBYTES);
  const hash = sodium.crypto_generichash(32, identityPk, key);
  return sodium.to_hex(hash).slice(0, 32).toUpperCase();
}

export async function ensureDeviceKeys(uid: string): Promise<{
  bundle: DeviceKeyBundle;
  publicWire: PublicKeyBundleWire;
  created: boolean;
}> {
  const sodium = await ready();
  const existing = await idbGet(uid);
  if (existing?.identitySk && existing.identityPk) {
    const bundle: DeviceKeyBundle = {
      identitySk: fromB64(existing.identitySk),
      identityPk: fromB64(existing.identityPk),
      signSk: fromB64(existing.signSk),
      signPk: fromB64(existing.signPk),
      signedPrekeySk: fromB64(existing.signedPrekeySk),
      signedPrekeyPk: fromB64(existing.signedPrekeyPk),
      signedPrekeySig: fromB64(existing.signedPrekeySig),
    };
    return {
      bundle,
      publicWire: {
        identityPk: existing.identityPk,
        signedPrekeyPk: existing.signedPrekeyPk,
        signedPrekeySig: existing.signedPrekeySig,
        fingerprint: existing.fingerprint,
      },
      created: false,
    };
  }

  const identity = sodium.crypto_box_keypair();
  const sign = sodium.crypto_sign_keypair();
  const pre = sodium.crypto_box_keypair();
  const sig = sodium.crypto_sign_detached(pre.publicKey, sign.privateKey);
  const fingerprint = fingerprintFromIdentityPk(identity.publicKey, sodium);

  const wire = {
    identitySk: b64(identity.privateKey),
    identityPk: b64(identity.publicKey),
    signSk: b64(sign.privateKey),
    signPk: b64(sign.publicKey),
    signedPrekeySk: b64(pre.privateKey),
    signedPrekeyPk: b64(pre.publicKey),
    signedPrekeySig: b64(sig),
    fingerprint,
  };
  await idbSet(uid, wire);

  return {
    bundle: {
      identitySk: identity.privateKey,
      identityPk: identity.publicKey,
      signSk: sign.privateKey,
      signPk: sign.publicKey,
      signedPrekeySk: pre.privateKey,
      signedPrekeyPk: pre.publicKey,
      signedPrekeySig: sig,
    },
    publicWire: {
      identityPk: wire.identityPk,
      signedPrekeyPk: wire.signedPrekeyPk,
      signedPrekeySig: wire.signedPrekeySig,
      fingerprint,
    },
    created: true,
  };
}

async function sharedSecret(
  mySk: Uint8Array,
  peerPkB64: string,
  cacheKey: string,
): Promise<Uint8Array> {
  const sodium = await ready();
  const cached = sharedCache.get(cacheKey);
  if (cached) return cached;
  const shared = sodium.crypto_box_beforenm(fromB64(peerPkB64), mySk);
  sharedCache.set(cacheKey, shared);
  return shared;
}

export async function encryptMessageForPeer(
  plaintext: string,
  myIdentitySk: Uint8Array,
  peerIdentityPkB64: string,
  cacheKey: string,
): Promise<EncryptedPayload> {
  try {
    const sodium = await ready();
    const shared = await sharedSecret(myIdentitySk, peerIdentityPkB64, cacheKey);
    const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
    const ciphertext = sodium.crypto_secretbox_easy(
      sodium.from_string(plaintext),
      nonce,
      shared,
    );
    return {
      v: E2EE_VERSION,
      ciphertext: b64(ciphertext),
      nonce: b64(nonce),
    };
  } catch (error) {
    throw new AppError(
      ErrorCode.ENCRYPTION_ERROR,
      error instanceof Error ? error.message : "encrypt failed",
    );
  }
}

export async function decryptMessageFromPeer(
  payload: EncryptedPayload,
  myIdentitySk: Uint8Array,
  peerIdentityPkB64: string,
  cacheKey: string,
): Promise<string> {
  try {
    const sodium = await ready();
    const shared = await sharedSecret(myIdentitySk, peerIdentityPkB64, cacheKey);
    const opened = sodium.crypto_secretbox_open_easy(
      fromB64(payload.ciphertext),
      fromB64(payload.nonce),
      shared,
    );
    return sodium.to_string(opened);
  } catch (error) {
    throw new AppError(
      ErrorCode.ENCRYPTION_ERROR,
      error instanceof Error ? error.message : "decrypt failed",
    );
  }
}

export function formatFingerprint(fp: string): string {
  return fp.match(/.{1,4}/g)?.join(" ") ?? fp;
}

export function clearSharedCache(): void {
  sharedCache.clear();
}
