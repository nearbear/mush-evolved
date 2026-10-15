// Room equipment: fixed things in rooms (terminals, beds, showers, turrets).
// Which equipment is in which room comes from the original map (see
// placedEquipment in shipLayout.ts); this file only names the types.

export interface EquipmentType {
  /** Item type pulled from it, once per cycle per machine (confirmed 2026-10-13). */
  dispenses?: string;
  /** Players can wash here. */
  shower?: boolean;
}

/**
 * English names, translated by hand from the French in Mush/data/DataExt.ods
 * (`objects` sheet) on 2026-10-11. PLANT_CONTROLLER has no entry there.
 */
export const EQUIPMENT_TYPES: Record<string, EquipmentType> = {
  ASTRO_MODULE: {},
  BEAT_BOX: {},
  BED: {},
  COFFEE_DISPENSER: { dispenses: "coffee" },
  COMBUSTION_CHAMBER_ACCESS: {},
  COM_CENTER: {},
  CRYO_MODULE: {},
  DRUG_DISP: {},
  DYNARCADE: {},
  EMERGENCY_REACTOR: {},
  FUEL_TANK: {},
  GRAVITY_SIMULATOR: {},
  ICARUS_COMMAND: {},
  KITCHEN: {},
  MYCOSCAN: {},
  NERON_BIOS_TERM: {},
  NERON_CORE: {},
  OXYGEN_TANK: {},
  PATROL_INTERFACE: {},
  PILGRED: {},
  PILOT_MODULE: {},
  PLANET_SCANNER: {},
  PLANT_CONTROLLER: {},
  RESEARCH_LAB: {},
  ROTATIONAL_REACTOR: {},
  SHOWER: { shower: true },
  SOFA: {},
  STELLAR_ANTENNA: {},
  SUPER_CALC: {},
  SURGERY_POD: {},
  TURRET_COMMAND: {},
};

