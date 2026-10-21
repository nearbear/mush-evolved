import { describe, expect, it } from "vitest";
import { PALETTE, SKY, starfield } from "../../src/iso/starfield.ts";

describe("starfield", () => {
  const sky = starfield(256);
  const colorAt = (i: number) => (sky.rgba[i]! << 16) | (sky.rgba[i + 1]! << 8) | sky.rgba[i + 2]!;

  it("is the same for the same seed and different for another", () => {
    expect(starfield(256).rgba).toEqual(sky.rgba);
    expect(starfield(256, 2).rgba).not.toEqual(sky.rgba);
  });

  it("is opaque and uses only the original backdrop's colors, mostly bare sky", () => {
    const palette = new Set(PALETTE);
    let bare = 0;
    for (let i = 0; i < sky.rgba.length; i += 4) {
      expect(sky.rgba[i + 3]).toBe(255);
      expect(palette.has(colorAt(i))).toBe(true);
      if (colorAt(i) === SKY) bare++;
    }
    expect(bare / (256 * 256)).toBeGreaterThan(0.8);
    expect(bare / (256 * 256)).toBeLessThan(0.999);
  });
});
