/**
 * Verify Firebase ID tokens on API routes.
 * Never trust client-claimed roles — only verified tokens.
 */
import { NextRequest } from "next/server";
import { adminAuth } from "@/lib/server/firebaseAdmin";

export async function requireAuth(req: Request | NextRequest): Promise<
  | { ok: true; uid: string; email?: string }
  | { ok: false; status: number; message: string }
> {
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match?.[1]) {
    return { ok: false, status: 401, message: "Missing authorization." };
  }
  try {
    const decoded = await adminAuth().verifyIdToken(match[1]);
    return { ok: true, uid: decoded.uid, email: decoded.email };
  } catch {
    return { ok: false, status: 401, message: "Invalid or expired session." };
  }
}

export async function requireAdmin(req: Request | NextRequest): Promise<
  | { ok: true; uid: string; roles: string[]; permissions: string[] }
  | { ok: false; status: number; message: string }
> {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth;
  try {
    const { adminDb } = await import("@/lib/server/firebaseAdmin");
    const snap = await adminDb().doc(`adminRoles/${auth.uid}`).get();
    if (!snap.exists) {
      return { ok: false, status: 403, message: "Admin access required." };
    }
    const data = snap.data()!;
    if (data.status && data.status !== "ACTIVE") {
      return { ok: false, status: 403, message: "Admin access revoked." };
    }
    return {
      ok: true,
      uid: auth.uid,
      roles: (data.roles as string[]) ?? [],
      permissions: (data.permissions as string[]) ?? [],
    };
  } catch {
    return { ok: false, status: 503, message: "Admin service unavailable." };
  }
}

export function hasPermission(
  admin: { permissions: string[]; roles: string[] },
  permission: string,
): boolean {
  if (admin.roles.includes("OWNER") || admin.roles.includes("SUPER_ADMIN")) {
    return true;
  }
  return admin.permissions.includes(permission) || admin.permissions.includes("*");
}
