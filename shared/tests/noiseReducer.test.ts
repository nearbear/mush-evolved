import { describe, expect, it } from "vitest";
import { advanceNeron } from "../src/comms.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { PROJECT_COMPLETE, PROJECT_IDS } from "../src/projects.ts";
import { createGame, viewFor } from "../src/rules.ts";
import type { GameState } from "../src/types.ts";
import { clone, makeSeats, mustApply, nextCycle, pickSkill, player, setProgress } from "./support.ts";

const config = DEFAULT_CONFIG;
const bonus = config.project.noiseReducer.maxAp;
const work = { type: "project", equipment: "NEXUS_ROOM:NERON_CORE", project: "NOISE_REDUCER" } as const;

/** Three players at NERON's core; p1 has Lethargy. The Noise Reducer is one action from done. */
function ship(): GameState {
  let s = createGame(makeSeats(3, "others"), config, 7);
  for (const p of s.players) p.room = "NEXUS_ROOM";
  s = pickSkill(s, "p1", "lethargy");
  setProgress(s, { project: "NOISE_REDUCER" }, PROJECT_COMPLETE - 1);
  return s;
}

describe("Noise Reducer", () => {
  it("pins the decided number: +2 AP cap", () => {
    expect(bonus).toBe(2);
  });

  it("raises everyone's AP cap by 2 when worked to completion, added after Lethargy's doubling (14 and 26), but not their AP", () => {
    const s = ship();
    const before = s.players.map((p) => p.ap);
    const done = mustApply(s, "p0", work);
    expect(done.projects.NOISE_REDUCER).toBe(PROJECT_COMPLETE);
    expect(player(done, "p0").maxAp).toBe(config.maxAp + bonus);
    expect(player(done, "p2").maxAp).toBe(config.maxAp + bonus);
    expect(player(done, "p1").maxAp).toBe(config.maxAp * config.lethargy.maxApMultiplier + bonus);
    expect([14, 26]).toEqual([player(done, "p2").maxAp, player(done, "p1").maxAp]);
    expect(player(done, "p2").ap).toBe(before[2]);
    expect(viewFor(done, "p2").maxAp).toBe(config.maxAp + bonus);
  });

  it("lets AP refill past the old cap, up to the new one", () => {
    let s = mustApply(ship(), "p0", work);
    player(s, "p2").ap = config.maxAp;
    for (let i = 0; i < 4; i++) s = nextCycle(s);
    expect(player(s, "p2").ap).toBe(config.maxAp + bonus);
  });

  it("also applies when a NERON update completes it, and to a skill picked afterwards", () => {
    let s = createGame(makeSeats(3, "others"), config, 7);
    for (const id of PROJECT_IDS) if (id !== "NOISE_REDUCER") s.projects[id] = PROJECT_COMPLETE;
    s.comms.neron.progress = 0;
    s = clone(s);
    expect(advanceNeron(s, 100)).toBe("NOISE_REDUCER");
    expect(s.players.map((p) => p.maxAp)).toEqual(s.players.map(() => config.maxAp + bonus));
    s = pickSkill(s, "p1", "lethargy");
    expect(player(s, "p1").maxAp).toBe(config.maxAp * config.lethargy.maxApMultiplier + bonus);
  });

  it("changes nothing while unfinished", () => {
    const s = ship();
    expect(s.players.map((p) => p.maxAp)).toEqual([config.maxAp, config.maxAp * config.lethargy.maxApMultiplier, config.maxAp]);
  });
});
