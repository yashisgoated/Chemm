import {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  updateProfile,
  type User,
  type Unsubscribe,
} from "firebase/auth";
import { getFirebaseAuth, getDb } from "./client";
import type { UserProfile } from "@/types";
import { signupSchema, usernameSchema, displayNameSchema } from "@/lib/validation";
import { generateChemmNumber, normalizeChemmNumber } from "@/lib/chemm";
import { AppError, ErrorCode, toAppError, userFacingMessage } from "@/lib/errors";
import { publishPublicKeys } from "@/services/encryption/keys";
import { normalizeUsername } from "@/lib/utils";

const MAX_CHEMM_ATTEMPTS = 8;
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

export function subscribeToAuth(callback: (user: User | null) => void): Unsubscribe {
  return onAuthStateChanged(getFirebaseAuth(), callback);
}

export async function loginWithEmail(email: string, password: string): Promise<User> {
  try {
    const cred = await signInWithEmailAndPassword(
      getFirebaseAuth(),
      email.trim(),
      password,
    );
    return cred.user;
  } catch (error) {
    throw toAppError(error, ErrorCode.AUTH_ERROR);
  }
}

export async function loginWithGoogle(): Promise<{
  user: User;
  isNewProfile: boolean;
}> {
  const auth = getFirebaseAuth();
  try {
    const cred = await signInWithPopup(auth, googleProvider);
    const existing = await ensureUserProfile(cred.user);
    return { user: cred.user, isNewProfile: !existing };
  } catch (error: unknown) {
    const code = (error as { code?: string })?.code;
    if (code === "auth/popup-blocked" || code === "auth/cancelled-popup-request") {
      // Fallback for mobile and popup-blocking environments
      await signInWithRedirect(auth, googleProvider);
      return new Promise(() => {});
    }
    throw toAppError(error, ErrorCode.AUTH_ERROR);
  }
}

export async function checkGoogleRedirectResult(): Promise<{
  user: User;
  isNewProfile: boolean;
} | null> {
  try {
    const cred = await getRedirectResult(getFirebaseAuth());
    if (!cred) return null;
    const existing = await ensureUserProfile(cred.user);
    return { user: cred.user, isNewProfile: !existing };
  } catch (error) {
    throw toAppError(error, ErrorCode.AUTH_ERROR);
  }
}

export async function sendPasswordReset(email: string): Promise<void> {
  try {
    await sendPasswordResetEmail(getFirebaseAuth(), email.trim());
  } catch (error) {
    throw toAppError(error, ErrorCode.AUTH_ERROR);
  }
}

async function claimChemmNumber(uid: string): Promise<string> {
  const db = getDb();
  for (let i = 0; i < MAX_CHEMM_ATTEMPTS; i++) {
    const chemmNumber = generateChemmNumber();
    const normalized = normalizeChemmNumber(chemmNumber);
    const ref = doc(db, "chemmNumbers", normalized);
    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (snap.exists()) throw new Error("COLLISION");
        tx.set(ref, {
          uid,
          chemmNumber: normalized,
          createdAt: serverTimestamp(),
        });
      });
      return normalized;
    } catch (error) {
      if (error instanceof Error && error.message === "COLLISION") continue;
      throw error;
    }
  }
  throw new AppError(ErrorCode.CONFLICT, "Could not allocate CHEMM Number");
}

