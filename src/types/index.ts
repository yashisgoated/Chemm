import type { Timestamp } from "firebase/firestore";

export type PresenceStatus = "online" | "away" | "offline";

export type ContactRequestStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "blocked";

export interface UserProfile {
  uid: string;
  /** Permanent public ID, e.g. CHEMM-7K4X92 — immutable after create */
  chemmNumber: string;
  email: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string;
  createdAt: Timestamp | null;
  lastSeen: Timestamp | null;
  isOnline: boolean;
  searchUsername: string;
  /** Public encryption identity fingerprint (hex), not a secret */
  encryptionFingerprint: string | null;
}

/** Limited profile returned by CHEMM lookup / search */
export interface PublicUserPreview {
  uid: string;
  chemmNumber: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  isOnline: boolean;
  lastSeen: Timestamp | null;
  encryptionFingerprint: string | null;
}

export interface Contact {
  uid: string;
  chemmNumber: string;
  addedAt: Timestamp | null;
  displayName: string;
  username: string;
  avatarUrl: string | null;
  status: ContactRequestStatus;
}

export interface ContactRequest {
  id: string;
  fromUid: string;
  toUid: string;
  status: ContactRequestStatus;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
  fromDisplayName: string;
  fromUsername: string;
  fromChemmNumber: string;
  fromAvatarUrl: string | null;
}

export type MessageStatus =
  | "sending"
  | "sent"
  | "delivered"
  | "read"
  | "failed"
  | "queued";

/** Wire format stored in Firestore — never plaintext body */
export interface EncryptedMessageDoc {
  id: string;
  conversationId: string;
  senderId: string;
  clientMessageId: string;
  /** libsodium crypto_box ciphertext (base64) */
  ciphertext: string;
  /** nonce (base64) */
  nonce: string;
  /** ephemeral public key for FS (base64), when used */
  ephemeralPk?: string;
  /** protocol version */
  v: number;
  createdAt: Timestamp | null;
  status: MessageStatus;
  reactions?: Record<string, string[]>;
  /** Soft-delete tombstone for everyone */
  deletedForEveryone?: boolean;
  /** Per-user hide map */
  deletedFor?: Record<string, boolean>;
  editedAt?: Timestamp | null;
  replyTo?: string | null;
}

/** Decrypted in-memory message for UI */
export interface ChatMessage {
  id: string;
  clientId?: string;
  senderId: string;
  text: string;
  createdAt: Timestamp | null;
  status: MessageStatus;
  reactions?: Record<string, string[]>;
  encrypted?: boolean;
  decryptError?: boolean;
  deletedForEveryone?: boolean;
  editedAt?: Timestamp | null;
  replyTo?: string | null;
}

export interface PrivacySettings {
  uid: string;
  whoCanMessage: "everyone" | "contacts";
  whoCanCall: "everyone" | "contacts";
  showLastSeen: boolean;
  showOnline: boolean;
  readReceipts: boolean;
  updatedAt: Timestamp | null;
}

export interface DeviceRecord {
  uid: string;
  deviceId: string;
  label: string;
  platform: string;
  lastActiveAt: Timestamp | null;
  createdAt: Timestamp | null;
  fingerprintHint?: string | null;
}

