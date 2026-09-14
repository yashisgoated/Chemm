import { NextResponse } from "next/server";
import { hasPermission, requireAdmin } from "@/lib/server/auth";
import { jsonError } from "@/lib/server/security";

/**
 * Admin overview — server-side role check via adminRoles/{uid}.
 * Seed an owner with Admin SDK: adminRoles/{uid} = { roles: ['OWNER'], permissions: ['*'], status: 'ACTIVE' }
 */
export async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (!admin.ok) {
    return jsonError("FORBIDDEN", admin.status, admin.message);
  }
  if (!hasPermission(admin, "dashboard:read") && !hasPermission(admin, "*")) {
    // OWNER/SUPER_ADMIN already pass hasPermission
    if (!admin.roles.includes("OWNER") && !admin.roles.includes("SUPER_ADMIN")) {
      return jsonError("FORBIDDEN", 403, "Missing dashboard permission.");
    }
  }

  try {
    const { adminDb } = await import("@/lib/server/firebaseAdmin");
    const db = adminDb();

    const [usersSnap, reportsSnap] = await Promise.all([
      db.collection("users").count().get(),
      db.collection("reports").orderBy("createdAt", "desc").limit(20).get(),
    ]);

    const reports = reportsSnap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        reporterUid: data.reporterUid,
        reportedUid: data.reportedUid,
        reason: data.reason,
        createdAt: data.createdAt?.toMillis?.() ?? null,
      };
    });

    // Audit log entry (server-only write)
    await db.collection("auditLogs").add({
      action: "ADMIN_DASHBOARD_VIEW",
      actorUid: admin.uid,
      createdAt: new Date(),
      meta: { roles: admin.roles },
    });

    return NextResponse.json({
      ok: true,
      admin: { uid: admin.uid, roles: admin.roles, permissions: admin.permissions },
      stats: {
        usersApprox: usersSnap.data().count,
        openReports: reports.length,
      },
      recentReports: reports,
    });
  } catch (error) {
    return jsonError(
      "ADMIN_UNAVAILABLE",
      503,
      error instanceof Error ? error.message : "Admin service unavailable.",
    );
  }
}
