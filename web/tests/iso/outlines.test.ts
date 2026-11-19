import { describe, expect, it } from "vitest";
import type { ShipLayout } from "@mush2/shared";
import shipArtJson from "../../../Mush/derived/ship-art.json?raw";
import shipMapJson from "../../../Mush/derived/ship-map.json?raw";
import { SLICE_OUTLINES, insideOutline } from "../../src/iso/outlines.ts";

const layout = { ...JSON.parse(shipArtJson), ...JSON.parse(shipMapJson) } as ShipLayout;

describe("slice outlines", () => {
  it("fit inside their slice and outline equipment the map binds to it", () => {
    for (const [slice, outline] of Object.entries(SLICE_OUTLINES)) {
      const info = layout.slices[slice];
      expect(info, slice).toBeDefined();
      for (const [x, y] of outline) {
        expect(x >= 0 && x <= info!.width && y >= 0 && y <= info!.height, `${slice} (${x}, ${y})`).toBe(true);
      }
      expect(layout.rooms.some((r) => r.equipment.some((b) => b.tile === slice)), slice).toBe(true);
    }
  });

  it("keeps the plasma shield's coils and leaves out its console wall and floor trim", () => {
    const shield = SLICE_OUTLINES.plasma_shield!;
    expect(insideOutline(shield, 155, 100)).toBe(true); // the middle coils
    expect(insideOutline(shield, 110, 40)).toBe(true); // the tower
    expect(insideOutline(shield, 40, 60)).toBe(false); // the console wall
    expect(insideOutline(shield, 230, 165)).toBe(false); // floor trim right of the stairs
  });
});
