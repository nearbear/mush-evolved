import { describe, expect, it } from "vitest";
import { ITEM_TYPES, TABULATOR_ITEM } from "../src/items.ts";
import { applyAction, createGame } from "../src/rules.ts";
import type { Action, GameState, ItemState } from "../src/types.ts";
import { makeSeats, nextCycle, offered, player, testConfig } from "./support.ts";

// THE List (owner, 2026-11-21, #266; docs/plans/the-list.md). Step 1: the tabulator item.

const STORAGE = "STORAGE_FRONT";
const config = testConfig({ manualCycles: true });
const room = (id: string) => ({ kind: "room", id }) as const;
const put = (s: GameState, id: string, type: string, at: ItemState["at"]) => void s.items.push({ id, type, at });
const tab = (s: GameState) => s.items.find((i) => i.id === "tab")!;
const on = (s: GameState, id: string) => offered(s, id).filter((a) => "item" in a && a.item === "tab");

/** p0 (human) and p1 (Mush) in front storage with the tabulator on the floor, after selection. */
function ship(): GameState {
  const s = createGame(makeSeats(2), config, 5);
  s.preselection = false;
  for (const p of s.players) p.room = STORAGE;
  player(s, "p0").role = "human";
  player(s, "p1").role = "mush";
  put(s, "tab", TABULATOR_ITEM, room(STORAGE));
  return s;
}

describe("the tabulator", () => {
  it("pins eMush's 12% repair chance and its flags", () => {
    expect(ITEM_TYPES[TABULATOR_ITEM]).toMatchObject({
      canTake: false,
      canDrop: false,
      canHide: false,
      canBreak: true,
      canBreakOnCycleChange: true,
      canBeSabotaged: true,
      repairChance: 0.12,
    });
    expect(ITEM_TYPES[TABULATOR_ITEM]!.dismantle).toBeUndefined();
    expect(ITEM_TYPES[TABULATOR_ITEM]!.heavy).toBeFalsy();
  });

  it("can't be taken, dismantled or sent by tube", () => {
    const s = ship();
    put(s, "in", "input_tube", room(STORAGE));
    put(s, "out", "output_tube", room("LABORATORY"));
    const types = on(s, "p0").map((a) => a.type);
    expect(types).not.toContain("take");
    expect(types).not.toContain("dismantle");
    expect(types).not.toContain("tube_transfer");
    for (const action of [{ type: "take", item: "tab" }, { type: "dismantle", item: "tab" }, { type: "tube_transfer", item: "tab" }] as Action[]) {
      expect(applyAction(s, "p0", action).ok).toBe(false);
    }
    expect(tab(s).at).toEqual(room(STORAGE));
  });

  it("can't be dropped or hidden, even if it somehow ends up carried", () => {
    const s = ship();
    tab(s).at = { kind: "player", id: "p0" };
    const types = on(s, "p0").map((a) => a.type);
    expect(types).not.toContain("drop");
    expect(types).not.toContain("hide");
    expect(applyAction(s, "p0", { type: "drop", item: "tab" }).ok).toBe(false);
    expect(applyAction(s, "p0", { type: "hide", item: "tab" }).ok).toBe(false);
  });

  it("can be sabotaged by a Mush, and repaired once broken", () => {
    const s = ship();
    expect(offered(s, "p1")).toContainEqual({ type: "sabotage", item: "tab" });
    expect(offered(s, "p0")).not.toContainEqual({ type: "repair", item: "tab" });
    tab(s).broken = true;
    expect(offered(s, "p0")).toContainEqual({ type: "repair", item: "tab" });
  });

  it("can break in a cycle-change breakdown", () => {
    const s = ship();
    s.config = {
      ...s.config,
      incidents: {
        ...s.config.incidents,
        rollPoints: 1,
        catalog: Object.fromEntries(Object.entries(s.config.incidents.catalog).map(([id, c]) => [id, { ...c, weight: id === "equipment_breakdown" ? 1 : 0 }])) as typeof s.config.incidents.catalog,
      },
    };
    for (const list of Object.values(s.equipment)) for (const e of list) e.broken = true;
    s.incidentPoints = 2;
    expect(nextCycle(s).items.find((i) => i.id === "tab")?.broken).toBe(true);
  });
});
