import { describe, expect, it } from "vitest";
import { NO_FORMATION, aimedSlot, hunterIn, stepAim, track } from "../../src/hud/hunterSlots.ts";

const h = (id: string, hp = 6) => ({ id, hp });

describe("hunter slots", () => {
  it("gives new hunters the lowest free slots, in list order", () => {
    expect(track(NO_FORMATION, [h("a"), h("b"), h("c")]).slots).toEqual({ a: 0, b: 1, c: 2 });
  });

  it("keeps a hunter's slot when another dies, and reuses the gap", () => {
    const first = track(NO_FORMATION, [h("a"), h("b"), h("c")]);
    const second = track(first, [h("a"), h("c")]);
    expect(second.slots).toEqual({ a: 0, c: 2 });
    expect(track(second, [h("a"), h("c"), h("d"), h("e")]).slots).toEqual({ a: 0, c: 2, d: 1, e: 3 });
  });

  it("returns the same object when nothing changed", () => {
    const first = track(NO_FORMATION, [h("a"), h("b")]);
    expect(track(first, [h("a"), h("b")])).toBe(first);
  });

  it("counts a hit when hp drops, not when a hunter arrives", () => {
    const first = track(NO_FORMATION, [h("a"), h("b")]);
    expect(first.hits).toEqual({ a: 0, b: 0 });
    const second = track(first, [h("a", 2), h("b")]);
    expect(second.hits).toEqual({ a: 1, b: 0 });
    expect(second.hp.a).toBe(2);
  });

  it("aims at the next hunter when the target's slot empties, wrapping", () => {
    const f = track(track(NO_FORMATION, [h("a"), h("b"), h("c")]), [h("a"), h("c")]);
    expect(aimedSlot(f, 1)).toBe(2);
    expect(hunterIn(f, aimedSlot(f, 1))).toBe("c");
    expect(aimedSlot(f, 3)).toBe(0);
    expect(aimedSlot(NO_FORMATION, 0)).toBeUndefined();
  });

  it("steps through occupied slots both ways, wrapping", () => {
    const f = track(track(NO_FORMATION, [h("a"), h("b"), h("c")]), [h("a"), h("c")]);
    expect(stepAim(f, 0, 1)).toBe(2);
    expect(stepAim(f, 2, 1)).toBe(0);
    expect(stepAim(f, 0, -1)).toBe(2);
    expect(stepAim(NO_FORMATION, 5, 1)).toBe(5);
  });
});
