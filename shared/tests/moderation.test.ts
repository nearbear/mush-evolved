import { describe, expect, it } from "vitest";
import { moderateChat } from "../src/moderation.ts";
import { MAX_CHAT_LENGTH, MAX_CHAT_LINES } from "../src/rules.ts";

describe("moderateChat", () => {
  it("collapses spaces and strips invisible characters", () => {
    expect(moderateChat("  hi​ \t there‮ ")).toEqual({ ok: true, text: "hi there" });
  });

  it("keeps line breaks, folds CRLF, trims line edges, and allows one blank line", () => {
    expect(moderateChat("# Plan \r\n\r\n\r\n\r\n- [ ]  one\n  - [x] two ")).toEqual({
      ok: true,
      text: "# Plan\n\n- [ ] one\n- [x] two",
    });
  });

  it("rejects too many lines", () => {
    expect(moderateChat(Array(MAX_CHAT_LINES + 1).fill("a").join("\n")).ok).toBe(false);
    expect(moderateChat(Array(MAX_CHAT_LINES).fill("a").join("\n")).ok).toBe(true);
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

  // Known gap for French and Spanish (i18n): `\b` treats é and ñ as non-word characters, so a
  // blocked word that starts or ends with an accented letter is never masked. Fix moderation.ts
  // (e.g. Unicode-aware boundaries with the `u` flag), then change `it.fails` to `it`.
  it.fails("masks blocked words that start or end with an accented letter", () => {
    expect(moderateChat("un café ici", ["café"])).toEqual({ ok: true, text: "un **** ici" });
    expect(moderateChat("une étoile", ["étoile"])).toEqual({ ok: true, text: "une ******" });
  });
});
