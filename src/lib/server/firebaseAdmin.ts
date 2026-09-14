import { getApps, initializeApp, cert, type App, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

let app: App | null = null;

export function getAdminApp(): App {
  if (app) return app;
  if (getApps().length) {
    app = getApps()[0]!;
    return app;
  }

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (projectId && clientEmail && privateKey) {
    app = initializeApp({
      credential: cert({ projectId, clientEmail, privateKey }),
      projectId,
    });
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    app = initializeApp({ credential: applicationDefault() });
  } else {
    throw new Error("Firebase Admin is not configured.");
  }
  return app;
}

export function adminDb() {
  return getFirestore(getAdminApp());
}

export function adminAuth() {
  return getAuth(getAdminApp());
}
