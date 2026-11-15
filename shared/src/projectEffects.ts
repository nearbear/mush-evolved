// What happens the moment a NERON project completes, whichever way it got there (worked on at the core, or picked by a
// NERON update, comms.ts). Effects that last are read where they apply (ship.ts for the Plasma Shield, `maxAp` in
// modifiers.ts for the Noise Reducer); this only refreshes what is stored.

import { updateMaxValues } from "./adjustStats.ts";
import { DYNARCADE_EQUIPMENT } from "./equipment.ts";
import { PROJECT_IDS, projectDone, type ProjectId } from "./projects.ts";
import { newItemId, TREE_POT_ITEM } from "./items.ts";
import type { DeepReadonly, GameConfig, GameCore, GameState, PlayerState } from "./types.ts";

/**
 * The unfinished projects currently offered at NERON's core: the first `config.project.offerCount` unfinished entries
 * of `state.projectDeck`, or every unfinished project for a player with the `freeHacking` ("Unrestricted terminals") cheat.
 */
export function offeredProjects(
  state: Readonly<Pick<GameCore, "projects" | "projectDeck"> & { config: DeepReadonly<Pick<GameConfig, "project">> }>,
  player?: Readonly<Pick<PlayerState, "cheats">>,
): ProjectId[] {
  if (player?.cheats.includes("freeHacking")) {
    return PROJECT_IDS.filter((id) => !projectDone(state, id));
  }
  return state.projectDeck.filter((id) => !projectDone(state, id)).slice(0, state.config.project.offerCount);
}

/** Runs once when `project` reaches 100%. Mutates a state the caller already cloned. */
export function onProjectCompleted(state: GameState, project: ProjectId): void {
  // The AP cap goes up by 2; current AP doesn't (eMushpedia: only the maximum).
  if (project === "NOISE_REDUCER") for (const p of state.players) if (p.alive) updateMaxValues(state, p);
  // The pneumatic tubes (owner, 2026-11-04): an output and two inputs appear on the floor of the configured room (the Nexus).
  if (project === "FOOD_RETAILER") {
    const { room, items } = state.config.project.foodRetailer;
    for (const type of items) state.items.push({ id: newItemId(state), type, at: { kind: "room", id: room } });
  }
  // Dynarcade (CALL_OF_DIRTY; owner, 2026-11-14): spawns the Dynarcade in Alpha Bay 2 once complete.
  if (project === "CALL_OF_DIRTY") {
    const { room } = state.config.project.dynarcade;
    const id = `${room}:${DYNARCADE_EQUIPMENT}`;
    const list = (state.equipment[room] ??= []);
    if (!list.some((e) => e.id === id)) list.push({ id, type: DYNARCADE_EQUIPMENT });
  }
  // Extra hydropots (EXTRA_HYDROPONPOTS; owner, 2026-11-14): spawns `count` empty hydropots on the floor of `room`.
  if (project === "EXTRA_HYDROPONPOTS") {
    const { room, count } = state.config.project.extraHydropots;
    for (let i = 0; i < count; i++) state.items.push({ id: newItemId(state), type: TREE_POT_ITEM, at: { kind: "room", id: room } });
  }
}
