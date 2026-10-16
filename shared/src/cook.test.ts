import { describe, expect, it } from "vitest";
import { CHARACTERS } from "./characters.ts";
import { DEFAULT_CONFIG } from "./config.ts";
import { parseGameMessage } from "./protocol.ts";
import { applyAction, createGame, legalActions, viewFor } from "./rules.ts";
import type { Action, GameState, PlayerId, Seat } from "./types.ts";

const seats: Seat[] = Array.from({ length: 3 }, (_, i) => ({ id: `p${i}`, name: `Player ${i}`, isBot: false, character: CHARACTERS[i]!.id }));
const base = { ...DEFAULT_CONFIG, mushCount: 1, startInventory: [], startItems: [], startSkills: [] };
const player = (s: GameState, id: PlayerId) => s.players.find((p) => p.id === id)!;
const cook = (item: string): Action => ({ type: "cook", item });

/** p0 and p1 in the refectory, p2 elsewhere; one uncooked ration on the floor (r1) and one carried by p0 (r2). */
function ship(): GameState {
  const s = createGame(seats, base, 3);
  player(s, "p0").room = player(s, "p1").room = "REFECTORY";
  player(s, "p2").room = "SICK_BAY";
  s.items.push({ id: "r1", type: "uncooked_ration", at: { kind: "room", id: "REFECTORY" } });
  s.items.push({ id: "r2", type: "uncooked_ration", at: { kind: "player", id: "p0" } });
  return s;
}

describe("cook", () => {
  it("spawns uncooked rations in the refectory by default", () => {
    expect(DEFAULT_CONFIG.startItems.filter((i) => i.room === "REFECTORY" && i.type !== "freezer").map((i) => i.type)).toEqual(["uncooked_ration", "uncooked_ration", "uncooked_ration"]);
    expect(DEFAULT_CONFIG.cook.ap).toBe(1);
  });

  it("turns a floor ration into a cooked one in place for 1 AP, publicly", () => {
    const r = applyAction(ship(), "p0", cook("r1"));
    if (!r.ok) throw new Error(r.error);
    expect(r.state.items.find((i) => i.id === "r1")).toEqual({ id: "r1", type: "cooked_ration", at: { kind: "room", id: "REFECTORY" } });
    expect(player(r.state, "p0").ap).toBe(base.startAp - 1);
    expect(viewFor(r.state, "p1").log.some((e) => e.key === "cooked")).toBe(true);
  });

  it("cooks a carried ration and keeps it in the inventory", () => {
    const r = applyAction(ship(), "p0", cook("r2"));
    if (!r.ok) throw new Error(r.error);
    expect(r.state.items.find((i) => i.id === "r2")).toEqual({ id: "r2", type: "cooked_ration", at: { kind: "player", id: "p0" } });
  });

  it("is offered only for uncooked items you can reach, in the refectory", () => {
    const s = ship();
    expect(legalActions(s, "p0").filter((a) => a.type === "cook")).toEqual([cook("r1"), cook("r2")]);
    // p1 can't reach p0's carried ration.
    expect(legalActions(s, "p1").filter((a) => a.type === "cook")).toEqual([cook("r1")]);
    expect(legalActions(s, "p2").some((a) => a.type === "cook")).toBe(false);
  });

  it("is refused outside the refectory, for cooked food, and without AP, leaving state unchanged", () => {
    const s = ship();
    s.items.push({ id: "c1", type: "cooked_ration", at: { kind: "room", id: "REFECTORY" } });
    player(s, "p2").room = "REFECTORY";
    player(s, "p2").ap = 0;
    expect(applyAction(s, "p2", cook("r1")).ok).toBe(false);
    expect(applyAction(s, "p0", cook("c1")).ok).toBe(false);
    player(s, "p2").room = "SICK_BAY";
    player(s, "p0").room = "SICK_BAY";
    const before = JSON.stringify(s);
    expect(applyAction(s, "p0", cook("r2")).ok).toBe(false);
    expect(JSON.stringify(s)).toBe(before);
  });

  it("can't be eaten raw", () => {
    const s = ship();
    expect(applyAction(s, "p0", { type: "consume", item: "r2" }).ok).toBe(false);
  });

  it("parses from the client", () => {
    expect(parseGameMessage(JSON.stringify({ type: "action", action: { type: "cook", item: "r1" } }))).toEqual({ type: "action", action: cook("r1") });
  });
});
