import { describe, expect, it } from "vitest";
import { checkRateLimit } from "@/lib/server/security";

describe("rate limiting", () => {
  it("allows under the limit and blocks after", () => {
    const key = `test_${Date.now()}_${Math.random()}`;
    for (let i = 0; i < 3; i++) {
      expect(checkRateLimit({ key, limit: 3, windowMs: 60_000 }).ok).toBe(true);
    }
    expect(checkRateLimit({ key, limit: 3, windowMs: 60_000 }).ok).toBe(false);
  });
});
