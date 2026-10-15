// Room equipment: fixed things in rooms (terminals, beds, showers, turrets).
// Which equipment is in which room comes from the original map (see
// placedEquipment in shipLayout.ts); this file only names the types.

export interface EquipmentType {
  name: string;
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
  ASTRO_MODULE: { name: "Astro terminal" },
  BEAT_BOX: { name: "Jukebox" },
  BED: { name: "Bed" },
  COFFEE_DISPENSER: { name: "Coffee machine", dispenses: "coffee" },
  COMBUSTION_CHAMBER_ACCESS: { name: "Combustion chamber" },
  COM_CENTER: { name: "Communications center" },
  CRYO_MODULE: { name: "Cryo module" },
  DRUG_DISP: { name: "Drug distiller" },
  DYNARCADE: { name: "Dynarcade" },
  EMERGENCY_REACTOR: { name: "Emergency reactor" },
  FUEL_TANK: { name: "Fuel tank" },
  GRAVITY_SIMULATOR: { name: "Gravity simulator" },
  ICARUS_COMMAND: { name: "Icarus controls" },
  KITCHEN: { name: "Kitchen" },
  MYCOSCAN: { name: "Mycoscan" },
  NERON_BIOS_TERM: { name: "BIOS terminal" },
  NERON_CORE: { name: "NERON core" },
  OXYGEN_TANK: { name: "Oxygen tank" },
  PATROL_INTERFACE: { name: "Patrol ship" },
  PILGRED: { name: "PILGRED reactor" },
  PILOT_MODULE: { name: "Command terminal" },
  PLANET_SCANNER: { name: "Planet scanner" },
  PLANT_CONTROLLER: { name: "Plant controller" },
  RESEARCH_LAB: { name: "Research lab" },
  ROTATIONAL_REACTOR: { name: "Lateral reactor" },
  SHOWER: { name: "Shower", shower: true },
  SOFA: { name: "Swedish sofa" },
  STELLAR_ANTENNA: { name: "Antenna" },
  SUPER_CALC: { name: "Supercomputer" },
  SURGERY_POD: { name: "Surgery station" },
  TURRET_COMMAND: { name: "Turret controls" },
};

export function equipmentName(type: string): string {
  return EQUIPMENT_TYPES[type]?.name ?? type;
}
