import { describe, expect, it } from "vitest";
import { checkDisplayName } from "../src/accounts.ts";
import { MAX_NAME_LENGTH } from "../src/protocol.ts";

describe("checkDisplayName", () => {
  it("folds whitespace and trims", () => {
    expect(checkDisplayName("  Kuan \t Ti ")).toEqual({ ok: true, name: "Kuan Ti" });
  });

  it("keeps accented and non-Latin names", () => {
    expect(checkDisplayName("Élodie")).toEqual({ ok: true, name: "Élodie" });
    expect(checkDisplayName("周")).toEqual({ ok: true, name: "周" });
  });

  it("refuses an empty name", () => {
    expect(checkDisplayName(" \n ")).toEqual({ ok: false, reason: "name_empty" });
  });

  it("refuses a name over MAX_NAME_LENGTH, after folding whitespace", () => {
    expect(checkDisplayName("x".repeat(MAX_NAME_LENGTH)).ok).toBe(true);
    expect(checkDisplayName(`${"x".repeat(MAX_NAME_LENGTH - 1)}    y`)).toEqual({ ok: false, reason: "name_too_long" });
  });

  it("refuses rather than masks a name moderation would change", () => {
    expect(checkDisplayName("zorblaxt happens")).toEqual({ ok: false, reason: "name_rejected" });
    expect(checkDisplayName("www.spam.test")).toEqual({ ok: false, reason: "name_rejected" });
    expect(checkDisplayName("Chun​")).toEqual({ ok: false, reason: "name_rejected" });
  });
});
