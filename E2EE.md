# End-to-End Encryption (E2EE)

## Library

**libsodium** (`libsodium-wrappers`) — mature NaCl cryptography (Curve25519 / XSalsa20-Poly1305 family).

We do **not** invent a cipher. We use documented NaCl constructions:

1. Long-term **identity keypair**: `crypto_box_keypair` (X25519)
2. Signing keypair + signed prekey for identity attestation / key-change UX
3. Conversation shared secret: `crypto_box_beforenm(peerPk, mySk)`
4. Message seal: `crypto_secretbox_easy(plaintext, nonce, shared)`

Both participants derive the same DH shared secret, so both can decrypt. Firestore only stores:

```text
ciphertext, nonce, v, senderId, clientMessageId, status, createdAt
```

Private keys never leave the device (IndexedDB). They are never uploaded.

## Key change detection

Public `fingerprint` is published on `publicKeys/{uid}` and mirrored on the user profile.
Clients should warn if a peer fingerprint differs from the previously trusted value (`localStorage`).

## Forward secrecy notes

Per-message unique nonces. Full Double Ratchet (Signal) is a documented upgrade path; current design prioritizes genuine E2EE with audited primitives for 1:1 chat.

## Threat model

| Attacker | Can read message plaintext? |
|---|---|
| Firestore admin / DB dump | No (ciphertext only) |
| Network observer | No (TLS + E2EE) |
| Compromised device | Yes (keys on device) |
| Malicious peer | Yes (they are a participant) |
