# CHEMM — Final Audit

Honest status as of this checkpoint. Prefer this over marketing claims.

## Verified working

| Area | Status |
|------|--------|
| 1:1 E2EE text (libsodium box + secretbox) | Working (static identity DH; not Signal Double Ratchet) |
| 1:1 WebRTC voice + Firestore signaling | Working (STUN; TURN via authenticated API when configured) |
| Email/password + Google Auth | Working (Google new users complete username setup) |
| CHEMM Numbers + username claim | Working (client CSPRNG + atomic claim) |
| Liquid Glass UI + dark/light/system | Working |
| Contact add / list / filter / remove / requests | Wired to Firestore |
| Block + report (UI + Firestore) | Wired |
| Soft-delete messages (me / everyone) | Wired |
| Privacy settings persistence | Wired (client prefs; not fully enforced server-side yet) |
| Device registry | Foundation (register / list / revoke) |
| Admin `/admin` + `/api/admin/overview` | Foundation (server role check via `adminRoles/{uid}`) |
| Groups create + rules + dialog | Foundation (no group message UI / SFU yet) |
| `publicProfiles` (email hidden from peers) | Wired |
| Authenticated TURN + CHEMM lookup APIs | Wired |
| Tightened Firestore message/conversation rules | Wired (deploy required) |
| `firebase-admin` in production dependencies | Yes |

## Removed

- **Test / Demo Mode** — app requires Firebase configuration. No local Alice/Bob sandbox.

## Security fixes landed this pass

1. **Email privacy** — `users/{uid}` is self-read only; discovery uses `publicProfiles/{uid}` (no email).
2. **API auth** — `/api/turn/credentials` and `/api/chemm/lookup` require Firebase ID token when Admin is configured.
3. **Message updates** — non-senders cannot rewrite ciphertext; soft-delete fields constrained.
4. **Conversation updates** — participants limited to `lastMessage`, `updatedAt`, `unreadCount`, `typing`, `pinnedMessageIds`.
5. **Admin writes** — `adminRoles` / `auditLogs` client-write denied.

## Not done / partial (do not claim complete)

- Signal-style Double Ratchet / sealed sender / multi-device key sync
- Group E2EE sender keys + group message UI thread
- Group voice SFU
- Push notifications (FCM)
- Google / OAuth signup, email verification flow UI
- Message reply UX (schema field exists; composer not wired)
- Message edit UX (service exists; UI not wired)
- Privacy “contacts only” fully enforced in chat/call services + rules
- Redis / Upstash rate limits (in-memory only)
- Server-side CHEMM allocation (still client claim)
- Analytics dashboards, tags, full moderation workflows
- Production TURN always-on without fallback STUN-only
- Migrating all legacy users to `publicProfiles` (best-effort sync on login)

## External deploy checklist

1. Deploy `firestore.rules` and `storage.rules`.
2. Deploy `firestore.indexes.json` (contactRequests `toUid+status`, groups).
3. Set `FIREBASE_ADMIN_PROJECT_ID`, `FIREBASE_ADMIN_CLIENT_EMAIL`, `FIREBASE_ADMIN_PRIVATE_KEY`.
4. Set `TURN_URLS` + `TURN_SECRET` for short-lived TURN.
5. Seed admin: Admin SDK write `adminRoles/{uid}` → `{ roles: ["OWNER"], permissions: ["*"], status: "ACTIVE" }`.
6. Backfill `publicProfiles` for existing users (login sync helps; batch job recommended).

## Crypto honesty

Messages are ciphertext-at-rest in Firestore. Identity keys live in IndexedDB. This is **not** equivalent to Signal Protocol. Treat fingerprint display as a safety number for identity keys, not a full MITM-proof session ratchet.

## Verify locally

```bash
npm run typecheck && npm run test && npm run lint && npm run build
```
