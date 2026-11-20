// A planet sector's tag icon (`planetTagIcon`), shared by the expedition screen (ExpeditionTimeline.tsx) and the report
// (ExpeditionReportDialog.tsx). The icons are 40x40 pixel art drawn at a whole-number scale, the CSS `--zoom` of a
// parent (1 when none sets it); see styles/expedition-timeline.css.

import { planetTagIcon } from "../art/assets.ts";
import { useKeyedSprite } from "../art/keyedSprite.ts";

/** A sector's icon; null is the unknown sector, whose art has no alpha, so its background is keyed out. */
export function SectorIcon({ sector }: { sector: string | null }) {
  // The U-turn leads back to the landing site.
  const src = planetTagIcon(sector === "U_TURN" ? "LANDING" : sector);
  const unknown = src === planetTagIcon(null);
  return unknown ? <KeyedIcon src={src} /> : <img className="sector-icon" src={src} alt="" draggable={false} />;
}

function KeyedIcon({ src }: { src: string }) {
  const url = useKeyedSprite(src);
  return url ? <img className="sector-icon sector-icon-unknown" src={url} alt="" draggable={false} /> : <span className="sector-icon sector-icon-unknown" />;
}
