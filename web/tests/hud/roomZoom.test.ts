import { afterEach, describe, expect, it, vi } from "vitest";
import { BIG_ROOM_QUERY, defaultRoomZoom, stepZoom, ZOOM_STEPS } from "../../src/hud/InventoryOverlay.tsx";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("defaultRoomZoom", () => {
  it("defaults to 1 when window is unavailable", () => {
    expect(defaultRoomZoom()).toBe(1);
  });

  it("defaults to 2 on viewports matching the big-room media query (wide desktops, upright phones)", () => {
    const matchMedia = vi.fn((query: string) => ({ matches: query === BIG_ROOM_QUERY }));
    vi.stubGlobal("window", { matchMedia });

    expect(defaultRoomZoom()).toBe(2);
    expect(matchMedia).toHaveBeenCalledWith(BIG_ROOM_QUERY);
  });

  it("defaults to 1 on narrower or shorter viewports", () => {
    const matchMedia = vi.fn(() => ({ matches: false }));
    vi.stubGlobal("window", { matchMedia });

    expect(defaultRoomZoom()).toBe(1);
    expect(matchMedia).toHaveBeenCalledWith(BIG_ROOM_QUERY);
  });

  it("covers wide desktops and the upright phone layout", () => {
    expect(BIG_ROOM_QUERY).toContain("(min-width: 2000px) and (min-height: 900px)");
    expect(BIG_ROOM_QUERY).toContain("(max-width: 1023px) and (orientation: portrait)");
  });

  it("defaults to 1 when matchMedia is absent", () => {
    vi.stubGlobal("window", {});
    expect(defaultRoomZoom()).toBe(1);
  });
});

describe("stepZoom", () => {
  it("steps between ZOOM_STEPS and stops at the ends", () => {
    expect(ZOOM_STEPS).toEqual([0.5, 1, 2]);
    expect(stepZoom(2, 1)).toBeUndefined();
    expect(stepZoom(2, -1)).toBe(1);
    expect(stepZoom(1, 1)).toBe(2);
    expect(stepZoom(1, -1)).toBe(0.5);
    expect(stepZoom(0.5, 1)).toBe(1);
    expect(stepZoom(0.5, -1)).toBeUndefined();
  });
});
