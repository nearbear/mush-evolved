import { describe, expect, it } from "vitest";
import { actionItemType, actionVisibility } from "../src/actions.ts";
import { killPlayer } from "../src/death.ts";
import { ITRACKIE_ITEM } from "../src/itemIds.ts";
import { normalizeItem } from "../src/normalizeState.ts";
import { PATROL_SHIPS } from "../src/patrol.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import type { GameState } from "../src/types.ts";
import { makeSeats, mustApply, offered, player, testConfig } from "./support.ts";

// The iTrackie is a private item (owner, 2026-11-18): only its owner sees or touches it, wherever it lies.
const config = testConfig({ startInventory: [ITRACKIE_ITEM], startItems: [{ type: "wrench", room: "LABORATORY" }] });

/** p0 and p1 in the lab, each carrying their own iTrackie. */
function lab(): GameState {
  const s = createGame(makeSeats(3), config, 7);
  for (const p of s.players) p.room = "LABORATORY";
  return s;
}

const wrench = (s: GameState) => s.items.find((i) => i.type === "wrench")!.id;
const iTrackieOf = (s: GameState, id: string) => s.items.find((i) => i.type === ITRACKIE_ITEM && i.privateTo === id)!;
const dropped = () => {
  const s = lab();
  return { s: mustApply(s, "p0", { type: "drop", item: iTrackieOf(s, "p0").id }), id: iTrackieOf(s, "p0").id };
};

describe("private items: the iTrackie", () => {
  it("is created belonging to the player who carries it", () => {
    const s = lab();
    for (const p of s.players) expect(iTrackieOf(s, p.id).at).toEqual({ kind: "player", id: p.id });
  });

  it("dropped, is in its owner's room view only; nobody else is offered it or can take it", () => {
    const { s, id } = dropped();
    expect(viewFor(s, "p0").roomItems.map((i) => i.id)).toContain(id);
    expect(viewFor(s, "p1").roomItems.map((i) => i.id)).not.toContain(id);
    expect(JSON.stringify(viewFor(s, "p1"))).not.toContain(`"${id}"`);
    expect(offered(s, "p1").some((a) => "item" in a && a.item === id)).toBe(false);
    expect(applyAction(s, "p1", { type: "take", item: id }).ok).toBe(false);
    expect(applyAction(s, "p1", { type: "examine", target: { kind: "item", id } }).ok).toBe(false);
  });

  it("taking and dropping it are private: only the owner's log has a line", () => {
    const { s, id } = dropped();
    const back = mustApply(s, "p0", { type: "take", item: id });
    const lines = back.log.filter((e) => e.key === "dropped" || e.key === "pickedUp");
    expect(lines.map((e) => [e.key, e.kind, e.visibleTo])).toEqual([
      ["dropped", "private", ["p0"]],
      ["pickedUp", "private", ["p0"]],
    ]);
    expect(viewFor(back, "p1").log.some((e) => e.key === "dropped" || e.key === "pickedUp")).toBe(false);
    expect(player(back, "p0").id).toBe(iTrackieOf(back, "p0").at.id);
  });

  it("other items still log publicly", () => {
    const start = lab();
    const s = mustApply(start, "p0", { type: "take", item: wrench(start) });
    expect(s.log.find((e) => e.key === "pickedUp")?.visibleTo).toBe("all");
  });

  it("shows the take or drop as private, and as public for other items", () => {
    const s = lab();
    const drop = { type: "drop", item: iTrackieOf(s, "p0").id } as const;
    expect(actionVisibility("drop", undefined, actionItemType(s.items, drop))).toBe("private");
    expect(actionVisibility("take", undefined, actionItemType(s.items, { type: "take", item: wrench(s) }))).toBe("public");
  });

  it("can't be hidden, so a search never finds it", () => {
    const s = lab();
    expect(offered(s, "p0").some((a) => a.type === "hide")).toBe(false);
    const { s: down, id } = dropped();
    const searched = mustApply(down, "p1", { type: "search" });
    expect(searched.items.find((i) => i.id === id)?.at).toEqual({ kind: "room", id: "LABORATORY" });
  });

  it("is destroyed when its owner dies, even lying on a floor", () => {
    const { s, id } = dropped();
    killPlayer(s, player(s, "p0"), "injury");
    expect(s.items.some((i) => i.id === id)).toBe(false);
  });

  it("an iTrackie stored before private items belongs to whoever carries it; one on a floor stays public", () => {
    const carried = normalizeItem({ id: "it-1", type: ITRACKIE_ITEM, at: { kind: "player", id: "p2" } });
    expect(carried.privateTo).toBe("p2");
    expect(normalizeItem({ id: "it-2", type: ITRACKIE_ITEM, at: { kind: "room", id: "LABORATORY" } }).privateTo).toBeUndefined();
    expect(normalizeItem({ id: "it-3", type: "wrench", at: { kind: "player", id: "p2" } }).privateTo).toBeUndefined();
  });
});

describe("nothing can be dropped or hidden in a patrol ship (owner, 2026-11-25)", () => {
  it("refuses drop and hide while flying", () => {
    const start = lab();
    const s = mustApply(start, "p0", { type: "take", item: wrench(start) });
    player(s, "p0").room = PATROL_SHIPS[0]!.id;
    for (const type of ["drop", "hide"] as const) {
      expect(offered(s, "p0").some((a) => a.type === type)).toBe(false);
      expect(applyAction(s, "p0", { type, item: wrench(s) }).ok).toBe(false);
    }
  });
});
