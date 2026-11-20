import type { Modifier } from "../modifiers.ts";
import { peopleHere } from "../actions/action.ts";
import { gainMorale } from "../adjustStats.ts";

// Raluca's Antisocial trait (owner, 2026-11-19, #470): at each cycle change she loses `config.antisocial.moraleLoss`
// morale if at least one other living player shares her room (any number costs the same), Mush or not, aboard the Icarus
// too. Runs in `cycleChanged`, after `hopelessCycle`, so reaching 0 this way still leaves her a cycle to recover.
// Bond refuses her with `antisocial` (actions/bond.ts).
export const antisocial: Modifier = {
  onCycle(next, player) {
    if (peopleHere(next, player).length > 0) gainMorale(next, player, -next.config.antisocial.moraleLoss, "antisocialMoraleLoss");
  },
};
