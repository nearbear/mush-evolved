import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, PRESELECTION, resolveConfig } from "../src/config.ts";
import type { ConfigOverrides } from "../src/types.ts";

describe("resolveConfig", () => {
  it("is DEFAULT_CONFIG without overrides, with no pre-selection", () => {
    expect(resolveConfig()).toEqual(DEFAULT_CONFIG);
    expect(resolveConfig({})).toEqual(DEFAULT_CONFIG);
    expect(resolveConfig({}).preselection).toBeNull();
  });

  it("replaces only the overridden fields", () => {
    expect(resolveConfig({ mushCount: 1 })).toEqual({ ...DEFAULT_CONFIG, mushCount: 1 });
    expect(resolveConfig({ manualCycles: true })).toEqual({ ...DEFAULT_CONFIG, manualCycles: true });
  });

  it("derives the cycles per day from the cycle length: a day is always 24 hours (#230)", () => {
    expect(DEFAULT_CONFIG.cycleHours * DEFAULT_CONFIG.cyclesPerDay).toBe(24);
    expect(resolveConfig({ cycleHours: 1 })).toEqual({ ...DEFAULT_CONFIG, cycleHours: 1, cyclesPerDay: 24 });
    expect(resolveConfig({ cycleHours: 6 })).toEqual({ ...DEFAULT_CONFIG, cycleHours: 6, cyclesPerDay: 4 });
  });

  it("uses a pre-selection override whole", () => {
    const rules = { ...PRESELECTION, seats: 16, endsOn: { day: 5, cycle: 1 } };
    expect(resolveConfig({ preselection: rules }).preselection).toEqual(rules);
  });

  it("ignores keys it doesn't know, at both levels", () => {
    const o = { mushCount: 1, cyclesPerDay: 2, preselection: { ...PRESELECTION, seats: 5, extra: true } } as ConfigOverrides;
    const config = resolveConfig(o);
    expect(config).toEqual({ ...DEFAULT_CONFIG, mushCount: 1, preselection: { ...PRESELECTION, seats: 5 } });
    expect(config.preselection).not.toHaveProperty("extra");
  });

  it("freezes DEFAULT_CONFIG and returns a fresh top-level object on each resolve", () => {
    expect(Object.isFrozen(DEFAULT_CONFIG)).toBe(true);
    const a = resolveConfig({ mushCount: 1 });
    const b = resolveConfig({ mushCount: 1 });
    expect(a).not.toBe(DEFAULT_CONFIG);
    expect(a).not.toBe(b);
    expect(a.maxAp).toBe(DEFAULT_CONFIG.maxAp);
  });
});
