import { addDisease } from "../diseases.ts";
import { legInjury } from "./legInjury.ts";
import type { Modifier } from "../modifiers.ts";

const base = legInjury({ maxHpLoss: 4, maxMpLoss: 12 });

// Unusable Legs (owner, 2026-11-22; eMushpedia's "Jambes inutilisables"): the upgrade of Mashed Foot and Broken Leg
// (INJURY_UPGRADES, diseases.ts). -4 max health, -12 max MP (skipped by a wheelchair user), and a Critical Haemorrhage
// when it appears. Moving costs no extra MP, and moving stays possible (the owner's spec leaves out the wiki's "can't move").
export const unusable_legs_injury: Modifier = {
  ...base,
  onPick: (next, player) => {
    base.onPick!(next, player);
    addDisease(next, player, "critical_haemorrhage_injury");
  },
};
