// Drugs: 13 item types whose effects are drawn once per ship, at launch (`createGame`), and never change after.
// Every disease in `config.diseases.allDiseases` is treated by at least one drug.

import { DRUG_ITEMS, newItemId } from "./items.ts";
import { changeAP, changeMP, gainMorale, treatDisease } from "./adjustStats.ts";
import { skillsOf } from "./skills.ts";
import { rollInt, rollShuffle } from "./rng.ts";
import type { GameState, PlayerState } from "./types.ts";

export interface DrugEffect {
  /** Morale gained (negative: lost); 0 for none. */
  morale: number;
  /** AP gained; 0 for none. */
  ap: number;
  /** MP gained; 0 for none. */
  mp: number;
  /** The diseases it treats (`treatDisease`), 1 to `MAX_TREATED`. */
  treats: string[];
}

export const MORALE_EFFECTS: readonly number[] = [-2, 1, 2, 3];
export const BOOST_EFFECTS: readonly { ap: number; mp: number }[] = [
  { ap: 1, mp: 0 },
  { ap: 2, mp: 0 },
  { ap: 3, mp: 0 },
  { ap: 0, mp: 2 },
  { ap: 0, mp: 4 },
];
export const MAX_TREATED = 4;

/** Draws every drug's effects: 0-1 morale effect, 0-1 AP or MP effect, and 1-4 treated diseases. Advances `state.rng`. */
export function drawDrugs(state: Pick<GameState, "rng"> & { config: Pick<GameState["config"], "diseases"> }): Record<string, DrugEffect> {
  const diseases = state.config.diseases.allDiseases;
  // Deal the diseases out in turn so each is treated by at least one drug (up to 13 * 4 of them fit).
  const treats: string[][] = DRUG_ITEMS.map(() => []);
  for (const [i, disease] of rollShuffle(state, diseases).entries()) treats[i % DRUG_ITEMS.length]!.push(disease);
  const out: Record<string, DrugEffect> = {};
  DRUG_ITEMS.forEach((id, i) => {
    const wanted = Math.min(diseases.length, 1 + rollInt(state, MAX_TREATED));
    const mine = treats[i]!;
    for (const disease of rollShuffle(state, diseases)) {
      if (mine.length >= wanted) break;
      if (!mine.includes(disease)) mine.push(disease);
    }
    // Index 0 of each list means "no effect".
    const moraleRoll = rollInt(state, MORALE_EFFECTS.length + 1);
    const boostRoll = rollInt(state, BOOST_EFFECTS.length + 1);
    const boost = boostRoll === 0 ? { ap: 0, mp: 0 } : BOOST_EFFECTS[boostRoll - 1]!;
    out[id] = { morale: moraleRoll === 0 ? 0 : MORALE_EFFECTS[moraleRoll - 1]!, ap: boost.ap, mp: boost.mp, treats: mine };
  });
  return out;
}

/** How many random drugs each ship starts with, in the Medlab (owner, 2026-11-10). */
export const START_DRUGS = 12;

/** Puts `START_DRUGS` drugs, each of a random type, on the Medlab's floor. Mutates a state the caller already cloned. */
export function stockMedlab(state: GameState): void {
  for (let i = 0; i < START_DRUGS; i++) {
    state.items.push({ id: newItemId(state), type: DRUG_ITEMS[rollInt(state, DRUG_ITEMS.length)]!, at: { kind: "room", id: "SICK_BAY" } });
  }
}

/** The skills that reveal the drugs' effects: Biologist, Medic and Nurse (`first_aid`). Mush see them too. */
export const DRUG_LORE_SKILLS: readonly string[] = ["biologist", "medic", "first_aid"];

/** The drugs' effects, for a living Biologist, Medic, Nurse or Mush; null for everyone else (they learn by trying). */
export function drugEffectsSeenBy(state: Readonly<GameState>, player: Readonly<PlayerState>): Record<string, DrugEffect> | null {
  if (!player.alive) return null;
  if (player.role !== "mush" && !DRUG_LORE_SKILLS.some((skill) => skillsOf(player).includes(skill))) return null;
  return Object.fromEntries(Object.entries(state.drugs).map(([type, d]) => [type, { ...d, treats: [...d.treats] }]));
}

/** A human takes the drug: its AP, MP and morale effects, and it treats its diseases. Mutates a state the caller already cloned. */
export function applyDrug(state: GameState, player: PlayerState, type: string): void {
  const drug = state.drugs[type];
  if (!drug) return;
  changeAP(state, player, drug.ap);
  changeMP(state, player, drug.mp);
  gainMorale(state, player, drug.morale);
  for (const disease of drug.treats) treatDisease(state, player, disease);
}
