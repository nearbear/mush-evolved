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

  it("reads DEFAULT_CONFIG on each call, so a balance change reaches every later resolve", () => {
    const before = DEFAULT_CONFIG.maxAp;
    try {
      DEFAULT_CONFIG.maxAp = 99;
      expect(resolveConfig({ mushCount: 1 }).maxAp).toBe(99);
    } finally {
      DEFAULT_CONFIG.maxAp = before;
    }
  });
});
