import { z } from "zod";

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_]{3,20}$/, "Username must be 3–20 lowercase letters, numbers, or underscores.");

export const displayNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(40);

export const bioSchema = z.string().trim().max(160);

export const emailSchema = z.string().trim().email();

export const passwordSchema = z.string().min(6).max(128);

export const messageTextSchema = z.string().trim().min(1).max(2000);

/** CHEMM-XXXXXX… where X is Crockford base32-ish (no I,L,O,U); 6–8 chars */
export const CHEMM_REGEX = /^CHEMM-[0-9A-HJKMNP-TV-Z]{6,8}$/;

export function normalizeChemmNumber(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, "");
}

export const chemmNumberSchema = z
  .string()
  .transform(normalizeChemmNumber)
  .refine((v) => CHEMM_REGEX.test(v), "Enter a valid CHEMM Number (e.g. CHEMM-7K4X92).");

export const signupSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  username: usernameSchema,
  displayName: displayNameSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
});

export const reportReasonSchema = z
  .string()
  .trim()
  .min(3)
  .max(500);

export const contactRequestSchema = z.object({
  toUid: z.string().min(1),
});
