/**
 * CHEMM Number generation — CSPRNG + collision-resistant alphabet.
 * Uniqueness is enforced by an atomic Firestore claim on `chemmNumbers/{id}`.
 */

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford-like, no I L O U

function randomChars(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i]! % ALPHABET.length]!;
  }
  return out;
}

export function generateChemmNumber(): string {
  return `CHEMM-${randomChars(6)}`;
}

export function normalizeChemmNumber(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, "");
}

export function isValidChemmFormat(value: string): boolean {
  return /^CHEMM-[0-9A-HJKMNP-TV-Z]{6,8}$/.test(normalizeChemmNumber(value));
}
