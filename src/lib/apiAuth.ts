import { getFirebaseAuth } from "@/services/firebase/client";

/** Authorization header for authenticated API routes. */
export async function authHeaders(
  extra?: Record<string, string>,
): Promise<Record<string, string>> {
  const user = getFirebaseAuth().currentUser;
  if (!user) return { ...extra };
  const token = await user.getIdToken();
  return {
    Authorization: `Bearer ${token}`,
    ...extra,
  };
}
