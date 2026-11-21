import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { ITEM_TYPES } from "../src/items.ts";
import { parseGameMessage } from "../src/protocol.ts";
import { applyAction, createGame, legalActions, viewFor } from "../src/rules.ts";
import type { Action, GameState } from "../src/types.ts";
import { makeSeats, mustApply, nextDay, option, player, testConfig } from "./support.ts";

const seats = makeSeats(3);
const base = testConfig();
const hyperfreeze = (item: string): Action => ({ type: "hyperfreeze", item });
const freezer = (s: GameState) => s.items.find((i) => i.type === "freezer")!;

/** p0 and p1 in the refectory with a working freezer on the floor, p2 in the sick bay; c1 cooked ration on floor, a1 alien steak carried by p0. */
function ship(): GameState {
  const s = createGame(seats, testConfig({ startItems: [{ type: "freezer", room: "REFECTORY" }] }), 3);
  player(s, "p0").room = player(s, "p1").room = "REFECTORY";
  player(s, "p2").room = "SICK_BAY";
  s.items.push({ id: "c1", type: "cooked_ration", at: { kind: "room", id: "REFECTORY" } });
  s.items.push({ id: "a1", type: "alien_steak", at: { kind: "player", id: "p0" } });
  return s;
}

describe("hyperfreeze", () => {
  it("pins the default hyperfreeze cost and alien steak config", () => {
    expect(DEFAULT_CONFIG.hyperfreeze.cost.ap).toBe(1);
    expect(DEFAULT_CONFIG.expedition.loot.provision).toBe("alien_steak");
    expect(ITEM_TYPES.alien_steak).toMatchObject({
      cook: { into: "cooked_ration" },
      hyperfreeze: { into: "uncooked_ration" },
      consume: { ap: 4, satiety: 4, morale: -1 },
      perishable: true,
    });
  });

  it("turns a cooked ration or alien steak into an uncooked ration in place, publicly", () => {
    const r1 = applyAction(ship(), "p0", hyperfreeze("c1"));
    if (!r1.ok) throw new Error(r1.error);
    expect(r1.state.items.find((i) => i.id === "c1")).toEqual({ id: "c1", type: "uncooked_ration", at: { kind: "room", id: "REFECTORY" } });
    expect(player(r1.state, "p0").ap).toBe(base.startAp - base.hyperfreeze.cost.ap);
    expect(viewFor(r1.state, "p1").log.some((e) => e.key === "hyperfrozen")).toBe(true);
    expect(viewFor(r1.state, "p2").log.some((e) => e.key === "hyperfrozen")).toBe(false);

    const r2 = applyAction(r1.state, "p0", hyperfreeze("a1"));
    if (!r2.ok) throw new Error(r2.error);
    expect(r2.state.items.find((i) => i.id === "a1")).toEqual({ id: "a1", type: "uncooked_ration", at: { kind: "player", id: "p0" } });
  });

  it("spends a Cook point instead of AP when available", () => {
    const s = ship();
    player(s, "p0").resources.cook = 1;
    const opt = option(s, "p0", hyperfreeze("c1"));
    expect(opt?.cost).toEqual({ ap: 0, mp: 0, paidBy: "cook" });

    const next = mustApply(s, "p0", hyperfreeze("c1"));
    expect(player(next, "p0").ap).toBe(base.startAp);
    expect(player(next, "p0").resources.cook).toBe(0);

    // Next one falls back to AP.
    expect(option(next, "p0", hyperfreeze("a1"))?.cost).toEqual({ ap: base.hyperfreeze.cost.ap, mp: 0 });
  });

  it("works in any room with a carried working freezer, and is refused when unreachable or broken", () => {
    const s = ship();
    freezer(s).at = { kind: "player", id: "p0" };
    player(s, "p0").room = "SICK_BAY";
    expect(legalActions(s, "p0").filter((a) => a.type === "hyperfreeze")).toEqual([hyperfreeze("a1")]);

    // Carried by someone else: p1 in the same room can't use it.
    freezer(s).at = { kind: "player", id: "p0" };
    player(s, "p1").room = "SICK_BAY";
    expect(legalActions(s, "p1").some((a) => a.type === "hyperfreeze")).toBe(false);

    // Broken freezer: refused, leaving state unchanged.
    const t = ship();
    freezer(t).broken = true;
    expect(legalActions(t, "p0").some((a) => a.type === "hyperfreeze")).toBe(false);
    const before = JSON.stringify(t);
    const r = applyAction(t, "p0", hyperfreeze("c1"));
    expect(r.ok).toBe(false);
    expect(JSON.stringify(t)).toBe(before);
  });

  it("only offers cooked_ration and alien_steak, not uncooked rations, coffee, or fruits", () => {
    const s = ship();
    s.items.push(
      { id: "u1", type: "uncooked_ration", at: { kind: "room", id: "REFECTORY" } },
      { id: "k1", type: "coffee", at: { kind: "room", id: "REFECTORY" } },
      { id: "b1", type: "fruit_banana", at: { kind: "room", id: "REFECTORY" } },
    );
    expect(legalActions(s, "p0").filter((a) => a.type === "hyperfreeze")).toEqual([hyperfreeze("c1"), hyperfreeze("a1")]);
  });

  it("clears Fungal Cuisine spores, while keeping the current spoilage stage and stopping further spoilage", () => {
    const s = ship();
    const steak = s.items.find((i) => i.id === "a1")!;
    steak.spores = 2;
    steak.spoil = "unstable";

    const frozen = mustApply(s, "p0", hyperfreeze("a1"));
    const result = frozen.items.find((i) => i.id === "a1")!;
    expect(result.type).toBe("uncooked_ration");
    expect(result.spores).toBeUndefined();
    expect(result.spoil).toBe("unstable");

    // Subsequent day change does not spoil the hyperfrozen uncooked_ration further.
    const later = nextDay(frozen);
    expect(later.items.find((i) => i.id === "a1")?.spoil).toBe("unstable");

    // Eating it does not contaminate the human since spores were cleared.
    player(later, "p0").role = "human";
    const ate = mustApply(later, "p0", { type: "consume", item: "a1" });
    expect(player(ate, "p0").role).toBe("human");
    expect(player(ate, "p0").spores).toBe(0);
  });

  it("alien_steak spoils each day unless hyperfrozen or cooked", () => {
    const s = ship();
    const d1 = nextDay(s);
    expect(d1.items.find((i) => i.id === "a1")?.spoil).toBe("unstable");
    const d2 = nextDay(d1);
    expect(d2.items.find((i) => i.id === "a1")?.spoil).toBe("hazardous");
  });

  it("parses from the client", () => {
    expect(parseGameMessage(JSON.stringify({ type: "action", action: { type: "hyperfreeze", item: "c1" } }))).toEqual({
      type: "action",
      action: hyperfreeze("c1"),
    });
  });
});
