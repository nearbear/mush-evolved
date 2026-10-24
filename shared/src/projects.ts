// NERON projects, worked on at NERON's core in the Nexus. Built the same way as research (research.ts): only the ids live
// here (the names are translated in the client), progress is state (`GameState.projects`, percent), and the whole list
// is public (decided 2026-10-18). The original's other fields (skill tags, the 3-at-a-time offer, effects) are not used yet.

/** Every project in the original's live list (`projets.json`, above `$EOF`), each with card art in `Mush/www/img/cards/projects/` (the file is the lowercase id). */
export const PROJECT_IDS = [
  "PATROL_SHIP_LAUNCHER",
  "PATROLSHIP_BLASTER_GUN",
  "BAY_DOOR_XXL",
  "PATROLSHIP_EXTRA_AMMO",
  "TURRET_EXTRA_FIRERATE",
  "FIRE_SENSOR",
  "DOOR_SENSOR",
  "EQUIPMENT_SENSOR",
  "QUANTUM_SENSORS",
  "CHIPSET_ACCELERATION",
  "ICARUS_ANTIGRAV_PROPELLER",
  "ICARUS_LARGER_BAY",
  "ICARUS_LAVATORY",
  "NERON_PROJECT_THREAD",
  "ARMOUR_CORRIDOR",
  "PLASMA_SHIELD",
  "EXTRA_HYDROPONPOTS",
  "HYDROPONIC_INCUBATOR",
  "HEAT_LAMP",
  "AUXILIARY_TERMINAL",
  "AUTO_WATERING",
  "RADAR_TRANS_VOID",
  "MAGNETIC_NET",
  "FOOD_RETAILER",
  "DISMANTLING",
  "AUTO_RETURN_ICARUS",
  "EXTRA_DRONE",
  "FISSION_COFFEE_ROASTER",
  "TRAIL_REDUCER",
  "TRASH_LOAD",
  "WHOS_WHO",
  "CALL_OF_DIRTY",
  "BEAT_BOX",
  "THALASSO",
  "FLOOR_HEATING",
  "NOISE_REDUCER",
  "NERON_TARGETING_ASSIST",
  "PARASITE_ELIM",
  "OXY_MORE",
  "BRIC_BROC",
  "APERO_KITCHEN",
] as const;

export const PROJECT_COMPLETE = 100;

/** How much of a project's effects the rules implement, like `ResearchStatus`. */
export type ProjectStatus = "full" | "partial" | "none";

/** Implementation status shown in the NERON core's project list. Update it when a project gains effects. */
export const PROJECT_STATUS: Readonly<Partial<Record<(typeof PROJECT_IDS)[number], ProjectStatus>>> = {
  // The shield absorbs 67% of a hit instead of 33% (owner, 2026-10-24; ship.ts).
  PLASMA_SHIELD: "full",
};

export function projectStatus(project: string): ProjectStatus {
  return PROJECT_STATUS[project as (typeof PROJECT_IDS)[number]] ?? "none";
}
