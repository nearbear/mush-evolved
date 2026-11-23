import { addDisease, diseaseAffects } from "../diseases.ts";
import type { Modifier } from "../modifiers.ts";

/** What a spore gives a carrier. */
const ON_SPORE = "quincks_oedema_disease";

// Black Bite (owner, 2026-11-21): lasts 20-32 cycles (config.ts). A Mush-only action (tagged `mush`: Spike, Demoralize,
// Body Transfer) aimed at a carrier costs the Mush no AP; anything else it costs (Spike's spore) is still paid. The Mush
// sees the 0 AP price, so it tells them who has it (an accepted leak, owner). A carrier who receives a spore catches
// Quincke's Oedema. A Mush carries it with none of this: the cost hooks never reach a Mush's diseases, and a spore that
// converts the carrier gives nothing, as with Mush Allergy.
export const black_bite_disease: Modifier = {
  roomActionCost: (cost, { actor, action, tags, holder }) =>
    actor?.role === "mush" && tags.includes("mush") && "target" in action && action.target === holder.id ? { ...cost, ap: 0 } : cost,
  onContaminate(next, player) {
    if (!player.alive || !diseaseAffects(player)) return;
    addDisease(next, player, ON_SPORE);
  },
};
