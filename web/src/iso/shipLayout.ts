// Loads the ship: Mush/derived/ship-art.json (the sprites) and ship-map.json (the rooms and their
// tiles), both CC BY-NC-SA (see Mush/ATTRIBUTION.md), and the atlas images they reference.
// Fetched rather than imported so the 700 KB of JSON stays out of the JS bundle and out of type
// inference.
// BigFill and BigFill2 are too big for some GPUs; the layout points at their
// repacked pages in derived/pages/ instead (tools/src/shipLayout/pages.ts).

import { useEffect, useState } from "react";
import type { ShipArt, ShipLayout, ShipMap, SliceInfo } from "@mush2/shared";
import artUrl from "../../../Mush/derived/ship-art.json?url";
import mapUrl from "../../../Mush/derived/ship-map.json?url";
import { withoutBuiltOnly } from "./equipmentTiles.ts";

const atlases = import.meta.glob<string>(
  ["../../../Mush/clients/iso/gfx/{gfx_01,fx,SmallFill,MidFill,MidFill2,dev,Masks}.png", "../../../Mush/derived/pages/*.png"],
  { eager: true, query: "?url", import: "default" },
);

/** URL of a sheet's image; `image` is relative to Mush/, as in the layout file. */
export function atlasUrl(layout: ShipLayout, sheet: string): string | undefined {
  const image = layout.sheets[sheet]?.image;
  return image ? atlases[`../../../Mush/${image}`] : undefined;
}

let loading: Promise<ShipLayout> | undefined;

export function useShipLayout(): ShipLayout | undefined {
  const [layout, setLayout] = useState<ShipLayout>();
  useEffect(() => {
    let live = true;
    loading ??= loadShip().then(withoutBuiltOnly);
    loading.then((l) => live && setLayout(l)).catch(console.error);
    return () => {
      live = false;
    };
  }, []);
  return layout;
}

/**
 * The human_tank with a person floating in it: row 2 of MidFill2.png right under human_tank (y=1145).
 * Swapped in for human_tank once a Mush has died on the ship (humanTankFull).
 */
export const HUMAN_TANK_FULL_SLICE: SliceInfo = {
  sheet: "BmpMidFill2", // i18n-ignore: asset sheet name
  x: 0,
  y: 1145,
  width: 42,
  height: 62,
  framesX: 9,
  framesY: 1,
  flipX: false,
  flipY: false,
  rot: 0,
  offset: [-4, -18],
  flags: ["bloquer"],
  footprint: [1, 1],
  frames: [{ color: "507be4" }],
  anims: [
    {
      frames: [0, 1, 2, 3, 4, 5, 6, 7, 8],
      rhythm: [12, 12, 12, 12, 12, 12, 12, 12, 12],
      auto: true,
    },
  ],
  modulePad: [-1, 1],
};

/** The art and the map as they are in the files, without the game's changes (the ship map editor draws this). */
export async function loadShip(): Promise<ShipLayout> {
  const [art, map] = await Promise.all([fetchJson<ShipArt>(artUrl), fetchJson<ShipMap>(mapUrl)]);
  return {
    ...art,
    ...map,
    slices: {
      ...art.slices,
      human_tank_full: HUMAN_TANK_FULL_SLICE,
    },
  };
}

async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`ship layout: HTTP ${r.status} for ${url}`);
  return (await r.json()) as T;
}
