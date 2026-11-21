import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, SHIP_ROOMS } from "../src/config.ts";
import { EQUIPMENT_TYPES } from "../src/equipment.ts";
import { parseGameMessage } from "../src/protocol.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import type { Action, GameState, PlayerId, Target } from "../src/types.ts";
import { makeSeats, mustApply, offered } from "./support.ts";

const seats = makeSeats(3, "others");
// Everyone in the lab, empty-handed; a wrench (item-1) there.
const newGame = () => createGame(seats, { ...DEFAULT_CONFIG, startInventory: [], startItems: [{ type: "wrench", room: "LABORATORY" }, { type: "tree_pot", room: "HYDROPONIC_CENTER" }] }, 42);

const examine = (kind: Target["kind"], id: string): Action => ({ type: "examine", target: { kind, id } as Target });

const lastLine = (state: GameState, id: PlayerId) => {
  const { key, params } = viewFor(state, id).log.at(-1)!;
  return { key, params };
};

describe("room equipment", () => {
  it("comes from the original map and every type has a name", () => {
    expect(DEFAULT_CONFIG.equipment["REFECTORY"]).toEqual([
      { id: "REFECTORY:KITCHEN", type: "KITCHEN" },
      { id: "REFECTORY:COFFEE_DISPENSER", type: "COFFEE_DISPENSER" },
    ]);
    expect(DEFAULT_CONFIG.equipment["BEDROOM_A"]!.filter((e) => e.type === "BED")).toHaveLength(3);
    for (const room of SHIP_ROOMS) for (const e of room.equipment) expect(EQUIPMENT_TYPES[e.type], e.type).toBeDefined();
    const ids = SHIP_ROOMS.flatMap((r) => r.equipment.map((e) => e.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("is in the view for your room only", () => {
    const view = viewFor(newGame(), "p0");
    expect(view.roomEquipment.map((e) => e.type)).toEqual(["RESEARCH_LAB", "CRYO_MODULE", "GRAVITY_SIMULATOR"]);
  });
});

describe("examine", () => {
  it("is offered for equipment and items you can see, not characters", () => {
    const start = newGame();
    start.items.find((i) => i.type === "tree_pot")!.at = { kind: "room", id: "LABORATORY" };
    const state = mustApply(start, "p0", { type: "take", item: "item-1" });
    const ids = state.items.filter((i) => i.at.kind === "room" && i.at.id === "LABORATORY").map((i) => i.id);
    expect(ids).toHaveLength(1);
    const targets = offered(state, "p0").flatMap((a) => (a.type === "examine" ? [a.target] : []));
    expect(targets).toEqual([
      { kind: "equipment", id: "LABORATORY:RESEARCH_LAB" },
      { kind: "equipment", id: "LABORATORY:CRYO_MODULE" },
      { kind: "equipment", id: "LABORATORY:GRAVITY_SIMULATOR" },
      { kind: "item", id: "item-1" }, // in your inventory
      ...ids.map((id) => ({ kind: "item", id })), // a hydropot, in the room
    ]);
  });

  it("is free and writes a line only you see", () => {
    let state = mustApply(newGame(), "p0", examine("equipment", "LABORATORY:CRYO_MODULE"));
    expect(lastLine(state, "p0")).toEqual({ key: "examineEquipment", params: { equipment: "CRYO_MODULE" } });
    expect(viewFor(state, "p1").log.map((e) => e.key)).not.toContain("examineEquipment");
    expect(state.players[0]!.ap).toBe(DEFAULT_CONFIG.startAp);

    state = mustApply(state, "p0", examine("item", "item-1"));
    expect(lastLine(state, "p0")).toEqual({ key: "examineItem", params: { item: "wrench" } });
  });

  it("rejects characters and things out of sight without changing state", () => {
    const state = mustApply(newGame(), "p1", { type: "take", item: "item-1" }, { type: "move", to: "CORRIDOR_A" });
    for (const action of [
      examine("player", "p0"), // yourself
      examine("player", "p2"), // in the same room
      examine("player", "p1"), // left the room
      examine("equipment", "REFECTORY:KITCHEN"), // another room
      examine("item", "item-1"), // in p1's inventory
      examine("item", "item-3"), // the medikit, in the sick bay
      examine("player", "nobody"),
    ]) {
      expect(applyAction(state, "p0", action).ok, JSON.stringify(action)).toBe(false);
    }
  });

  it("parses from the wire, rejecting characters and unknown target kinds", () => {
    const msg = (action: unknown) => JSON.stringify({ type: "action", action });
    expect(parseGameMessage(msg({ type: "examine", target: { kind: "item", id: "item-1", x: 1 } }))).toEqual({
      type: "action",
      action: { type: "examine", target: { kind: "item", id: "item-1" } },
    });
    expect(parseGameMessage(msg({ type: "examine", target: { kind: "player", id: "p1" } }))).toBeNull();
    expect(parseGameMessage(msg({ type: "examine", target: { kind: "role", id: "p1" } }))).toBeNull();
    expect(parseGameMessage(msg({ type: "examine", target: "p1" }))).toBeNull();
  });
});
