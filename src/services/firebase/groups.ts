import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { getDb, getFirebaseStorage } from "./client";
import { AppError, ErrorCode } from "@/lib/errors";
import type {
  GroupInvitation,
  GroupInvitationStatus,
  GroupMember,
  GroupMeta,
  UserProfile,
} from "@/types";
import { compressImage } from "@/lib/utils";
import { lookupByChemmNumber } from "./chemmLookup";

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function randomId() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function assertGroupRole(
  groupId: string,
  uid: string,
  allowed: GroupMember["role"][],
): Promise<GroupMember> {
  const snap = await getDoc(doc(getDb(), "groups", groupId, "members", uid));
  if (!snap.exists()) throw new AppError(ErrorCode.FORBIDDEN, "Not a group member");
  const member = snap.data() as GroupMember;
  if (!allowed.includes(member.role)) {
    throw new AppError(ErrorCode.FORBIDDEN, "Insufficient permissions");
  }
  return member;
}

/* ------------------------------------------------------------------ */
/*  Create                                                            */
/* ------------------------------------------------------------------ */

export async function createGroup(input: {
  creator: UserProfile;
  name: string;
  memberUids: string[];
  memberProfiles: UserProfile[];
}): Promise<string> {
  const name = input.name.trim().slice(0, 64);
  if (!name) throw new AppError(ErrorCode.VALIDATION_ERROR, "Group name required");
  const members = [
    input.creator.uid,
    ...input.memberUids.filter((u) => u !== input.creator.uid),
  ].slice(0, 32);
  if (members.length < 2) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, "Add at least one other member");
  }

  const id = `grp_${randomId()}`;
  const meta: Omit<GroupMeta, "createdAt" | "updatedAt"> & {
    createdAt: ReturnType<typeof serverTimestamp>;
    updatedAt: ReturnType<typeof serverTimestamp>;
  } = {
    id,
    name,
    description: "",
    createdBy: input.creator.uid,
    avatarUrl: null,
    memberCount: members.length,
    memberUids: members,
    e2ee: true,
    createdAt: serverTimestamp() as ReturnType<typeof serverTimestamp>,
    updatedAt: serverTimestamp() as ReturnType<typeof serverTimestamp>,
  };

  const db = getDb();
  await setDoc(doc(db, "groups", id), meta);

  // Owner membership first
  await setDoc(doc(db, "groups", id, "members", input.creator.uid), {
    uid: input.creator.uid,
    role: "owner",
    displayName: input.creator.displayName,
    username: input.creator.username,
    avatarUrl: input.creator.avatarUrl,
    joinedAt: serverTimestamp(),
  });

  for (const uid of members) {
    if (uid === input.creator.uid) continue;
    const p = input.memberProfiles.find((m) => m.uid === uid);
    await setDoc(doc(db, "groups", id, "members", uid), {
      uid,
      role: "member",
      displayName: p?.displayName ?? "User",
      username: p?.username ?? "",
      avatarUrl: p?.avatarUrl ?? null,
      joinedAt: serverTimestamp(),
    });
  }

  return id;
}

/* ------------------------------------------------------------------ */
/*  Update Group Meta                                                 */
/* ------------------------------------------------------------------ */

export async function updateGroupMeta(
  groupId: string,
  updaterUid: string,
  updates: Partial<Pick<GroupMeta, "name" | "description">>,
): Promise<void> {
  await assertGroupRole(groupId, updaterUid, ["owner", "admin"]);

  const clean: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (updates.name !== undefined) {
    const name = updates.name.trim().slice(0, 64);
    if (!name) throw new AppError(ErrorCode.VALIDATION_ERROR, "Group name required");
    clean.name = name;
  }
  if (updates.description !== undefined) {
    clean.description = updates.description.trim().slice(0, 200);
  }
  await updateDoc(doc(getDb(), "groups", groupId), clean);
}

/* ------------------------------------------------------------------ */
/*  Upload Group Avatar                                               */
/* ------------------------------------------------------------------ */

