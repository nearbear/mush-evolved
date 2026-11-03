import { produceItem } from "../items.ts";
import type { Modifier } from "../modifiers.ts";

// Skill "paranoid" (the original's Paranoïaque), per the owner 2026-10-27: when picked, one extra `camera` item
// (the original gives two; the owner chose one), into the inventory, or on the room floor if the inventory is full.
// Installing it is the normal install action. Nothing else changes, and no log line (picking a skill writes none).
export const paranoid: Modifier = {
actionCost: (cost, { action, state }) => ((action.type === "install" || action.type === "uninstall") ? { ...cost, ap: 0 } : cost),
  onPick: (next, player) => {
    for (let i = 0; i < next.config.paranoid.cameras; i++) produceItem(next, player, "camera");
  },
};
