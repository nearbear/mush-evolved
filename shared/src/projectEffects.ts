// What happens the moment a NERON project completes, whichever way it got there (worked on at the core, or picked by a
// NERON update, comms.ts). Effects that last are read where they apply (ship.ts for the Plasma Shield, `maxAp` in
// modifiers.ts for the Noise Reducer); this only refreshes what is stored.

import { updateMaxValues } from "./adjustStats.ts";
import { DYNARCADE_EQUIPMENT } from "./equipment.ts";
import { logPublic } from "./log.ts";
import { PATROL_SHIPS, patrolMaxCharges } from "./patrol.ts";
import { PROJECT_COMPLETE, PROJECT_IDS, projectDone, type ProjectId } from "./projects.ts";
import { newItemId, SUPPORT_DRONE_ITEM, TREE_POT_ITEM } from "./items.ts";
import { newDrone } from "./droneIdentity.ts";
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
function onProjectCompleted(state: GameState, project: ProjectId): void {
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
  // Teslatron reservoir (PATROLSHIP_EXTRA_AMMO; owner, 2026-11-14): non-destroyed patrol ships gain +6 charges (capped at new max; Pasiphae unaffected).
  if (project === "PATROLSHIP_EXTRA_AMMO") {
    const extra = state.config.project.patrolShipExtraAmmo.extraCharges;
    for (const ship of PATROL_SHIPS) {
      if (ship.kind !== "patrol") continue;
      const shipState = state.patrolShips[ship.id]!;
      if (shipState.destroyed) continue;
      shipState.charges = Math.min(patrolMaxCharges(state, ship), shipState.charges + extra);
    }
  }
  // Extra hydropots (EXTRA_HYDROPONPOTS; owner, 2026-11-14): spawns `count` empty hydropots on the floor of `room`.
  if (project === "EXTRA_HYDROPONPOTS") {
    const { room, count } = state.config.project.extraHydropots;
    for (let i = 0; i < count; i++) state.items.push({ id: newItemId(state), type: TREE_POT_ITEM, at: { kind: "room", id: room } });
  }
  // Extra drone (EXTRA_DRONE; 2026-11-14): spawns `count` support drone(s) on the floor of `room` (the Nexus).
  if (project === "EXTRA_DRONE") {
    const { room, count } = state.config.project.extraDrone;
    for (let i = 0; i < count; i++) {
      // What initNpc does for a support drone, without importing npcs.ts -> drones.ts (an import cycle; droneIdentity.ts).
      state.items.push({ id: newItemId(state), type: SUPPORT_DRONE_ITEM, at: { kind: "room", id: room }, drone: newDrone(state) });
    }
  }
  // Dismantling (DISMANTLING; owner, 2026-11-15): spawns `count` metal scraps on the floor of `room` (the engine room).
  if (project === "DISMANTLING") {
    const { room, count } = state.config.project.dismantling;
    for (let i = 0; i < count; i++) state.items.push({ id: newItemId(state), type: "metal_scraps", at: { kind: "room", id: room } });
  }
}

/** Marks `project` complete, retires `retire` from the proposal deck, and runs its one-time completion effects. */
export function completeProject(state: GameState, project: ProjectId, retire: readonly ProjectId[] = [project]): void {
  state.projects[project] = PROJECT_COMPLETE;
  const retired = new Set(retire);
  state.projectDeck = state.projectDeck.filter((id) => !retired.has(id));
  onProjectCompleted(state, project);
}

/**
 * NERON participation (`NERON_PROJECT_THREAD`; owner, 2026-11-14): once complete, each cycle advances every
 * currently offered project strictly above 0% by `config.project.neronParticipation.percent` (5%). At most one
 * project can complete per cycle (any other that would reach 100% is capped at 99% before the batch retires).
 */
export function neronParticipationCycle(state: GameState): void {
  if (!projectDone(state, "NERON_PROJECT_THREAD")) return;
  const offered = offeredProjects(state);
  const step = state.config.project.neronParticipation.percent;
  let completed: ProjectId | undefined;
  for (const id of offered) {
    const current = state.projects[id] ?? 0;
    if (current <= 0 || current >= PROJECT_COMPLETE) continue;
    const next = Math.min(PROJECT_COMPLETE, current + step);
    if (next >= PROJECT_COMPLETE) {
      if (completed === undefined) {
        completed = id;
      } else {
        state.projects[id] = PROJECT_COMPLETE - 1;
      }
    } else {
      state.projects[id] = next;
    }
  }
  if (completed !== undefined) {
    completeProject(state, completed, offered);
    logPublic(state, undefined, "neronProjectCompleted", { project: completed });
  }
}