export async function uploadGroupAvatar(
  groupId: string,
  file: File,
  uploaderUid: string,
): Promise<string> {
  await assertGroupRole(groupId, uploaderUid, ["owner", "admin"]);

  if (!file.type.startsWith("image/")) {
    throw new Error("Please choose an image file.");
  }
  if (file.size > 8 * 1024 * 1024) {
    throw new Error("Image must be under 8 MB.");
  }
  const blob = await compressImage(file);
  const storageRef = ref(getFirebaseStorage(), `groupAvatars/${groupId}.jpg`);
  await uploadBytes(storageRef, blob, { contentType: "image/jpeg" });
  const url = await getDownloadURL(storageRef);
  await updateDoc(doc(getDb(), "groups", groupId), {
    avatarUrl: url,
    updatedAt: serverTimestamp(),
  });
  return url;
}

/* ------------------------------------------------------------------ */
/*  Invite Member by CHEMM Number                                     */
/* ------------------------------------------------------------------ */

export async function inviteMemberByChemmNumber(
  groupId: string,
  chemmNumber: string,
  inviter: UserProfile,
): Promise<string> {
  await assertGroupRole(groupId, inviter.uid, ["owner", "admin"]);

  // Lookup user
  const target = await lookupByChemmNumber(chemmNumber);
  if (!target) throw new AppError(ErrorCode.USER_NOT_FOUND, "User not found");

  // Check not already a member
  const memberSnap = await getDoc(
    doc(getDb(), "groups", groupId, "members", target.uid),
  );
  if (memberSnap.exists()) {
    throw new AppError(ErrorCode.CONFLICT, "User is already a member");
  }

  // Check no pending invitation
  const existing = await getDocs(
    query(
      collection(getDb(), "groupInvitations"),
      where("groupId", "==", groupId),
      where("invitedUid", "==", target.uid),
      where("status", "==", "pending"),
      limit(1),
    ),
  );
  if (!existing.empty) {
    throw new AppError(ErrorCode.CONFLICT, "Invitation already pending");
  }

  // Get group meta for the invitation display
  const groupSnap = await getDoc(doc(getDb(), "groups", groupId));
  if (!groupSnap.exists()) throw new AppError(ErrorCode.USER_NOT_FOUND, "Group not found");
  const group = groupSnap.data() as GroupMeta;

  const invRef = doc(collection(getDb(), "groupInvitations"));
  await setDoc(invRef, {
    id: invRef.id,
    groupId,
    groupName: group.name,
    groupAvatarUrl: group.avatarUrl,
    invitedUid: target.uid,
    invitedByUid: inviter.uid,
    invitedByDisplayName: inviter.displayName,
    invitedByChemmNumber: inviter.chemmNumber,
    status: "pending" satisfies GroupInvitationStatus,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return invRef.id;
}

/* ------------------------------------------------------------------ */
/*  Respond to Invitation                                             */
/* ------------------------------------------------------------------ */

export async function respondToGroupInvitation(
  invitationId: string,
  uid: string,
  accept: boolean,
): Promise<void> {
  const ref = doc(getDb(), "groupInvitations", invitationId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new AppError(ErrorCode.USER_NOT_FOUND, "Invitation not found");
  const inv = snap.data() as GroupInvitation;
  if (inv.invitedUid !== uid) throw new AppError(ErrorCode.FORBIDDEN);

  await updateDoc(ref, {
    status: (accept ? "accepted" : "declined") satisfies GroupInvitationStatus,
    updatedAt: serverTimestamp(),
  });

  if (accept) {
    const db = getDb();
    // Fetch user profile for member doc
    const { getUserById } = await import("./users");
    const userProfile = await getUserById(uid);

    await setDoc(doc(db, "groups", inv.groupId, "members", uid), {
      uid,
      role: "member",
      displayName: userProfile?.displayName ?? "User",
      username: userProfile?.username ?? "",
      avatarUrl: userProfile?.avatarUrl ?? null,
      joinedAt: serverTimestamp(),
    });

    // Update denormalized fields
    const groupSnap = await getDoc(doc(db, "groups", inv.groupId));
    if (groupSnap.exists()) {
      const data = groupSnap.data() as GroupMeta;
      const uids = [...new Set([...(data.memberUids ?? []), uid])];
      await updateDoc(doc(db, "groups", inv.groupId), {
        memberUids: uids,
        memberCount: uids.length,
        updatedAt: serverTimestamp(),
      });
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Subscribe to Group Invitations (for a user)                       */
/* ------------------------------------------------------------------ */

export function subscribeGroupInvitations(
  uid: string,
  callback: (invitations: GroupInvitation[]) => void,
): Unsubscribe {
  const q = query(
    collection(getDb(), "groupInvitations"),
    where("invitedUid", "==", uid),
    where("status", "==", "pending"),
    limit(40),
  );
  return onSnapshot(
    q,
    (snap) => {
      callback(
        snap.docs.map((d) => ({ ...(d.data() as GroupInvitation), id: d.id })),
      );
    },
    () => callback([]),
  );
}

/* ------------------------------------------------------------------ */
/*  Remove Member / Leave Group                                       */
/* ------------------------------------------------------------------ */

export async function removeMember(
  groupId: string,
  memberUid: string,
  removerUid: string,
): Promise<void> {
  if (memberUid === removerUid) {
    return leaveGroup(groupId, memberUid);
  }
  await assertGroupRole(groupId, removerUid, ["owner", "admin"]);

  const targetSnap = await getDoc(
    doc(getDb(), "groups", groupId, "members", memberUid),
  );
  if (!targetSnap.exists()) return;
  const target = targetSnap.data() as GroupMember;
  if (target.role === "owner") {
    throw new AppError(ErrorCode.FORBIDDEN, "Cannot remove the group owner");
  }

  await deleteDoc(doc(getDb(), "groups", groupId, "members", memberUid));

  // Update denormalized fields
  const groupSnap = await getDoc(doc(getDb(), "groups", groupId));
  if (groupSnap.exists()) {
    const data = groupSnap.data() as GroupMeta;
    const uids = (data.memberUids ?? []).filter((u) => u !== memberUid);
    await updateDoc(doc(getDb(), "groups", groupId), {
      memberUids: uids,
      memberCount: Math.max(1, uids.length),
      updatedAt: serverTimestamp(),
    });
  }
}

export async function leaveGroup(groupId: string, uid: string): Promise<void> {
  const memberSnap = await getDoc(
    doc(getDb(), "groups", groupId, "members", uid),
  );
  if (!memberSnap.exists()) return;
  const member = memberSnap.data() as GroupMember;
  if (member.role === "owner") {
    throw new AppError(ErrorCode.FORBIDDEN, "Owner cannot leave. Transfer ownership first.");
  }

  await deleteDoc(doc(getDb(), "groups", groupId, "members", uid));

  const groupSnap = await getDoc(doc(getDb(), "groups", groupId));
  if (groupSnap.exists()) {
    const data = groupSnap.data() as GroupMeta;
    const uids = (data.memberUids ?? []).filter((u) => u !== uid);
    await updateDoc(doc(getDb(), "groups", groupId), {
      memberUids: uids,
      memberCount: Math.max(1, uids.length),
      updatedAt: serverTimestamp(),
    });
  }
}

/* ------------------------------------------------------------------ */
/*  Subscribe                                                         */
/* ------------------------------------------------------------------ */

export function subscribeMyGroups(
  uid: string,
  callback: (groups: GroupMeta[]) => void,
): Unsubscribe {
  const q = query(
    collection(getDb(), "groups"),
    where("memberUids", "array-contains", uid),
    limit(40),
  );
  return onSnapshot(
    q,
    (snap) => {
      callback(snap.docs.map((d) => ({ ...(d.data() as GroupMeta), id: d.id })));
    },
    () => callback([]),
  );
}

export function subscribeGroupMembers(
  groupId: string,
  callback: (members: GroupMember[]) => void,
): Unsubscribe {
  return onSnapshot(
    collection(getDb(), "groups", groupId, "members"),
    (snap) => {
      callback(snap.docs.map((d) => d.data() as GroupMember));
    },
    () => callback([]),
  );
}

export async function listGroupMembers(groupId: string): Promise<GroupMember[]> {
  const snap = await getDocs(collection(getDb(), "groups", groupId, "members"));
  return snap.docs.map((d) => d.data() as GroupMember);
}

export async function getGroupMeta(groupId: string): Promise<GroupMeta | null> {
  const snap = await getDoc(doc(getDb(), "groups", groupId));
  return snap.exists() ? { ...(snap.data() as GroupMeta), id: snap.id } : null;
}
