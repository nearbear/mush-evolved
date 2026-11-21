// What happens the moment a NERON project completes, whichever way it got there (worked on at the core, or picked by a
// NERON update, comms.ts). Effects that last are read where they apply (ship.ts for the Plasma Shield, `maxAp` in
// modifiers.ts for the Noise Reducer); this only refreshes what is stored.

import { updateMaxValues } from "./adjustStats.ts";
import { BLUEPRINT_ITEM } from "./blueprints.ts";
import { DYNARCADE_EQUIPMENT } from "./equipment.ts";
import { logPublic } from "./log.ts";
import { PATROL_SHIPS, patrolMaxCharges } from "./patrol.ts";
import { availableProjects, PROJECT_COMPLETE, PROJECT_IDS, projectDone, type ProjectId } from "./projects.ts";
import { BOOK_ITEM, spawnInRoom, SUPPORT_DRONE_ITEM, TREE_POT_ITEM } from "./items.ts";
import { newDrone } from "./droneIdentity.ts";
import { rollInt, rollShuffle } from "./rng.ts";
import { SKILLS } from "./skills.ts";
import type { DeepReadonly, GameConfig, GameCore, GameState, ItemState, PlayerState } from "./types.ts";

/**
 * The unfinished projects currently offered at NERON's core: the first `config.project.offerCount` unfinished entries
 * of `state.projectDeck`, or every unfinished project for a player with the `freeHacking` ("Unrestricted terminals") cheat.
 */
export function offeredProjects(
  state: Readonly<Pick<GameCore, "projects" | "projectDeck" | "lostProjects"> & { config: DeepReadonly<Pick<GameConfig, "project">> }>,
  player?: Readonly<Pick<PlayerState, "cheats">>,
): ProjectId[] {
  if (player?.cheats.includes("freeHacking")) {
    return availableProjects(state);
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
    for (const type of items) spawnInRoom(state, room, type);
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
    spawnInRoom(state, room, TREE_POT_ITEM, count);
  }
  // Extra drone (EXTRA_DRONE; 2026-11-14): spawns `count` support drone(s) on the floor of `room` (the Nexus).
  if (project === "EXTRA_DRONE") {
    const { room, count } = state.config.project.extraDrone;
    // What initNpc does for a support drone, without importing npcs.ts -> drones.ts (an import cycle; droneIdentity.ts).
    spawnInRoom(state, room, SUPPORT_DRONE_ITEM, count, () => ({ drone: newDrone(state) }));
  }
  // Dismantling (DISMANTLING; owner, 2026-11-15): spawns `count` metal scraps on the floor of `room` (the engine room).
  if (project === "DISMANTLING") {
    const { room, count } = state.config.project.dismantling;
    spawnInRoom(state, room, "metal_scraps", count);
  }
  // Scrap heap (TRASH_LOAD; owner, 2026-11-16): spawns one item per pool across `rooms` in shuffled order (wrapping).
  if (project === "TRASH_LOAD") {
    const { rooms, weaponBlueprints, misc } = state.config.project.trashLoad;
    const order = rollShuffle(state, rooms);
    const pick = <T,>(list: readonly T[]): T => list[rollInt(state, list.length)]!;
    const items: Array<{ type: string; extra?: Partial<Omit<ItemState, "id" | "type" | "at">> }> = [
      { type: "thick_tube" },
      { type: "plastic_scraps" },
      { type: BOOK_ITEM, extra: { teaches: pick(SKILLS) } },
      { type: BLUEPRINT_ITEM, extra: { builds: pick(weaponBlueprints) } },
      { type: "rope" },
      { type: "bandage" },
      { type: pick(misc) },
    ];
    for (const [i, item] of items.entries()) {
      spawnInRoom(state, order[i % order.length]!, item.type, 1, item.extra);
    }
  }
}

/**
 * Projects whose completion has a one-time effect that can't be undone (spawned items or equipment, extra patrol ship
 * charges), so a merchant can't take them back (TECHNO_REWRITE; owner, 2026-11-21). Every other finished project's
 * effects are read from `projectDone` as they apply, so they stop once it is lost. Keep it in step with
 * `onProjectCompleted`.
 */
export const ONE_TIME_PROJECTS: readonly ProjectId[] = [
  "FOOD_RETAILER",
  "CALL_OF_DIRTY",
  "PATROLSHIP_EXTRA_AMMO",
  "EXTRA_HYDROPONPOTS",
  "EXTRA_DRONE",
  "DISMANTLING",
  "TRASH_LOAD",
];

/** The finished projects a merchant can take: every finished one but `ONE_TIME_PROJECTS`, in project order. */
export function tradableProjects(state: Readonly<Pick<GameState, "projects">>): ProjectId[] {
  return PROJECT_IDS.filter((id) => projectDone(state, id) && !ONE_TIME_PROJECTS.includes(id));
}

/**
 * A merchant takes a finished `project` (owner, 2026-11-21): it is back to 0% and lost for good, never proposed or
 * finished again (`lostProjects`). Its effects stop with it; Noise reducer's AP cap is recomputed (current AP capped).
 */
export function loseProject(state: GameState, project: ProjectId): void {
  delete state.projects[project];
  if (!state.lostProjects.includes(project)) state.lostProjects.push(project);
  state.projectDeck = state.projectDeck.filter((id) => id !== project);
  if (project === "NOISE_REDUCER") for (const p of state.players) if (p.alive) updateMaxValues(state, p);
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
