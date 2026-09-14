import { NextResponse } from "next/server";
import { chemmNumberSchema } from "@/lib/validation";
import {
  checkRateLimit,
  clientIp,
  hashIdentifier,
  jsonError,
} from "@/lib/server/security";
import { normalizeChemmNumber } from "@/lib/chemm";
import { requireAuth } from "@/lib/server/auth";

/**
 * Authenticated, rate-limited CHEMM lookup.
 * Returns public profile fields only (never email).
 */
export async function POST(req: Request) {
  const auth = await requireAuth(req);
  // When Admin isn't configured (local demo), fall through to 503 for client fallback
  if (!auth.ok) {
    try {
      const { getAdminApp } = await import("@/lib/server/firebaseAdmin");
      getAdminApp();
      return jsonError("UNAUTHORIZED", auth.status, auth.message);
    } catch {
      return NextResponse.json(
        { error: "ADMIN_UNAVAILABLE", user: null },
        { status: 503 },
      );
    }
  }

  const ip = clientIp(req);
  const limit = checkRateLimit({
    key: `chemm_lookup:${auth.uid}:${hashIdentifier(ip)}`,
    limit: 20,
    windowMs: 60_000,
  });
  if (!limit.ok) {
    return jsonError("RATE_LIMITED", 429, "Too many lookups.", {
      retryAfterSec: limit.retryAfterSec,
    });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("VALIDATION_ERROR", 400, "Invalid JSON.");
  }

  const chemmRaw =
    typeof body === "object" &&
    body !== null &&
    "chemmNumber" in body &&
    typeof (body as { chemmNumber: unknown }).chemmNumber === "string"
      ? (body as { chemmNumber: string }).chemmNumber
      : "";

  const parsed = chemmNumberSchema.safeParse(chemmRaw);
  if (!parsed.success) {
    return jsonError("VALIDATION_ERROR", 400, "Invalid CHEMM Number.");
  }
  const chemm = normalizeChemmNumber(parsed.data);

  try {
    const { adminDb } = await import("@/lib/server/firebaseAdmin");
    const db = adminDb();
    const claim = await db.doc(`chemmNumbers/${chemm}`).get();
    if (!claim.exists) {
      return NextResponse.json({ user: null });
    }
    const uid = claim.data()?.uid as string;
    // Prefer publicProfiles (no email); fall back to stripped users doc
    const pub = await db.doc(`publicProfiles/${uid}`).get();
    if (pub.exists) {
      const u = pub.data()!;
      return NextResponse.json({
        user: {
          uid,
          chemmNumber: u.chemmNumber,
          username: u.username,
          displayName: u.displayName,
          avatarUrl: u.avatarUrl ?? null,
          isOnline: !!u.isOnline,
          lastSeen: u.lastSeen ?? null,
          encryptionFingerprint: u.encryptionFingerprint ?? null,
        },
      });
    }
    const userSnap = await db.doc(`users/${uid}`).get();
    if (!userSnap.exists) return NextResponse.json({ user: null });
    const u = userSnap.data()!;
    return NextResponse.json({
      user: {
        uid: u.uid,
        chemmNumber: u.chemmNumber,
        username: u.username,
        displayName: u.displayName,
        avatarUrl: u.avatarUrl ?? null,
        isOnline: !!u.isOnline,
        lastSeen: u.lastSeen ?? null,
        encryptionFingerprint: u.encryptionFingerprint ?? null,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "ADMIN_UNAVAILABLE", user: null },
      { status: 503 },
    );
  }
}
