// NERON projects, worked on at NERON's core in the Nexus. Built the same way as research (research.ts): only the ids live
// here (the names are translated in the client), and progress is state (`GameState.projects`, percent). Only 3 randomly
// drawn projects are offered at a time (`newProjectDeck`, `offeredProjects`; owner, 2026-11-14). Each project's skill
// tags speed up work on it (owner, 2026-10-27).

import { rollShuffle, streamFor } from "./rng.ts";
import type { SkillId } from "./skills.ts";
import type { GameState } from "./types.ts";

/**
 * Every project in the original's live list (`projets.json`, above `$EOF`), each with card art in `Mush/www/img/cards/projects/`
 * (the file is the lowercase id). `skills` speed up work on it, each by `config.project.progress.skillBoost` (owner, 2026-10-27):
 * the original's `tags` column, with CONCEPTOR as `designer`. The 'plus' projects are tagged ALL, a pseudo-skill nobody has, so
 * they have none. A test checks the skills against the data.
 */
export const PROJECTS = [
  { id: "PATROL_SHIP_LAUNCHER", skills: ["pilot", "physicist"] },
  { id: "PATROLSHIP_BLASTER_GUN", skills: ["pilot", "gunman"] },
  { id: "BAY_DOOR_XXL", skills: ["pilot", "engineer"] },
  { id: "PATROLSHIP_EXTRA_AMMO", skills: ["physicist", "engineer"] },
  { id: "TURRET_EXTRA_FIRERATE", skills: ["physicist", "engineer"] },
  { id: "FIRE_SENSOR", skills: ["radio_expert", "fireman"] },
  { id: "DOOR_SENSOR", skills: ["radio_expert", "robotics"] },
  { id: "EQUIPMENT_SENSOR", skills: ["radio_expert", "engineer"] },
  { id: "QUANTUM_SENSORS", skills: ["astrophysician", "radio_expert"] },
  { id: "CHIPSET_ACCELERATION", skills: ["astrophysician", "computer"] },
  { id: "ICARUS_ANTIGRAV_PROPELLER", skills: ["pilot", "physicist"] },
  { id: "ICARUS_LARGER_BAY", skills: ["pilot", "engineer"] },
  { id: "ICARUS_LAVATORY", skills: ["biologist", "engineer"] },
  { id: "NERON_PROJECT_THREAD", skills: ["computer", "shrink"] },
  { id: "ARMOUR_CORRIDOR", skills: ["engineer", "physicist"] },
  { id: "PLASMA_SHIELD", skills: ["engineer", "physicist"] },
  { id: "EXTRA_HYDROPONPOTS", skills: ["engineer", "botanic"] },
  { id: "HYDROPONIC_INCUBATOR", skills: ["physicist", "botanic"] },
  { id: "HEAT_LAMP", skills: ["engineer", "botanic"] },
  { id: "AUXILIARY_TERMINAL", skills: ["computer", "radio_expert"] },
  { id: "AUTO_WATERING", skills: ["engineer", "fireman"] },
  { id: "RADAR_TRANS_VOID", skills: ["engineer", "radio_expert"] },
  { id: "MAGNETIC_NET", skills: ["pilot", "physicist"] },
  { id: "FOOD_RETAILER", skills: ["robotics", "cook"] },
  { id: "DISMANTLING", skills: ["engineer", "robotics"] },
  { id: "AUTO_RETURN_ICARUS", skills: ["computer", "robotics"] },
  { id: "EXTRA_DRONE", skills: ["engineer", "robotics"] },
  { id: "FISSION_COFFEE_ROASTER", skills: ["caffeinomaniac", "physicist"] },
  { id: "TRAIL_REDUCER", skills: ["pilot", "engineer"] },
  { id: "TRASH_LOAD", skills: [] },
  { id: "CALL_OF_DIRTY", skills: [] },
  { id: "BEAT_BOX", skills: [] },
  { id: "THALASSO", skills: [] },
  { id: "FLOOR_HEATING", skills: [] },
  { id: "NOISE_REDUCER", skills: [] },
  { id: "NERON_TARGETING_ASSIST", skills: [] },
  { id: "PARASITE_ELIM", skills: [] },
  { id: "OXY_MORE", skills: ["engineer", "biologist"] },
  { id: "BRIC_BROC", skills: ["designer", "creative"] },
  { id: "APERO_KITCHEN", skills: [] },
] as const satisfies readonly { id: string; skills: readonly SkillId[] }[];

export type ProjectId = (typeof PROJECTS)[number]["id"];

