import { describe, expect, it } from "vitest";
import { espPulse, filterKey, lookOf, paddingOf } from "../../src/iso/pixi/effects.ts";
import type { SceneSprite } from "../../src/iso/scene.ts";

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
  it("draws fog as a tint, with no filter", () => {
    const look = lookOf(sprite({ effect: "fogged" }));
    expect(look.tint).toBe(0x4d4d4d);
    expect(filterKey(look)).toBe("");
    expect(lookOf(sprite({ effect: "foggedLifted" })).tint).toBe(0x808080);
  });

  it("needs no filter for a plain sprite", () => {
    expect(filterKey(lookOf(sprite({})))).toBe("");
  });

  it("brightens and glows a hovered door, as in iso.css", () => {
    const look = lookOf(sprite({ role: "door", effect: "doorHover" }));
    expect(look.brightness).toBe(1.35);
    expect(look.glow).toEqual({ token: "--accent", sigma: 1.5 });
    expect(paddingOf(look)).toBe(5);
  });

  it("keeps a fogged person's shadow, and shares a filter between people with the same look", () => {
    const fogged = lookOf(sprite({ role: "person", shadow: "standing", effect: "fogged" }));
    const plain = lookOf(sprite({ role: "person", shadow: "standing" }));
    expect(fogged.shadow).toEqual({ x: 0, y: 3, sigma: 1, alpha: 0.6 });
    expect(filterKey(fogged)).toBe(filterKey(plain));
    expect(filterKey(fogged)).not.toBe(filterKey(lookOf(sprite({ role: "person", shadow: "standing", effect: "hover" }))));
    expect(paddingOf(plain)).toBe(6);
  });

  it("gives a selected body its shadow and the highlight glow", () => {
    const look = lookOf(sprite({ role: "corpse", shadow: "lying", effect: "selected" }));
    expect(look.shadow?.sigma).toBe(0.5);
    expect(look.glow?.token).toBe("--highlight");
    expect(look.brightness).toBe(1);
  });
});

describe("espPulse", () => {
  it("runs from 0.65 to 1 and back every 3.2 seconds", () => {
    expect(espPulse(0, false)).toBeCloseTo(0.65);
    expect(espPulse(1600, false)).toBeCloseTo(1);
    expect(espPulse(3200, false)).toBeCloseTo(0.65);
    expect(espPulse(800, false)).toBeCloseTo(0.825);
  });

  it("holds at 1 with reduced motion", () => {
    expect(espPulse(400, true)).toBe(1);
  });
});
