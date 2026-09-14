import { doc, getDoc, collection, query, where, limit, getDocs } from "firebase/firestore";
import { getDb } from "./client";
import { chemmNumberSchema } from "@/lib/validation";
import { AppError, ErrorCode } from "@/lib/errors";
import type { PublicUserPreview, UserProfile } from "@/types";
import { normalizeChemmNumber } from "@/lib/chemm";

function toPreview(u: UserProfile): PublicUserPreview {
  return {
    uid: u.uid,
    chemmNumber: u.chemmNumber,
    username: u.username,
    displayName: u.displayName,
    avatarUrl: u.avatarUrl,
    isOnline: u.isOnline,
    lastSeen: u.lastSeen,
    encryptionFingerprint: u.encryptionFingerprint,
  };
}

/** Exact CHEMM lookup — never enumerate by UID from the client UI. */
export async function lookupByChemmNumber(
  raw: string,
): Promise<PublicUserPreview> {
  const parsed = chemmNumberSchema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, parsed.error.issues[0]?.message);
  }
  const chemm = normalizeChemmNumber(parsed.data);

  // Prefer rate-limited authenticated API when available
  try {
    const { authHeaders } = await import("@/lib/apiAuth");
    const res = await fetch("/api/chemm/lookup", {
      method: "POST",
      headers: await authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ chemmNumber: chemm }),
    });
    if (res.status === 429) throw new AppError(ErrorCode.RATE_LIMITED);
    if (res.ok) {
      const data = (await res.json()) as { user: PublicUserPreview | null };
      if (!data.user) throw new AppError(ErrorCode.USER_NOT_FOUND);
      return data.user;
    }
    // Fall through to client lookup if API not configured
  } catch (error) {
    if (error instanceof AppError) throw error;
  }

  const claim = await getDoc(doc(getDb(), "chemmNumbers", chemm));
  if (!claim.exists()) throw new AppError(ErrorCode.USER_NOT_FOUND);
  const uid = claim.data().uid as string;
  const pub = await getDoc(doc(getDb(), "publicProfiles", uid));
  if (pub.exists()) return toPublicPreview({ ...pub.data(), uid });
  const userSnap = await getDoc(doc(getDb(), "users", uid));
  if (!userSnap.exists()) throw new AppError(ErrorCode.USER_NOT_FOUND);
  return toPreview(userSnap.data() as UserProfile);
}

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

export async function lookupByUsernameExact(
  username: string,
): Promise<PublicUserPreview | null> {
  const normalized = username.trim().toLowerCase();
  if (normalized.length < 3) return null;

  const snap = await getDoc(doc(getDb(), "usernames", normalized));
  if (!snap.exists()) return null;
  const uid = snap.data().uid as string;
  const pub = await getDoc(doc(getDb(), "publicProfiles", uid));
  if (pub.exists()) return toPublicPreview({ ...pub.data(), uid });
  const userSnap = await getDoc(doc(getDb(), "users", uid));
  if (!userSnap.exists()) return null;
  return toPreview(userSnap.data() as UserProfile);
}

/** Bounded prefix search — prefer exact CHEMM for discovery. */
export async function searchUsersLimited(
  term: string,
  excludeUid?: string,
): Promise<PublicUserPreview[]> {
  const t = term.trim();
  if (t.toUpperCase().startsWith("CHEMM-")) {
    try {
      return [await lookupByChemmNumber(t)];
    } catch {
      return [];
    }
  }

  if (t.length < 3) return [];
  const q = query(
    collection(getDb(), "publicProfiles"),
    where("searchUsername", ">=", t.toLowerCase()),
    where("searchUsername", "<=", `${t.toLowerCase()}\uf8ff`),
    limit(8),
  );
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => toPublicPreview({ ...d.data(), uid: d.id }))
    .filter((u) => u.uid !== excludeUid);
}
