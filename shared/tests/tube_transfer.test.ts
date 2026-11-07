import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import type { GameState, ItemState } from "../src/types.ts";
import { costOf, makeSeats, must, offered, player } from "./support.ts";

// The pneumatic tube (owner, 2026-11-04): an item in a room with an input tube is sent to the floor of an output tube's room.
const config = { ...DEFAULT_CONFIG, manualCycles: true, startInventory: [], startItems: [] };
const send = (item: string) => ({ type: "tube_transfer", item }) as const;

const room = (id: string) => ({ kind: "room", id }) as const;
const put = (s: GameState, id: string, type: string, at: ItemState["at"]) => void s.items.push({ id, type, at });
const where = (s: GameState, id: string) => s.items.find((i) => i.id === id)!.at;

/** p0 in LABORATORY with an input tube and a floor item; p1 in REFECTORY, p2 in a third room. */
function ship(): GameState {
  const s = createGame(makeSeats(3), config, 3);
  s.preselection = false;
  s.players[0]!.room = "LABORATORY";
  s.players[1]!.room = "REFECTORY";
  s.players[2]!.room = "SICK_BAY";
  put(s, "in", "input_tube", room("LABORATORY"));
  put(s, "box", "metal_scraps", room("LABORATORY"));
  return s;
}

describe("tube transfer", () => {
  it("sends a floor item to the room of the output tube, free, with public logs in both rooms", () => {
    const s = ship();
    put(s, "out", "output_tube", room("REFECTORY"));
    expect(costOf(s, "p0", send("box")).ap).toBe(config.tubeTransfer.cost.ap);
    const r = must(applyAction(s, "p0", send("box")));
    expect(where(r, "box")).toEqual(room("REFECTORY"));
    expect(viewFor(r, "p0").log.some((e) => e.key === "tubeSent")).toBe(true);
    expect(viewFor(r, "p1").log.some((e) => e.key === "tubeArrived")).toBe(true);
    expect(viewFor(r, "p2").log.some((e) => e.key === "tubeArrived")).toBe(false);
  });

  it("sends a carried item too", () => {
    const s = ship();
    put(s, "out", "output_tube", room("REFECTORY"));
    put(s, "mine", "plastic_scraps", { kind: "player", id: "p0" });
    expect(where(must(applyAction(s, "p0", send("mine"))), "mine")).toEqual(room("REFECTORY"));
  });

  it("is offered only in a room with an input tube lying on the floor, and never for the tubes themselves", () => {
    const s = ship();
    put(s, "out", "output_tube", room("REFECTORY"));
    const types = (st: GameState, id: string) => offered(st, id).map((a) => a.type);
    expect(types(s, "p0")).toContain("tube_transfer");
    expect(types(s, "p1")).not.toContain("tube_transfer");
    for (const tube of ["in", "out"]) expect(applyAction(s, "p0", send(tube)).ok).toBe(false);
    const carried = ship();
    carried.items.find((i) => i.id === "in")!.at = { kind: "player", id: "p0" };
    expect(types(carried, "p0")).not.toContain("tube_transfer");
    expect(applyAction(carried, "p0", send("box")).ok).toBe(false);
  });

  it("does nothing, still resolving, when there is no output tube or every one is carried", () => {
    const none = ship();
    const held = ship();
    put(held, "out", "output_tube", { kind: "player", id: "p1" });
    for (const s of [none, held]) {
      const r = must(applyAction(s, "p0", send("box")));
      expect(where(r, "box")).toEqual(room("LABORATORY"));
      expect(viewFor(r, "p1").log.some((e) => e.key === "tubeArrived")).toBe(false);
    }
  });

  it("picks among several output tubes at random, reaching each, and a carried one is never chosen", () => {
    const reached = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const s = createGame(makeSeats(3), config, seed);
      s.preselection = false;
      s.players[0]!.room = "LABORATORY";
      put(s, "in", "input_tube", room("LABORATORY"));
      put(s, "box", "metal_scraps", room("LABORATORY"));
      put(s, "o1", "output_tube", room("REFECTORY"));
      put(s, "o2", "output_tube", room("SICK_BAY"));
      put(s, "o3", "output_tube", { kind: "player", id: "p1" });
      reached.add(where(must(applyAction(s, "p0", send("box"))), "box").id);
    }
    expect([...reached].sort()).toEqual(["REFECTORY", "SICK_BAY"]);
  });

  it("refuses another player's carried item and leaves state unchanged", () => {
    const s = ship();
    put(s, "out", "output_tube", room("REFECTORY"));
    put(s, "theirs", "plastic_scraps", { kind: "player", id: "p1" });
    const before = JSON.stringify(s);
    expect(applyAction(s, "p0", send("theirs")).ok).toBe(false);
    expect(JSON.stringify(s)).toBe(before);
  });

  it("an item hidden by someone else can't be sent, and one sent loses its hiding", () => {
    const s = ship();
    put(s, "out", "output_tube", room("REFECTORY"));
    s.items.find((i) => i.id === "box")!.hiddenBy = "p1";
    expect(applyAction(s, "p0", send("box")).ok).toBe(false);
    s.items.find((i) => i.id === "box")!.hiddenBy = "p0";
    expect(must(applyAction(s, "p0", send("box"))).items.find((i) => i.id === "box")!.hiddenBy).toBeUndefined();
  });
});
