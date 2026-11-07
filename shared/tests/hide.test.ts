import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import type { GameConfig, GameState } from "../src/types.ts";
import { costOf, makeSeats, mustApply, offered, player } from "./support.ts";

const config: GameConfig = {
  ...DEFAULT_CONFIG,
  startInventory: [],
  startItems: [
    { type: "wrench", room: "LABORATORY" },
    { type: "medikit", room: "LABORATORY" },
    { type: "wrench", room: "LABORATORY" },
    { type: "wrench", room: "LABORATORY" },
    { type: "wrench", room: "LABORATORY" },
    { type: "camera", room: "LABORATORY" },
  ],
};
const newGame = () => createGame(makeSeats(4), config, 7);

/** p0 and p1 in the lab; p0 carries item-1 and has hidden it. */
function hidden(): GameState {
  let s = newGame();
  for (const p of s.players) p.room = "LABORATORY";
  return mustApply(s, "p0", { type: "take", item: "item-1" }, { type: "hide", item: "item-1" });
}

const roomIds = (s: GameState, id: string) => viewFor(s, id).roomItems.map((i) => i.id);

describe("hide and search", () => {
  it("hides a carried item from everyone but the hider, and they keep seeing it as hidden", () => {
    const s = hidden();
    expect(player(s, "p0").ap).toBe(config.startAp - config.hide.cost.ap);
    expect(roomIds(s, "p0")).toContain("item-1");
    expect(viewFor(s, "p0").roomItems.find((i) => i.id === "item-1")?.hidden).toBe(true);
    expect(roomIds(s, "p1")).not.toContain("item-1");
    expect(JSON.stringify(viewFor(s, "p1"))).not.toContain("item-1\"");
  });

  it("offers nothing on others' hidden items and refuses them", () => {
    const s = hidden();
    const types = offered(s, "p1").map((a) => ("item" in a ? a.item : null));
    expect(types).not.toContain("item-1");
    const refused = applyAction(s, "p1", { type: "take", item: "item-1" });
    expect(refused.ok).toBe(false);
  });

  it("lets the hider take it back, as a normal take", () => {
    const s = mustApply(hidden(), "p0", { type: "take", item: "item-1" });
    expect(viewFor(s, "p0").inventory.map((i) => i.id)).toEqual(["item-1"]);
    expect(s.items.find((i) => i.id === "item-1")?.hiddenBy).toBeUndefined();
  });

  it("only offers hiding for carried items that can be dropped (not the camera)", () => {
    let s = newGame();
    s = mustApply(s, "p0", { type: "take", item: "item-2" });
    expect(offered(s, "p0")).toContainEqual({ type: "hide", item: "item-2" });
    expect(offered(s, "p0").some((a) => a.type === "hide" && a.item === "item-6")).toBe(false);
    expect(offered(newGame(), "p0").some((a) => a.type === "hide")).toBe(false);
    expect(applyAction(s, "p0", { type: "hide", item: "item-6" }).ok).toBe(false);
  });

  it("search finds every hidden item into free slots, the rest stay in the room, for 1 AP", () => {
    let s = newGame();
    for (const p of s.players) p.room = "LABORATORY";
    s = mustApply(s, "p0", { type: "take", item: "item-1" }, { type: "hide", item: "item-1" }, { type: "take", item: "item-2" }, { type: "hide", item: "item-2" });
    s = mustApply(s, "p1", { type: "take", item: "item-3" }, { type: "take", item: "item-4" }, { type: "take", item: "item-5" });
    expect(costOf(s, "p1", { type: "search" })).toEqual({ ap: config.search.cost.ap, mp: 0 });
    s = mustApply(s, "p1", { type: "search" });
    expect(s.items.filter((i) => i.hiddenBy !== undefined)).toEqual([]);
    expect(viewFor(s, "p1").inventory).toHaveLength(config.startInventorySlots ?? 3);
    expect(roomIds(s, "p2")).toEqual(expect.arrayContaining(["item-1", "item-2"]));
  });

  it("search finds hidden items for a free hand and fails quietly when there are none", () => {
    let s = hidden();
    s = mustApply(s, "p1", { type: "search" });
    expect(viewFor(s, "p1").inventory.map((i) => i.id)).toEqual(["item-1"]);
    const none = mustApply(newGame(), "p1", { type: "search" });
    const log = viewFor(none, "p1").log;
    expect(log).toContainEqual(expect.objectContaining({ key: "searchedNothing" }));
  });

  it("is always offered, whether or not anything is hidden", () => {
    expect(offered(newGame(), "p1")).toContainEqual({ type: "search" });
    expect(offered(hidden(), "p1")).toContainEqual({ type: "search" });
  });

  it("logs secretly: alone only the hider has it, with a witness the room does", () => {
    const setup = (witness: boolean) => {
      const g = newGame();
      for (const p of g.players) p.room = witness || p.id === "p0" ? "LABORATORY" : "CORRIDOR_A";
      return mustApply(g, "p0", { type: "take", item: "item-1" }, { type: "hide", item: "item-1" });
    };
    const seen = (s: GameState) => viewFor(s, "p1").log.some((e) => e.key === "hid");
    expect(viewFor(setup(false), "p0").log.some((e) => e.key === "hid")).toBe(true);
    expect(seen(setup(false))).toBe(false);
    expect(seen(setup(true))).toBe(true);
  });

  it("is refused during pre-selection", () => {
    const s = hidden();
    s.preselection = true;
    expect(applyAction(s, "p1", { type: "search" }).ok).toBe(false);
    expect(applyAction(s, "p0", { type: "take", item: "item-2" }).ok).toBe(true);
    expect(applyAction(mustApply(s, "p0", { type: "take", item: "item-2" }), "p0", { type: "hide", item: "item-2" }).ok).toBe(false);
  });
});
