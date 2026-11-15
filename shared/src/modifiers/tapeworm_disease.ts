import { rumble } from "../diseases.ts";
import { ITEM_TYPES } from "../items.ts";
import type { Modifier } from "../modifiers.ts";

/** Extra satiety lost each cycle, on top of the base loss. */
const EXTRA_SATIETY_LOSS = 2;

// Tapeworm (owner, 2026-11-15): lasts 20-32 cycles (config.ts). +2 satiety lost each cycle (3 in all), and hunger
// starts `config.hunger.tapewormHungryAfterCycles` (8) cycles after satiety reaches 0, not 24 (statuses.ts, `isHungry`).
// Food (satiety above 0) gives half its AP, rounded down (the `mealAp` fold, consume.ts), and makes the stomach
// grumble (`rumble`, a public line). The folds never reach a Mush's diseases; a Mush's meal only grumbles.
export const tapeworm_disease: Modifier = {
  satietyPerCycle: (loss) => loss + EXTRA_SATIETY_LOSS,
  mealAp: (ap) => Math.floor(ap / 2),
  onConsume(next, player, item) {
    const consume = ITEM_TYPES[item.type]?.consume;
    if (consume && consume.satiety > 0) rumble(next, player);
  },
};
