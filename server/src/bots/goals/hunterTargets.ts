// Which hunter a bot shoots, for the turret and patrol-ship goals (owner, 2026-11-12, after #388): an Arack first,
// since it stops the ship from traveling; then the weakest, so shots finish kills; never an asteroid, since 20 hp is
// too much to shoot down and the way to escape one is to travel away from it.

import type { PlayerView } from "@mush2/shared";
import type { BotMemory } from "./types.ts";

type HunterList = NonNullable<PlayerView["hunters"]["list"]>;

/** `shots` worth taking, best first: Aracks, then the rest by hp; shots at asteroids (or unseen hunters) are dropped. */
export function shotOrder<O extends { action: { hunter: string } }>(shots: readonly O[], list: HunterList | null): O[] {
  const byId = new Map((list ?? []).map((h) => [h.id, h]));
  const rank = (o: O): [number, number] => {
    const h = byId.get(o.action.hunter)!;
    return [h.type === "spider" ? 0 : 1, h.hp];
  };
  return shots
    .filter((o) => {
      const h = byId.get(o.action.hunter);
      return h !== undefined && h.type !== "asteroid";
    })
    .sort((a, b) => {
      const [ka, ha] = rank(a);
      const [kb, hb] = rank(b);
      return ka - kb || ha - hb;
    });
}

/**
 * Whether the hunters out there are only asteroids, as far as this bot knows. Outside a turret room or a ship in
 * flight a bot sees only the public count, so it remembers the count when it last saw a list of nothing but asteroids
 * (`BotMemory.asteroidsOnly`), and trusts that while the count stays the same. Updates the memory from `view`.
 */
export function onlyAsteroids(view: PlayerView, memory: BotMemory): boolean {
  const { list, count } = view.hunters;
  if (list) memory.asteroidsOnly = list.length > 0 && list.every((h) => h.type === "asteroid") ? count : null;
  return count > 0 && memory.asteroidsOnly === count;
}
