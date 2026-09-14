# Architecture

Chemm is a 1-to-1 voice + E2EE messaging web app.

## Layers

```
UI (React / Next.js App Router)
  ↓
Features (auth, chat, calls, contacts, theme)
  ↓
Services (firebase/*, webrtc, encryption)
  ↓
Firebase Auth + Firestore (+ optional Admin API routes)
WebRTC peer media (browser ↔ browser)
```

## Identity

- **Auth identity**: Firebase Auth UID (never shown as public ID)
- **CHEMM Number**: permanent public ID `CHEMM-XXXXXX`, claimed atomically in `chemmNumbers/{id}`
- **Encryption identity**: libsodium X25519 keypair in IndexedDB; public keys in `publicKeys/{uid}`

## Chat path

1. Encrypt locally (NaCl `crypto_box_beforenm` + `crypto_secretbox`)
2. Store ciphertext + nonce in Firestore
3. Peer decrypts with shared DH secret

## Call path

1. Signaling (offer/answer/ICE) via Firestore `calls`
2. Media via WebRTC P2P only
3. ICE servers from `/api/turn/credentials` (short-lived TURN) + STUN

## Demo / Test Mode

When Firebase env is missing (or forced), `services/demo` uses `localStorage` + `BroadcastChannel` so two tabs can chat/call without `.env`.
