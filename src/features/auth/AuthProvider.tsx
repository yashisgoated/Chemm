"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { User } from "firebase/auth";
import {
  completeProfileSetup,
  checkGoogleRedirectResult,
  loginWithEmail,
  loginWithGoogle,
  logout as firebaseLogout,
  sendPasswordReset,
  signupWithEmail,
  subscribeToAuth,
} from "@/services/firebase/auth";
import {
  setPresence,
  subscribeToUser,
  syncPublicProfile,
  updateUserProfile,
  uploadAvatar,
} from "@/services/firebase/users";
import { registerDevice, touchDevice } from "@/services/firebase/devices";
import { isFirebaseConfigured } from "@/lib/mode";
import { PRESENCE_HEARTBEAT_MS } from "@/lib/constants";
import type { UserProfile } from "@/types";
import { publishPublicKeys } from "@/services/encryption/keys";

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  configured: boolean;
  /** Signed in but missing Firestore profile (typical after first Google sign-in). */
  needsProfileSetup: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginGoogle: () => Promise<void>;
  signup: (input: {
    email: string;
    password: string;
    username: string;
    displayName: string;
  }) => Promise<void>;
  completeSetup: (input: {
    username: string;
    displayName: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  refreshProfile: () => void;
  updateProfile: (
    updates: Partial<Pick<UserProfile, "displayName" | "bio">>,
  ) => Promise<void>;
  uploadAvatarFile: (file: File) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = isFirebaseConfigured();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(configured);
  const [profileEpoch, setProfileEpoch] = useState(0);
  const [needsProfileSetup, setNeedsProfileSetup] = useState(false);

  useEffect(() => {
    if (!configured) return;

    void checkGoogleRedirectResult()
      .then((res) => {
        if (res?.isNewProfile) {
          setNeedsProfileSetup(true);
        }
      })
      .catch(() => undefined);

    const unsub = subscribeToAuth((next) => {
      setUser(next);
      if (!next) {
        setProfile(null);
        setNeedsProfileSetup(false);
        setLoading(false);
      }
    });
    return unsub;
  }, [configured]);

  useEffect(() => {
    if (!configured || !user) return;
    const unsub = subscribeToUser(
      user.uid,
      (p) => {
        setProfile(p);
        setNeedsProfileSetup(!p);
        setLoading(false);
      },
      { self: true },
    );
    return unsub;
  }, [user, profileEpoch, configured]);

  useEffect(() => {
    if (!user || !profile) return;
    void publishPublicKeys(user.uid).catch(() => undefined);
    void registerDevice(user.uid).catch(() => undefined);
    void touchDevice(user.uid).catch(() => undefined);
  }, [user, profile]);

  useEffect(() => {
    if (!profile) return;
    void syncPublicProfile(profile).catch(() => undefined);
  }, [profile]);

  useEffect(() => {
    if (!user || !profile) return;

    let cancelled = false;
    const beat = async () => {
      if (cancelled || document.visibilityState === "hidden") return;
      try {
        await setPresence(user.uid, true);
      } catch {
        /* ignore */
      }
    };
    void beat();
    const interval = window.setInterval(beat, PRESENCE_HEARTBEAT_MS);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") void setPresence(user.uid, false);
      else void beat();
    };
    document.addEventListener("visibilitychange", onVisibility);
    const onHide = () => void setPresence(user.uid, false);
    window.addEventListener("pagehide", onHide);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onHide);
      void setPresence(user.uid, false);
    };
  }, [user, profile]);

  const login = useCallback(async (email: string, password: string) => {
    await loginWithEmail(email, password);
  }, []);

  const loginGoogle = useCallback(async () => {
    const { isNewProfile } = await loginWithGoogle();
    if (isNewProfile) setNeedsProfileSetup(true);
  }, []);

  const signup = useCallback(
    async (input: {
      email: string;
      password: string;
      username: string;
      displayName: string;
    }) => {
      await signupWithEmail(input);
    },
    [],
  );

  const completeSetup = useCallback(
    async (input: { username: string; displayName: string }) => {
      const p = await completeProfileSetup(input);
      setProfile(p);
      setNeedsProfileSetup(false);
      setProfileEpoch((n) => n + 1);
    },
    [],
  );

  const logout = useCallback(async () => {
    await firebaseLogout();
    setProfile(null);
    setNeedsProfileSetup(false);
  }, []);

  const handleResetPassword = useCallback(async (email: string) => {
    await sendPasswordReset(email);
  }, []);

  const updateProfile = useCallback(
    async (updates: Partial<Pick<UserProfile, "displayName" | "bio">>) => {
      if (!user) return;
      await updateUserProfile(user.uid, updates);
    },
    [user],
  );

  const uploadAvatarFile = useCallback(
    async (file: File) => {
      if (!user) return;
      await uploadAvatar(user.uid, file);
    },
    [user],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      profile,
      loading,
      configured,
      needsProfileSetup,
      login,
      loginGoogle,
      signup,
      completeSetup,
      logout,
      resetPassword: handleResetPassword,
      refreshProfile: () => setProfileEpoch((n) => n + 1),
      updateProfile,
      uploadAvatarFile,
    }),
    [
      user,
      profile,
      loading,
      configured,
      needsProfileSetup,
      login,
      loginGoogle,
      signup,
      completeSetup,
      logout,
      handleResetPassword,
      updateProfile,
      uploadAvatarFile,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
