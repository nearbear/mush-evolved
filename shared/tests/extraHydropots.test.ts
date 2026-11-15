import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { TREE_POT_ITEM } from "../src/items.ts";
import { PROJECT_COMPLETE } from "../src/projects.ts";
import { createGame } from "../src/rules.ts";
import type { GameState } from "../src/types.ts";
import { makeSeats, mustApply, setProgress } from "./support.ts";

// Extra hydropots (EXTRA_HYDROPONPOTS; owner, 2026-11-14): completing it puts 3 empty hydropots on the Hydroponic Garden floor.
const work = { type: "project", equipment: "NEXUS_ROOM:NERON_CORE", project: "EXTRA_HYDROPONPOTS" } as const;

function ship(progress = PROJECT_COMPLETE - 1): GameState {
  const s = createGame(makeSeats(3, "others"), DEFAULT_CONFIG, 7);
  for (const p of s.players) p.room = "NEXUS_ROOM";
  setProgress(s, { project: "EXTRA_HYDROPONPOTS" }, progress);
  return s;
}

const gardenPots = (s: GameState) =>
  s.items.filter((i) => i.type === TREE_POT_ITEM && i.at.kind === "room" && i.at.id === s.config.project.extraHydropots.room);

describe("Extra hydropots project", () => {
  it("uses the confirmed config values", () => {
    expect(DEFAULT_CONFIG.project.extraHydropots).toEqual({ room: "HYDROPONIC_CENTER", count: 3 });
  });

  it("spawns empty hydropots on the Hydroponic Garden floor once, when it completes", () => {
    const s = ship();
    const before = gardenPots(s);
    const beforeIds = new Set(before.map((i) => i.id));
    const done = mustApply(s, "p0", work);
    const after = gardenPots(done);
    const added = after.filter((i) => !beforeIds.has(i.id));
    expect(added).toHaveLength(s.config.project.extraHydropots.count);
    expect(added.every((i) => i.plant === undefined)).toBe(true);
    expect(new Set(added.map((i) => i.id)).size).toBe(s.config.project.extraHydropots.count);
  });

  it("spawns none before it is complete", () => {
    const s = ship(0);
    const before = gardenPots(s).length;
    const after = mustApply(s, "p0", work);
    expect(gardenPots(after)).toHaveLength(before);
  });
});
