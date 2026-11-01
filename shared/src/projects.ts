// NERON projects, worked on at NERON's core in the Nexus. Built the same way as research (research.ts): only the ids live
// here (the names are translated in the client), progress is state (`GameState.projects`, percent), and the whole list
// is public (decided 2026-10-18). Each project's skill tags speed up work on it (owner, 2026-10-27); the original's other
// fields (difficulty `mod`, the 3-at-a-time offer, effects) are not used yet.

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
  { id: "WHOS_WHO", skills: [] },
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

/** How much of a project's effects the rules implement, like `ResearchStatus`. */
export type ProjectStatus = "full" | "partial" | "none";

/** Implementation status shown in the NERON core's project list. Update it when a project gains effects. */
export const PROJECT_STATUS: Readonly<Partial<Record<ProjectId, ProjectStatus>>> = {
  // The shield absorbs 67% of a hit instead of 33% (owner, 2026-10-24; ship.ts).
  PLASMA_SHIELD: "full",
  // Every player's AP cap +2 (owner, 2026-11-01; modifiers.ts `maxAp`, projectEffects.ts).
  NOISE_REDUCER: "full",
};

export function projectStatus(project: string): ProjectStatus {
  return PROJECT_STATUS[project as ProjectId] ?? "none";
}
