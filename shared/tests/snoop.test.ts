import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import type { Action, GameConfig, GameState, PlayerId } from "../src/types.ts";
import { clone, costOf, makeSeats, mustApply, nextCycle, nextDay, offered, pickSkill, player, testConfig } from "./support.ts";

/** Metal scraps only and no dirt or injury, so the tests below know what a snoop does; the defaults have their own tests. */
const base: GameConfig = { ...testConfig(), snoop: { ...DEFAULT_CONFIG.snoop, items: { metal_scraps: 1 }, dirtyChance: 0, injuryChance: 0 } };
const snoop: Action = { type: "snoop" };
const STORAGE = "STORAGE_FRONT";

/** p0 is a Scrapper, p0 and p1 in front storage, p2 elsewhere. */
function ship(skill = "metaliciste", config = base): GameState {
  let s = createGame(makeSeats(3), config, 5);
  player(s, "p0").room = player(s, "p1").room = STORAGE;
  player(s, "p2").room = "REFECTORY";
  s = pickSkill(s, "p0", skill);
  for (const p of s.players) p.ap = 5;
  return s;
}

const scraps = (s: GameState, at: { kind: "player" | "room"; id: string }) =>
  s.items.filter((i) => i.type === "metal_scraps" && i.at.kind === at.kind && i.at.id === at.id).length;
const offersSnoop = (s: GameState, id: PlayerId) => offered(s, id).some((a) => a.type === "snoop");

describe("Scrapper's Snoop", () => {
  it("can make the Scrapper dirty and injure them for 2 HP, privately", () => {
    const s = ship("metaliciste", { ...base, snoop: { ...base.snoop, dirtyChance: 1, injuryChance: 1 } });
    const hp = player(s, "p0").hp;
    const after = mustApply(s, "p0", snoop);
    expect(player(after, "p0").statuses).toContain("dirty");
    expect(player(after, "p0").hp).toBe(hp - 2);
    const keys = viewFor(after, "p0").log.map((e) => e.key);
    expect(keys).toEqual(expect.arrayContaining(["snooped", "becomeDirty", "randomInjury"]));
    const roommate = JSON.stringify(viewFor(after, "p1").log);
    for (const key of ["snooped", "becomeDirty", "randomInjury"]) expect(roommate).not.toContain(key);
  });

  it("picks the item by the configured weights: a weight of 0 is never found", () => {
    // The draw itself is rollWeighted, whose shares rng.test.ts checks; this checks snoop hands it the configured weights.
    const items = { metal_scraps: 0, plastic_scraps: 1, oxy_capsule: 0 };
    const start = ship("metaliciste", { ...base, snoop: { ...base.snoop, items } });
    for (let seed = 1; seed <= 20; seed++) {
      const s = clone(start);
      s.rng = seed * 7919;
      const before = new Set(s.items.map((i) => i.id));
      const found = mustApply(s, "p0", snoop).items.filter((i) => !before.has(i.id));
      expect(found.map((i) => i.type)).toEqual(["plastic_scraps"]);
    }
  });

  it("makes metal scraps in the Scrapper's inventory, for free", () => {
    const s = ship();
    expect(costOf(s, "p0", { type: "snoop" })).toEqual({ ap: base.snoop.cost.ap, mp: 0 });
    const after = mustApply(s, "p0", snoop);
    expect(scraps(after, { kind: "player", id: "p0" })).toBe(1);
    expect(after.items.length).toBe(s.items.length + 1);
    expect(player(after, "p0").ap).toBe(5 - base.snoop.cost.ap);
  });

  it("puts the scraps on the floor when the inventory is full", () => {
    const s = ship();
    for (let i = 0; i < base.inventorySlots; i++) s.items.push({ id: `junk${i}`, type: "plastic_scraps", at: { kind: "player", id: "p0" } });
    const after = mustApply(s, "p0", snoop);
    expect(scraps(after, { kind: "room", id: STORAGE })).toBe(1);
    expect(viewFor(after, "p0").log.at(-1)?.key).toBe("snoopedKnocked");
  });

  it("is offered only to a Scrapper, only in a storage room", () => {
    const s = ship();
    expect(offersSnoop(s, "p0")).toBe(true);
    expect(offersSnoop(s, "p1")).toBe(false);
    expect(applyAction(s, "p1", snoop).ok).toBe(false);
    player(s, "p0").room = "REFECTORY";
    expect(offersSnoop(s, "p0")).toBe(false);
    const before = clone(s);
    expect(applyAction(s, "p0", snoop).ok).toBe(false);
    expect(s).toEqual(before);
  });

  it("works once a day per storage room, and again the next day", () => {
    let s = mustApply(ship(), "p0", snoop);
    expect(offersSnoop(s, "p0")).toBe(false);
    expect(applyAction(s, "p0", snoop).ok).toBe(false);
    s = nextCycle(s);
    expect(offersSnoop(s, "p0")).toBe(false);
    player(s, "p0").room = "STORAGE_A_0";
    expect(offersSnoop(s, "p0")).toBe(true);
    s = nextDay(s);
    player(s, "p0").room = STORAGE;
    expect(offersSnoop(s, "p0")).toBe(true);
  });

  it("counts per Scrapper: another Scrapper can snoop the same room the same day", () => {
    let s = pickSkill(mustApply(ship(), "p0", snoop), "p1", "metaliciste");
    s = mustApply(s, "p1", snoop);
    expect(scraps(s, { kind: "player", id: "p1" })).toBe(1);
  });

  it("is private to the Scrapper: roommates see neither the line nor the daily flag", () => {
    const s = mustApply(ship(), "p0", snoop);
    expect(viewFor(s, "p0").log.at(-1)).toMatchObject({ key: "snooped", params: { item: "metal_scraps" } });
    for (const id of ["p1", "p2"]) {
      const view = JSON.stringify(viewFor(s, id));
      expect(view).not.toContain("snooped");
      expect(view).not.toContain("snoopedToday");
    }
    expect(JSON.stringify(viewFor(s, "p0"))).toContain("snoopedToday");
  });
});
