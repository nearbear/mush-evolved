import { describe, expect, it } from "vitest";
import { CHARACTERS } from "../src/characters.ts";
import { resolveConfig } from "../src/config.ts";
import { startGame } from "../src/replay.ts";
import { applyAction, viewFor } from "../src/rules.ts";
import { NEVER_BOTS, SINGLE_PLAYER_HUMAN, SINGLE_PLAYER_SEATS, singlePlayerGame } from "../src/singlePlayer.ts";
import { must, player } from "./support.ts";

const start = (character: (typeof CHARACTERS)[number]["id"] = "finola", seed = 7) => {
  const { overrides, ...game } = singlePlayerGame("Guest 1", character, seed);
  return startGame({ ...game, config: resolveConfig(overrides), seed, rulesVersion: "test" });
};

describe("single player", () => {
  it("seats 9: the human first, then 8 bots labeled as AI", () => {
    expect(SINGLE_PLAYER_SEATS).toBe(9);
    expect(NEVER_BOTS).toEqual(["eleesha", "chun", "chao"]);
    const { seats } = singlePlayerGame("Guest 1", "finola", 1);
    expect(seats).toHaveLength(SINGLE_PLAYER_SEATS);
    expect(seats[0]).toMatchObject({ id: SINGLE_PLAYER_HUMAN, name: "Guest 1", isBot: false, character: "finola" });
    for (const s of seats.slice(1)) expect(s).toMatchObject({ isBot: true, botKind: "model", name: expect.stringContaining("(AI)") });
  });

  it("makes the human the only Mush, with no pre-selection", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const s = start("finola", seed);
      expect(s.preselection).toBe(false);
      expect(s.players.filter((p) => p.role === "mush").map((p) => p.id)).toEqual([SINGLE_PLAYER_HUMAN]);
    }
  });

  it("never gives a bot the human's character or an investigation character, but lets the human pick one", () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const { seats } = singlePlayerGame("Guest 1", "chun", seed);
      expect(seats[0]!.character).toBe("chun");
      const bots = seats.slice(1).map((s) => s.character);
      expect(new Set(bots).size).toBe(bots.length);
      for (const c of bots) expect([...NEVER_BOTS]).not.toContain(c);
    }
  });

  it("draws the bots' characters from the seed", () => {
    expect(singlePlayerGame("a", "ian", 3).seats).toEqual(singlePlayerGame("a", "ian", 3).seats);
    const draws = new Set([1, 2, 3, 4, 5].map((seed) => singlePlayerGame("a", "ian", seed).seats.map((s) => s.character).join()));
    expect(draws.size).toBeGreaterThan(1);
  });

  it("ends a cycle only once the human and every bot have ended theirs", () => {
    let s = start();
    const cycle = s.cycle;
    s = must(applyAction(s, SINGLE_PLAYER_HUMAN, { type: "ready" }));
    expect(s.cycle).toBe(cycle);
    const bots = s.players.filter((p) => p.isBot);
    for (const [i, p] of bots.entries()) {
      s = must(applyAction(s, p.id, { type: "ready" }));
      expect(s.cycle).toBe(i === bots.length - 1 ? cycle + 1 : cycle);
    }
    expect(player(s, SINGLE_PLAYER_HUMAN).ready).toBe(false);
  });

  it("shows the bots the human as a crew member, never as Mush", () => {
    const s = start();
    const view = viewFor(s, "p1");
    expect(JSON.stringify(view.players.find((p) => p.id === SINGLE_PLAYER_HUMAN))).not.toContain("mush");
    expect(view.you.role).toBe("human");
  });
});
