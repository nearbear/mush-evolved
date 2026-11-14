// Alien fruits (#437): 12 species (`fruit01`–`fruit12`) whose effects are drawn once per ship at launch (`createGame`)
// inside a target value budget, and never change after. Every alien fruit also gives the base +1 AP and +1 satiety
// carried on `ITEM_TYPES`.

import { changeAP, gainMorale } from "./adjustStats.ts";
import { heal } from "./death.ts";
import { ALIEN_FRUIT_ITEMS } from "./itemIds.ts";
import { type HasRng, roll, rollFloat, rollInt, rollShuffle } from "./rng.ts";
import { skillsOf } from "./skills.ts";
import type { DeepReadonly, FruitsConfig, GameState, PlayerState } from "./types.ts";

export const FRUIT_BUFF_IDS = ["treat_disease", "energize", "resistance", "perception"] as const;
export type FruitBuffId = (typeof FRUIT_BUFF_IDS)[number];

export interface FruitDisease {
  /** Disease id (`config.diseases.allDiseases`). */
  id: string;
  /** Probability per human meal of contracting this disease later (0.30..0.80). */
  odds: number;
}

export interface FruitEffect {
  /** Extra AP gained beyond every fruit's base +1 AP; 0 for none. */
  ap: number;
  /** Morale gained (negative: lost; applies to humans and Mush); 0 for none. */
  morale: number;
  /** HP gained (humans only); 0 for none. */
  hp: number;
  /** Distinct temporary buffs granted when eaten by a human (up to 3). */
  buffs: FruitBuffId[];
  /** Distinct diseases this fruit may trigger after a delay (up to 3). */
  diseases: FruitDisease[];
  /** Cycles a young plant of this species needs before becoming adult (`4 * value`, 12..24). */
  growCycles: number;
}

export interface PendingDisease {
  /** Disease id to contract when `atCycle` is reached. */
  id: string;
  /** Global `state.cycle` at which the disease manifests (`eatCycle + roll([2, 16])`). */
  atCycle: number;
}

/** Skills that reveal all alien fruit species' effects, disease odds and grow times (`cook` is Chef). Mush see them too. */
export const FRUIT_LORE_SKILLS: readonly string[] = ["botanic", "skilful", "cook"];

function rollFruit(
  rng: HasRng,
  cfg: DeepReadonly<FruitsConfig>,
  eligibleDiseases: readonly [string, number][],
): { effect: FruitEffect; value: number } {
  const apPick = rollInt(rng, cfg.ap.length + 1);
  const apOpt = apPick === 0 ? { ap: 0, value: 0 } : cfg.ap[apPick - 1]!;

  const moralePick = rollInt(rng, cfg.morale.length + 1);
  const moraleOpt = moralePick === 0 ? { morale: 0, value: 0 } : cfg.morale[moralePick - 1]!;

  const hpPick = rollInt(rng, cfg.hp.length + 1);
  const hpOpt = hpPick === 0 ? { hp: 0, value: 0 } : cfg.hp[hpPick - 1]!;

  const buffCount = rollInt(rng, Math.min(cfg.maxSpecials, FRUIT_BUFF_IDS.length) + 1);
  const buffs = rollShuffle(rng, FRUIT_BUFF_IDS).slice(0, buffCount);
  const buffsValue = buffs.reduce((sum, id) => sum + cfg.buffs[id].value, 0);

  const diseaseLimit = Math.min(cfg.maxDiseases, eligibleDiseases.length);
  const diseaseCount = rollInt(rng, diseaseLimit + 1);
  const pickedDiseases = rollShuffle(rng, eligibleDiseases).slice(0, diseaseCount);
  const diseases: FruitDisease[] = [];
  let diseasesValue = 0;
  for (const [id, cost] of pickedDiseases) {
    const odds = roll(rng, cfg.diseaseOdds) / 100;
    diseases.push({ id, odds });
    diseasesValue -= Math.max(1, Math.round((cost * odds) / cfg.diseaseValueDivisor));
  }

  const value = apOpt.value + moraleOpt.value + hpOpt.value + buffsValue + diseasesValue;
  return {
    value,
    effect: {
      ap: apOpt.ap,
      morale: moraleOpt.morale,
      hp: hpOpt.hp,
      buffs,
      diseases,
      growCycles: value * cfg.growCyclesPerPoint,
    },
  };
}

/**
 * Draws every alien fruit species' effects once at launch, re-rolling the whole fruit until its total value lands in
 * `config.botany.fruits.valueRange`. `createGame` passes its own `"fruits"` stream (`streamFor`).
 */
export function drawFruits(
  state: Pick<GameState, "rng"> & { config: Pick<GameState["config"], "botany" | "diseases"> },
): Record<string, FruitEffect> {
  const cfg = state.config.botany.fruits;
  const [minValue, maxValue] = cfg.valueRange;
  const eligibleDiseases = Object.entries(cfg.diseases).filter(
    ([id]) => id !== "cold_disease" && state.config.diseases.allDiseases.includes(id),
  );
  const out: Record<string, FruitEffect> = {};
  for (const id of ALIEN_FRUIT_ITEMS) {
    let chosen: FruitEffect | null = null;
    for (let attempt = 0; attempt < cfg.maxAttempts; attempt++) {
      const rolled = rollFruit(state, cfg, eligibleDiseases);
      if (rolled.value >= minValue && rolled.value <= maxValue) {
        chosen = rolled.effect;
        break;
      }
    }
    if (!chosen) throw new Error("fruit_generation_exceeded_max_tries");
    out[id] = chosen;
  }
  return out;
}

/** Alien fruit effects seen by a living Botanist, Skilful, Chef (`cook`) or Mush; null for everyone else. */
export function fruitEffectsSeenBy(
  state: Readonly<GameState>,
  player: Readonly<PlayerState>,
): Record<string, FruitEffect> | null {
  if (!player.alive) return null;
  if (player.role !== "mush" && !FRUIT_LORE_SKILLS.some((skill) => skillsOf(player).includes(skill))) return null;
  return Object.fromEntries(
    Object.entries(state.fruits).map(([type, f]) => [
      type,
      { ...f, buffs: [...f.buffs], diseases: f.diseases.map((d) => ({ ...d })) },
    ]),
  );
}

/**
 * A human eats an alien fruit: extra AP, morale, HP, non-stacking buff timers (re-eating resets them), and any
 * delayed diseases rolled for this meal. Mutates a state the caller already cloned.
 */
export function applyFruit(state: GameState, player: PlayerState, type: string): void {
  const fruit = state.fruits[type];
  if (!fruit) return;
  if (fruit.hp > 0) heal(state, player, fruit.hp);
  if (fruit.ap !== 0) changeAP(state, player, fruit.ap);
  if (fruit.morale !== 0) gainMorale(state, player, fruit.morale);

  const { buffs, diseaseDelay } = state.config.botany.fruits;
  for (const buff of fruit.buffs) {
    switch (buff) {
      case "treat_disease":
        player.treatDiseaseUntil = state.cycle + buffs.treat_disease.cycles;
        break;
      case "energize":
        player.energizeUntil = state.cycle + buffs.energize.cycles;
        break;
      case "resistance":
        player.immuneUntil = state.cycle + buffs.resistance.cycles;
        break;
      case "perception":
        player.perceptionUntil = state.cycle + buffs.perception.cycles;
        break;
    }
  }

  for (const disease of fruit.diseases) {
    if (rollFloat(state) >= disease.odds) continue;
    const delay = roll(state, diseaseDelay);
    (player.pendingDiseases ??= []).push({ id: disease.id, atCycle: state.cycle + delay });
  }
}
