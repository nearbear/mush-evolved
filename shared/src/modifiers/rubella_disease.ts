import { changeMP, updateMaxValues } from "../adjustStats.ts";
import { addDisease, diseaseAffects, diseaseStats, itchy } from "../diseases.ts";
import type { Modifier } from "../modifiers.ts";
import { rollFloat } from "../rng.ts";

/** Chance to lose 1 MP at each cycle change. */
const CYCLE_MP_CHANCE = 0.5;
/** Chance to scratch (a public log) on entering a room. */
const ENTER_ITCH_CHANCE = 0.16;
/** Chance, at a cycle change spent lying down, that the bed gives no extra AP. */
const NO_REST_CHANCE = 0.3;

// Rubella (owner, 2026-11-17): lasts 12-20 cycles and spreads with a 2% chance to each other player in the room at a
// cycle change and on an encounter (config.ts, as Cold and Flu do; not by STT/DTT). At each cycle change a 50% chance to lose 1 MP; -3 max
// morale and -3 max health; a 16% chance to scratch (itchy, a special log) on entering a room; lying down, a 30% chance
// that the bed gives no extra AP (as Rejuvenation). A human with it can't cook or repair (`rubellaBlocks`, checked by
// cook, express_cook, repair, repair_hull, repair_pilgred and renovate). A Mush carries it without suffering any of it.
export const rubella_disease: Modifier = {
  onCycle(next, player) {
    const spread = diseaseStats(next, "rubella_disease")?.cycleSpread;
    if (spread != null) {
      for (const other of next.players) {
        if (other.alive && other.id !== player.id && other.room === player.room && rollFloat(next) < spread) addDisease(next, other, "rubella_disease");
      }
    }
    if (!diseaseAffects(player)) return;
    if (rollFloat(next) < CYCLE_MP_CHANCE && player.mp > 0) changeMP(next, player, -1);
  },
  maxMorale: (value) => (value - 3 < 0 ? 1 : value - 3),
  maxHp: (value) => (value - 3 < 0 ? 1 : value - 3),
  onPick: (next, player) => {
    updateMaxValues(next, player);
  },
  onEnterRoom(next, player) {
    if (rollFloat(next) < ENTER_ITCH_CHANCE) itchy(next, player);
  },
  onEncounter(next, _player, other) {
    const odds = diseaseStats(next, "rubella_disease")?.roomSpread;
    if (odds != null && rollFloat(next) < odds) addDisease(next, other, "rubella_disease");
  },
  spoilsRest: (next, player) => diseaseAffects(player) && rollFloat(next) < NO_REST_CHANCE,
};
