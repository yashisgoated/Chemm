"use client";

import { useEffect, useState } from "react";
import { getUserByUsername } from "@/services/firebase/users";
import { isContact } from "@/services/firebase/contacts";
import type { UserProfile } from "@/types";

export function useAsyncPeer(username: string | null, currentUid?: string) {
  const [peer, setPeer] = useState<UserProfile | null>(null);
  const [inContacts, setInContacts] = useState(false);
  const [loading, setLoading] = useState(Boolean(username));
  const [requestKey, setRequestKey] = useState(username);

  if (username !== requestKey) {
    setRequestKey(username);
    setPeer(null);
    setInContacts(false);
    setLoading(Boolean(username));
  }

  useEffect(() => {
    if (!username) return;

    let cancelled = false;

    void getUserByUsername(username).then(async (user) => {
      if (cancelled) return;
      setPeer(user);
      if (user && currentUid) {
        setInContacts(await isContact(currentUid, user.uid));
      } else {
        setInContacts(false);
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [username, currentUid]);

  return { peer, inContacts, setInContacts, loading };
}
