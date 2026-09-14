"use client";

import { useEffect, useState, useRef } from "react";
import {
  Camera,
  Check,
  Crown,
  LogOut,
  Shield,
  UserMinus,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { useAuth } from "@/features/auth/AuthProvider";
import {
  getGroupMeta,
  subscribeGroupMembers,
  updateGroupMeta,
  uploadGroupAvatar,
  inviteMemberByChemmNumber,
  removeMember,
  leaveGroup,
} from "@/services/firebase/groups";
import { sendSystemMessage } from "@/services/firebase/groupChat";
import { userFacingMessage } from "@/lib/errors";
import type { GroupMember, GroupMeta } from "@/types";
import { cn } from "@/lib/utils";

interface GroupSettingsPanelProps {
  groupId: string;
  onClose: () => void;
  onGroupLeft?: () => void;
}

export function GroupSettingsPanel({
  groupId,
  onClose,
  onGroupLeft,
}: GroupSettingsPanelProps) {
  const { profile } = useAuth();
  const [group, setGroup] = useState<GroupMeta | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [loading, setLoading] = useState(true);

  // Editing state
  const [editingInfo, setEditingInfo] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [savingInfo, setSavingInfo] = useState(false);

  // Invite state
  const [chemmNumber, setChemmNumber] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // Action state
  const [busyMember, setBusyMember] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load group meta & members
  useEffect(() => {
    let active = true;
    setLoading(true);

    getGroupMeta(groupId)
      .then((meta) => {
        if (!active) return;
        setGroup(meta);
        if (meta) {
          setName(meta.name);
          setDescription(meta.description ?? "");
        }
      })
      .catch((err) => {
        if (active) setActionError(userFacingMessage(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    const unsubMembers = subscribeGroupMembers(groupId, (m) => {
      if (active) setMembers(m);
    });

    return () => {
      active = false;
      unsubMembers();
    };
  }, [groupId]);

  const currentMember = members.find((m) => m.uid === profile?.uid);
  const isAdmin = currentMember?.role === "admin" || currentMember?.role === "owner";
  const isOwner = currentMember?.role === "owner";

  const handleSaveInfo = async () => {
    if (!profile || !isAdmin) return;
    try {
      setSavingInfo(true);
      setActionError(null);
      await updateGroupMeta(groupId, profile.uid, { name, description });
      setGroup((prev) => (prev ? { ...prev, name, description } : null));
      await sendSystemMessage(groupId, `${profile.displayName} updated group information`);
      setEditingInfo(false);
    } catch (err) {
      setActionError(userFacingMessage(err));
    } finally {
      setSavingInfo(false);
    }
  };

  const handleAvatarChange = async (file: File) => {
    if (!profile || !isAdmin) return;
    try {
      setAvatarUploading(true);
      setActionError(null);
      const newUrl = await uploadGroupAvatar(groupId, file, profile.uid);
      setGroup((prev) => (prev ? { ...prev, avatarUrl: newUrl } : null));
      await sendSystemMessage(groupId, `${profile.displayName} updated the group avatar`);
    } catch (err) {
      setActionError(userFacingMessage(err));
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !chemmNumber.trim()) return;
    try {
      setInviting(true);
      setInviteError(null);
      setInviteSuccess(null);
      await inviteMemberByChemmNumber(groupId, chemmNumber.trim(), profile);
      setInviteSuccess(`Invitation sent to ${chemmNumber.trim()}`);
      setChemmNumber("");
    } catch (err) {
      setInviteError(userFacingMessage(err));
    } finally {
      setInviting(false);
    }
  };

  const handleRemoveMember = async (memberUid: string, memberName: string) => {
    if (!profile || !isAdmin) return;
    if (!confirm(`Remove ${memberName} from this group?`)) return;
    try {
      setBusyMember(memberUid);
      setActionError(null);
      await removeMember(groupId, memberUid, profile.uid);
      await sendSystemMessage(groupId, `${profile.displayName} removed ${memberName} from the group`);
    } catch (err) {
      setActionError(userFacingMessage(err));
    } finally {
      setBusyMember(null);
    }
  };

  const handleLeave = async () => {
    if (!profile) return;
    if (isOwner && members.length > 1) {
      alert("As group owner, please transfer ownership before leaving or remove members.");
      return;
    }
    if (!confirm("Are you sure you want to leave this group?")) return;
    try {
      setActionError(null);
      await leaveGroup(groupId, profile.uid);
      await sendSystemMessage(groupId, `${profile.displayName} left the group`);
      onGroupLeft?.();
      onClose();
    } catch (err) {
      setActionError(userFacingMessage(err));
    }
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col border-l border-[var(--glass-border-soft)] bg-[var(--sidebar)] backdrop-blur-2xl">
      <div className="flex items-center justify-between px-4 py-4">
        <h2 className="font-display text-lg font-semibold">Group Info</h2>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
          <X className="h-5 w-5" />
        </Button>
      </div>

      <div className="subtle-scroll flex-1 overflow-y-auto px-4 pb-6 space-y-6">
        {actionError && (
          <div className="rounded-xl bg-rose-500/10 p-3 text-xs text-rose-500 ring-1 ring-rose-500/20">
            {actionError}
          </div>
        )}

        {/* Group Header / Avatar */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="relative group">
            <Avatar
              name={group?.name ?? "Group"}
              src={group?.avatarUrl}
              size="xl"
              className="ring-2 ring-[var(--glass-border)]"
            />
            {isAdmin && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={avatarUploading}
                aria-label="Change group photo"
                className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent)] text-white shadow-md transition hover:opacity-90 disabled:opacity-50"
              >
                <Camera className="h-4 w-4" />
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleAvatarChange(file);
              }}
            />
          </div>

          {avatarUploading && (
            <p className="text-xs text-[var(--accent)] animate-pulse">Uploading avatar…</p>
          )}

          {!editingInfo ? (
            <div className="w-full">
              <div className="flex items-center justify-center gap-2">
                <h3 className="font-display text-xl font-semibold text-[var(--ink)]">
                  {group?.name ?? "Group"}
                </h3>
              </div>
              {group?.description && (
                <p className="mt-1 text-sm text-[var(--ink-muted)] px-2">
                  {group.description}
                </p>
              )}
              <p className="mt-1 text-xs text-[var(--ink-soft)]">
                {members.length} {members.length === 1 ? "member" : "members"}
              </p>
              {isAdmin && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 text-xs"
                  onClick={() => setEditingInfo(true)}
                >
                  Edit group details
                </Button>
              )}
            </div>
          ) : (
            <div className="w-full space-y-3 text-left">
              <div>
                <label className="block text-xs font-medium text-[var(--ink-muted)] mb-1">
                  Group Name
                </label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={64}
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--ink-muted)] mb-1">
                  Description
                </label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What is this group about?"
                  maxLength={200}
                  rows={2}
                />
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => void handleSaveInfo()}
                  disabled={savingInfo || !name.trim()}
                >
                  {savingInfo ? "Saving…" : "Save"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditingInfo(false);
                    setName(group?.name ?? "");
                    setDescription(group?.description ?? "");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Invite by CHEMM Number */}
        {isAdmin && (
          <div className="rounded-2xl bg-[var(--glass)] p-3 ring-1 ring-[var(--glass-border-soft)]">
            <div className="flex items-center gap-2 mb-2">
              <UserPlus className="h-4 w-4 text-[var(--accent)]" />
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ink)]">
                Invite by CHEMM Number
              </p>
            </div>
            <p className="text-xs text-[var(--ink-muted)] mb-3">
              Enter their CHEMM number. They will receive an invitation they can accept or decline.
            </p>
            <form onSubmit={handleInvite} className="space-y-2">
              <div className="flex gap-2">
                <Input
                  value={chemmNumber}
                  onChange={(e) => setChemmNumber(e.target.value.toUpperCase())}
                  placeholder="CHEMM-XXXXXXXX"
                  className="text-xs font-mono"
                  required
                />
                <Button
                  type="submit"
                  size="sm"
                  disabled={inviting || !chemmNumber.trim()}
                  className="shrink-0"
                >
                  {inviting ? "…" : "Invite"}
                </Button>
              </div>
              {inviteSuccess && (
                <p className="text-xs text-emerald-500 flex items-center gap-1">
                  <Check className="h-3 w-3" />
                  {inviteSuccess}
                </p>
              )}
              {inviteError && (
                <p className="text-xs text-rose-500">{inviteError}</p>
              )}
            </form>
          </div>
        )}

        {/* Members List */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-soft)]">
              Members ({members.length})
            </p>
          </div>
          <div className="space-y-1">
            {members.map((m) => {
              const isSelf = m.uid === profile?.uid;
              const canRemove =
                isAdmin && !isSelf && (isOwner || m.role === "member");

              return (
                <div
                  key={m.uid}
                  className="flex items-center justify-between gap-3 rounded-xl p-2 hover:bg-[var(--glass)] transition"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar
                      name={m.displayName}
                      src={m.avatarUrl}
                      size="md"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-sm font-medium text-[var(--ink)]">
                          {m.displayName}
                        </p>
                        {isSelf && (
                          <span className="text-[10px] text-[var(--ink-soft)] font-medium">
                            (You)
                          </span>
                        )}
                      </div>
                      <p className="truncate text-xs text-[var(--ink-muted)]">
                        @{m.username}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {m.role === "owner" ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-500">
                        <Crown className="h-3 w-3" />
                        Owner
                      </span>
                    ) : m.role === "admin" ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold text-sky-500">
                        <Shield className="h-3 w-3" />
                        Admin
                      </span>
                    ) : null}

                    {canRemove && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => void handleRemoveMember(m.uid, m.displayName)}
                        disabled={busyMember === m.uid}
                        className="h-8 w-8 text-rose-500 hover:bg-rose-500/10"
                        aria-label={`Remove ${m.displayName}`}
                      >
                        <UserMinus className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Leave Group Action */}
        <div className="pt-4 border-t border-[var(--glass-border-soft)]">
          <Button
            variant="ghost"
            onClick={() => void handleLeave()}
            className="w-full text-rose-500 hover:bg-rose-500/10 hover:text-rose-600 justify-center gap-2"
          >
            <LogOut className="h-4 w-4" />
            Leave Group
          </Button>
        </div>
      </div>
    </div>
  );
}
