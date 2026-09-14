import type { CallEndReason, CallUiState } from "@/types";

const ALLOWED: Record<CallUiState, CallUiState[]> = {
  idle: ["outgoing", "ringing"],
  outgoing: ["connecting", "ended", "failed", "idle"],
  ringing: ["connecting", "ended", "failed", "idle"],
  connecting: ["connected", "reconnecting", "ended", "failed", "idle"],
  connected: ["reconnecting", "ended", "failed", "idle"],
  reconnecting: ["connected", "ended", "failed", "idle"],
  ended: ["idle"],
  failed: ["idle"],
};

export function canTransition(from: CallUiState, to: CallUiState): boolean {
  if (from === to) return true;
  return ALLOWED[from]?.includes(to) ?? false;
}

export function transitionCallState(
  from: CallUiState,
  to: CallUiState,
): CallUiState {
  return canTransition(from, to) ? to : from;
}

export function statusLabel(state: CallUiState): string {
  switch (state) {
    case "idle":
      return "";
    case "outgoing":
      return "Calling…";
    case "ringing":
      return "Incoming call";
    case "connecting":
      return "Connecting…";
    case "connected":
      return "Connected";
    case "reconnecting":
      return "Reconnecting…";
    case "ended":
      return "Call ended";
    case "failed":
      return "Call failed";
    default:
      return "";
  }
}

export function endReasonMessage(reason: CallEndReason | null | undefined): string {
  switch (reason) {
    case "declined":
      return "Call declined";
    case "cancelled":
      return "Call cancelled";
    case "timeout":
      return "No answer";
    case "failed":
      return "Could not connect";
    case "disconnected":
      return "Connection lost";
    case "busy":
      return "User is busy";
    case "hangup":
      return "Call ended";
    default:
      return "Call ended";
  }
}
