import { describe, expect, it } from "vitest";
import type { ShipLayout } from "@mush2/shared";
import shipArtJson from "../../../Mush/derived/ship-art.json?raw";
import { FX_SHEET, lyingSprite } from "../../src/art/assets.ts";
import { atlasUrl } from "../../src/iso/shipLayout.ts";

const layout = { ...JSON.parse(shipArtJson), rooms: [] } as ShipLayout;
const WEBP_SHEETS = new Set(["BmpBigFill.p0", "BmpBigFill2.p0", "BmpGfx2", "BmpMidFill", "BmpMidFill2", "BmpGfxFx"]);

describe("atlasUrl and WebP spritesheets", () => {
  it("resolves every sheet in ship-art.json, using lossless WebP for the 6 large iso sheets", () => {
    for (const sheet of Object.keys(layout.sheets)) {
      const url = atlasUrl(layout, sheet);
      expect(url, `missing atlas URL for ${sheet}`).toBeTruthy();
      if (WEBP_SHEETS.has(sheet)) {
        expect(url, `${sheet} should load as .webp`).toMatch(/\.webp$/);
      }
    }
  });

  it("loads the cast and space-battle sheets as WebP", () => {
    expect(FX_SHEET).toMatch(/\.webp$/);
    expect(lyingSprite("jinsu")?.backgroundImage).toMatch(/\.webp\)$/);
  });
});
