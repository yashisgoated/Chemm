"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/features/auth/AuthProvider";
import { WebRTCService, isWebRTCSupported } from "@/services/webrtc/WebRTCService";
import {
  addIceCandidate,
  cleanupStaleCalls,
  createCall,
  endCall,
  setCallAnswer,
  subscribeToCall,
  subscribeToIceCandidates,
  subscribeToIncomingCalls,
  updateCallStatus,
} from "@/services/firebase/calls";
import { getUserById } from "@/services/firebase/users";
import {
  CALL_CONNECT_TIMEOUT_MS,
  CALL_RING_TIMEOUT_MS,
} from "@/lib/constants";
import { friendlyError } from "@/lib/utils";
import { endReasonMessage, transitionCallState } from "./callStateMachine";
import type {
  CallEndReason,
  CallSignaling,
  CallStatus,
  CallUiState,
  UserProfile,
} from "@/types";

interface CallContextValue {
  uiState: CallUiState;
  activeCall: CallSignaling | null;
  remoteProfile: UserProfile | null;
  muted: boolean;
  error: string | null;
  durationSeconds: number;
  remoteStream: MediaStream | null;
  supported: boolean;
  startCall: (callee: UserProfile) => Promise<void>;
  acceptCall: () => Promise<void>;
  declineCall: () => Promise<void>;
  cancelCall: () => Promise<void>;
  hangup: () => Promise<void>;
  toggleMute: () => void;
  clearError: () => void;
}

const CallContext = createContext<CallContextValue | null>(null);

function toLiteProfile(
  uid: string,
  info: {
    displayName: string;
    username: string;
    avatarUrl: string | null;
    chemmNumber?: string;
  },
): UserProfile {
  return {
    uid,
    email: "",
    chemmNumber: info.chemmNumber ?? "",
    username: info.username,
    displayName: info.displayName,
    avatarUrl: info.avatarUrl,
    bio: "",
    createdAt: null,
    lastSeen: null,
    isOnline: false,
    searchUsername: info.username,
    encryptionFingerprint: null,
  };
}

