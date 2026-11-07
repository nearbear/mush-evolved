import { describe, expect, it } from "vitest";
import { PALETTE, SKY, starfield, starLayer } from "../../src/iso/starfield.ts";

/** Each pixel's alpha and colour; checked in plain loops, since an `expect` per pixel takes seconds over 65k pixels. */
const pixels = (rgba: Uint8ClampedArray | Uint8Array) =>
  Array.from({ length: rgba.length / 4 }, (_, i) => ({ alpha: rgba[i * 4 + 3]!, color: (rgba[i * 4]! << 16) | (rgba[i * 4 + 1]! << 8) | rgba[i * 4 + 2]! }));

describe("starfield", () => {
  const sky = starfield(256);

  it("is the same for the same seed and different for another", () => {
    expect(starfield(256).rgba).toEqual(sky.rgba);
    expect(starfield(256, 2).rgba).not.toEqual(sky.rgba);
  });

  it("is opaque and uses only the original backdrop's colors, mostly bare sky", () => {
    const palette = new Set(PALETTE);
    const all = pixels(sky.rgba);
    expect(all.filter((p) => p.alpha !== 255)).toHaveLength(0);
    expect(all.filter((p) => !palette.has(p.color))).toHaveLength(0);
    const bare = all.filter((p) => p.color === SKY).length / all.length;
    expect(bare).toBeGreaterThan(0.8);
    expect(bare).toBeLessThan(0.999);
  });
});

describe("starLayer", () => {
  it("is the same every time for a seed", () => {
    expect(starLayer(128, 5).rgba).toEqual(starLayer(128, 5).rgba);
  });

  it("is mostly transparent, with some opaque stars", () => {
    const all = pixels(starLayer(256).rgba);
    const opaque = all.filter((p) => p.alpha === 255).length;
    expect(opaque).toBeGreaterThan(0);
    expect(opaque / all.length).toBeLessThan(0.01);
  });
});