export const PROJECT_IDS: readonly ProjectId[] = PROJECTS.map((p) => p.id);

/** The skills that speed up work on a project (none for an unknown id). */
export function projectSkills(project: string): readonly SkillId[] {
  return PROJECTS.find((p) => p.id === project)?.skills ?? [];
}

export const PROJECT_COMPLETE = 100;

/** Whether a NERON project is complete. */
export function projectDone(state: Readonly<Pick<GameState, "projects">>, project: ProjectId): boolean {
  return (state.projects[project] ?? 0) >= PROJECT_COMPLETE;
}

/** Whether a merchant took `project` (TECHNO_REWRITE; owner, 2026-11-21): it can never be proposed or finished again. */
export function projectLost(state: Readonly<Pick<GameState, "lostProjects">>, project: ProjectId): boolean {
  return state.lostProjects.includes(project);
}

/** The projects that can still be finished: neither finished nor taken by a merchant. */
export function availableProjects(state: Readonly<Pick<GameState, "projects" | "lostProjects">>): ProjectId[] {
  return PROJECT_IDS.filter((id) => !projectDone(state, id) && !projectLost(state, id));
}

/** The game's shuffled project draw order, from its own stream so other rolls never shift it. */
export function newProjectDeck(seed: number): ProjectId[] {
  const stream = { rng: streamFor(seed, "projects") };
  return rollShuffle(stream, PROJECT_IDS);
}

/** How much of a project's effects the rules implement, like `ResearchStatus`. */
export type ProjectStatus = "full" | "partial" | "none";