async function provisionProfile(input: {
  user: User;
  email: string;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
}): Promise<UserProfile> {
  const username = normalizeUsername(input.username);
  const displayParsed = displayNameSchema.safeParse(input.displayName);
  const userParsed = usernameSchema.safeParse(username);
  if (!displayParsed.success) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      displayParsed.error.issues[0]?.message,
    );
  }
  if (!userParsed.success) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      userParsed.error.issues[0]?.message,
    );
  }

  const db = getDb();
  const usernameRef = doc(db, "usernames", username);
  const existing = await getDoc(usernameRef);
  if (existing.exists() && existing.data()?.uid !== input.user.uid) {
    throw new AppError(ErrorCode.CONFLICT, "Username taken");
  }

  // Already provisioned?
  const existingProfile = await getDoc(doc(db, "users", input.user.uid));
  if (existingProfile.exists()) {
    return existingProfile.data() as UserProfile;
  }

  const chemmNumber = await claimChemmNumber(input.user.uid);
  const keys = await publishPublicKeys(input.user.uid);
  const avatarUrl = input.avatarUrl ?? input.user.photoURL ?? null;

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(usernameRef);
    if (snap.exists() && snap.data()?.uid !== input.user.uid) {
      throw new AppError(ErrorCode.CONFLICT, "Username taken");
    }
    tx.set(usernameRef, {
      uid: input.user.uid,
      chemmNumber,
      createdAt: serverTimestamp(),
    });
    tx.set(doc(db, "users", input.user.uid), {
      uid: input.user.uid,
      chemmNumber,
      email: input.email,
      username,
      displayName: displayParsed.data,
      avatarUrl,
      bio: "",
      createdAt: serverTimestamp(),
      lastSeen: serverTimestamp(),
      isOnline: true,
      searchUsername: username,
      encryptionFingerprint: keys.fingerprint,
    });
    tx.set(doc(db, "publicProfiles", input.user.uid), {
      uid: input.user.uid,
      chemmNumber,
      username,
      searchUsername: username,
      displayName: displayParsed.data,
      avatarUrl,
      bio: "",
      isOnline: true,
      lastSeen: serverTimestamp(),
      encryptionFingerprint: keys.fingerprint,
      updatedAt: serverTimestamp(),
    });
  });

  await updateProfile(input.user, {
    displayName: displayParsed.data,
    photoURL: avatarUrl ?? undefined,
  });

  const snap = await getDoc(doc(db, "users", input.user.uid));
  return snap.data() as UserProfile;
}

export async function signupWithEmail(input: {
  email: string;
  password: string;
  username: string;
  displayName: string;
}): Promise<User> {
  const parsed = signupSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      parsed.error.issues[0]?.message,
    );
  }

  const { email, password, username, displayName } = parsed.data;
  let user: User;
  try {
    const cred = await createUserWithEmailAndPassword(
      getFirebaseAuth(),
      email,
      password,
    );
    user = cred.user;
  } catch (error) {
    throw toAppError(error, ErrorCode.AUTH_ERROR);
  }

  try {
    await provisionProfile({ user, email, username, displayName });
  } catch (error) {
    await user.delete().catch(() => undefined);
    throw new AppError(ErrorCode.AUTH_ERROR, userFacingMessage(error));
  }

  return user;
}

/** Finish Google (or incomplete) account: claim username + CHEMM + keys. */
export async function completeProfileSetup(input: {
  username: string;
  displayName: string;
}): Promise<UserProfile> {
  const user = getFirebaseAuth().currentUser;
  if (!user?.email) {
    throw new AppError(ErrorCode.AUTH_ERROR, "Sign in required");
  }
  try {
    return await provisionProfile({
      user,
      email: user.email,
      username: input.username,
      displayName: input.displayName,
      avatarUrl: user.photoURL,
    });
  } catch (error) {
    throw new AppError(ErrorCode.AUTH_ERROR, userFacingMessage(error));
  }
}

export async function logout(): Promise<void> {
  const auth = getFirebaseAuth();
  const user = auth.currentUser;
  if (user) {
    try {
      await updateDoc(doc(getDb(), "users", user.uid), {
        isOnline: false,
        lastSeen: serverTimestamp(),
      });
      await updateDoc(doc(getDb(), "publicProfiles", user.uid), {
        isOnline: false,
        lastSeen: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }).catch(() => undefined);
    } catch {
      /* best-effort */
    }
  }
  await signOut(auth);
}

export async function ensureUserProfile(user: User): Promise<UserProfile | null> {
  const snap = await getDoc(doc(getDb(), "users", user.uid));
  return snap.exists() ? (snap.data() as UserProfile) : null;
}
