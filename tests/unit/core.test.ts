import { describe, expect, it } from "vitest";
import {
  generateChemmNumber,
  isValidChemmFormat,
  normalizeChemmNumber,
} from "@/lib/chemm";
import { chemmNumberSchema, signupSchema } from "@/lib/validation";
import { ErrorCode, toAppError } from "@/lib/errors";
import { conversationIdFor } from "@/lib/utils";

describe("CHEMM numbers", () => {
  it("generates valid unique-format numbers", () => {
    const a = generateChemmNumber();
    const b = generateChemmNumber();
    expect(isValidChemmFormat(a)).toBe(true);
    expect(isValidChemmFormat(b)).toBe(true);
    expect(a).toMatch(/^CHEMM-[0-9A-HJKMNP-TV-Z]{6}$/);
  });

  it("normalizes whitespace and case", () => {
    expect(normalizeChemmNumber(" chemM-a1b2c3 ")).toBe("CHEMM-A1B2C3");
  });

  it("rejects invalid formats via zod", () => {
    expect(chemmNumberSchema.safeParse("CHEMM-!!!").success).toBe(false);
    expect(chemmNumberSchema.safeParse("CHEMM-A1B2C3").success).toBe(true);
  });
});

describe("validation", () => {
  it("validates signup payload", () => {
    const ok = signupSchema.safeParse({
      email: "a@b.com",
      password: "secret1",
      username: "alice_1",
      displayName: "Alice",
    });
    expect(ok.success).toBe(true);
  });

  it("rejects bad usernames", () => {
    const bad = signupSchema.safeParse({
      email: "a@b.com",
      password: "secret1",
      username: "A",
      displayName: "Alice",
    });
    expect(bad.success).toBe(false);
  });
});

describe("errors", () => {
  it("maps permission-denied", () => {
    const err = toAppError({ code: "permission-denied" });
    expect(err.code).toBe(ErrorCode.FORBIDDEN);
  });
});

describe("conversation ids", () => {
  it("is deterministic regardless of order", () => {
    expect(conversationIdFor("b", "a")).toBe(conversationIdFor("a", "b"));
  });
});
