import { describe, expect, it } from "vitest";
import type { ShipArt, SliceInfo } from "@mush2/shared";
import { buildPage, pageSheets } from "../../src/shipLayout/pages.ts";

const slice = (over: Partial<SliceInfo>): SliceInfo => ({
  sheet: "Big",
  x: 0,
  y: 0,
  width: 10,
  height: 10,
  framesX: 1,
  framesY: 1,
  flipX: false,
  flipY: false,
  rot: 0,
  offset: [0, 0],
  flags: [],
  frames: [],
  anims: [],
  ...over,
});

const art = (slices: Record<string, SliceInfo>): ShipArt => ({
  sheets: { Small: { image: "gfx/small.png", width: 50, height: 50 }, Big: { image: "gfx/Big.png", width: 200, height: 100 } },
  slices,
  autoBind: [],
});

/** Frame n's top-left in its sheet, as frameRect (web/src/iso/placement.ts) reads it. */
const frameAt = (s: SliceInfo, n: number) => [s.x + (n % s.framesX) * s.width, s.y + Math.floor(n / s.framesX) * s.height];

describe("pageSheets", () => {
  it("leaves sheets within the limit alone, and drops an oversized one nothing uses", () => {
    const small = slice({ sheet: "Small" });
    const { art: out, pages } = pageSheets(art({ a: small }), 100);
    expect(out.slices.a).toEqual(small);
    expect(Object.keys(out.sheets)).toEqual(["Small"]);
    expect(pages).toEqual([]);
  });

  it("wraps a strip wider than a page onto rows, keeping frame order", () => {
    // 12 frames of 15 px = 180 px, over a 100 px page: 2 rows of 6.
    const { art: out, pages } = pageSheets(art({ strip: slice({ x: 5, y: 20, width: 15, framesX: 12 }) }), 100);
    const s = out.slices.strip!;
    expect([s.sheet, s.framesX, s.framesY]).toEqual(["Big.p0", 6, 2]);
    expect(out.sheets["Big.p0"]).toEqual({ image: "derived/pages/Big-0.png", width: 90, height: 20 });
    // Each frame is copied from where it was to where frameRect now finds it.
    for (let n = 0; n < 12; n++) {
      const [dx, dy] = frameAt(s, n);
      expect(pages[0]!.blits[n]).toEqual({ sx: 5 + n * 15, sy: 20, dx, dy, width: 15, height: 10 });
    }
  });

  it("shares one copy between slices with the same frames, and starts a page when one is full", () => {
    const { art: out, pages } = pageSheets(
      art({ a: slice({ width: 60, height: 60 }), twin: slice({ width: 60, height: 60 }), b: slice({ y: 60, width: 60, height: 60 }) }),
      100,
    );
    expect(out.slices.twin).toMatchObject({ sheet: out.slices.a!.sheet, x: out.slices.a!.x, y: out.slices.a!.y });
    expect(out.slices.b!.sheet).not.toBe(out.slices.a!.sheet);
    expect(pages.map((p) => [p.sheet, p.blits.length])).toEqual([["Big.p0", 1], ["Big.p1", 1]]);
  });

  it("copies pixels onto the page", () => {
    const img = { width: 4, height: 2, rgba: new Uint8Array(32).map((_, i) => i) };
    const page = { sheet: "p", source: "s", image: "i", width: 2, height: 1, blits: [{ sx: 2, sy: 1, dx: 0, dy: 0, width: 2, height: 1 }] };
    expect([...buildPage(img, page).rgba]).toEqual([...img.rgba.subarray(24, 32)]);
  });
});
