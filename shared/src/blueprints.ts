// Blueprints: a `blueprint` item carries the key of one of these recipes in `ItemState.builds`.
// Building (actions/build.ts) consumes the blueprint and the ingredients and produces the result.

export interface Blueprint {
  /** Item types consumed, one entry per unit. They may be carried or lying in the room. */
  needs: string[];
  /**
   * The result: a piece of room equipment (type from EQUIPMENT_TYPES) added to the builder's room, or an item
   * (type from ITEM_TYPES) handed to the builder (inventory if there is room, else the floor).
   */
  makes: { equipment: string } | { item: string };
}

/**
 * Recipes (decided 2026-10-16). The sofa's ingredients are the original's: metal scraps and a thick tube
 * (Mush/derived/data/DataExt/blueprints.json).
 */
export const BLUEPRINTS: Record<string, Blueprint> = {
  SOFA: { needs: ["metal_scraps", "thick_tube"], makes: { equipment: "SOFA" } },
  // Decided 2026-10-16: the original's first (weighted) recipe. The item has no effect yet.
  MISSILE_LAUNCHER: { needs: ["thick_tube", "metal_scraps", "plastic_scraps"], makes: { item: "missile_launcher" } },
};

/** The item type that carries a recipe. Named after its icon, blueprint.jpg. */
export const BLUEPRINT_ITEM = "blueprint";
