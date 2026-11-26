import { changeAP, gainMorale } from "../adjustStats.ts";
import { damage } from "../death.ts";
import { diseaseAffects, vomit } from "../diseases.ts";
import { ITEM_TYPES } from "../itemTypes.ts";
import type { Modifier } from "../modifiers.ts";

// Acid Reflux (owner, 2026-11-15): lasts 12-20 cycles (config.ts). After eating food (satiety above 0, so not a drug,
// as with gastroenteritis), the player loses 1 AP, 2 morale and 2 health (`damage`, so it can kill), and vomits.
// A Mush suffers no stats but still vomits (`vomit` keeps to special logs).
export const acid_reflux_disease: Modifier = {
  onConsume(next, player, item) {
    const consume = ITEM_TYPES[item.type]?.consume;
    if (!consume || consume.satiety <= 0) return;
    if (diseaseAffects(player)) {
      changeAP(next, player, -1);
      gainMorale(next, player, -2);
      damage(next, player, 2, "injury");
    }
    vomit(next, player);
  },
};
