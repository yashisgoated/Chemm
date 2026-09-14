import type { IceServerConfig } from "@/types";

export const APP_NAME = "Chemm";
export const APP_TAGLINE = "Crystal-clear calls & messages";

export const CALL_RING_TIMEOUT_MS = 45_000;
export const CALL_CONNECT_TIMEOUT_MS = 30_000;
export const STALE_CALL_MS = 90_000;
export const TYPING_TTL_MS = 3_000;
export const PRESENCE_HEARTBEAT_MS = 25_000;
export const MESSAGE_PAGE_SIZE = 40;
export const SEARCH_DEBOUNCE_MS = 280;

export function getIceServers(): RTCIceServer[] {
  const servers: IceServerConfig[] = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ];

  // Legacy static TURN (discouraged). Prefer /api/turn/credentials.
  const turnUrls = process.env.NEXT_PUBLIC_TURN_URLS;
  const turnUsername = process.env.NEXT_PUBLIC_TURN_USERNAME;
  const turnCredential = process.env.NEXT_PUBLIC_TURN_CREDENTIAL;

  if (turnUrls && turnUsername && turnCredential) {
    servers.push({
      urls: turnUrls.split(",").map((u) => u.trim()).filter(Boolean),
      username: turnUsername,
      credential: turnCredential,
    });
  }

  return servers as RTCIceServer[];
}

/** Fetch short-lived ICE servers from the server (preferred). */
export async function fetchIceServers(): Promise<RTCIceServer[]> {
  try {
    const { authHeaders } = await import("@/lib/apiAuth");
    const res = await fetch("/api/turn/credentials", {
      headers: await authHeaders(),
    });
    if (!res.ok) return getIceServers();
    const data = (await res.json()) as { iceServers?: RTCIceServer[] };
    if (data.iceServers?.length) return data.iceServers;
  } catch {
    /* fall through */
  }
  return getIceServers();
}

export const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 1,
};
