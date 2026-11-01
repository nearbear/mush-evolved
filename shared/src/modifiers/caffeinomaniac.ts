import { changeAP } from "../adjustStats.ts";
import type { Modifier } from "../modifiers.ts";

// Skill "caffeinomaniac", confirmed 2026-10-16: consuming a coffee gives `caffeinomaniac.ap` extra AP on top of the
// coffee's own, still capped at maxAp. Bonuses for developing NERON projects are not built.
export const caffeinomaniac: Modifier = {
  onConsume(next, player, item) {
    if (item.type !== "coffee") return;
    changeAP(next, player, next.config.caffeinomaniac.ap);
  },
};
