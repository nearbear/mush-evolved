// Desktop only: the star field behind the whole game screen (styles/backdrop.css). The Pixi renderer draws into it
// (iso/backdrop.ts), moving and turning the stars with the ship; until it does, or while the room view shows something
// else (the patrol cockpit, the Icarus, a death notice), the same sky shows as a still CSS tile (hud/spaceSky.ts).

import type { CSSProperties } from "react";
import { ftlSpaceSky, spaceSky } from "./hud/spaceSky.ts";

export function SpaceBackdrop({ ref, ftl = false }: { ref: (el: HTMLDivElement | null) => void; ftl?: boolean }) {
  const sky = ftl ? ftlSpaceSky() : spaceSky();
  const style = sky ? ({ "--sky": `url(${sky.sky})`, "--stars": `url(${sky.stars})` } as CSSProperties) : undefined;
  return (
    <div ref={ref} className={ftl ? "space-backdrop ftl" : "space-backdrop"} aria-hidden="true" style={style}>
      {ftl && (
        <>
          <div className="space-backdrop-layer space-backdrop-sky" />
          <div className="space-backdrop-layer space-backdrop-stars" />
        </>
      )}
    </div>
  );
}
