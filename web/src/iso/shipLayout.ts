// Loads Mush/derived/ship-layout.json (CC BY-NC-SA, see Mush/ATTRIBUTION.md)
// and the atlas images it references. Fetched rather than imported so the
// 400 KB of JSON stays out of the JS bundle and out of type inference.

import { useEffect, useState } from "react";
import type { ShipLayout } from "@mush2/shared";
import layoutUrl from "../../../Mush/derived/ship-layout.json?url";
import { withoutBuiltOnly } from "./equipmentTiles.ts";

const atlases = import.meta.glob<string>(
  "../../../Mush/clients/iso/gfx/{gfx_01,fx,SmallFill,MidFill,MidFill2,BigFill,BigFill2,dev,Masks}.png",
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
    loading ??= fetch(layoutUrl).then((r) => {
      if (!r.ok) throw new Error(`ship layout: HTTP ${r.status}`);
      return r.json() as Promise<ShipLayout>;
    }).then(withoutBuiltOnly);
    loading.then((l) => live && setLayout(l)).catch(console.error);
    return () => {
      live = false;
    };
  }, []);
  return layout;
}
