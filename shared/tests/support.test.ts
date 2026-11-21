// The test helpers' own config merge: a slip here would silently change what every test using `testConfig` covers.
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { deepMerge, noCharacterModifiers, testConfig } from "./support.ts";

describe("testConfig", () => {
  it("merges nested objects key by key and keeps the rest of the default", () => {
    const c = testConfig({ repair: { chance: { COFFEE_DISPENSER: 0 } } });
    expect(c.repair.chance.COFFEE_DISPENSER).toBe(0);
    expect(c.repair.chance).toEqual({ ...DEFAULT_CONFIG.repair.chance, COFFEE_DISPENSER: 0 });
    expect(c.repair.cost).toEqual(DEFAULT_CONFIG.repair.cost);
  });

  it("starts quiet: one Mush, nothing carried or on the floor, no hunters or incidents", () => {
    const c = testConfig();
    expect([c.mushCount, c.startInventory, c.startItems, c.startSkills]).toEqual([1, [], [], []]);
    expect(c.hunters.waveChance).toBe(0);
    expect(c.incidents.rollPoints).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("replaces arrays and scalars whole, and leaves the frozen default untouched", () => {
    expect(deepMerge({ a: [1, 2], b: 1, c: { d: 1 } }, { a: [3], c: { d: 2 } })).toEqual({ a: [3], b: 1, c: { d: 2 } });
    testConfig({ startSkills: ["computer"], research: { cost: { ap: 9 } } });
    expect(DEFAULT_CONFIG.research.cost.ap).not.toBe(9);
  });

  it("can't empty a record by merging {}, so a named helper does it", () => {
    expect(testConfig({ characterModifiers: {} }).characterModifiers).toEqual(DEFAULT_CONFIG.characterModifiers);
    expect(noCharacterModifiers(testConfig()).characterModifiers).toEqual({});
  });
});
