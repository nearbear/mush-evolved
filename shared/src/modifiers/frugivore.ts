import { changeAP } from "../adjustStats.ts";
import { isAlienFruitType } from "../itemIds.ts";
import type { Modifier } from "../modifiers.ts";

// Skill "frugivore", owner 2026-11-14: eating a banana gives `frugivore.bananaAp` extra AP and eating an alien
// fruit (graft hybrids included, #438) gives `frugivore.alienFruitAp` extra AP on top of the fruit's own, still capped at maxAp. Humans only
// (`consumedByMush` skips skill `onConsume` hooks).
export const frugivore: Modifier = {
  onConsume(next, player, item) {
    if (item.type === "fruit_banana") {
      changeAP(next, player, next.config.frugivore.bananaAp);
    } else if (isAlienFruitType(item.type)) {
      changeAP(next, player, next.config.frugivore.alienFruitAp);
    }
  },
};