export interface GroupMeta {
  id: string;
  name: string;
  description: string;
  createdBy: string;
  avatarUrl: string | null;
  memberCount: number;
  /** Denormalized UID list for efficient array-contains queries */
  memberUids: string[];
  e2ee: true;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface GroupMember {
  uid: string;
  role: "owner" | "admin" | "member";
  displayName: string;
  username: string;
  avatarUrl: string | null;
  joinedAt: Timestamp | null;
}

export type GroupInvitationStatus = "pending" | "accepted" | "declined";

export interface GroupInvitation {
  id: string;
  groupId: string;
  groupName: string;
  groupAvatarUrl: string | null;
  invitedUid: string;
  invitedByUid: string;
  invitedByDisplayName: string;
  invitedByChemmNumber: string;
  status: GroupInvitationStatus;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface GroupMessage {
  id: string;
  groupId: string;
  senderId: string;
  senderDisplayName: string;
  senderAvatarUrl: string | null;
  text: string;
  /** "text" for normal, "system" for join/leave/rename events */
  type: "text" | "system";
  createdAt: Timestamp | null;
  clientMessageId?: string;
  status: MessageStatus;
  reactions?: Record<string, string[]>;
  deletedForEveryone?: boolean;
  editedAt?: Timestamp | null;
  replyTo?: string | null;
}

export interface ConversationLastMessage {
  /** Preview: ciphertext marker or local decrypted cache — never store plaintext server-side */
  previewCipher?: string;
  /** Non-sensitive type only */
  type: "text" | "call" | "system";
  senderId: string;
  createdAt: Timestamp | null;
}

export interface Conversation {
  id: string;
  participants: [string, string];
  participantInfo: Record<
    string,
    {
      displayName: string;
      username: string;
      avatarUrl: string | null;
      chemmNumber: string;
    }
  >;
  lastMessage: ConversationLastMessage | null;
  unreadCount: Record<string, number>;
  typing: Record<string, number>;
  pinnedMessageIds?: string[];
  updatedAt: Timestamp | null;
  createdAt: Timestamp | null;
  e2ee: true;
}

export type CallStatus =
  | "ringing"
  | "connecting"
  | "connected"
  | "ended"
  | "declined"
  | "missed"
  | "failed"
  | "cancelled";

export type CallUiState =
  | "idle"
  | "outgoing"
  | "ringing"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "ended"
  | "failed";

export type CallEndReason =
  | "hangup"
  | "declined"
  | "cancelled"
  | "timeout"
  | "failed"
  | "disconnected"
  | "busy";

export interface CallSignaling {
  id: string;
  callerId: string;
  calleeId: string;
  status: CallStatus;
  offer: RTCSessionDescriptionInit | null;
  answer: RTCSessionDescriptionInit | null;
  callerInfo: {
    displayName: string;
    username: string;
    avatarUrl: string | null;
    chemmNumber: string;
  };
  calleeInfo: {
    displayName: string;
    username: string;
    avatarUrl: string | null;
    chemmNumber: string;
  };
  createdAt: Timestamp | null;
  answeredAt: Timestamp | null;
  endedAt: Timestamp | null;
  durationSeconds: number;
  endReason: CallEndReason | null;
}

export interface IceCandidateDoc {
  id: string;
  candidate: RTCIceCandidateInit;
  from: string;
  createdAt: Timestamp | null;
}

export interface CallHistoryItem {
  id: string;
  peerId: string;
  peerDisplayName: string;
  peerUsername: string;
  peerChemmNumber: string;
  peerAvatarUrl: string | null;
  direction: "outgoing" | "incoming";
  status: CallStatus;
  durationSeconds: number;
  createdAt: Timestamp | null;
  endReason: CallEndReason | null;
}

export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface PublicEncryptionBundle {
  uid: string;
  identityPk: string;
  signedPrekeyPk: string;
  signedPrekeySig: string;
  fingerprint: string;
  updatedAt: Timestamp | null;
}

export interface UserReport {
  id: string;
  reporterUid: string;
  reportedUid: string;
  reason: string;
  status?: "new" | "investigating" | "resolved" | "dismissed";
  createdAt: Timestamp | null;
  resolvedAt?: Timestamp | null;
  actionTaken?: string | null;
}

export type AdminRole =
  | "OWNER"
  | "SUPER_ADMIN"
  | "ADMIN"
  | "MODERATOR"
  | "SUPPORT"
  | "ANALYST";

export type AccountStatus =
  | "ACTIVE"
  | "RESTRICTED"
  | "SUSPENDED"
  | "BANNED"
  | "DEACTIVATED"
  | "DELETED";

export type UserRestriction =
  | "MESSAGE_RESTRICTED"
  | "CALL_RESTRICTED"
  | "CONTACT_RESTRICTED"
  | "SEARCH_RESTRICTED";

export interface UserTag {
  id: string;
  name: string;
  color: string;
  icon?: string;
  description: string;
  order: number;
  isPrivileged?: boolean;
}

export interface AuditLogRecord {
  id: string;
  action: string;
  actorUid: string;
  targetUid?: string;
  reason?: string;
  meta?: Record<string, unknown>;
  createdAt: number | Timestamp | null;
}

export interface SystemConfig {
  registrationEnabled: boolean;
  maintenanceMode: boolean;
  inactivityThresholdDays: number;
  maxMessageLength: number;
  uploadLimitBytes: number;
  updatedAt?: Timestamp | null;
}
