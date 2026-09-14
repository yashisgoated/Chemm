# Security

## Principles

1. Never trust the client for authorization — enforce with Firestore Security Rules + server routes.
2. Never put Admin SDK keys, TURN secrets, or private encryption keys in the browser bundle.
3. Obfuscation is not a security boundary; secrets stay server-side.
4. Message bodies are ciphertext at rest in Firestore.

## Controls

| Area | Mechanism |
|---|---|
| Auth | Firebase Email/Password |
| Authorization | Firestore rules (participants / self / call parties) |
| E2EE | libsodium NaCl (see E2EE.md) |
| CHEMM lookup | Rate-limited `/api/chemm/lookup` |
| TURN | HMAC short-lived creds via `/api/turn/credentials` |
| Abuse | In-memory rate limits (swap to Redis for multi-region) |
| Block | `blocks/{uid}/users/{other}` checked before chat/call |
| Reports | Write-only `reports` collection |
| Headers | CSP, HSTS (prod), XFO DENY, nosniff |
| Validation | Zod schemas on inputs |

## Forbidden client actions

- Change `chemmNumber` after create
- Write plaintext `text` on messages
- Read another user's call ICE
- Impersonate `senderId` / `callerId`

## Remaining production hardening

- App Check
- Redis/Upstash rate limits across instances
- Cloud Function stale-call sweeper
- Dependency scanning in CI (`npm audit`)
