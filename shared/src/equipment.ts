// Room equipment: fixed things in rooms (terminals, beds, showers, turrets).
// Which equipment is in which room comes from the original map (see
// placedEquipment in shipLayout.ts); this file only names the types.

export interface EquipmentType {
  /** Item type pulled from it, once per cycle per machine (confirmed 2026-10-13). */
  dispenses?: string;
  /** Players can wash here. */
  shower?: boolean;
  /** A terminal: players can access it, which opens its (so far blank) window. */
  terminal?: boolean;
}

/**
 * English names, translated by hand from the French in Mush/data/DataExt.ods
 * (`objects` sheet) on 2026-10-11. PLANT_CONTROLLER has no entry there.
 */
export const EQUIPMENT_TYPES: Record<string, EquipmentType> = {
  ASTRO_MODULE: { terminal: true },
  BEAT_BOX: {},
  BED: {},
  // Installed from a carried `camera` item (actions/install.ts); never part of the map.
  CAMERA: {},
  COFFEE_DISPENSER: { dispenses: "coffee" },
  COMBUSTION_CHAMBER_ACCESS: {},
  COM_CENTER: { terminal: true },
  CRYO_MODULE: {},
  DRUG_DISP: {},
  DYNARCADE: {},
  EMERGENCY_REACTOR: {},
  FUEL_TANK: {},
  GRAVITY_SIMULATOR: {},
  ICARUS_COMMAND: {},
  KITCHEN: {},
  MYCOSCAN: {},
  NERON_BIOS_TERM: { terminal: true },
  NERON_CORE: { terminal: true },
  OXYGEN_TANK: {},
  PATROL_INTERFACE: {},
  PILGRED: { terminal: true },
  PILOT_MODULE: { terminal: true },
  PLANET_SCANNER: {},
  PLANT_CONTROLLER: {},
  RESEARCH_LAB: { terminal: true },
  ROTATIONAL_REACTOR: {},
  SHOWER: { shower: true },
  SOFA: {},
  STELLAR_ANTENNA: {},
  SUPER_CALC: { terminal: true },
  SURGERY_POD: {},
  TURRET_COMMAND: {},
};


/** Equipment type of an installed camera. An uninstalled camera is a `camera` item, not equipment. */
export const CAMERA_EQUIPMENT = "CAMERA";

/** Id of the camera installed in a room (at most one per room). */
export const cameraEquipmentId = (room: string): string => `${room}:${CAMERA_EQUIPMENT}`;
