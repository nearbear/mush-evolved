import { describe, expect, it } from "vitest";
import { RateLimiter } from "./rateLimit.ts";

describe("RateLimiter", () => {
  it("allows up to the limit within a window, then refuses", () => {
    const l = new RateLimiter(3, 1000);
    expect([1, 2, 3, 4, 5].map(() => l.allow("a", 0))).toEqual([true, true, true, false, false]);
  });

  it("starts a fresh window once the old one has elapsed", () => {
    const l = new RateLimiter(1, 1000);
    expect(l.allow("a", 0)).toBe(true);
    expect(l.allow("a", 999)).toBe(false);
    expect(l.allow("a", 1000)).toBe(true);
  });

  it("tracks keys independently", () => {
    const l = new RateLimiter(1, 1000);
    expect(l.allow("a", 0)).toBe(true);
    expect(l.allow("b", 0)).toBe(true);
    expect(l.allow("a", 1)).toBe(false);
  });

  it("forget resets a key", () => {
    const l = new RateLimiter(1, 1000);
    l.allow("a", 0);
    l.forget("a");
    expect(l.allow("a", 1)).toBe(true);
  });
});
