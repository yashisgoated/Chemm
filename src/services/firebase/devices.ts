import {
  doc,
  getDocs,
  collection,
  serverTimestamp,
  setDoc,
  deleteDoc,
} from "firebase/firestore";
import { getDb } from "./client";
import type { DeviceRecord } from "@/types";

const STORAGE_KEY = "chemm_device_id";

function randomId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function getOrCreateLocalDeviceId(): string {
  if (typeof window === "undefined") return "server";
  let id = window.localStorage.getItem(STORAGE_KEY);
  if (!id) {
    id = randomId();
    window.localStorage.setItem(STORAGE_KEY, id);
  }
  return id;
}

export async function registerDevice(
  uid: string,
  opts?: { label?: string },
): Promise<DeviceRecord> {
  const deviceId = getOrCreateLocalDeviceId();
  const platform =
    typeof navigator !== "undefined" ? navigator.platform || "web" : "web";
  const label =
    opts?.label ??
    (typeof navigator !== "undefined"
      ? `${platform} browser`
      : "Web device");

  const record: DeviceRecord = {
    uid,
    deviceId,
    label,
    platform,
    lastActiveAt: null,
    createdAt: null,
    fingerprintHint: null,
  };

  await setDoc(
    doc(getDb(), "devices", uid, "items", deviceId),
    {
      ...record,
      lastActiveAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    },
    { merge: true },
  );
  return record;
}

export async function listDevices(uid: string): Promise<DeviceRecord[]> {
  const snap = await getDocs(collection(getDb(), "devices", uid, "items"));
  return snap.docs.map((d) => d.data() as DeviceRecord);
}

export async function revokeDevice(uid: string, deviceId: string): Promise<void> {
  await deleteDoc(doc(getDb(), "devices", uid, "items", deviceId));
}

export async function touchDevice(uid: string): Promise<void> {
  const deviceId = getOrCreateLocalDeviceId();
  await setDoc(
    doc(getDb(), "devices", uid, "items", deviceId),
    { lastActiveAt: serverTimestamp() },
    { merge: true },
  );
}
