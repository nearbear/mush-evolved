import type { GameConfig } from "./types.ts";

// PLACEHOLDER values so the skeleton runs. Player count, Mush count, AP, costs,
// and the map are open decisions (see CLAUDE.md) — confirm before changing rules.
export const SEAT_COUNT = 8;

export const DEFAULT_CONFIG: GameConfig = {
  mushCount: 2,
  apPerCycle: 4,
  moveCost: 1,
  startRoom: "corridor",
  // Hub-and-spoke placeholder map. Room ids match art in Mush/www/img/art/site/rooms.
  rooms: {
    corridor: ["command_center", "refectory", "sick_bay", "engineering_bay", "storage", "bedroom"],
    command_center: ["corridor"],
    refectory: ["corridor"],
    sick_bay: ["corridor"],
    engineering_bay: ["corridor"],
    storage: ["corridor"],
    bedroom: ["corridor"],
  },
};
