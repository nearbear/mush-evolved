import { BLUEPRINT_ITEM } from "../blueprints.ts";
import { produceItem } from "../items.ts";
import type { Modifier } from "../modifiers.ts";

// Skill "robotics" (the original's Robotics Expert; #411, phase 1 of #410): when picked, a support drone blueprint
// (`SUPPORT_DRONE`), into the inventory, or on the room floor if the inventory is full, like `green_thumb`. Picking it
// again through a skill book gives another. Upgrading drones is a later phase of #410. No log line (picking a skill writes none).
export const robotics: Modifier = {
  onPick: (next, player) => {
    produceItem(next, player, BLUEPRINT_ITEM).item.builds = "SUPPORT_DRONE";
  },
};
