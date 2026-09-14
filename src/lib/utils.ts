import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}

export function conversationIdFor(uidA: string, uidB: string): string {
  return [uidA, uidB].sort().join("_");
}

export function getOtherParticipant(
  participants: string[],
  currentUid: string,
): string {
  return participants.find((id) => id !== currentUid) ?? participants[0] ?? "";
}

const USERNAME_REGEX = /^[a-z0-9_]{3,20}$/;

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

export function validateUsername(username: string): string | null {
  const normalized = normalizeUsername(username);
  if (!USERNAME_REGEX.test(normalized)) {
    return "Username must be 3–20 characters: lowercase letters, numbers, underscores.";
  }
  return null;
}

export function validateDisplayName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 40) {
    return "Display name must be 1–40 characters.";
  }
  return null;
}

export const MAX_MESSAGE_LENGTH = 2000;

export function validateMessage(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return "Message cannot be empty.";
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    return `Message must be under ${MAX_MESSAGE_LENGTH} characters.`;
  }
  return null;
}

export function formatRelativeTime(date: Date | null | undefined): string {
  if (!date) return "";
  const now = Date.now();
  const diff = Math.max(0, now - date.getTime());
  const seconds = Math.floor(diff / 1000);
  if (seconds < 45) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function formatMessageTime(date: Date | null | undefined): string {
  if (!date) return "";
  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatCallDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function formatLastSeen(
  isOnline: boolean,
  lastSeen: Date | null | undefined,
): string {
  if (isOnline) return "Online";
  if (!lastSeen) return "Offline";
  return `Last seen ${formatRelativeTime(lastSeen)}`;
}

export function debounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  waitMs: number,
): (...args: Args) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: Args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), waitMs);
  };
}

export function timestampToDate(
  value: { toDate?: () => Date; seconds?: number } | Date | null | undefined,
): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === "function") {
    try {
      return value.toDate();
    } catch {
      /* fall through */
    }
  }
  if (typeof value.seconds === "number") return new Date(value.seconds * 1000);
  return null;
}

export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

export async function compressImage(
  file: File,
  maxSize = 256,
  quality = 0.82,
): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not process image.");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) reject(new Error("Could not compress image."));
        else resolve(blob);
      },
      "image/jpeg",
      quality,
    );
  });
}

export function friendlyError(error: unknown, fallback: string): string {
  if (!error) return fallback;

  const message =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : fallback;

  // Direct .code field (raw Firebase errors)
  const code =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "string"
      ? (error as { code: string }).code
      : "";

  // AppError wraps the original Firebase message in .technical — extract code from it
  const technical =
    typeof error === "object" &&
    error !== null &&
    "technical" in error &&
    typeof (error as { technical: unknown }).technical === "string"
      ? (error as { technical: string }).technical
      : "";

  const map: Record<string, string> = {
    "auth/email-already-in-use": "That email is already registered.",
    "auth/invalid-email": "Please enter a valid email address.",
    "auth/weak-password": "Password must be at least 6 characters.",
    "auth/user-not-found": "No account found with that email.",
    "auth/wrong-password": "Incorrect password.",
    "auth/invalid-credential": "Incorrect email or password.",
    "auth/user-disabled": "This account has been disabled.",
    "auth/email-already-exists": "That email is already registered.",
    "auth/account-exists-with-different-credential":
      "An account already exists with a different sign-in method.",
    "auth/popup-closed-by-user": "Sign-in popup was closed. Please try again.",
    "auth/cancelled-popup-request": "Only one sign-in popup can be open at a time.",
    "auth/operation-not-allowed":
      "This sign-in method is not enabled. Please contact support.",
    "auth/too-many-requests": "Too many attempts. Please try again later.",
    "auth/network-request-failed": "Network error. Check your connection.",
    "auth/requires-recent-login":
      "For security, please sign in again before making this change.",
    "permission-denied": "You don't have permission to do that.",
    unavailable: "Service temporarily unavailable. Try again.",
    NotAllowedError: "Microphone permission was denied.",
    NotFoundError: "No microphone was found on this device.",
    NotReadableError: "Microphone is already in use by another app.",
    OverconstrainedError: "Could not access a usable microphone.",
    SecurityError: "Browser blocked microphone access on this page.",
  };

  // 1. Try the raw code (raw Firebase error)
  if (code && map[code]) return map[code]!;

  // 2. Try scanning the technical string for a known Firebase code
  //    (AppError stores the original Firebase error message in .technical)
  if (technical) {
    for (const key of Object.keys(map)) {
      if (technical.includes(key)) return map[key]!;
    }
  }

  // 3. Try scanning the message itself for a known code
  if (message) {
    for (const key of Object.keys(map)) {
      if (message.includes(key)) return map[key]!;
    }
  }

  if (map[message]) return map[message]!;
  if (message.includes("Permission denied")) return map["permission-denied"]!;
  // Avoid leaking internal "Authentication failed" sentinel — return the fallback instead
  if (message === "Authentication failed. Please try again.") return fallback;
  return message || fallback;
}

export function randomId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
