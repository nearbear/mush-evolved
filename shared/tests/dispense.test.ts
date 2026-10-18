import { describe, expect, it } from "vitest";
import { CHARACTERS } from "../src/characters.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { parseGameMessage } from "../src/protocol.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import type { Action, GameState, PlayerId, Seat } from "../src/types.ts";

const seats: Seat[] = Array.from({ length: 3 }, (_, i) => ({ id: `p${i}`, name: `Player ${i}`, isBot: i > 0, character: CHARACTERS[i]!.id }));
const MACHINE = "REFECTORY:COFFEE_DISPENSER";
const pull: Action = { type: "dispense", equipment: MACHINE };

/** Everyone in the refectory with an empty inventory. */
function refectory(): GameState {
  const state = createGame(seats, { ...DEFAULT_CONFIG, startInventory: [], startItems: [] }, 7);
  for (const p of state.players) p.room = "REFECTORY";
  return state;
}

function mustApply(state: GameState, id: PlayerId, ...actions: Action[]): GameState {
  for (const action of actions) {
    const r = applyAction(state, id, action);
    if (!r.ok) throw new Error(r.error);
    state = r.state;
  }
  return state;
}

const mine = (s: GameState, id: PlayerId) => viewFor(s, id).inventory.map((i) => i.type);

describe("coffee machine", () => {
  it("puts a coffee in your inventory, free, and logs it publicly", () => {
    const s = mustApply(refectory(), "p0", pull);
    expect(mine(s, "p0")).toEqual(["coffee"]);
    expect(s.players[0]!.ap).toBe(DEFAULT_CONFIG.startAp);
    expect(viewFor(s, "p1").log.at(-1)).toMatchObject({ key: "tookFrom", params: { name: "chao", item: "coffee", equipment: "COFFEE_DISPENSER" } });
  });

  it("works once per cycle per machine, then again next cycle", () => {
    let s = mustApply(refectory(), "p0", pull);
    expect(applyAction(s, "p1", pull).ok).toBe(false);
    expect(viewFor(s, "p1").legalActions).not.toContainEqual(pull);
    for (const p of seats) s = mustApply(s, p.id, { type: "ready" });
    expect(viewFor(s, "p1").legalActions).toContainEqual(pull);
  });

  it("is only offered in the refectory", () => {
    const s = refectory();
    s.players[0]!.room = "LABORATORY";
    expect(viewFor(s, "p0").legalActions).not.toContainEqual(pull);
    expect(applyAction(s, "p0", pull).ok).toBe(false);
    expect(applyAction(s, "p0", { type: "dispense", equipment: "REFECTORY:KITCHEN" }).ok).toBe(false);
  });

  it("knocks it over into the room when your inventory is full", () => {
    const s0 = refectory();
    for (let i = 0; i < DEFAULT_CONFIG.inventorySlots; i++) {
      s0.items.push({ id: `x${i}`, type: "wrench", at: { kind: "player", id: "p0" } });
    }
    const s = mustApply(s0, "p0", pull);
    expect(mine(s, "p0")).toHaveLength(DEFAULT_CONFIG.inventorySlots);
    expect(mine(s, "p0")).not.toContain("coffee");
    expect(viewFor(s, "p1").roomItems.map((i) => i.type)).toEqual(["coffee"]);
    expect(viewFor(s, "p1").log.at(-1)!.key).toBe("tookFromKnocked");
  });

  it("gives each coffee a unique id", () => {
    let s = mustApply(refectory(), "p0", pull);
    for (const p of seats) s = mustApply(s, p.id, { type: "ready" });
    s = mustApply(s, "p1", pull);
    expect(new Set(s.items.map((i) => i.id)).size).toBe(2);
  });
});

describe("consume", () => {
  const withCoffee = () => mustApply(refectory(), "p0", pull);
  const coffeeId = (s: GameState) => viewFor(s, "p0").inventory[0]!.id;

  it("gives 2 AP, removes the coffee, and logs publicly", () => {
    let s = withCoffee();
    s.players[0]!.ap = 5;
    s = mustApply(s, "p0", { type: "consume", item: coffeeId(s) });
    expect(s.players[0]!.ap).toBe(7);
    expect(s.items).toHaveLength(0);
    expect(viewFor(s, "p1").log.at(-1)).toMatchObject({ key: "consumed", params: { name: "chao", item: "coffee" } });
  });

  it("caps AP at the maximum", () => {
    let s = withCoffee();
    s.players[0]!.ap = s.config.maxAp - 1;
    s = mustApply(s, "p0", { type: "consume", item: coffeeId(s) });
    expect(s.players[0]!.ap).toBe(s.config.maxAp);
  });

  it("works on a coffee lying in your room, but not someone else's inventory or another room", () => {
    let s = withCoffee();
    const id = coffeeId(s);
    expect(applyAction(s, "p1", { type: "consume", item: id }).ok).toBe(false); // in p0's inventory
    s = mustApply(s, "p0", { type: "drop", item: id });
    expect(viewFor(s, "p1").legalActions).toContainEqual({ type: "consume", item: id });
    s.players[2]!.room = "LABORATORY";
    expect(applyAction(s, "p2", { type: "consume", item: id }).ok).toBe(false);
    expect(mustApply(s, "p1", { type: "consume", item: id }).items).toHaveLength(0);
  });

  it("refuses items that aren't consumable and leaves state unchanged", () => {
    const s = refectory();
    s.items.push({ id: "w", type: "wrench", at: { kind: "player", id: "p0" } });
    const before = JSON.stringify(s);
    expect(applyAction(s, "p0", { type: "consume", item: "w" }).ok).toBe(false);
    expect(applyAction(s, "p0", { type: "consume", item: "nope" }).ok).toBe(false);
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe("protocol", () => {
  it("parses the new actions and rejects malformed ones", () => {
    expect(parseGameMessage(JSON.stringify({ type: "action", action: pull }))).toEqual({ type: "action", action: pull });
    expect(parseGameMessage(JSON.stringify({ type: "action", action: { type: "consume", item: "item-1" } }))).not.toBeNull();
    expect(parseGameMessage(JSON.stringify({ type: "action", action: { type: "consume", item: 5 } }))).toBeNull();
    expect(parseGameMessage(JSON.stringify({ type: "action", action: { type: "dispense" } }))).toBeNull();
  });
});
