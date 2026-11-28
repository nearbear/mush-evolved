import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, PRESELECTION, resolveConfig } from "../src/config.ts";
import {
  CYCLE_HOURS,
  MAX_SETUP_DESCRIPTION_LENGTH,
  MAX_SETUP_NAME_LENGTH,
  MUSH_COUNTS,
  STANDARD_KNOBS,
  STANDARD_SETUP,
  STANDARD_SETUP_ID,
  countVotes,
  cyclesPerDayFor,
  knobsDiff,
  moderateSetupTexts,
  parsePostSetup,
  parseSetupKnobs,
  setupOverrides,
  tallyVotes,
  validateSetup,
  type Setup,
  type SetupKnobs,
} from "../src/setups.ts";

const knobs = (o: Record<string, unknown> = {}) => ({ ...STANDARD_KNOBS, ...o });
const setup = (o: Record<string, unknown> = {}): Setup =>
  ({
    id: "s1",
    text: { en: { name: "Fast", description: "Short cycles" } },
    ownerName: "Ana",
    version: 1,
    rulesVersion: "dev",
    createdAt: 1,
    knobs: knobs(),
    ...o,
  }) as Setup;
const en = (name: string, description = "") => ({ en: { name, description } });

describe("parseSetupKnobs", () => {
  it("accepts the standard knobs and returns a copy", () => {
    const k = knobs();
    expect(parseSetupKnobs(k)).toEqual(STANDARD_KNOBS);
    expect(parseSetupKnobs(k)).not.toBe(k);
  });

  it.each([
    ["seats", 4, 3],
    ["seats", 16, 17],
    ["preselectionDays", 1, 0],
    ["preselectionDays", 5, 6],
  ])("bounds %s: %d is in, %d is out", (key, inside, outside) => {
    expect(parseSetupKnobs(knobs({ [key]: inside }))).not.toBeNull();
    expect(parseSetupKnobs(knobs({ [key]: outside }))).toBeNull();
  });

  it("rejects non-integer and non-number seats and days", () => {
    for (const bad of [8.5, "8", null, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(parseSetupKnobs(knobs({ seats: bad }))).toBeNull();
      expect(parseSetupKnobs(knobs({ preselectionDays: bad }))).toBeNull();
    }
  });

  it("takes each Mush count and nothing else", () => {
    for (const mushCount of ["auto", 1, 2, 3]) expect(parseSetupKnobs(knobs({ mushCount }))?.mushCount).toBe(mushCount);
    for (const mushCount of [0, 4, "2", "Auto", null]) expect(parseSetupKnobs(knobs({ mushCount }))).toBeNull();
  });

  it("caps a fixed Mush count at the seats minus 2", () => {
    expect(parseSetupKnobs(knobs({ seats: 4, mushCount: 3 }))).toBeNull();
    expect(parseSetupKnobs(knobs({ seats: 4, mushCount: 2 }))).not.toBeNull();
    expect(parseSetupKnobs(knobs({ seats: 5, mushCount: 3 }))).not.toBeNull();
    expect(parseSetupKnobs(knobs({ seats: 4, mushCount: "auto" }))).not.toBeNull();
  });

  it("takes each cycle length and nothing else", () => {
    for (const cycleHours of CYCLE_HOURS) expect(parseSetupKnobs(knobs({ cycleHours }))?.cycleHours).toBe(cycleHours);
    for (const cycleHours of [0, 5, 8, 12, 24, 2.5, "3"]) expect(parseSetupKnobs(knobs({ cycleHours }))).toBeNull();
  });

  it("takes only a boolean for shared positions", () => {
    expect(parseSetupKnobs(knobs({ sharedSpots: false }))?.sharedSpots).toBe(false);
    for (const sharedSpots of [0, 1, "true", null]) expect(parseSetupKnobs(knobs({ sharedSpots }))).toBeNull();
  });

  it("rejects unknown and missing keys, and non-objects", () => {
    expect(parseSetupKnobs(knobs({ startAp: 20 }))).toBeNull();
    const { seats: _, ...missing } = knobs();
    expect(parseSetupKnobs(missing)).toBeNull();
    for (const bad of [null, undefined, 3, "x", [], [STANDARD_KNOBS]]) expect(parseSetupKnobs(bad)).toBeNull();
  });
});

describe("validateSetup", () => {
  it("accepts a well-formed setup and the standard one", () => {
    expect(validateSetup(setup())).toEqual(setup());
    expect(validateSetup(STANDARD_SETUP)).toEqual(STANDARD_SETUP);
  });

  it("rejects unknown keys at the top and in the knobs", () => {
    expect(validateSetup(setup({ ownerHash: "abc" }))).toBeNull();
    expect(validateSetup(setup({ knobs: knobs({ extra: 1 }) }))).toBeNull();
  });

  it("rejects bad knobs", () => {
    expect(validateSetup(setup({ knobs: knobs({ seats: 4, mushCount: 3 }) }))).toBeNull();
    expect(validateSetup(setup({ knobs: undefined }))).toBeNull();
  });

  it("bounds the text fields", () => {
    expect(validateSetup(setup({ text: en("x".repeat(MAX_SETUP_NAME_LENGTH)) }))).not.toBeNull();
    expect(validateSetup(setup({ text: en("x".repeat(MAX_SETUP_NAME_LENGTH + 1)) }))).toBeNull();
    expect(validateSetup(setup({ text: en("   ") }))).toBeNull();
    expect(validateSetup(setup({ text: en("A", "x".repeat(MAX_SETUP_DESCRIPTION_LENGTH)) }))).not.toBeNull();
    expect(validateSetup(setup({ text: en("A", "x".repeat(MAX_SETUP_DESCRIPTION_LENGTH + 1)) }))).toBeNull();
    expect(validateSetup(setup({ id: "" }))).toBeNull();
    expect(validateSetup(setup({ ownerName: 7 }))).toBeNull();
  });

  it("takes a name and description per language, at least one, and no other languages or keys", () => {
    const three = { en: { name: "Fast", description: "" }, fr: { name: "Rapide", description: "Vite" }, es: { name: "Rápido", description: "" } };
    expect(validateSetup(setup({ text: three }))?.text).toEqual(three);
    expect(validateSetup(setup({ text: { fr: { name: "Rapide", description: "" } } }))).not.toBeNull();
    expect(validateSetup(setup({ text: {} }))).toBeNull();
    expect(validateSetup(setup({ text: { de: { name: "Schnell", description: "" } } }))).toBeNull();
    expect(validateSetup(setup({ text: { en: { name: "Fast" } } }))).toBeNull();
    expect(validateSetup(setup({ text: { en: { name: "Fast", description: "", extra: 1 } } }))).toBeNull();
    expect(validateSetup(setup({ text: "Fast" }))).toBeNull();
  });

  it("links a later version to the one it follows, and only a later one", () => {
    expect(validateSetup(setup({ version: 2, previousId: "s0" }))).toEqual(setup({ version: 2, previousId: "s0" }));
    expect(validateSetup(setup({ version: 2 }))).toBeNull();
    expect(validateSetup(setup({ version: 1, previousId: "s0" }))).toBeNull();
    expect(validateSetup(setup({ version: 0 }))).toBeNull();
    expect(validateSetup(setup({ version: 1.5 }))).toBeNull();
  });

  it("takes the id \"standard\" only with the standard knobs", () => {
    expect(validateSetup({ ...STANDARD_SETUP, knobs: knobs({ seats: 4, mushCount: 2 }) })).toBeNull();
    expect(validateSetup(setup({ id: STANDARD_SETUP.id }))).not.toBeNull();
  });

  it("rejects a bad creation time", () => {
    expect(validateSetup(setup({ createdAt: -1 }))).toBeNull();
    expect(validateSetup(setup({ createdAt: "2026-10-29" }))).toBeNull();
  });
});

describe("moderateSetupTexts", () => {
  it("masks the word list in every field whatever its language, and removes links", () => {
    const result = moderateSetupTexts({
      fr: { name: "Pas de zorblaxt", description: "Voir www.example.com" },
      es: { name: "Bueno", description: "zorblaxt" },
    });
    expect(result).toEqual({
      ok: true,
      text: { fr: { name: "Pas de ********", description: "Voir [link removed]" }, es: { name: "Bueno", description: "********" } },
    });
  });

  it("folds a name onto one line and strips invisible characters", () => {
    expect(moderateSetupTexts({ en: { name: "  Two\n  lines\u200b ", description: "  a\n\n\n\nb  " } })).toEqual({
      ok: true,
      text: { en: { name: "Two lines", description: "a\n\nb" } },
    });
  });

  it("refuses a missing or overlong name and an overlong description, naming the language", () => {
    expect(moderateSetupTexts({})).toEqual({ ok: false, reason: "no_text" });
    expect(moderateSetupTexts({ en: { name: " ", description: "Hi" } })).toEqual({ ok: false, reason: "name_empty", lang: "en" });
    const long = "x".repeat(MAX_SETUP_NAME_LENGTH + 1);
    expect(moderateSetupTexts({ en: { name: "A", description: "" }, es: { name: long, description: "" } })).toEqual({
      ok: false,
      reason: "name_too_long",
      lang: "es",
    });
    const longDescription = "x".repeat(MAX_SETUP_DESCRIPTION_LENGTH + 1);
    expect(moderateSetupTexts({ fr: { name: "A", description: longDescription } })).toEqual({
      ok: false,
      reason: "description_too_long",
      lang: "fr",
    });
    expect(moderateSetupTexts({ en: { name: "A", description: "   " } })).toEqual({ ok: true, text: en("A") });
  });

  it("checks the caps again after removing links, which lengthens text", () => {
    const name = `${"x".repeat(MAX_SETUP_NAME_LENGTH - 6)} www.a`;
    expect(name.length).toBeLessThanOrEqual(MAX_SETUP_NAME_LENGTH);
    expect(moderateSetupTexts(en(name))).toEqual({ ok: false, reason: "name_too_long", lang: "en" });
  });
});

describe("parsePostSetup", () => {
  const body = (o: Record<string, unknown> = {}) => ({ text: en("Fast"), knobs: knobs(), ...o });

  it("copies a well-formed post, with or without a previous version", () => {
    expect(parsePostSetup(body())).toEqual(body());
    expect(parsePostSetup(body({ previousId: "s1" }))).toEqual(body({ previousId: "s1" }));
  });

  it("refuses unknown fields, bad knobs and mistyped text, leaving caps to moderation", () => {
    expect(parsePostSetup(body({ ownerName: "Me" }))).toBeNull();
    expect(parsePostSetup(body({ knobs: knobs({ seats: 3 }) }))).toBeNull();
    expect(parsePostSetup(body({ knobs: knobs({ startAp: 20 }) }))).toBeNull();
    expect(parsePostSetup(body({ text: { en: { name: 7, description: "" } } }))).toBeNull();
    expect(parsePostSetup(body({ text: { xx: { name: "A", description: "" } } }))).toBeNull();
    expect(parsePostSetup(body({ previousId: "" }))).toBeNull();
    expect(parsePostSetup(body({ previousId: 3 }))).toBeNull();
    for (const bad of [null, undefined, "x", []]) expect(parsePostSetup(bad)).toBeNull();
    // Too long is moderation's to report, as its own reason.
    expect(parsePostSetup(body({ text: en("x".repeat(MAX_SETUP_NAME_LENGTH + 1)) }))).not.toBeNull();
  });
});

describe("cyclesPerDayFor", () => {
  it("fits whole cycles in a 24-hour day", () => {
    expect(CYCLE_HOURS.map(cyclesPerDayFor)).toEqual([24, 12, 8, 6, 4]);
  });
});

describe("setupOverrides", () => {
  it("sets the seats and pre-selection deadline, keeping the other pre-selection rules", () => {
    const p = setupOverrides(knobs({ seats: 6, preselectionDays: 2 }) as SetupKnobs).preselection;
    expect(p).toEqual({ ...PRESELECTION, seats: 6, endsOn: { day: 2, cycle: 8 } });
  });

  it("ends pre-selection on the last cycle of its last day, for each cycle length", () => {
    for (const cycleHours of CYCLE_HOURS) {
      const p = setupOverrides(knobs({ cycleHours, preselectionDays: 5 }) as SetupKnobs).preselection;
      expect(p?.endsOn).toEqual({ day: 5, cycle: 24 / cycleHours });
    }
  });

  it("passes the Mush count through", () => {
    for (const mushCount of MUSH_COUNTS) expect(setupOverrides(knobs({ mushCount }) as SetupKnobs).preselection?.mushCount).toBe(mushCount);
  });

  it("sets the cycle length, and with it the cycles per day", () => {
    for (const cycleHours of CYCLE_HOURS) {
      const config = resolveConfig(setupOverrides(knobs({ cycleHours }) as SetupKnobs));
      expect([config.cycleHours, config.cyclesPerDay]).toEqual([cycleHours, cyclesPerDayFor(cycleHours)]);
    }
  });

  it("sets shared positions", () => {
    for (const sharedSpots of [true, false]) expect(resolveConfig(setupOverrides(knobs({ sharedSpots }) as SetupKnobs)).sharedSpots).toBe(sharedSpots);
  });

  it("gives today's ship from the standard knobs, apart from 16 seats", () => {
    const config = resolveConfig(setupOverrides(STANDARD_KNOBS));
    expect(config).toEqual({ ...DEFAULT_CONFIG, preselection: { ...PRESELECTION, seats: 16 } });
  });
});

describe("knobsDiff", () => {
  it("is empty for the standard and lists the changed knobs in order", () => {
    expect(knobsDiff(STANDARD_KNOBS)).toEqual([]);
    expect(knobsDiff(knobs({ sharedSpots: false, seats: 8 }) as SetupKnobs)).toEqual(["seats", "sharedSpots"]);
  });
});

describe("tallyVotes (#236)", () => {
  const ballot = new Set(["a", "b", "c"]);
  const never = () => {
    throw new Error("No draw without a tie");
  };

  it("counts votes per setup", () => {
    expect(countVotes(["a", "b", "a"])).toEqual({ a: 2, b: 1 });
    expect(countVotes([])).toEqual({});
  });

  it("picks the setup with the most votes", () => {
    expect(tallyVotes(["a", "b", "b", "c"], ballot, never)).toBe("b");
    expect(tallyVotes(["standard", "standard", "a"], ballot, never)).toBe(STANDARD_SETUP_ID);
  });

  it("gives the standard setup when nobody voted", () => {
    expect(tallyVotes([], ballot, never)).toBe(STANDARD_SETUP_ID);
  });

  it("ignores votes for setups off the ballot, even when they have the most", () => {
    expect(tallyVotes(["gone", "gone", "gone", "a"], ballot, never)).toBe("a");
    expect(tallyVotes(["gone", "gone"], ballot, never)).toBe(STANDARD_SETUP_ID);
  });

  it("always has the standard setup on the ballot", () => {
    expect(tallyVotes(["standard"], new Set(), never)).toBe(STANDARD_SETUP_ID);
  });

  it("breaks a tie uniformly at random among the tied setups only, whatever order the votes came in", () => {
    const votes = ["c", "a", "b", "a", "c", "b", "standard"];
    // Tied at 2: a, b and c, drawn in sorted order. The standard setup has 1 and is never drawn.
    expect(tallyVotes(votes, ballot, () => 0)).toBe("a");
    expect(tallyVotes(votes, ballot, () => 0.34)).toBe("b");
    expect(tallyVotes(votes, ballot, () => 0.99)).toBe("c");
    expect(tallyVotes([...votes].reverse(), ballot, () => 0.34)).toBe("b");
    // A draw at the top of the range still lands on the last tied setup.
    expect(tallyVotes(votes, ballot, () => 1)).toBe("c");
  });

  it("breaks a tie with the standard setup in either direction", () => {
    expect(tallyVotes(["a", "standard"], ballot, () => 0)).toBe("a");
    expect(tallyVotes(["a", "standard"], ballot, () => 0.5)).toBe(STANDARD_SETUP_ID);
  });
});
