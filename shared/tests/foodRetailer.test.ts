import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { PROJECT_COMPLETE } from "../src/projects.ts";
import { createGame } from "../src/rules.ts";
import type { GameState } from "../src/types.ts";
import { makeSeats, mustApply, setProgress } from "./support.ts";

// Pneumatic dispenser (FOOD_RETAILER): completing it puts an output tube and two input tubes in the Nexus (owner, 2026-11-04).
const work = { type: "project", equipment: "NEXUS_ROOM:NERON_CORE", project: "FOOD_RETAILER" } as const;

function ship(progress = PROJECT_COMPLETE - 1): GameState {
  const s = createGame(makeSeats(3, "others"), DEFAULT_CONFIG, 7);
  for (const p of s.players) p.room = "NEXUS_ROOM";
  if (progress > 0) setProgress(s, { project: "FOOD_RETAILER" }, progress);
  return s;
}

const tubes = (s: GameState) => s.items.filter((i) => i.type === "input_tube" || i.type === "output_tube");

describe("Food retailer project", () => {
  it("creates them on the Nexus floor once, when it completes", () => {
    const s = ship();
    expect(tubes(s)).toHaveLength(0);
    const done = mustApply(s, "p0", work);
    const made = tubes(done);
    expect(made.map((i) => i.type).sort()).toEqual(["input_tube", "input_tube", "output_tube"]);
    expect(made.every((i) => i.at.kind === "room" && i.at.id === "NEXUS_ROOM")).toBe(true);
    expect(new Set(made.map((i) => i.id)).size).toBe(3);
  });

  it("makes none before it is complete", () => {
    expect(tubes(mustApply(ship(0), "p0", work))).toHaveLength(0);
  });
});
