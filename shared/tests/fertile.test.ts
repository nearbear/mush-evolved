import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { applyAction, createGame } from "../src/rules.ts";
import type { GameState } from "../src/types.ts";
import { costOf, makeSeats, must, nextDay, player } from "./support.ts";

// Fertile (Mush skill): one free spore extraction a day, ignoring the cooldown (owner, 2026-10-27).
const config = { ...DEFAULT_CONFIG, manualCycles: true, mushCount: 1, startInventory: [], startItems: [], startSkills: [] };
const extract = { type: "extract_spore" } as const;

function ship(fertile = true): GameState {
  const s = createGame(makeSeats(3), config, 3);
  s.preselection = false;
  s.players.forEach((p, i) => {
    p.role = i === 0 ? "mush" : "human";
    p.mushSkills = i === 0 && fertile ? ["fertile"] : [];
    p.ap = 5;
  });
  return s;
}

describe("fertile", () => {
  it("makes the first extraction of the day free, then the normal price", () => {
    const s = ship();
    expect(costOf(s, "p0", extract).ap).toBe(0);
    const once = must(applyAction(s, "p0", extract));
    expect(player(once, "p0").ap).toBe(5);
    expect(player(once, "p0").spores).toBe(config.spores.effect.spores);
    expect(once.sporesToday).toBe(config.spores.effect.spores);
    once.sporeExtractedOn = {};
    expect(costOf(once, "p0", extract).ap).toBe(config.spores.cost.ap);
  });

  it("ignores the cooldown, and starts it", () => {
    const s = ship();
    s.sporeExtractedOn = { p0: s.cycle };
    const free = must(applyAction(s, "p0", extract));
    expect(player(free, "p0").ap).toBe(5);
    expect(free.sporeExtractedOn.p0).toBe(free.cycle);
    // Used up: now the cooldown blocks the paid one.
    expect(applyAction(free, "p0", extract).ok).toBe(false);
  });

  it("is blocked by the faction's daily cap", () => {
    const s = ship();
    s.sporesToday = config.spores.perDay;
    expect(applyAction(s, "p0", extract).ok).toBe(false);
  });

  it("comes back the next day", () => {
    const used = must(applyAction(ship(), "p0", extract));
    const next = nextDay(used);
    expect(costOf(next, "p0", extract).ap).toBe(0);
  });

  it("does nothing for a Mush without the skill", () => {
    expect(costOf(ship(false), "p0", extract).ap).toBe(config.spores.cost.ap);
  });
});
