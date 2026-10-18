import type { CharacterId } from "@mush2/shared";
import { spriteStrip } from "../art/assets.ts";
import { useKeyedSprite } from "../art/keyedSprite.ts";
import type { Facing } from "../iso/useWalkers.ts";

/**
 * One crew member drawn from a 6-frame walk strip (32x48 per frame). It plays
 * the walk cycle twice while `arriving` (someone who just entered the room walks in),
 * and loops it while `walking`. `facing` picks the strip (face or back) and
 * whether it is mirrored; the default faces down-left.
 */
export function CrewSprite({ character, facing, walking, arriving }: { character: CharacterId | undefined; facing?: Facing; walking?: boolean; arriving?: boolean }) {
  const url = useKeyedSprite(spriteStrip(character, facing?.strip ?? "face"));
  return (
    <div
      className={`crew-sprite${facing?.flip ? " flip" : ""}${walking ? " walking" : ""}${arriving ? " arriving" : ""}`}
      style={{ backgroundImage: url ? `url(${url})` : undefined }}
    />
  );
}