/** Implementation status shown in the NERON core's project list. Update it when a project gains effects. */
export const PROJECT_STATUS: Readonly<Partial<Record<ProjectId, ProjectStatus>>> = {
  // Every attack on the Daedalus (damageShip) is reduced by 1 before the shield, floor 0 (owner, 2026-11-14; ship.ts).
  ARMOUR_CORRIDOR: "full",
  // Patrol ship, Pasiphae, and Icarus takeoff cost 1 AP less (owner, 2026-11-14; modifiers.ts `actionCost`).
  PATROL_SHIP_LAUNCHER: "full",
  // Patrol ship and Pasiphae takeoff and landing manoeuvres are always clean (owner, 2026-11-15; modifiers.ts `cleanManoeuvreChance`).
  BAY_DOOR_XXL: "full",
  // Patrol ships hold +6 max charges (10 -> 16) and gain +6 current charges on completion (owner, 2026-11-14; patrol.ts, projectEffects.ts).
  PATROLSHIP_EXTRA_AMMO: "full",
  // Every patrol ship hit does +1 damage, stacking with Cygni (owner, 2026-11-14; patrol.ts, patrol_attack.ts).
  PATROLSHIP_BLASTER_GUN: "full",
  // Turrets recharge twice as fast each cycle (owner, 2026-11-14; hunters.ts).
  TURRET_EXTRA_FIRERATE: "full",
  // Turret and patrol ship shots gain x1.25 hit chance for everyone (owner, 2026-11-14; modifiers.ts `actionSuccessRate`).
  NERON_TARGETING_ASSIST: "full",
  // The shield absorbs 67% of a hit instead of 33% (owner, 2026-10-24; ship.ts).
  PLASMA_SHIELD: "full",
  // Reports every fire: burning rooms turn red on the minimap and show on the alert bar (owner, 2026-11-02; #444).
  FIRE_SENSOR: "full",
  // Reports every broken piece of equipment on the alert bar (owner, 2026-11-14, #444; reports.ts).
  EQUIPMENT_SENSOR: "full",
  // Reports every broken door on the alert bar and colors broken doors yellow on the minimap (owner, 2026-11-14, #330; reports.ts).
  DOOR_SENSOR: "full",
  // Every player's AP cap +2 (owner, 2026-11-01; modifiers.ts `maxAp`, projectEffects.ts).
  NOISE_REDUCER: "full",
  // Each analysis reveals 1 extra sector (owner, 2026-11-01; modifiers.ts `analysisSectors`).
  QUANTUM_SENSORS: "full",
  // Scan for planets costs 1 AP less (owner, 2026-11-01; modifiers.ts `actionCost`).
  CHIPSET_ACCELERATION: "full",
  // Completing it puts an output tube and two input tubes in the Nexus (owner, 2026-11-04; projectEffects.ts); the Fruit Mover tubes themselves are tube_transfer.
  FOOD_RETAILER: "full",
  // Coffee machine regenerates twice a day (C1, C5; every cycle with PILGRED) (owner, 2026-11-02).
  FISSION_COFFEE_ROASTER: "full",
  // Each cycle change, 15% that all its incidents are prevented; the points are still spent (owner, 2026-11-08; incidents.ts).
  BRIC_BROC: "full",
  // Completing it adds the Dynarcade in Alpha Bay 2 (hiding the broken patrol ship); anyone can play for 1 AP (owner, 2026-11-14).
  CALL_OF_DIRTY: "full",
  // Completing it adds the jukebox in the refectory; Listen gives +3 morale once a day while your song plays (owner, 2026-11-22; jukebox.ts).
  BEAT_BOX: "full",
  // Completing it spawns 3 empty hydropots on the Hydroponic Garden floor (owner, 2026-11-14; projectEffects.ts).
  EXTRA_HYDROPONPOTS: "full",
  // Each producing plant in the garden (floor or carried) has a 50% chance at day start of producing an extra fruit while PLANT_CONTROLLER is working (owner, 2026-11-14; botany.ts).
  HEAT_LAMP: "full",
  // Young plants in the garden (floor or carried) age 2x per cycle while the Hydroponics center (PLANT_CONTROLLER) is working; maturation stays at day start (owner, 2026-11-14; botany.ts).
  HYDROPONIC_INCUBATOR: "full",
  // Plants in the garden (floor or carried) never fall sick at cycle change while PLANT_CONTROLLER is working (owner, 2026-11-14; botany.ts).
  PARASITE_ELIM: "full",
  // Any offered project above 0% gains +5% per cycle; at most one can complete per cycle (owner, 2026-11-14; projectEffects.ts).
  NERON_PROJECT_THREAD: "full",
  // Sick bay and engine room auxiliary NERON terminals stay offline (no access/project/coup/breakage, black screen) until complete (owner, 2026-11-14; equipment.ts).
  AUXILIARY_TERMINAL: "full",
  // Each burning room has a 25% chance per cycle to go out before acting, announced globally without the room (owner, 2026-11-14; fire.ts).
  AUTO_WATERING: "full",
  // Halves the share of "share" hunters following a jump (50% -> 25%) (owner, 2026-11-14; modifiers.ts `followingHuntersShare`).
  TRAIL_REDUCER: "full",
  // Completing it spawns 1 support drone on the Nexus floor (projectEffects.ts).
  EXTRA_DRONE: "full",
  // On jump or leaving orbit, patrol ships in flight dock cleanly in their bays with their pilots and cargo (owner, 2026-11-12; actions/land.ts).
  MAGNETIC_NET: "full",
  // On jump or leaving orbit, an expedition away (Icarus or patrol ship on a planet) is recalled safe instead of lost (owner, 2026-11-07, #356; expeditions.ts).
  AUTO_RETURN_ICARUS: "full",
  // Any expedition landing is safe (Nothing) even without a living Pilot aboard (owner, 2026-11-08; expeditions.ts).
  ICARUS_ANTIGRAV_PROPELLER: "full",
  // The Icarus holds 6 crew instead of 4 (owner, 2026-11-09, #359; expeditions.ts).
  ICARUS_LARGER_BAY: "full",
  // Returning from an Icarus expedition never makes the crew dirty (owner, 2026-11-15; expeditions.ts).
  ICARUS_LAVATORY: "full",
  // Each cycle has a 20% chance to prevent all oxygen loss (burn and broken tank leaks), announced globally (owner, 2026-11-15; ship.ts, breakage.ts).
  OXY_MORE: "full",
  // Halves the random injury chance on every action (50% reduction) (owner, 2026-11-15; modifiers.ts `actionInjuryRate`).
  FLOOR_HEATING: "full",
  // Non-Mush showers roll independently (25% each) for +1 HP, +1 morale, and +2 MP, each capped at max (owner, 2026-11-15; actions/shower.ts).
  THALASSO: "full",
  // Completing it spawns 8 metal scraps on the Engine Room floor (owner, 2026-11-15; projectEffects.ts).
  DISMANTLING: "full",
  // Completing it spawns one item from each pool across the storage rooms in shuffled order (owner, 2026-11-16; projectEffects.ts).
  TRASH_LOAD: "full",
  // Connection to Sol attempts and diplomacy trades cost 1 AP less; decoding a rebel base discards the lower of the two rolls (owner, 2026-11-16; modifiers.ts `actionCost`, comms.ts `rollRebelGain`).
  RADAR_TRANS_VOID: "full",
};

export function projectStatus(project: string): ProjectStatus {
  return PROJECT_STATUS[project as ProjectId] ?? "none";
}
