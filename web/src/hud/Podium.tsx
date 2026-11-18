// A standing sprite on its podium (styles/podium.css), or the bare podium when nobody stands on it. Decorative: the
// caller names who it is. Used by the character picker and the Icarus's seats.

import type { CharacterId } from "@mush2/shared";
import { standingSprite } from "../art/assets.ts";

export function Podium({ character }: { character?: CharacterId | undefined }) {
  return (
    <span className="pod-figure" aria-hidden="true">
      <span className="pod-podium" />
      {character && <span className="pod-sprite" style={standingSprite(character)} />}
    </span>
  );
}
