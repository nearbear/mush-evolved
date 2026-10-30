import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, PRESELECTION, resolveConfig } from "../src/config.ts";
import {
  CYCLE_HOURS,
  MAX_SETUP_DESCRIPTION_LENGTH,
  MAX_SETUP_NAME_LENGTH,
  MUSH_COUNTS,
  STANDARD_KNOBS,
  STANDARD_SETUP,
  cyclesPerDayFor,
  knobsDiff,
  parseSetupKnobs,
  setupOverrides,
  validateSetup,
  type Setup,
  type SetupKnobs,
} from "../src/setups.ts";

const knobs = (o: Record<string, unknown> = {}) => ({ ...STANDARD_KNOBS, ...o });
const setup = (o: Record<string, unknown> = {}): Setup =>
  ({ id: "s1", name: "Fast", description: "Short cycles", author: "Ana", version: 1, rulesVersion: "dev", createdAt: 1, knobs: knobs(), ...o }) as Setup;

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
    expect(validateSetup(setup({ name: "x".repeat(MAX_SETUP_NAME_LENGTH) }))).not.toBeNull();
    expect(validateSetup(setup({ name: "x".repeat(MAX_SETUP_NAME_LENGTH + 1) }))).toBeNull();
    expect(validateSetup(setup({ name: "   " }))).toBeNull();
    expect(validateSetup(setup({ description: "x".repeat(MAX_SETUP_DESCRIPTION_LENGTH) }))).not.toBeNull();
    expect(validateSetup(setup({ description: "x".repeat(MAX_SETUP_DESCRIPTION_LENGTH + 1) }))).toBeNull();
    expect(validateSetup(setup({ id: "" }))).toBeNull();
    expect(validateSetup(setup({ author: 7 }))).toBeNull();
  });

  it("links a later version to the one it follows, and only a later one", () => {
    expect(validateSetup(setup({ version: 2, previousId: "s0" }))).toEqual(setup({ version: 2, previousId: "s0" }));
    expect(validateSetup(setup({ version: 2 }))).toBeNull();
    expect(validateSetup(setup({ version: 1, previousId: "s0" }))).toBeNull();
    expect(validateSetup(setup({ version: 0 }))).toBeNull();
    expect(validateSetup(setup({ version: 1.5 }))).toBeNull();
  });

  it("rejects a bad creation time", () => {
    expect(validateSetup(setup({ createdAt: -1 }))).toBeNull();
    expect(validateSetup(setup({ createdAt: "2026-10-29" }))).toBeNull();
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
