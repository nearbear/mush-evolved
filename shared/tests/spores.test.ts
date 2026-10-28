import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { MODIFIERS } from "../src/modifiers.ts";
import { parseGameMessage } from "../src/protocol.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import type { Action, GameState } from "../src/types.ts";
import { makeSeats, player, mustApply, nextCycle, offered } from "./support.ts";

const seats = makeSeats(6);
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
describe("spore extraction", () => {
  it("costs 1 AP and gives the Mush 1 spore, available straight away", () => {
    const s = mustApply(ship(), "p0", extract);
    expect(player(s, "p0").spores).toBe(1);
    expect(player(s, "p0").ap).toBe(config.startAp - 1);
  });

  it("is Mush only: not offered to, and refused for, humans", () => {
    const s = ship();
    expect(offered(s, "p2")).not.toContainEqual(extract);
    expect(offered(s, "p0")).toContainEqual(extract);
    const r = applyAction(s, "p2", extract);
    expect(r.ok).toBe(false);
    expect(player(s, "p2").spores).toBe(0);
  });

  it("has a 4-cycle cooldown per Mush that ignores the day", () => {
    let s = mustApply(ship(), "p0", extract);
    expect(applyAction(s, "p0", extract).ok).toBe(false);
    for (let i = 0; i < 3; i++) {
      s = nextCycle(s);
      expect(offered(s, "p0")).not.toContainEqual(extract);
    }
    s = nextCycle(s);
    expect(offered(s, "p0")).toContainEqual(extract);
    expect(player(mustApply(s, "p0", extract), "p0").spores).toBe(2);
  });

  it("shows the extraction disabled with the cycles left while it cools down", () => {
    let s = mustApply(ship(), "p0", extract);
    const listed = () => viewFor(s, "p0").actions.find((o) => o.action.type === "extract_spore");
    expect(listed()).toMatchObject({ lacks: ["cooldown"], cooldown: 4 });
    s = nextCycle(nextCycle(s));
    expect(listed()).toMatchObject({ lacks: ["cooldown"], cooldown: 2 });
    s = nextCycle(nextCycle(s));
    expect(listed()?.lacks).toEqual([]);
  });

  it("shows the extraction disabled at the daily cap, which outranks a cooldown", () => {
    const s = ship();
    s.config = { ...s.config, spores: { ...s.config.spores, perDay: 1 } };
    const t = mustApply(s, "p0", extract);
    expect(viewFor(t, "p0").actions.find((o) => o.action.type === "extract_spore")).toMatchObject({ lacks: ["capacity"] });
    expect(viewFor(t, "p1").actions.find((o) => o.action.type === "extract_spore")).toMatchObject({ lacks: ["capacity"] });
  });

  it("keeps cooldowns separate per Mush", () => {
    const s = mustApply(ship(), "p0", extract);
    expect(offered(s, "p1")).toContainEqual(extract);
  });

  it("shares a daily cap across the faction, and the cap resets at the day boundary", () => {
    const s = ship();
    s.config = { ...s.config, spores: { ...s.config.spores, perDay: 2 } };
    let t = mustApply(mustApply(s, "p0", extract), "p1", extract);
    t = nextCycle(nextCycle(nextCycle(nextCycle(t)))); // cooldowns over, same day
    expect(offered(t, "p0")).not.toContainEqual(extract);
    expect(applyAction(t, "p1", extract).ok).toBe(false);
    while (viewFor(t, "p0").day === 1) t = nextCycle(t);
    expect(offered(t, "p0")).toContainEqual(extract);
  });

  it("lets a modifier raise the daily cap", () => {
    MODIFIERS["test_spore_cap"] = { sporesPerDay: (c) => c + 1 };
    try {
      const s = ship();
      s.config = { ...s.config, spores: { ...s.config.spores, perDay: 1 } };
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
  it("shows the count only in your own view", () => {
    const s = mustApply(ship(), "p0", extract);
    expect(viewFor(s, "p0").you.spores).toBe(1);
    const other = JSON.stringify(viewFor(s, "p2"));
    expect(other).not.toContain(`"spores":1`);
    expect(other).not.toContain("sporesToday");
    for (const o of viewFor(s, "p1").players) expect(o).not.toHaveProperty("spores");
  });

  // Secret (decided 2026-10-17): room history if someone else saw it, otherwise only the extractor's.
  it("logs secretly: unwitnessed it stays yours, witnessed it is room history", () => {
    const alone = ship();
    for (const p of alone.players) if (p.id !== "p0") p.room = "SICK_BAY";
    player(alone, "p0").room = "CORRIDOR_A";
    const a = mustApply(alone, "p0", extract);
    expect(viewFor(a, "p0").log.some((e) => e.key === "sporeExtracted")).toBe(true);
    expect(JSON.stringify(viewFor(a, "p2"))).not.toContain("sporeExtracted");

    const seen = ship();
    for (const p of seen.players) p.room = p.id === "p0" || p.id === "p2" ? "CORRIDOR_A" : "SICK_BAY";
    const b = mustApply(seen, "p0", extract);
    expect(viewFor(b, "p2").log.some((e) => e.key === "sporeExtracted")).toBe(true);
    expect(JSON.stringify(viewFor(b, "p3"))).not.toContain("sporeExtracted");
  });
});
