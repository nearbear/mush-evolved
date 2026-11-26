// ---- Shared plant status -----------------------------------------------------
// Sharing the greenhouse plant status in the Botany feature (owner, 2026-11-21): at a working Hydroponics center
// (`PLANT_CONTROLLER`), a living player with an iTrackie posts an editable snapshot of the greenhouse's plants plus an
// optional free-text note. The values are never checked against the real plants: lies and mistakes are allowed, like
// Astrophysics's `sharePlanet`. Only the latest share is kept, pinned above the Botany thread; sharing again replaces
// it and posts a system message in Botany chat. Like chat, this is not an Action, and the server moderates the free
// text (note and per-plant effects) first.

import { plantControllerHere } from "./botany.ts";
import { chatChannels, pushChat } from "./chat.ts";
import { cloneState, dayOf, fail, findPlayer, isRecord, type ActionResult } from "./helpers.ts";
import { ITEM_TYPES } from "./itemTypes.ts";
import { MAX_SHARED_PLANET_LENGTH, MAX_SHARED_PLANET_LINES } from "./sharedPlanets.ts";
import type { GameState, PlayerId, PlayerState, SharedPlantRow, SharedPlantStatus } from "./types.ts";

/** Most plant rows in a single greenhouse status share. */
export const MAX_SHARED_PLANTS = 32;

/** Longest per-plant effects string in a greenhouse status share. */
export const MAX_SHARED_PLANT_EFFECTS_LENGTH = 200;

/** Most lines in a per-plant effects string; moderation enforces it. */
export const MAX_SHARED_PLANT_EFFECTS_LINES = 10;

/** Longest free-text note in a greenhouse status share (same as a shared planet). */
export const MAX_SHARED_PLANT_TEXT_LENGTH = MAX_SHARED_PLANET_LENGTH;

/** Most lines in a greenhouse status note; moderation enforces it. */
export const MAX_SHARED_PLANT_TEXT_LINES = MAX_SHARED_PLANET_LINES;

/** Highest diseased cycle count a sharer may claim. */
export const MAX_SHARED_PLANT_SICK_CYCLES = 999;

/** Whether `id` is a valid fruit/plant species id (`fruit_banana`, alien species, or graft hybrid). */
export const isValidPlantSpecies = (id: unknown): id is string =>
  typeof id === "string" && Object.hasOwn(ITEM_TYPES, id) && ITEM_TYPES[id]?.fruit === true;

/** Whether `value` is a valid shared plant row (for wire parsing and rules validation). */
export function parseSharedPlantRow(value: unknown, maxEffectsLength = MAX_SHARED_PLANT_EFFECTS_LENGTH): SharedPlantRow | null {
  if (!isRecord(value)) return null;
  const { species, effects, thirst, sickCycles, young } = value;
  if (!isValidPlantSpecies(species)) return null;
  if (typeof effects !== "string" || effects.length > maxEffectsLength) return null;
  if (thirst !== 0 && thirst !== 1 && thirst !== 2) return null;
  if (sickCycles !== null && (!Number.isSafeInteger(sickCycles) || (sickCycles as number) < 1 || (sickCycles as number) > MAX_SHARED_PLANT_SICK_CYCLES)) return null;
  if (typeof young !== "boolean") return null;
  return { species, effects, thirst, sickCycles: sickCycles as number | null, young };
}

/**
 * Whether this player may share the greenhouse plant status now: alive at a working Hydroponics center
 * (`PLANT_CONTROLLER`) with what opens the Botany feature (an iTrackie, or the rebel base's brain probes).
 */
export const canSharePlants = (state: Readonly<GameState>, player: Readonly<PlayerState>): boolean =>
  player.alive && plantControllerHere(state, player.room).length > 0 && chatChannels(state, player).includes("botany");

/**
 * Shares the greenhouse plant status in the Botany feature, replacing any previous share. Free. `text` and each row's
 * `effects` come moderated.
 */
export function sharePlants(state: GameState, playerId: PlayerId, plants: readonly SharedPlantRow[], text: string): ActionResult {
  const p = findPlayer(state, playerId);
  if (!p || !canSharePlants(state, p)) return fail("share_forbidden");
  if (!Array.isArray(plants) || plants.length > MAX_SHARED_PLANTS) return fail("share_plants_invalid");
  const normalized: SharedPlantRow[] = [];
  for (const row of plants) {
    const parsed = parseSharedPlantRow(row);
    if (!parsed) return fail("share_plants_invalid");
    normalized.push({ ...parsed, effects: parsed.effects.trim() });
  }
  if (typeof text !== "string") return fail("share_text_invalid");
  const body = text.trim();
  if (body.length > MAX_SHARED_PLANT_TEXT_LENGTH) return fail("share_text_invalid");

  const next = cloneState(state);
  const hadPrior = next.sharedPlants !== null;
  next.sharedPlants = { plants: normalized, text: body, by: playerId, ...dayOf(next) };
  pushChat(next, "botany", { from: null, isBot: false, text: "", system: { key: hadPrior ? "plantShareUpdated" : "plantShared", params: { name: p.character } } });
  return { ok: true, state: next };
}

/** Deep copy of the shared greenhouse plant status for a view, or null if none was shared. */
export function sharedPlantsView(state: Readonly<Pick<GameState, "sharedPlants">>): SharedPlantStatus | null {
  if (!state.sharedPlants) return null;
  const { plants, text, by, day, cycleOfDay } = state.sharedPlants;
  return { plants: plants.map((row) => ({ ...row })), text, by, day, cycleOfDay };
}
