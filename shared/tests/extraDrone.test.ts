import { describe, expect, it } from "vitest";
import { advanceNeron } from "../src/comms.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { SUPPORT_DRONE_ITEM } from "../src/itemIds.ts";
import { PROJECT_COMPLETE, PROJECT_IDS } from "../src/projects.ts";
import { createGame } from "../src/rules.ts";
import type { GameState } from "../src/types.ts";
import { clone, makeSeats, mustApply, nextCycle, setProgress } from "./support.ts";

// Extra drone (EXTRA_DRONE): completing it puts 1 support drone on the Nexus floor.
const work = { type: "project", equipment: "NEXUS_ROOM:NERON_CORE", project: "EXTRA_DRONE" } as const;

function ship(progress = PROJECT_COMPLETE - 1): GameState {
  const s = createGame(makeSeats(3, "others"), DEFAULT_CONFIG, 7);
  for (const p of s.players) p.room = "NEXUS_ROOM";
  setProgress(s, { project: "EXTRA_DRONE" }, progress);
  return s;
}

const nexusDrones = (s: GameState) =>
  s.items.filter((i) => i.type === SUPPORT_DRONE_ITEM && i.at.kind === "room" && i.at.id === s.config.project.extraDrone.room);

describe("Extra drone project", () => {
  it("uses the confirmed config values", () => {
    expect(DEFAULT_CONFIG.project.extraDrone).toEqual({ room: "NEXUS_ROOM", count: 1 });
  });

  it("spawns a support drone on the Nexus floor once, when it completes", () => {
    const s = ship();
    const before = nexusDrones(s);
    const beforeIds = new Set(before.map((i) => i.id));
    const done = mustApply(s, "p0", work);
    const after = nexusDrones(done);
    const added = after.filter((i) => !beforeIds.has(i.id));
    expect(added).toHaveLength(s.config.project.extraDrone.count);
    for (const drone of added) {
      expect(drone.drone).toBeDefined();
      expect(drone.drone!.name.length).toBeGreaterThan(0);
      expect(drone.drone!.serial).toBeGreaterThanOrEqual(1);
      expect(drone.drone!.upgrades).toEqual([]);
      expect(drone.drone!.failures).toEqual({ repair: 0, extinguish: 0, shoot: 0 });
    }
    expect(new Set(added.map((i) => i.id)).size).toBe(s.config.project.extraDrone.count);

    // The spawned drone survives a cycle change, where NPCs act.
    expect(nextCycle(done).items.some((i) => i.id === added[0]!.id)).toBe(true);
  });

  it("spawns a drone when a NERON update completes it", () => {
    const s = clone(ship(0));
    for (const id of PROJECT_IDS) if (id !== "EXTRA_DRONE") s.projects[id] = PROJECT_COMPLETE;
    const before = nexusDrones(s).length;
    expect(advanceNeron(s, 100)).toBe("EXTRA_DRONE");
    expect(nexusDrones(s)).toHaveLength(before + 1);
  });

  it("spawns none before it is complete", () => {
    const s = ship(0);
    const before = nexusDrones(s).length;
    const after = mustApply(s, "p0", work);
    expect(nexusDrones(after)).toHaveLength(before);
  });
});
