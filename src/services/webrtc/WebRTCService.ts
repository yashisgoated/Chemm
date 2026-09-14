import { AUDIO_CONSTRAINTS, fetchIceServers, getIceServers } from "@/lib/constants";

export type WebRTCConnectionState =
  | "new"
  | "connecting"
  | "connected"
  | "disconnected"
  | "failed"
  | "closed"
  | "reconnecting";

export interface WebRTCServiceEvents {
  onLocalStream?: (stream: MediaStream) => void;
  onRemoteStream?: (stream: MediaStream) => void;
  onIceCandidate?: (candidate: RTCIceCandidate) => void;
  onConnectionState?: (state: WebRTCConnectionState) => void;
  onIceConnectionState?: (state: RTCIceConnectionState) => void;
  onError?: (error: Error) => void;
}

/**
 * Browser WebRTC peer connection abstraction.
 * UI must not invent peer-connection logic — use this service.
 */
export class WebRTCService {
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private events: WebRTCServiceEvents = {};
  private makingOffer = false;
  private isPolite = false;
  private disposed = false;
  private iceRestartAttempts = 0;
  private readonly maxIceRestarts = 2;

  configure(events: WebRTCServiceEvents, options?: { polite?: boolean }): void {
    this.events = events;
    this.isPolite = options?.polite ?? false;
  }

  async initPeerConnection(): Promise<RTCPeerConnection> {
    this.ensureNotDisposed();
    if (this.pc) return this.pc;

    let iceServers = getIceServers();
    try {
      iceServers = await fetchIceServers();
    } catch {
      /* keep STUN defaults */
    }

    const pc = new RTCPeerConnection({
      iceServers,
      iceCandidatePoolSize: 4,
    });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.events.onIceCandidate?.(event.candidate);
      }
    };

    pc.ontrack = (event) => {
      if (!this.remoteStream) {
        this.remoteStream = new MediaStream();
      }
      event.streams[0]?.getTracks().forEach((track) => {
        const already = this.remoteStream!.getTracks().some((t) => t.id === track.id);
        if (!already) this.remoteStream!.addTrack(track);
      });
      if (!event.streams[0] && event.track) {
        this.remoteStream.addTrack(event.track);
      }
      this.events.onRemoteStream?.(this.remoteStream);
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState as WebRTCConnectionState;
      if (state === "disconnected") {
        this.events.onConnectionState?.("reconnecting");
        void this.tryIceRestart();
        return;
      }
      this.events.onConnectionState?.(state);
    };

    pc.oniceconnectionstatechange = () => {
      this.events.onIceConnectionState?.(pc.iceConnectionState);
      if (pc.iceConnectionState === "failed") {
        void this.tryIceRestart();
      }
    };

    this.pc = pc;
    return pc;
  }

  async getLocalAudioStream(): Promise<MediaStream> {
    this.ensureNotDisposed();
    if (this.localStream) return this.localStream;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: AUDIO_CONSTRAINTS,
        video: false,
      });
      this.localStream = stream;
      this.events.onLocalStream?.(stream);
      return stream;
    } catch (error) {
      const err =
        error instanceof DOMException
          ? new Error(error.name)
          : error instanceof Error
            ? error
            : new Error("Microphone unavailable");
      this.events.onError?.(err);
      throw err;
    }
  }

  async attachLocalAudio(): Promise<MediaStream> {
    const pc = await this.initPeerConnection();
    const stream = await this.getLocalAudioStream();
    for (const track of stream.getAudioTracks()) {
      const sender = pc.getSenders().find((s) => s.track?.kind === "audio");
      if (sender) {
        await sender.replaceTrack(track);
      } else {
        pc.addTrack(track, stream);
      }
    }
    return stream;
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    const pc = await this.initPeerConnection();
    await this.attachLocalAudio();
    this.makingOffer = true;
    try {
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false,
      });
      await pc.setLocalDescription(offer);
      return pc.localDescription!.toJSON();
    } finally {
      this.makingOffer = false;
    }
  }

  async createAnswer(
    remoteOffer: RTCSessionDescriptionInit,
  ): Promise<RTCSessionDescriptionInit> {
    const pc = await this.initPeerConnection();
    await this.attachLocalAudio();
    await pc.setRemoteDescription(remoteOffer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    return pc.localDescription!.toJSON();
  }

  async setRemoteDescription(desc: RTCSessionDescriptionInit): Promise<void> {
    const pc = await this.initPeerConnection();
    const readyForOffer =
      !this.makingOffer &&
      (pc.signalingState === "stable" || this.isPolite);

    if (desc.type === "offer" && !readyForOffer) {
      // Glare: ignore impolite colliding offer
      return;
    }

    await pc.setRemoteDescription(desc);
  }

  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    const pc = await this.initPeerConnection();
    if (!candidate.candidate) return;
    try {
      await pc.addIceCandidate(candidate);
    } catch (error) {
      // Ignore duplicates / late candidates after close
      if (pc.signalingState === "closed") return;
      this.events.onError?.(
        error instanceof Error ? error : new Error("ICE candidate failed"),
      );
    }
  }

  setMuted(muted: boolean): void {
    this.localStream?.getAudioTracks().forEach((track) => {
      track.enabled = !muted;
    });
  }

  isMuted(): boolean {
    const track = this.localStream?.getAudioTracks()[0];
    return track ? !track.enabled : false;
  }

  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  getRemoteStream(): MediaStream | null {
    return this.remoteStream;
  }

  async setAudioOutput(element: HTMLAudioElement, deviceId: string): Promise<void> {
    const mediaEl = element as HTMLAudioElement & {
      setSinkId?: (id: string) => Promise<void>;
    };
    if (typeof mediaEl.setSinkId === "function") {
      await mediaEl.setSinkId(deviceId);
    }
  }

  async listAudioOutputDevices(): Promise<MediaDeviceInfo[]> {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === "audiooutput");
  }

  private async tryIceRestart(): Promise<void> {
    if (!this.pc || this.disposed) return;
    if (this.iceRestartAttempts >= this.maxIceRestarts) {
      this.events.onConnectionState?.("failed");
      return;
    }
    this.iceRestartAttempts += 1;
    try {
      this.events.onConnectionState?.("reconnecting");
      const offer = await this.pc.createOffer({ iceRestart: true });
      await this.pc.setLocalDescription(offer);
      // Caller must re-publish this offer via signaling if needed.
      // For V1 we rely on ICE restart within existing session where possible.
    } catch {
      this.events.onConnectionState?.("failed");
    }
  }

  async cleanup(): Promise<void> {
    this.disposed = true;
    this.events = {};

    this.localStream?.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch {
        // ignore
      }
    });
    this.localStream = null;

    this.remoteStream?.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch {
        // ignore
      }
    });
    this.remoteStream = null;

    if (this.pc) {
      try {
        this.pc.onicecandidate = null;
        this.pc.ontrack = null;
        this.pc.onconnectionstatechange = null;
        this.pc.oniceconnectionstatechange = null;
        this.pc.close();
      } catch {
        // ignore
      }
      this.pc = null;
    }
  }

  private ensureNotDisposed(): void {
    if (this.disposed) {
      throw new Error("WebRTCService already cleaned up.");
    }
  }
}

export function isWebRTCSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof RTCPeerConnection !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia
  );
}
