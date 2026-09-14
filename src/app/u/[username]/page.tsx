"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { GlassPanel } from "@/components/ui/Glass";
import { useAuth } from "@/features/auth/AuthProvider";
import { useCall } from "@/features/calls/CallProvider";
import { ensureConversation } from "@/services/firebase/chat";
import { getUserByUsername } from "@/services/firebase/users";
import { formatLastSeen, timestampToDate } from "@/lib/utils";
import type { UserProfile } from "@/types";

export default function UserProfilePage() {
  const params = useParams<{ username: string }>();
  const { profile, loading } = useAuth();
  const { startCall, supported } = useCall();
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!loading && !profile) router.replace("/login");
  }, [loading, profile, router]);

  useEffect(() => {
    const username = params.username;
    if (!username) return;
    void getUserByUsername(username).then((u) => {
      if (!u) setNotFound(true);
      else setUser(u);
    });
  }, [params.username]);

  if (loading || !profile) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-sm text-slate-500">
        Loading…
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6">
        <GlassPanel className="p-8 text-center">
          <p className="font-display text-xl font-semibold">User not found</p>
          <Button className="mt-4" onClick={() => router.push("/")}>
            Back home
          </Button>
        </GlassPanel>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-sm text-slate-500">
        Loading profile…
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <GlassPanel className="w-full max-w-md p-8 text-center">
        <Avatar
          name={user.displayName}
          src={user.avatarUrl}
          online={user.isOnline}
          size="xl"
          className="mx-auto"
        />
        <h1 className="mt-4 font-display text-3xl font-semibold">{user.displayName}</h1>
        <p className="text-slate-500">@{user.username}</p>
        <p className="mt-2 text-xs text-slate-400">
          {formatLastSeen(user.isOnline, timestampToDate(user.lastSeen))}
        </p>
        {user.bio && <p className="mt-4 text-sm text-slate-600">{user.bio}</p>}
        <div className="mt-8 flex flex-col gap-2">
          <Button
            onClick={async () => {
              const id = await ensureConversation(profile, user);
              router.push(`/?c=${id}`);
            }}
          >
            Message
          </Button>
          <Button
            variant="secondary"
            disabled={!supported || user.uid === profile.uid}
            onClick={() => void startCall(user)}
          >
            Voice call
          </Button>
          <Button variant="ghost" onClick={() => router.push("/")}>
            Back
          </Button>
        </div>
      </GlassPanel>
    </div>
  );
}
