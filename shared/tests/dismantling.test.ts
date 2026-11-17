import { describe, expect, it } from "vitest";
import { advanceNeron } from "../src/comms.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { PROJECT_COMPLETE, PROJECT_IDS, projectStatus } from "../src/projects.ts";
import { createGame } from "../src/rules.ts";
import type { GameState } from "../src/types.ts";
import { clone, makeSeats, mustApply, setProgress } from "./support.ts";

// Dismantling (DISMANTLING; owner, 2026-11-15): completing it puts 8 metal scraps on the Engine Room floor.
const work = { type: "project", equipment: "NEXUS_ROOM:NERON_CORE", project: "DISMANTLING" } as const;

function ship(progress = PROJECT_COMPLETE - 1): GameState {
  const s = createGame(makeSeats(3, "others"), DEFAULT_CONFIG, 7);
  for (const p of s.players) p.room = "NEXUS_ROOM";
  setProgress(s, { project: "DISMANTLING" }, progress);
  return s;
}

const engineScraps = (s: GameState) =>
  s.items.filter((i) => i.type === "metal_scraps" && i.at.kind === "room" && i.at.id === s.config.project.dismantling.room);

describe("Dismantling project", () => {
  it("uses the confirmed config values and full status", () => {
    expect(DEFAULT_CONFIG.project.dismantling).toEqual({ room: "MOTOR_ROOM", count: 8 });
    expect(projectStatus("DISMANTLING")).toBe("full");
  });

  it("spawns 8 metal scraps on the Engine Room floor once, when it completes", () => {
    const s = ship();
    const before = engineScraps(s);
    const beforeIds = new Set(before.map((i) => i.id));
    const done = mustApply(s, "p0", work);
    const after = engineScraps(done);
    const added = after.filter((i) => !beforeIds.has(i.id));
    expect(added).toHaveLength(s.config.project.dismantling.count);
    expect(new Set(added.map((i) => i.id)).size).toBe(s.config.project.dismantling.count);
  });

  it("spawns metal scraps when a NERON update completes it", () => {
    const s = clone(ship(0));
    for (const id of PROJECT_IDS) if (id !== "DISMANTLING") s.projects[id] = PROJECT_COMPLETE;
    const before = engineScraps(s).length;
    expect(advanceNeron(s, 100)).toBe("DISMANTLING");
    expect(engineScraps(s)).toHaveLength(before + s.config.project.dismantling.count);
  });

  it("spawns none before it is complete", () => {
    const s = ship(0);
    const before = engineScraps(s).length;
    const after = mustApply(s, "p0", work);
    expect(engineScraps(after)).toHaveLength(before);
  });
});