export function CallProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const [uiState, setUiState] = useState<CallUiState>("idle");
  const [activeCall, setActiveCall] = useState<CallSignaling | null>(null);
  const [remoteProfile, setRemoteProfile] = useState<UserProfile | null>(null);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const webrtcRef = useRef<WebRTCService | null>(null);
  const callIdRef = useRef<string | null>(null);
  const roleRef = useRef<"caller" | "callee" | null>(null);
  const unsubscribersRef = useRef<Array<() => void>>([]);
  const ringTimeoutRef = useRef<number | null>(null);
  const connectTimeoutRef = useRef<number | null>(null);
  const durationTimerRef = useRef<number | null>(null);
  const connectedAtRef = useRef<number | null>(null);
  const endingRef = useRef(false);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const uiStateRef = useRef<CallUiState>("idle");
  const profileRef = useRef(profile);
  const remoteProfileRef = useRef(remoteProfile);
  const answerAppliedRef = useRef(false);

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  useEffect(() => {
    remoteProfileRef.current = remoteProfile;
  }, [remoteProfile]);

  useEffect(() => {
    uiStateRef.current = uiState;
  }, [uiState]);

  const supported = typeof window !== "undefined" && isWebRTCSupported();

  const setStateSafe = useCallback((next: CallUiState) => {
    setUiState((prev) => {
      const resolved = transitionCallState(prev, next);
      uiStateRef.current = resolved;
      return resolved;
    });
  }, []);

  const clearTimers = useCallback(() => {
    if (ringTimeoutRef.current) window.clearTimeout(ringTimeoutRef.current);
    if (connectTimeoutRef.current) window.clearTimeout(connectTimeoutRef.current);
    if (durationTimerRef.current) window.clearInterval(durationTimerRef.current);
    ringTimeoutRef.current = null;
    connectTimeoutRef.current = null;
    durationTimerRef.current = null;
  }, []);

  const clearSubscriptions = useCallback(() => {
    unsubscribersRef.current.forEach((u) => u());
    unsubscribersRef.current = [];
  }, []);

  const cleanupMedia = useCallback(async () => {
    clearTimers();
    clearSubscriptions();
    answerAppliedRef.current = false;
    if (webrtcRef.current) {
      await webrtcRef.current.cleanup();
      webrtcRef.current = null;
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }
    setRemoteStream(null);
    setMuted(false);
    connectedAtRef.current = null;
    setDurationSeconds(0);
    callIdRef.current = null;
    roleRef.current = null;
    endingRef.current = false;
  }, [clearSubscriptions, clearTimers]);

  const startDurationTimer = useCallback(() => {
    if (connectedAtRef.current) return;
    connectedAtRef.current = Date.now();
    durationTimerRef.current = window.setInterval(() => {
      if (!connectedAtRef.current) return;
      setDurationSeconds(Math.floor((Date.now() - connectedAtRef.current) / 1000));
    }, 1000);
  }, []);

  const finishCall = useCallback(
    async (input: {
      status: CallStatus;
      endReason: CallEndReason;
      ui?: CallUiState;
      message?: string;
    }) => {
      if (endingRef.current) return;
      endingRef.current = true;

      const callId = callIdRef.current;
      const me = profileRef.current;
      const peer = remoteProfileRef.current;
      const duration =
        connectedAtRef.current != null
          ? Math.floor((Date.now() - connectedAtRef.current) / 1000)
          : 0;

      if (callId && me && peer) {
        const caller = roleRef.current === "caller" ? me : peer;
        const callee = roleRef.current === "caller" ? peer : me;
        try {
          await endCall({
            callId,
            status: input.status,
            endReason: input.endReason,
            durationSeconds: duration,
            caller,
            callee,
          });
        } catch {
          // ignore
        }
      }

      await cleanupMedia();
      setActiveCall(null);
      setRemoteProfile(null);
      setStateSafe(input.ui ?? "ended");
      if (input.message) setError(input.message);
      window.setTimeout(() => setStateSafe("idle"), 1400);
    },
    [cleanupMedia, setStateSafe],
  );

  const attachRemoteAudio = useCallback((stream: MediaStream) => {
    setRemoteStream(stream);
    const play = (audio: HTMLAudioElement) => {
      audio.srcObject = stream;
      void audio.play().catch(() => undefined);
    };
    if (remoteAudioRef.current) {
      play(remoteAudioRef.current);
      return;
    }
    const audio = new Audio();
    audio.autoplay = true;
    audio.setAttribute("playsinline", "true");
    remoteAudioRef.current = audio;
    play(audio);
  }, []);

  const createService = useCallback(
    (role: "caller" | "callee") => {
      const service = new WebRTCService();
      service.configure(
        {
          onRemoteStream: attachRemoteAudio,
          onIceCandidate: (candidate) => {
            const callId = callIdRef.current;
            const uid = profileRef.current?.uid;
            if (!callId || !uid) return;
            void addIceCandidate(callId, uid, candidate.toJSON());
          },
          onConnectionState: (state) => {
            if (state === "connected") {
              setStateSafe("connected");
              startDurationTimer();
              if (connectTimeoutRef.current) {
                window.clearTimeout(connectTimeoutRef.current);
                connectTimeoutRef.current = null;
              }
              const callId = callIdRef.current;
              if (callId) void updateCallStatus(callId, "connected");
            } else if (state === "reconnecting") {
              setStateSafe("reconnecting");
            } else if (state === "failed") {
              void finishCall({
                status: "failed",
                endReason: "failed",
                ui: "failed",
                message: "Could not establish a peer connection.",
              });
            }
          },
          onError: (err) => setError(friendlyError(err, "Call error")),
        },
        { polite: role === "callee" },
      );
      webrtcRef.current = service;
      return service;
    },
    [attachRemoteAudio, finishCall, setStateSafe, startDurationTimer],
  );

  const watchCallDocument = useCallback(
    (callId: string) => {
      const unsub = subscribeToCall(callId, (call) => {
        setActiveCall(call);
        if (!call) return;

        if (
          ["ended", "declined", "missed", "failed", "cancelled"].includes(
            call.status,
          )
        ) {
          void cleanupMedia().then(() => {
            setActiveCall(null);
            setRemoteProfile(null);
            setError(endReasonMessage(call.endReason));
            setStateSafe(call.status === "failed" ? "failed" : "ended");
            window.setTimeout(() => setStateSafe("idle"), 1400);
          });
          return;
        }

        if (
          roleRef.current === "caller" &&
          call.answer &&
          webrtcRef.current &&
          !answerAppliedRef.current
        ) {
          answerAppliedRef.current = true;
          void webrtcRef.current.setRemoteDescription(call.answer).then(() => {
            setStateSafe("connecting");
            void updateCallStatus(callId, "connecting");
          });
        }

        if (call.status === "connecting") setStateSafe("connecting");
        if (call.status === "connected") {
          setStateSafe("connected");
          startDurationTimer();
        }
      });
      unsubscribersRef.current.push(unsub);
    },
    [cleanupMedia, setStateSafe, startDurationTimer],
  );

  const watchIce = useCallback((callId: string, uid: string) => {
    const unsub = subscribeToIceCandidates(callId, uid, (candidates) => {
      const service = webrtcRef.current;
      if (!service) return;
      candidates.forEach((c) => {
        void service.addIceCandidate(c.candidate);
      });
    });
    unsubscribersRef.current.push(unsub);
  }, []);

  const startCall = useCallback(
    async (callee: UserProfile) => {
      const me = profileRef.current;
      if (!me) return;
      if (!supported) {
        setError("This browser doesn’t support voice calling.");
        return;
      }
      if (uiStateRef.current !== "idle") {
        setError("You’re already in a call.");
        return;
      }

      try {
        setError(null);
        setRemoteProfile(callee);
        roleRef.current = "caller";
        setStateSafe("outgoing");

        const service = createService("caller");
        const offer = await service.createOffer();
        const callId = await createCall({ caller: me, callee, offer });
        callIdRef.current = callId;

        watchCallDocument(callId);
        watchIce(callId, me.uid);

        ringTimeoutRef.current = window.setTimeout(() => {
          if (!connectedAtRef.current) {
            void finishCall({
              status: "missed",
              endReason: "timeout",
              ui: "ended",
              message: "No answer",
            });
          }
        }, CALL_RING_TIMEOUT_MS);

        connectTimeoutRef.current = window.setTimeout(() => {
          if (!connectedAtRef.current) {
            void finishCall({
              status: "failed",
              endReason: "failed",
              ui: "failed",
              message: "Connection timed out",
            });
          }
        }, CALL_RING_TIMEOUT_MS + CALL_CONNECT_TIMEOUT_MS);
      } catch (err) {
        await cleanupMedia();
        setRemoteProfile(null);
        setStateSafe("failed");
        setError(friendlyError(err, "Could not start call."));
        window.setTimeout(() => setStateSafe("idle"), 1400);
      }
    },
    [
      cleanupMedia,
      createService,
      finishCall,
      setStateSafe,
      supported,
      watchCallDocument,
      watchIce,
    ],
  );

  const acceptCall = useCallback(async () => {
    const me = profileRef.current;
    const call = activeCall;
    if (!me || !call?.offer) return;
    if (!supported) {
      setError("This browser doesn’t support voice calling.");
      return;
    }

    try {
      setError(null);
      roleRef.current = "callee";
      callIdRef.current = call.id;
      setStateSafe("connecting");

      const caller = await getUserById(call.callerId);
      setRemoteProfile(caller ?? toLiteProfile(call.callerId, call.callerInfo));

      clearSubscriptions();
      const service = createService("callee");
      const answer = await service.createAnswer(call.offer);
      await setCallAnswer(call.id, answer);

      watchCallDocument(call.id);
      watchIce(call.id, me.uid);

      if (ringTimeoutRef.current) {
        window.clearTimeout(ringTimeoutRef.current);
        ringTimeoutRef.current = null;
      }

      connectTimeoutRef.current = window.setTimeout(() => {
        if (!connectedAtRef.current) {
          void finishCall({
            status: "failed",
            endReason: "failed",
            ui: "failed",
            message: "Connection timed out",
          });
        }
      }, CALL_CONNECT_TIMEOUT_MS);
    } catch (err) {
      await finishCall({
        status: "failed",
        endReason: "failed",
        ui: "failed",
        message: friendlyError(err, "Could not accept call."),
      });
    }
  }, [
    activeCall,
    clearSubscriptions,
    createService,
    finishCall,
    setStateSafe,
    supported,
    watchCallDocument,
    watchIce,
  ]);

  const declineCall = useCallback(async () => {
    if (!activeCall) return;
    callIdRef.current = activeCall.id;
    roleRef.current = "callee";
    if (!remoteProfileRef.current) {
      setRemoteProfile(toLiteProfile(activeCall.callerId, activeCall.callerInfo));
    }
    await finishCall({
      status: "declined",
      endReason: "declined",
      ui: "ended",
      message: "Call declined",
    });
  }, [activeCall, finishCall]);

  const cancelCall = useCallback(async () => {
    await finishCall({
      status: "cancelled",
      endReason: "cancelled",
      ui: "ended",
      message: "Call cancelled",
    });
  }, [finishCall]);

  const hangup = useCallback(async () => {
    await finishCall({
      status: "ended",
      endReason: "hangup",
      ui: "ended",
    });
  }, [finishCall]);

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      webrtcRef.current?.setMuted(next);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!profile) return;
    void cleanupStaleCalls(profile.uid);

    const unsub = subscribeToIncomingCalls(profile.uid, (call) => {
      if (!call) return;

      if (uiStateRef.current !== "idle" && callIdRef.current !== call.id) {
        void endCall({
          callId: call.id,
          status: "missed",
          endReason: "busy",
          caller: toLiteProfile(call.callerId, call.callerInfo),
          callee: profile,
        });
        return;
      }

      if (uiStateRef.current !== "idle") return;

      setActiveCall(call);
      setRemoteProfile(toLiteProfile(call.callerId, call.callerInfo));
      roleRef.current = "callee";
      callIdRef.current = call.id;
      setStateSafe("ringing");

      if (ringTimeoutRef.current) window.clearTimeout(ringTimeoutRef.current);
      ringTimeoutRef.current = window.setTimeout(() => {
        void finishCall({
          status: "missed",
          endReason: "timeout",
          ui: "ended",
          message: "Missed call",
        });
      }, CALL_RING_TIMEOUT_MS);
    });

    return () => unsub();
  }, [finishCall, profile, setStateSafe]);

  useEffect(() => {
    return () => {
      void cleanupMedia();
    };
  }, [cleanupMedia]);

  // Page refresh / close: best-effort end active call
  useEffect(() => {
    const onPageHide = () => {
      const callId = callIdRef.current;
      if (!callId) return;
      void updateCallStatus(callId, "ended", {
        endReason: "disconnected",
        offer: null,
        answer: null,
      });
    };
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, []);

  const value = useMemo<CallContextValue>(
    () => ({
      uiState,
      activeCall,
      remoteProfile,
      muted,
      error,
      durationSeconds,
      remoteStream,
      supported,
      startCall,
      acceptCall,
      declineCall,
      cancelCall,
      hangup,
      toggleMute,
      clearError: () => setError(null),
    }),
    [
      uiState,
      activeCall,
      remoteProfile,
      muted,
      error,
      durationSeconds,
      remoteStream,
      supported,
      startCall,
      acceptCall,
      declineCall,
      cancelCall,
      hangup,
      toggleMute,
    ],
  );

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
}

export function useCall(): CallContextValue {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error("useCall must be used within CallProvider");
  return ctx;
}
