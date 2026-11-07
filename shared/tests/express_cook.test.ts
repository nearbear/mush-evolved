import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { parseGameMessage } from "../src/protocol.ts";
import { applyAction, createGame, legalActions, viewFor } from "../src/rules.ts";
import type { Action, GameState } from "../src/types.ts";
import { makeSeats, mustApply, nextDay, player, noHunters } from "./support.ts";

const seats = makeSeats(3);
const base = { ...DEFAULT_CONFIG, mushCount: 1, startInventory: [], startItems: [], startSkills: [] };
const express = (item: string): Action => ({ type: "express_cook", item });
const microwave = (s: GameState) => s.items.find((i) => i.type === "microwave")!;

/** p0 and p1 in the refectory with a full microwave on the floor, p2 in the sick bay; r1 on the floor, r2 carried by p0. */
function ship(): GameState {
  const s = createGame(seats, noHunters({ ...base, startItems: [{ type: "microwave", room: "REFECTORY" }] }), 3);
  player(s, "p0").room = player(s, "p1").room = "REFECTORY";
  player(s, "p2").room = "SICK_BAY";
  s.items.push({ id: "r1", type: "uncooked_ration", at: { kind: "room", id: "REFECTORY" } });
  s.items.push({ id: "r2", type: "uncooked_ration", at: { kind: "player", id: "p0" } });
  return s;
}

describe("microwave", () => {
  it("spawns heavy in the refectory with its starting charges", () => {
    expect(DEFAULT_CONFIG.startItems).toContainEqual({ type: "microwave", room: "REFECTORY" });
    const s = createGame(seats, DEFAULT_CONFIG, 3);
    expect(microwave(s)).toMatchObject({ at: { kind: "room", id: "REFECTORY" }, charges: DEFAULT_CONFIG.expressCook.charges.start });
  });

  it("regains a charge at each day start, up to the max", () => {
    let s = ship();
    microwave(s).charges = 0;
    s = nextDay(s);
    expect(microwave(s).charges).toBe(base.expressCook.charges.perDay);
    microwave(s).charges = base.expressCook.charges.max;
    s = nextDay(s);
    expect(microwave(s).charges).toBe(base.expressCook.charges.max);
  });

  it("shows its charges to whoever sees it", () => {
    const s = ship();
    const seen = (id: string) => [...viewFor(s, id).roomItems, ...viewFor(s, id).inventory].find((i) => i.type === "microwave");
    expect(seen("p1")?.charges).toBe(base.expressCook.charges.start);
    expect(seen("p2")).toBeUndefined();
  });
});

describe("express cook", () => {
  it("cooks a ration in place, spends a charge and costs its AP, publicly", () => {
    const r = applyAction(ship(), "p0", express("r1"));
    if (!r.ok) throw new Error(r.error);
    expect(r.state.items.find((i) => i.id === "r1")).toEqual({ id: "r1", type: "cooked_ration", at: { kind: "room", id: "REFECTORY" } });
    expect(microwave(r.state).charges).toBe(base.expressCook.charges.start - 1);
    expect(player(r.state, "p0").ap).toBe(base.startAp - base.expressCook.cost.ap);
    expect(viewFor(r.state, "p1").log.some((e) => e.key === "expressCooked")).toBe(true);
    expect(viewFor(r.state, "p2").log.some((e) => e.key === "expressCooked")).toBe(false);
  });

  it("works in any room with a carried microwave, and keeps the Cook action separate", () => {
    const s = ship();
    microwave(s).at = { kind: "player", id: "p0" };
    player(s, "p0").room = "SICK_BAY";
    const legal = legalActions(s, "p0");
    expect(legal.filter((a) => a.type === "express_cook")).toEqual([express("r2")]);
    expect(legal.some((a) => a.type === "cook")).toBe(false);
    expect(legalActions(ship(), "p0").filter((a) => a.type === "cook")).toHaveLength(2);
  });

  it("is offered only with a reachable microwave", () => {
    const s = ship();
    expect(legalActions(s, "p0").filter((a) => a.type === "express_cook")).toEqual([express("r1"), express("r2")]);
    expect(legalActions(s, "p1").filter((a) => a.type === "express_cook")).toEqual([express("r1")]);
    player(s, "p2").room = "REFECTORY";
    microwave(s).at = { kind: "player", id: "p1" };
    expect(legalActions(s, "p2").some((a) => a.type === "express_cook")).toBe(false);
  });

  it("is refused with an empty microwave, leaving state unchanged", () => {
    const s = ship();
    let t = s;
    for (let i = 0; i < base.expressCook.charges.start; i++) {
      t.items.push({ id: `x${i}`, type: "uncooked_ration", at: { kind: "room", id: "REFECTORY" } });
      t = mustApply(t, "p0", express(`x${i}`));
    }
    expect(microwave(t).charges).toBe(0);
    expect(legalActions(t, "p0").some((a) => a.type === "express_cook")).toBe(false);
    const before = JSON.stringify(t);
    const r = applyAction(t, "p0", express("r1"));
    expect(r.ok).toBe(false);
    expect(JSON.stringify(t)).toBe(before);
  });

  it("parses from the client", () => {
    expect(parseGameMessage(JSON.stringify({ type: "action", action: { type: "express_cook", item: "r1" } }))).toEqual({ type: "action", action: express("r1") });
  });
});

describe("raw rations", () => {
  it("can be eaten for 1 morale, with a cooked ration's satiety", () => {
    const s = ship();
    const p0 = player(s, "p0");
    p0.role = "human";
    const r = applyAction(s, "p0", { type: "consume", item: "r2" });
    if (!r.ok) throw new Error(r.error);
    expect(r.state.items.some((i) => i.id === "r2")).toBe(false);
    expect(player(r.state, "p0").morale).toBe(p0.morale - 1);
    expect(player(r.state, "p0").satiety).toBe(p0.satiety + 4);
  });

  it("never takes morale below 0", () => {
    const s = ship();
    player(s, "p0").morale = 0;
    const r = applyAction(s, "p0", { type: "consume", item: "r2" });
    if (!r.ok) throw new Error(r.error);
    expect(player(r.state, "p0").morale).toBe(0);
  });
});
