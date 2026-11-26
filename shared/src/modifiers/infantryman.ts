import { CUSTOMIZED_BLASTER_ITEM } from "../itemIds.ts";
import { produceItem } from "../items.ts";
import type { Modifier } from "../modifiers.ts";

// Skill "infantryman" (Fantassin), per the owner 2026-11-15:
// - Doubles your chance to hit with turrets (`shoot` tag, stacking with Gunner).
// - +1 Shoot point per day and +1 when picked, sharing the Gunman cap (`config.gunman.capPoints`).
// - Spawns a customized blaster (`CUSTOMIZED_BLASTER_ITEM`) owned by the taker (`owner = player.id`), into the
//   inventory or room floor if full. Only the owner can fire it (`actions/attack.ts`), though anyone can carry it
//   and its +1 expedition power counts for the crew.
export const infantryman: Modifier = {
  actionSucessRate: (chance, { tags, state }) => (tags.includes("shoot") ? chance * state.config.infantryman.accuracyFactor : chance),
  shootPointsPerDay: (sum, _player, state) => sum + state.config.infantryman.pointsPerDay,
  onPick: (next, player) => {
    player.resources.shoot = Math.min(next.config.gunman.capPoints, player.resources.shoot + next.config.infantryman.pointsOnPick);
    produceItem(next, player, CUSTOMIZED_BLASTER_ITEM).item.owner = player.id;
  },
};
