import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { MODIFIERS } from "../src/modifiers.ts";
import { parseGameMessage } from "../src/protocol.ts";
import { RESEARCH_COMPLETE, RESEARCH_STATUS } from "../src/research.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import type { Action, GameState } from "../src/types.ts";
import { clone, costOf, makeSeats, player, mustApply, nextCycle, offered, testConfig } from "./support.ts";

const seats = makeSeats(6);
const config = testConfig({ maxAp: 99, startAp: 50 });
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
  it("is free on the first extraction of the day (innate Fertile), then costs 1 AP and gives 1 spore", () => {
    const first = mustApply(ship(), "p0", extract);
    expect(player(first, "p0").spores).toBe(1);
    expect(player(first, "p0").ap).toBe(config.startAp);
    const second = mustApply(first, "p0", extract);
    expect(player(second, "p0").spores).toBe(2);
    expect(player(second, "p0").ap).toBe(config.startAp - 1);
  });

  it("is Mush only: not offered to, and refused for, humans", () => {
    const s = ship();
    expect(offered(s, "p2")).not.toContainEqual(extract);
    expect(offered(s, "p0")).toContainEqual(extract);
    const r = applyAction(s, "p2", extract);
    expect(r.ok).toBe(false);
    expect(player(s, "p2").spores).toBe(0);
  });

  it("shows the extraction disabled at the daily cap", () => {
    const s = ship();
    s.config = { ...s.config, spores: { ...s.config.spores, perDay: 1 } };
    const t = mustApply(s, "p0", extract);
    expect(viewFor(t, "p0").actions.find((o) => o.action.type === "extract_spore")).toMatchObject({ lacks: ["capacity"] });
    expect(viewFor(t, "p1").actions.find((o) => o.action.type === "extract_spore")).toMatchObject({ lacks: ["capacity"] });
  });

  it("has no cooldown: a Mush can extract again straight away", () => {
    const s = mustApply(ship(), "p0", extract);
    expect(offered(s, "p0")).toContainEqual(extract);
    expect(player(mustApply(s, "p0", extract), "p0").spores).toBe(2);
  });

  it("shares a daily cap across the faction, and the cap resets at the day boundary", () => {
    const s = ship();
    s.config = { ...s.config, spores: { ...s.config.spores, perDay: 2 } };
    let t = mustApply(mustApply(s, "p0", extract), "p1", extract);
    expect(offered(t, "p0")).not.toContainEqual(extract);
    expect(applyAction(t, "p1", extract).ok).toBe(false);
    while (viewFor(t, "p0").day === 1) t = nextCycle(t);
    expect(offered(t, "p0")).toContainEqual(extract);
  });

  it("caps the spores one Mush holds at 2, shown disabled; spending one frees a slot", () => {
    expect(DEFAULT_CONFIG.spores.max).toBe(2);
    let s = ship();
    for (let i = 0; i < config.spores.max; i++) s = mustApply(s, "p0", extract);
    expect(player(s, "p0").spores).toBe(config.spores.max);
    expect(viewFor(s, "p0").actions.find((o) => o.action.type === "extract_spore")).toMatchObject({ lacks: ["sporesFull"] });
    const before = JSON.stringify(s);
    expect(applyAction(s, "p0", extract).ok).toBe(false);
    expect(JSON.stringify(s)).toBe(before);
    // Full hands are named over the faction's daily cap when both apply.
    const both = clone(s);
    both.sporesToday = both.config.spores.perDay;
    expect(viewFor(both, "p0").actions.find((o) => o.action.type === "extract_spore")).toMatchObject({ lacks: ["sporesFull"] });
    // The cap is per Mush: the other Mush still extracts.
    expect(offered(s, "p1")).toContainEqual(extract);
    player(s, "p0").spores -= 1;
    expect(offered(s, "p0")).toContainEqual(extract);
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

  it("refuses without AP after the daily free extraction and leaves state unchanged", () => {
    const s = ship();
    player(s, "p0").fertileToday = true;
    player(s, "p0").ap = 0;
    const before = JSON.stringify(s);
    expect(applyAction(s, "p0", extract).ok).toBe(false);
    expect(JSON.stringify(s)).toBe(before);
  });

  it("costs constipasporeExtraAp more AP once CONSTIPASPORE_SERUM is complete (after the daily free extraction)", () => {
    expect(DEFAULT_CONFIG.spores.constipasporeExtraAp).toBe(1);
    const partial = ship();
    player(partial, "p0").fertileToday = true;
    partial.research.CONSTIPASPORE_SERUM = RESEARCH_COMPLETE - 1;
    expect(costOf(partial, "p0", extract).ap).toBe(config.spores.cost.ap);

    const done = ship();
    player(done, "p0").fertileToday = true;
    done.research.CONSTIPASPORE_SERUM = RESEARCH_COMPLETE;
    const expectedCost = config.spores.cost.ap + config.spores.constipasporeExtraAp;
    expect(costOf(done, "p0", extract).ap).toBe(expectedCost);
    const after = mustApply(done, "p0", extract);
    expect(player(after, "p0").ap).toBe(config.startAp - expectedCost);

    player(done, "p0").ap = expectedCost - 1;
    expect(viewFor(done, "p0").actions.find((o) => o.action.type === "extract_spore")).toMatchObject({ lacks: ["ap"] });
    const before = JSON.stringify(done);
    expect(applyAction(done, "p0", extract).ok).toBe(false);
    expect(JSON.stringify(done)).toBe(before);
  });

  it("reduces the daily spore cap by antisporeReduction once ANTISPORE_GAZ is complete", () => {
    expect(DEFAULT_CONFIG.spores.antisporeReduction).toBe(2);
    expect(RESEARCH_STATUS.ANTISPORE_GAZ).toBe("full");

    const partial = ship();
    partial.research.ANTISPORE_GAZ = RESEARCH_COMPLETE - 1;
    partial.sporesToday = config.spores.perDay - config.spores.antisporeReduction;
    expect(offered(partial, "p0")).toContainEqual(extract);

    const done = ship();
    done.research.ANTISPORE_GAZ = RESEARCH_COMPLETE;
    const reducedCap = config.spores.perDay - config.spores.antisporeReduction;
    let s = done;
    for (let i = 0; i < reducedCap; i++) s = mustApply(s, "p0", extract);
    expect(s.sporesToday).toBe(reducedCap);
    expect(offered(s, "p0")).not.toContainEqual(extract);
    expect(offered(s, "p1")).not.toContainEqual(extract);
    const before = JSON.stringify(s);
    expect(applyAction(s, "p0", extract).ok).toBe(false);
    expect(JSON.stringify(s)).toBe(before);

    // Clamps at 0 when perDay is smaller than the reduction.
    const low = ship();
    low.config = { ...low.config, spores: { ...low.config.spores, perDay: 1 } };
    low.research.ANTISPORE_GAZ = RESEARCH_COMPLETE;
    expect(offered(low, "p0")).not.toContainEqual(extract);
    expect(applyAction(low, "p0", extract).ok).toBe(false);
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
