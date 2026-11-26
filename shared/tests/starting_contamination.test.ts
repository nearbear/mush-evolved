import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, PRESELECTION } from "../src/config.ts";
import { joinShip } from "../src/preselection.ts";
import { createGame, viewFor } from "../src/rules.ts";
import type { GameConfig, GameState } from "../src/types.ts";
import { makeSeats, must, testConfig } from "./support.ts";

// Owner, 2026-11-26: at Mush selection, two random humans without the Immunity trait start at contamination 1,
// silently. If fewer are eligible, nobody is contaminated.
const on = testConfig({ mushCount: 2, infection: { startingContaminated: DEFAULT_CONFIG.infection.startingContaminated } });
const off = testConfig({ mushCount: 2, infection: { startingContaminated: 0 } });
const { startingContaminated: wanted, startingLevel: level } = DEFAULT_CONFIG.infection;

const contaminated = (s: GameState) => Object.keys(s.contamination).sort();

function preselected(config: GameConfig, seed: number, n = 8): GameState {
  let s = createGame([], { ...config, preselection: { ...PRESELECTION, seats: n } }, seed);
  for (const seat of makeSeats(n)) s = must(joinShip(s, seat));
  return s;
}

describe("starting contamination at Mush selection", () => {
  it("is two humans at level 1 by default", () => {
    expect([wanted, level]).toEqual([2, 1]);
  });

  for (const [label, launch] of [
    ["at launch without pre-selection", (config: GameConfig, seed: number) => createGame(makeSeats(8), config, seed)],
    ["when pre-selection ends", preselected],
  ] as const) {
    it(`contaminates random living humans, never a Mush or an Immune character, ${label}`, () => {
      const picked = new Set<string>();
      for (let seed = 1; seed <= 20; seed++) {
        const s = launch(on, seed);
        expect(s.preselection).toBe(false);
        const ids = contaminated(s);
        expect(ids).toHaveLength(wanted);
        for (const id of ids) {
          const p = s.players.find((x) => x.id === id)!;
          expect([p.role, p.alive, s.contamination[id]]).toEqual(["human", true, level]);
          expect(p.modifiers).not.toContain("immunity");
          picked.add(id);
        }
      }
      expect(picked.size).toBeGreaterThan(wanted); // random, not always the same two
    });

    it(`is silent and moves no other roll, ${label}`, () => {
      const a = launch(on, 5);
      const b = launch(off, 5);
      expect(contaminated(b)).toEqual([]);
      // Same RNG, log and chat (no Mush-channel message): only the contamination differs.
      expect({ ...a, contamination: {}, config: null }).toEqual({ ...b, config: null });
      // Humans' views are unchanged, the contaminated ones' included.
      for (const p of a.players.filter((x) => x.role === "human")) {
        expect(JSON.stringify(viewFor(a, p.id))).toBe(JSON.stringify(viewFor(b, p.id)));
      }
    });
  }

  it("does nothing before pre-selection ends", () => {
    let s = createGame([], { ...on, preselection: { ...PRESELECTION, seats: 8 } }, 3);
    for (const seat of makeSeats(7)) s = must(joinShip(s, seat));
    expect(s.preselection).toBe(true);
    expect(contaminated(s)).toEqual([]);
  });

  it("contaminates nobody when fewer than two humans are eligible", () => {
    // chao, chun (Immune), eleesha, one Mush: at most one eligible human.
    const config = testConfig({ mushCount: 1, infection: { startingContaminated: wanted } });
    for (let seed = 1; seed <= 10; seed++) {
      const s = createGame(makeSeats(3), config, seed);
      expect(contaminated(s)).toEqual([]);
    }
  });
});
