import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { breakItem } from "../src/breakage.ts";
import { ITEM_TYPES } from "../src/items.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import type { Action, GameState } from "../src/types.ts";
import { forceDismantleOdds, makeSeats, must, offered, option, player, testConfig } from "./support.ts";

// Broken items (owner, 2026-11-07): they can't be used, and a destroyed-when-broken type vanishes instead.
const config = testConfig();
const real = { knife: ITEM_TYPES.knife, wrench: ITEM_TYPES.wrench, cooked: ITEM_TYPES.cooked_ration };

beforeEach(() => {
  ITEM_TYPES.knife = { ...real.knife!, canBreak: true, repairChance: 1 };
  ITEM_TYPES.wrench = { ...real.wrench!, canBreak: true };
});
afterEach(() => {
  ITEM_TYPES.knife = real.knife!;
  ITEM_TYPES.wrench = real.wrench!;
});

/** p0 and p1 share the sick bay; p0 carries a knife ("w") and a cooked ration ("food"). */
function ship(): GameState {
  const s = createGame(makeSeats(3), config, 3);
  for (const id of ["p0", "p1"]) player(s, id).room = "SICK_BAY";
  player(s, "p0").skills = ["engineer"];
  s.items.push({ id: "w", type: "knife", at: { kind: "player", id: "p0" } });
  s.items.push({ id: "food", type: "cooked_ration", at: { kind: "player", id: "p0" } });
  return s;
}
const item = (s: GameState, id: string) => s.items.find((i) => i.id === id);
const attack: Action = { type: "attack", weapon: "w", target: "p1" };

describe("breakItem", () => {
  it("flags an item whose type can break", () => {
    const s = ship();
    breakItem(s, item(s, "w")!);
    expect(item(s, "w")?.broken).toBe(true);
  });

  it("destroys an item whose type is destroyed when broken", () => {
    const s = ship();
    breakItem(s, item(s, "food")!);
    expect(item(s, "food")).toBeUndefined();
  });

  it("leaves an item whose type can't break alone", () => {
    const s = ship();
    s.items.push({ id: "g", type: "grenade", at: { kind: "player", id: "p0" } });
    breakItem(s, item(s, "g")!);
    expect(item(s, "g")?.broken).toBeUndefined();
  });
});

describe("a broken item", () => {
  it("can't be used: its actions aren't offered and are refused", () => {
    const s = ship();
    expect(offered(s, "p0")).toContainEqual(attack);
    expect(offered(s, "p0")).toContainEqual({ type: "consume", item: "food" });
    item(s, "w")!.broken = true;
    item(s, "food")!.broken = true;
    expect(offered(s, "p0")).not.toContainEqual(attack);
    expect(offered(s, "p0")).not.toContainEqual({ type: "consume", item: "food" });
    expect(applyAction(s, "p0", attack).ok).toBe(false);
    expect(applyAction(s, "p0", { type: "consume", item: "food" }).ok).toBe(false);
  });

  it("gives no bonus: a broken wrench doesn't help a repair", () => {
    const s = ship();
    s.equipment.SICK_BAY!.push({ id: "SICK_BAY:SHOWER", type: "SHOWER", broken: true });
    s.items.push({ id: "wr", type: "wrench", at: { kind: "player", id: "p0" } });
    const repair: Action = { type: "repair", equipment: "SICK_BAY:SHOWER" };
    const working = option(s, "p0", repair)!.chance;
    item(s, "wr")!.broken = true;
    expect(option(s, "p0", repair)!.chance).toBeLessThan(working!);
  });

  it("can still be dropped, picked up and dismantled", () => {
    const s = ship();
    item(s, "w")!.broken = true;
    const dropped = must(applyAction(s, "p0", { type: "drop", item: "w" }));
    expect(item(dropped, "w")).toMatchObject({ at: { kind: "room", id: "SICK_BAY" }, broken: true });
    const again = must(applyAction(dropped, "p0", { type: "take", item: "w" }));
    expect(item(again, "w")?.at).toEqual({ kind: "player", id: "p0" });
    const restore = forceDismantleOdds(1);
    const gone = must(applyAction(again, "p0", { type: "dismantle", item: "w" }));
    restore();
    expect(item(gone, "w")).toBeUndefined();
  });

  it("is shown broken in the view, to whoever sees the item", () => {
    const s = ship();
    item(s, "w")!.broken = true;
    expect(viewFor(s, "p0").inventory.find((i) => i.id === "w")?.broken).toBe(true);
    expect(viewFor(s, "p0").inventory.find((i) => i.id === "food")?.broken).toBeUndefined();
    // Nobody else's inventory is in their view, so the flag doesn't leak with it.
    expect(JSON.stringify(viewFor(s, "p1").roomItems)).not.toContain("broken");
  });
});

describe("repairing a broken item", () => {
  const repair: Action = { type: "repair", item: "w" };

  it("is offered for a broken item with a repair chance, in reach", () => {
    const s = ship();
    expect(offered(s, "p0")).not.toContainEqual(repair);
    item(s, "w")!.broken = true;
    expect(offered(s, "p0")).toContainEqual(repair);
    expect(option(s, "p0", repair)!.chance).toBe(1);
  });

  it("isn't offered for a type without a repair chance", () => {
    const s = ship();
    ITEM_TYPES.knife = { ...real.knife!, canBreak: true, repairChance: undefined };
    item(s, "w")!.broken = true;
    expect(offered(s, "p0")).not.toContainEqual(repair);
  });

  it("fixes it for 1 AP with a public line; a miss is private and leaves it broken", () => {
    const s = ship();
    item(s, "w")!.broken = true;
    const ap = player(s, "p0").ap;
    const fixed = must(applyAction(s, "p0", repair));
    expect(item(fixed, "w")?.broken).toBeUndefined();
    expect(player(fixed, "p0").ap).toBe(ap - config.repair.cost.ap);
    expect(viewFor(fixed, "p1").log.some((e) => e.key === "itemRepaired")).toBe(true);

    ITEM_TYPES.knife = { ...real.knife!, canBreak: true, repairChance: 0 };
    ITEM_TYPES.knife!.repairChance = 0;
    const missed = must(applyAction(s, "p0", repair));
    expect(item(missed, "w")?.broken).toBe(true);
    expect(viewFor(missed, "p0").log.some((e) => e.key === "itemRepairFailed")).toBe(true);
    expect(viewFor(missed, "p1").log.some((e) => e.key === "itemRepairFailed")).toBe(false);
  });

  it("is accepted from the wire", async () => {
    const { parseGameMessage } = await import("../src/protocol.ts");
    expect(parseGameMessage(JSON.stringify({ type: "action", action: { type: "repair", item: "w" } }))).toEqual({ type: "action", action: { type: "repair", item: "w" } });
  });
});
