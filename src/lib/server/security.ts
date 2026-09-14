import {
  createHash,
  createHmac,
  timingSafeEqual,
} from "crypto";
import { NextResponse } from "next/server";

/** In-memory rate limiter for serverless-friendly short windows.
 * For multi-instance production, replace with Redis / Upstash.
 */
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export function checkRateLimit(input: {
  key: string;
  limit: number;
  windowMs: number;
}): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  const existing = buckets.get(input.key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(input.key, { count: 1, resetAt: now + input.windowMs });
    return { ok: true };
  }
  if (existing.count >= input.limit) {
    return {
      ok: false,
      retryAfterSec: Math.ceil((existing.resetAt - now) / 1000),
    };
  }
  existing.count += 1;
  return { ok: true };
}

export function clientIp(req: Request): string {
  const xf = req.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

export function jsonError(
  code: string,
  status: number,
  message: string,
  extra?: Record<string, unknown>,
) {
  return NextResponse.json({ error: code, message, ...extra }, { status });
}

/** Coturn REST API style time-limited credentials (HMAC-SHA1). */
export function mintTurnCredentials(ttlSec = 3600): {
  urls: string[];
  username: string;
  credential: string;
  ttl: number;
} | null {
  const urls = process.env.TURN_URLS?.split(",").map((s) => s.trim()).filter(Boolean);
  const secret = process.env.TURN_SECRET;
  if (!urls?.length || !secret) return null;

  const expiry = Math.floor(Date.now() / 1000) + ttlSec;
  const username = `${expiry}:chemm`;
  const credential = createHmac("sha1", secret).update(username).digest("base64");
  return { urls, username, credential, ttl: ttlSec };
}

export function hashIdentifier(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
