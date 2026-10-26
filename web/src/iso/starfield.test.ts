import { describe, expect, it } from "vitest";
import { starfield, starLayer } from "./starfield.ts";

describe("starLayer", () => {
  it("is the same every time for a seed", () => {
    expect(starLayer(128, 5).rgba).toEqual(starLayer(128, 5).rgba);
  });

  it("is mostly transparent, with some opaque stars", () => {
    const { rgba } = starLayer(256);
    let opaque = 0;
    for (let i = 3; i < rgba.length; i += 4) if (rgba[i] === 255) opaque++;
    expect(opaque).toBeGreaterThan(0);
    expect(opaque / (rgba.length / 4)).toBeLessThan(0.01);
  });
});

describe("starfield", () => {
  it("is fully opaque", () => {
    const { rgba } = starfield(64);
    for (let i = 3; i < rgba.length; i += 4) expect(rgba[i]).toBe(255);
  });
});
