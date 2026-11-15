import { vomit } from "../diseases.ts";
import type { Modifier } from "../modifiers.ts";
import { rollFloat } from "../rng.ts";

/** Chance to vomit on entering a room. */
const ENTER_VOMIT_CHANCE = 0.16;

// Slight Nausea (owner, 2026-11-15): lasts 12-20 cycles (config.ts). A 16% chance to vomit on entering a room (special
// logs), 1 extra satiety lost each cycle, and a Pilot can't fly (patrol.ts, `canFly`). The fold never reaches a Mush's
// diseases.
export const slight_nausea_disease: Modifier = {
  satietyPerCycle: (loss) => loss + 1,
  onEnterRoom(next, player) {
    if (rollFloat(next) < ENTER_VOMIT_CHANCE) vomit(next, player);
  },
};
