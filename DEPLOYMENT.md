# Deployment

## 1. Firebase

1. Create project, enable **Email/Password** and **Google** Auth providers
2. Add authorized domains (`localhost` for local, your production host)
3. Create Firestore + Storage
4. Deploy rules: `firebase deploy --only firestore:rules,firestore:indexes,storage`
5. Add Web app config → `.env.local` (`NEXT_PUBLIC_*`)
6. Create service account → `FIREBASE_ADMIN_*` for API routes
7. (Optional) Seed admin: write `adminRoles/{uid}` with Admin SDK `{ roles: ["OWNER"], permissions: ["*"], status: "ACTIVE" }`

## 2. TURN

Configure coturn (or managed TURN) with REST API secret:

```env
TURN_URLS=turn:your.host:3478
TURN_SECRET=your_hmac_secret
```

Clients call `GET /api/turn/credentials` — never ship the secret to the browser.

## 3. App host

```bash
npm ci
npm run build
npm start
```

Or deploy to Vercel with the same env vars. Enable HTTPS only.

## 4. Post-deploy checks

- Signup / Google creates CHEMM Number + `publicProfiles`
- Two users chat (ciphertext in Firestore console)
- Contacts: add, view, remove, accept requests
- Voice call between browsers
- Unauthorized conversation read fails
- `/api/chemm/lookup` requires auth + returns 429 under burst
