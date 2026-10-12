import { describe, expect, it } from "vitest";
import { moderateChat } from "./moderation.ts";
import { MAX_CHAT_LENGTH } from "./rules.ts";

describe("moderateChat", () => {
  it("collapses whitespace and strips invisible characters", () => {
    expect(moderateChat("  hi​\n\tthere‮ ")).toEqual({ ok: true, text: "hi there" });
  });

  it("rejects empty and over-long messages", () => {
    expect(moderateChat(" ​ ").ok).toBe(false);
    expect(moderateChat("x".repeat(MAX_CHAT_LENGTH + 1)).ok).toBe(false);
  });

  it("removes links", () => {
    expect(moderateChat("see https://evil.example/x and www.spam.test")).toEqual({
      ok: true,
      text: "see [link removed] and [link removed]",
    });
  });

  it("masks blocked words case-insensitively, whole words only", () => {
    expect(moderateChat("Darn it, DARN", ["darn"])).toEqual({ ok: true, text: "**** it, ****" });
    expect(moderateChat("darned", ["darn"])).toEqual({ ok: true, text: "darned" });
  });
});
