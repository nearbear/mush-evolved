import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { capacity } from "../src/items.ts";
import { MODIFIERS } from "../src/modifiers.ts";
import { parseGameMessage } from "../src/protocol.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import type { Action, GameConfig } from "../src/types.ts";
import { makeSeats, mustApply, offered } from "./support.ts";

const seats = makeSeats(4, "others");

/** Five wrenches in the lab (more than fit in an inventory), one medikit next door, empty hands. */
const config: GameConfig = {
  ...DEFAULT_CONFIG,
  startInventory: [],
  startItems: [
    ...Array.from({ length: 5 }, () => ({ type: "wrench", room: "LABORATORY" })),
    { type: "medikit", room: "CORRIDOR_A" },
  ],
};
const newGame = () => createGame(seats, config, 42);

const take = (item: string): Action => ({ type: "take", item });
const drop = (item: string): Action => ({ type: "drop", item });

describe("inventory", () => {
  it("places start items in rooms and starts everyone empty-handed", () => {
    const state = newGame();
    expect(state.items.map((i) => i.at)).toEqual([
      ...Array(5).fill({ kind: "room", id: "LABORATORY" }),
      { kind: "room", id: "CORRIDOR_A" },
    ]);
    const view = viewFor(state, "p0");
    expect(view.inventory).toEqual([]);
    expect(view.inventorySlots).toBe(3);
    expect(view.roomItems).toHaveLength(5);
    expect(view.roomItems[0]).toEqual({ id: "item-1", type: "wrench" });
  });

  it("takes and drops for free, logging both to the room's history", () => {
    let state = mustApply(newGame(), "p0", take("item-1"));
    expect(viewFor(state, "p0").inventory.map((i) => i.id)).toEqual(["item-1"]);
    expect(viewFor(state, "p0").roomItems.map((i) => i.id)).not.toContain("item-1");
    expect(viewFor(state, "p1").roomItems.map((i) => i.id)).not.toContain("item-1");

    state = mustApply(state, "p0", { type: "move", to: "CORRIDOR_A" }, drop("item-1"));
    expect(viewFor(state, "p0").roomItems.map((i) => i.id)).toEqual(["item-6", "item-1"]);
    const p0 = state.players.find((p) => p.id === "p0")!;
    expect(p0.ap).toBe(DEFAULT_CONFIG.startAp - 1); // only the move cost anything

    const labLog = viewFor(state, "p1").log;
    expect(labLog).toContainEqual(expect.objectContaining({ key: "pickedUp", params: { name: "chao", item: "wrench" } }));
    const corridorLog = viewFor(state, "p0").log;
    expect(corridorLog).toContainEqual(expect.objectContaining({ key: "dropped", params: { name: "chao", item: "wrench" } }));
  });

  it("holds at most three items", () => {
    const state = mustApply(newGame(), "p0", take("item-1"), take("item-2"), take("item-3"));
    expect(offered(state, "p0").some((a) => a.type === "take")).toBe(false);
    expect(applyAction(state, "p0", take("item-4")).ok).toBe(false);
    // The room still takes anything back.
    expect(mustApply(state, "p0", drop("item-1")).items.find((i) => i.id === "item-1")!.at).toEqual({ kind: "room", id: "LABORATORY" });
  });

  it("can't drop items marked as non-droppable", () => {
    const state = newGame();
    state.items.push({ id: "item-camera", type: "camera", at: { kind: "player", id: "p0" } });
    expect(offered(state, "p0").some((a) => a.type === "drop" && a.item === "item-camera")).toBe(false);
    expect(applyAction(state, "p0", drop("item-camera")).ok).toBe(false);
  });

  it("dismantles inventory items into scrap in the room", () => {
    const state = mustApply(newGame(), "p0", take("item-1"));
    state.items.push({ id: "item-camera", type: "camera", at: { kind: "player", id: "p0" } });
    state.config.dismantle.successChance = 1;
    const result = applyAction(state, "p0", { type: "dismantle", item: "item-camera" });
    if (!result.ok) throw new Error(result.error);
    const next = result.state;
    expect(next.items.find((i: { id: string }) => i.id === "item-camera")).toBeUndefined();
    expect(next.items.filter((i: { at: { kind: string; id: string }; type: string }) => i.at.kind === "room" && i.at.id === "LABORATORY" && i.type === "metal_scraps")).toHaveLength(1);
    expect(next.items.filter((i: { at: { kind: string; id: string }; type: string }) => i.at.kind === "room" && i.at.id === "LABORATORY" && i.type === "plastic_scraps")).toHaveLength(0);
  });

  it("fails a dismantle when the roll misses", () => {
    const state = mustApply(newGame(), "p0", take("item-1"));
    state.items.push({ id: "item-camera", type: "camera", at: { kind: "player", id: "p0" } });
    state.config.dismantle.successChance = 0;
    const result = applyAction(state, "p0", { type: "dismantle", item: "item-camera" });
    if (!result.ok) throw new Error(result.error);
    const next = result.state;
    expect(next.items.find((i: { id: string }) => i.id === "item-camera")).toBeDefined();
    expect(next.items.filter((i: { at: { kind: string; id: string }; type: string }) => i.at.kind === "room" && i.at.id === "LABORATORY" && i.type === "metal_scraps")).toHaveLength(0);
  });

  it("lets modifiers change the slot count", () => {
    MODIFIERS["test:backpack"] = { inventorySlots: (n) => n + 1 };
    try {
      const state = newGame();
      state.players[0]!.modifiers = ["test:backpack"];
      expect(capacity(state, { kind: "player", id: "p0" })).toBe(4);
      expect(viewFor(state, "p0").inventorySlots).toBe(4);
      expect(capacity(state, { kind: "player", id: "p1" })).toBe(3);
    } finally {
      delete MODIFIERS["test:backpack"];
    }
  });

  it("can't take items from another room or another player, or drop what you don't hold", () => {
    const state = mustApply(newGame(), "p1", take("item-1"));
    for (const action of [take("item-6"), take("item-1"), drop("item-1"), drop("item-2"), take("nope")]) {
      expect(applyAction(state, "p0", action).ok, JSON.stringify(action)).toBe(false);
    }
  });

  it("leaves the input state unchanged", () => {
    const state = newGame();
    const before = JSON.parse(JSON.stringify(state));
    mustApply(state, "p0", take("item-1"));
    expect(state).toEqual(before);
  });
});

describe("inventory (hidden information)", () => {
  it("never shows other players' inventories or other rooms' items", () => {
    const state = mustApply(newGame(), "p1", take("item-1"));
    const view = viewFor(state, "p0");
    const json = JSON.stringify(view);
    expect(json).not.toContain("item-6"); // the medikit in the corridor
    expect(json).not.toContain('"item-1"'); // in p1's inventory
    for (const other of view.players) expect(other).not.toHaveProperty("inventory");
    expect(json).not.toContain('"at"');
  });
});

describe("protocol", () => {
  it("parses take and drop, and rejects malformed ones", () => {
    const msg = (action: unknown) => JSON.stringify({ type: "action", action });
    expect(parseGameMessage(msg({ type: "take", item: "item-1", extra: 1 }))).toEqual({
      type: "action",
      action: { type: "take", item: "item-1" },
    });
    expect(parseGameMessage(msg({ type: "drop", item: "item-1" }))?.type).toBe("action");
    expect(parseGameMessage(msg({ type: "take", item: 5 }))).toBeNull();
    expect(parseGameMessage(msg({ type: "drop" }))).toBeNull();
  });
});
