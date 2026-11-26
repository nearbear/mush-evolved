// Room equipment: fixed things in rooms (terminals, beds, showers, turrets).
// Which equipment is in which room comes from the original map (see
// placedEquipment in shipLayout.ts); this file only names the types.

import type { ItemTypeId } from "./itemIds.ts";
import { projectDone } from "./projects.ts";
import type { TitleId } from "./titles.ts";
import type { GameState, PlayerState } from "./types.ts";

export interface EquipmentType {
  /** Item type pulled from it, once per cycle per machine (confirmed 2026-10-13). */
  dispenses?: ItemTypeId;
  /** Players can lie down here. */
  bed?: boolean;
  /** Players can wash here. */
  shower?: boolean;
  /** A terminal: players can access it, which opens its (so far blank) window. */
  terminal?: boolean;
  /** A terminal only the holder of this title uses fully (see `hasTitleAccess`); anyone else gets limited access. */
  title?: TitleId;
  /** Can be dismantled, leaving this much scrap in the room. */
  dismantle?: { metal: number; plastic: number; chance?: number; extra?: ItemTypeId[] };
  /** A Mush can sabotage it (actions/sabotage.ts), if it can also break. */
  canBeSabotaged?: boolean;
  /** Only ever built from a blueprint: left out of the map's starting equipment even where the map draws one. */
  builtOnly?: boolean;
}

/**
 * English names, translated by hand from the French in Mush/data/DataExt.ods
 * (`objects` sheet) on 2026-10-11. PLANT_CONTROLLER has no entry there.
 */
export const EQUIPMENT_TYPES: Record<string, EquipmentType> = {
  ASTRO_MODULE: { terminal: true, canBeSabotaged: true },
  // Spawned in the refectory by the BEAT_BOX project (owner, 2026-11-22; projectEffects.ts); never there at the start.
  BEAT_BOX: { builtOnly: true, canBeSabotaged: true },
  BED: { bed: true },
  // Installed from a carried `camera` item (actions/install.ts); never part of the map. Dismantling it leaves the
  // camera item's scrap (#35, owner 2026-10-17).
  CAMERA: { dismantle: { metal: 1, plastic: 0, chance: 0.25 }, canBeSabotaged: true },
  COFFEE_DISPENSER: { dispenses: "coffee", canBeSabotaged: true },
  COMBUSTION_CHAMBER_ACCESS: {canBeSabotaged: true},
  COM_CENTER: { terminal: true, title: "comms_officer", canBeSabotaged: true },
  CRYO_MODULE: {},
  DRUG_DISP: { terminal: true, builtOnly: true, dismantle: { metal: 2, plastic: 1, chance: 0.25 }, },
  DYNARCADE: { builtOnly: true, canBeSabotaged: true },
  EMERGENCY_REACTOR: {canBeSabotaged: true },
  FUEL_TANK: {canBeSabotaged: true},
  GRAVITY_SIMULATOR: {canBeSabotaged: true },
  ICARUS_COMMAND: {},
  KITCHEN: {},
  MYCOSCAN: { builtOnly: true, canBeSabotaged: true },
  NERON_BIOS_TERM: { terminal: true, title: "neron_admin", canBeSabotaged: true },
  NERON_CORE: { terminal: true, canBeSabotaged: true },
  OXYGEN_TANK: { canBeSabotaged: true },
  PATROL_INTERFACE: {},
  // A patrol ship's and the Pasiphae's command, the only equipment in their rooms (patrol.ts).
  PATROL_COMMAND: {},
  PASIPHAE_COMMAND: {},
  PILGRED: { terminal: true },
  PILOT_MODULE: { terminal: true, title: "commander", canBeSabotaged: true },
  PLANET_SCANNER: {canBeSabotaged: true},
  // The engine room's shield emitter (owner, 2026-11-23): breakable/sabotageable, 6% base repair chance, starts broken (`config.startBrokenEquipment`).
  PLASMA_SHIELD: { canBeSabotaged: true },
  PLANT_CONTROLLER: { terminal: true, canBeSabotaged: true },
  RESEARCH_LAB: { terminal: true, canBeSabotaged: true },
  ROTATIONAL_REACTOR: {canBeSabotaged: true},
  SHOWER: { shower: true, canBeSabotaged: true },
  // Owner, 2026-10-18, from the French wiki: a bed that can be built in any room (more than one per room), never
  // there at the start; dismantling it leaves 1 plastic scrap.
  SOFA: { bed: true, builtOnly: true, dismantle: { metal: 0, plastic: 1, chance: 0.25 }, canBeSabotaged: true },
  STELLAR_ANTENNA: {canBeSabotaged: true},
  SUPER_CALC: { terminal: true, builtOnly: true, canBeSabotaged: true },
  // The cheat room's testing machine (#170, cheatRoom.ts): only ever in that room, on dev ships.
  SUPERKUBE: {},
  SURGERY_POD: {canBeSabotaged: true},
  TURRET_COMMAND: { terminal: true, canBeSabotaged: true },
};


/** Equipment type of an installed camera. An uninstalled camera is a `camera` item, not equipment. */
export const CAMERA_EQUIPMENT = "CAMERA";

/** Equipment type the DRUG_DISPENSER research adds to the Medlab. */
export const DRUG_DISPENSER_EQUIPMENT = "DRUG_DISP";
/** Equipment type the SUPER_CALC research adds to the Nexus. */
export const SUPER_CALC_EQUIPMENT = "SUPER_CALC";
/** Equipment type the CALL_OF_DIRTY project adds to Alpha Bay 2. */
export const DYNARCADE_EQUIPMENT = "DYNARCADE";

/** Equipment type the BEAT_BOX project adds to the refectory (`config.project.jukebox.room`). */
export const JUKEBOX_EQUIPMENT = "BEAT_BOX";

/** Id of the camera installed in a room (at most one per room). */
export const cameraEquipmentId = (room: string): string => `${room}:${CAMERA_EQUIPMENT}`;

/** Auxiliary NERON terminals on the map, offline until the `AUXILIARY_TERMINAL` project completes. */
export const AUXILIARY_TERMINAL_IDS: ReadonlySet<string> = new Set(["SICK_BAY:neron_sick", "MOTOR_ROOM:neron_engine"]);

/** Whether a piece of equipment is online (not an auxiliary terminal waiting for `AUXILIARY_TERMINAL`). */
export const isEquipmentEnabled = (state: Readonly<Pick<GameState, "projects">>, equipment: Readonly<{ id: string }>): boolean =>
  !AUXILIARY_TERMINAL_IDS.has(equipment.id) || projectDone(state, "AUXILIARY_TERMINAL");

/** The working equipment of this type in the player's room, or none: broken or offline equipment does nothing (breakage.ts). */
export const equipmentHere = (state: Readonly<GameState>, player: Readonly<PlayerState>, type: string) =>
  (state.equipment[player.room] ?? []).filter((equipment) => equipment.type === type && !equipment.broken && isEquipmentEnabled(state, equipment));

/** Whether the equipment with this id in `room` is broken (breakage.ts). */
export const isBrokenIn = (state: Readonly<GameState>, room: string, id: string): boolean =>
  state.equipment[room]?.find((equipment) => equipment.id === id)?.broken === true;
