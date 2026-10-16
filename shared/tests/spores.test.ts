import { describe, expect, it } from "vitest";
import { CHARACTERS } from "./characters.ts";
import { DEFAULT_CONFIG } from "./config.ts";
import { MODIFIERS } from "./modifiers.ts";
import { parseGameMessage } from "./protocol.ts";
import { applyAction, createGame, viewFor } from "./rules.ts";
import type { Action, GameState, PlayerId, Seat } from "./types.ts";

const seats: Seat[] = Array.from({ length: 6 }, (_, i) => ({ id: `p${i}`, name: `Player ${i}`, isBot: false, character: CHARACTERS[i]!.id }));
const config = { ...DEFAULT_CONFIG, mushCount: 1, startInventory: [], startItems: [], maxAp: 99, startAp: 50 };
const extract: Action = { type: "extract_spore" };

/** p0 and p1 are Mush, the rest human. */
function ship(): GameState {
  const s = createGame(seats, config, 3);
  s.players.forEach((p, i) => {
    p.role = i < 2 ? "mush" : "human";
  });
  return s;
}
const player = (s: GameState, id: PlayerId) => s.players.find((p) => p.id === id)!;
function mustApply(state: GameState, id: PlayerId, action: Action): GameState {
  const r = applyAction(state, id, action);
  if (!r.ok) throw new Error(r.error);
  return r.state;
}
/** Everyone readies, which advances one cycle. */
function nextCycle(s: GameState): GameState {
  for (const p of s.players) s = mustApply(s, p.id, { type: "ready" });
  return s;
}

describe("spore extraction", () => {
  it("costs 1 AP and gives the Mush 1 spore, available straight away", () => {
    const s = mustApply(ship(), "p0", extract);
    expect(player(s, "p0").spores).toBe(1);
    expect(player(s, "p0").ap).toBe(config.startAp - 1);
  });

  it("is Mush only: not offered to, and refused for, humans", () => {
    const s = ship();
    expect(viewFor(s, "p2").legalActions).not.toContainEqual(extract);
    expect(viewFor(s, "p0").legalActions).toContainEqual(extract);
    const r = applyAction(s, "p2", extract);
    expect(r.ok).toBe(false);
    expect(player(s, "p2").spores).toBe(0);
  });

  it("has a 4-cycle cooldown per Mush that ignores the day", () => {
    let s = mustApply(ship(), "p0", extract);
    expect(applyAction(s, "p0", extract).ok).toBe(false);
    for (let i = 0; i < 3; i++) {
      s = nextCycle(s);
      expect(viewFor(s, "p0").legalActions).not.toContainEqual(extract);
    }
    s = nextCycle(s);
    expect(viewFor(s, "p0").legalActions).toContainEqual(extract);
    expect(player(mustApply(s, "p0", extract), "p0").spores).toBe(2);
  });

  it("keeps cooldowns separate per Mush", () => {
    const s = mustApply(ship(), "p0", extract);
    expect(viewFor(s, "p1").legalActions).toContainEqual(extract);
  });

  it("shares a daily cap across the faction, and the cap resets at the day boundary", () => {
    const s = ship();
    s.config = { ...s.config, sporesPerDay: 2 };
    let t = mustApply(mustApply(s, "p0", extract), "p1", extract);
    t = nextCycle(nextCycle(nextCycle(nextCycle(t)))); // cooldowns over, same day
    expect(viewFor(t, "p0").legalActions).not.toContainEqual(extract);
    expect(applyAction(t, "p1", extract).ok).toBe(false);
    while (viewFor(t, "p0").day === 1) t = nextCycle(t);
    expect(viewFor(t, "p0").legalActions).toContainEqual(extract);
  });

  it("lets a modifier raise the daily cap", () => {
    MODIFIERS["test_spore_cap"] = { sporesPerDay: (c) => c + 1 };
    try {
      const s = ship();
      s.config = { ...s.config, sporesPerDay: 1 };
      s.sporesToday = 1;
      expect(applyAction(s, "p0", extract).ok).toBe(false);
      player(s, "p0").modifiers.push("test_spore_cap");
      expect(applyAction(s, "p0", extract).ok).toBe(true);
    } finally {
      delete MODIFIERS["test_spore_cap"];
    }
  });

  it("refuses without AP and leaves state unchanged", () => {
    const s = ship();
    player(s, "p0").ap = 0;
    const before = JSON.stringify(s);
    expect(applyAction(s, "p0", extract).ok).toBe(false);
    expect(JSON.stringify(s)).toBe(before);
  });

  it("parses from the wire", () => {
    expect(parseGameMessage(JSON.stringify({ type: "action", action: { type: "extract_spore" } }))).toEqual({ type: "action", action: extract });
  });
});

describe("spore extraction visibility", () => {
  it("shows the count only in your own view, and logs privately", () => {
    const s = mustApply(ship(), "p0", extract);
    expect(viewFor(s, "p0").you.spores).toBe(1);
    const other = JSON.stringify(viewFor(s, "p2"));
    expect(other).not.toContain(`"spores":1`);
    expect(other).not.toContain("sporesToday");
    expect(other).not.toContain("sporeExtracted");
    for (const o of viewFor(s, "p1").players) expect(o).not.toHaveProperty("spores");
    expect(viewFor(s, "p1").log.some((e) => e.key === "sporeExtracted")).toBe(false);
    expect(viewFor(s, "p0").log.some((e) => e.key === "sporeExtracted")).toBe(true);
  });
});
