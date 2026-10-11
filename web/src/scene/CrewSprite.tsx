import type { CharacterId } from "@mush2/shared";
import { spriteStrip } from "../art/assets.ts";
import { useKeyedSprite } from "../art/keyedSprite.ts";

/**
 * One crew member drawn from a 6-frame walk strip (32x48 per frame). It plays
 * the walk cycle once on mount, so anyone who just entered the room walks in.
 */
export function CrewSprite({ character, flip }: { character: CharacterId | undefined; flip?: boolean }) {
  const url = useKeyedSprite(spriteStrip(character, "face"));
  return (
    <div
      className={`crew-sprite${flip ? " flip" : ""}`}
      style={{ backgroundImage: url ? `url(${url})` : undefined }}
    />
  );
}
