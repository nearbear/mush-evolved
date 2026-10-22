// Loads the ship: Mush/derived/ship-art.json (the sprites) and ship-map.json (the rooms and their
// tiles), both CC BY-NC-SA (see Mush/ATTRIBUTION.md), and the atlas images they reference.
// Fetched rather than imported so the 700 KB of JSON stays out of the JS bundle and out of type
// inference.
// BigFill and BigFill2 are too big for some GPUs; the layout points at their
// repacked pages in derived/pages/ instead (tools/src/shipLayout/pages.ts).

import { useEffect, useState } from "react";
import type { ShipArt, ShipLayout, ShipMap } from "@mush2/shared";
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
    loading ??= Promise.all([fetchJson<ShipArt>(artUrl), fetchJson<ShipMap>(mapUrl)]).then(([art, map]) => withoutBuiltOnly({ ...art, ...map }));
    loading.then((l) => live && setLayout(l)).catch(console.error);
    return () => {
      live = false;
    };
  }, []);
  return layout;
}

async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`ship layout: HTTP ${r.status} for ${url}`);
  return (await r.json()) as T;
}
