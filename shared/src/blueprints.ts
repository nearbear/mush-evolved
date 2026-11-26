// Blueprints: a `blueprint` item carries the key of one of these recipes in `ItemState.builds`.
// Building (actions/build.ts) consumes the blueprint and the ingredients and produces the result.

import type { ItemTypeId } from "./itemIds.ts";

export interface Blueprint {
  /** Item types consumed, one entry per unit. They may be carried or lying in the room. */
  needs: ItemTypeId[];
  /**
   * The result: a piece of room equipment (type from EQUIPMENT_TYPES) added to the builder's room, or an item
   * (type from ITEM_TYPES) handed to the builder (inventory if there is room, else the floor).
   */
  makes: { equipment: string } | { item: ItemTypeId };
}

/**
 * Recipes (decided 2026-10-16). The sofa's ingredients are the original's: metal scraps and a thick tube
 * (Mush/derived/data/DataExt/blueprints.json).
 */
export const BLUEPRINTS: Record<string, Blueprint> = {
  SOFA: { needs: ["metal_scraps", "thick_tube"], makes: { equipment: "SOFA" } },
  // Decided 2026-10-16: the original's first (weighted) recipe. The item has no effect yet.
  MISSILE_LAUNCHER: { needs: ["thick_tube", "metal_scraps", "plastic_scraps"], makes: { item: "missile_launcher" } },
  // Weapon blueprints (owner, 2026-11-16, blueprints.json): Lizaro Jungle and Old Faithful.
  SNIPER_RIFFLE: { needs: ["metal_scraps", "metal_scraps", "plastic_scraps"], makes: { item: "sniper_riffle" } },
  MACHINE_GUN: { needs: ["metal_scraps", "metal_scraps", "metal_scraps", "metal_scraps"], makes: { item: "machine_gun" } },
  // Expedition gear (owner, 2026-11-08, #357): the original's recipes (blueprints.json's weighted list).
  ECHO_SOUNDER: { needs: ["metal_scraps", "plastic_scraps"], makes: { item: "echo_sounder" } },
  HEAT_SEEKER: { needs: ["metal_scraps", "plastic_scraps"], makes: { item: "thermosensor" } },
  TRAD_MODULE: { needs: ["metal_scraps", "plastic_scraps"], makes: { item: "trad_module" } },
  // #411 (owner, 2026-11-11; eMushpedia "Drone de soutien"): 4 metal scraps and 1 plastic scrap.
  SUPPORT_DRONE: { needs: ["metal_scraps", "metal_scraps", "metal_scraps", "metal_scraps", "plastic_scraps"], makes: { item: "support_drone" } },
  WHITE_FLAG: { needs: ["old_shirt", "soap"], makes: { item: "white_flag" } },
  OSCILLOSCOPE: { needs: ["metal_scraps", "plastic_scraps"], makes: { item: "oscilloscope" } },
  EXTINGUISHER: { needs: ["metal_scraps", "oxy_capsule"], makes: { item: "extinguisher" } },
  GRENADE: { needs: ["oxy_capsule", "fuel_capsule"], makes: { item: "grenade" } },
  SNIPER_HELMET: { needs: ["metal_scraps", "plastic_scraps"], makes: { item: "sniper_helmet" } },
};
