import { mintTurnCredentials, jsonError, checkRateLimit, clientIp, hashIdentifier } from "@/lib/server/security";
import { requireAuth } from "@/lib/server/auth";
import { NextResponse } from "next/server";

/**
 * Returns short-lived TURN credentials.
 * Requires a valid Firebase ID token. TURN_SECRET never leaves the server.
 */
export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (!auth.ok) {
    // Allow STUN-only without auth for graceful degradation in demo
    if (!process.env.TURN_SECRET && !process.env.FIREBASE_ADMIN_PROJECT_ID) {
      return NextResponse.json({
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
        ],
        turnConfigured: false,
      });
    }
    return jsonError("UNAUTHORIZED", auth.status, auth.message);
  }

  const ip = clientIp(req);
  const limit = checkRateLimit({
    key: `turn:${auth.uid}:${hashIdentifier(ip)}`,
    limit: 30,
    windowMs: 60_000,
  });
  if (!limit.ok) {
    return jsonError("RATE_LIMITED", 429, "Too many credential requests.");
  }

  const creds = mintTurnCredentials(3600);
  if (!creds) {
    return NextResponse.json({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
      ],
      turnConfigured: false,
    });
  }

  return NextResponse.json({
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      {
        urls: creds.urls,
        username: creds.username,
        credential: creds.credential,
      },
    ],
    ttl: creds.ttl,
    turnConfigured: true,
  });
}
