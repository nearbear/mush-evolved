import { describe, expect, it } from "vitest";
import { espPulse, filterKey, lookOf, selectionPulse } from "../../src/iso/pixi/effects.ts";
import type { SceneSprite } from "../../src/iso/scene.ts";

// What a look costs, not how it looks: tints, glows and timings are tuned by eye (`npm run screenshot`), so they aren't
// pinned here. A filter per sprite is what would make the renderer slow, so these check which looks need one and that
// sprites with the same look share it.

const sprite = (over: Partial<SceneSprite>): SceneSprite => ({
  key: "s",
  x: 0,
  y: 0,
  width: 32,
  height: 16,
  image: { url: "u", frame: { sx: 0, sy: 0, width: 32, height: 16 }, keyed: false },
  role: "tile",
  ...over,
});

describe("Pixi looks", () => {
  it("need no filter for a plain sprite, or for fog, which is a tint", () => {
    expect(filterKey(lookOf(sprite({})))).toBe("");
    expect(filterKey(lookOf(sprite({ effect: "fogged" })))).toBe("");
    expect(filterKey(lookOf(sprite({ effect: "foggedLifted" })))).toBe("");
  });

  it("share a filter between people with the same look, fogged or not", () => {
    const fogged = lookOf(sprite({ role: "person", shadow: "standing", effect: "fogged" }));
    const plain = lookOf(sprite({ role: "person", shadow: "standing" }));
    expect(filterKey(fogged)).not.toBe("");
    expect(filterKey(fogged)).toBe(filterKey(plain));
    expect(filterKey(fogged)).not.toBe(filterKey(lookOf(sprite({ role: "person", shadow: "standing", effect: "hover" }))));
  });
});

describe("espPulse", () => {
  it("holds still with reduced motion", () => {
    expect(espPulse(400, true)).toBe(1);
    expect(espPulse(1600, true)).toBe(1);
  });
});

describe("selectionPulse", () => {
  it("holds still with reduced motion and stays visible while it pulses", () => {
    expect(selectionPulse(300, true)).toBe(1);
    for (let t = 0; t < 1200; t += 50) {
      expect(selectionPulse(t, false)).toBeGreaterThanOrEqual(0.5);
      expect(selectionPulse(t, false)).toBeLessThanOrEqual(1);
    }
  });

  it("is one shared filter for every selected sprite", () => {
    const a = filterKey(lookOf(sprite({ role: "person", shadow: "standing", effect: "selected" })));
    const b = filterKey(lookOf(sprite({ role: "person", shadow: "standing", effect: "selected" })));
    expect(a).toBe(b);
    expect(a).not.toBe(filterKey(lookOf(sprite({ role: "person", shadow: "standing", effect: "broken" }))));
  });
});
