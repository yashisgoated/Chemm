# Chemm

Premium 1-to-1 **E2EE messaging** + **WebRTC voice** with permanent **CHEMM Numbers**.

## Quick start

1. Copy env and fill Firebase web config:

```bash
cp .env.local.example .env.local
npm install
npm run dev
```

2. In Firebase Console enable **Email/Password** and **Google** sign-in providers.
3. Add your domain (e.g. `localhost`) under Authentication → Settings → Authorized domains.
4. Open the app → Sign up with email or **Continue with Google**.

See [DEPLOYMENT.md](./DEPLOYMENT.md), [SECURITY.md](./SECURITY.md), [E2EE.md](./E2EE.md), [ARCHITECTURE.md](./ARCHITECTURE.md), [FINAL_AUDIT.md](./FINAL_AUDIT.md).

```bash
npm run verify
```

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Development |
| `npm run typecheck` | TypeScript |
| `npm run lint` | ESLint |
| `npm run test` | Unit tests |
| `npm run security-check` | npm audit |
| `npm run build` | Production build |
| `npm run verify` | All checks |

## Security highlights

- CHEMM Numbers — not Firebase UIDs — for discovery
- libsodium E2EE (ciphertext only in Firestore)
- Hardened Security Rules + `publicProfiles` (email never shared to peers)
- Authenticated, rate-limited CHEMM lookup + TURN credential minting
- Block / report / contact requests
- Google + email auth
- CSP + production headers
