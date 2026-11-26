import { describe, expect, it } from "vitest";
import { addDisease } from "../src/diseases.ts";
import { applyAction, createGame } from "../src/rules.ts";
import type { GameState } from "../src/types.ts";
import { costOf, makeSeats, mustApply, noCharacterModifiers, pickSkill, player, testConfig } from "./support.ts";

// Kleptophobia (owner, 2026-11-26): a disorder. Dropping an item costs 2 AP (Agoraphobia's surcharge adds to it), and an
// item the holder carries that an expedition loses costs them 4 morale (expeditions.test.ts). Nothing to a Mush or while
// a Shrink has it calmed. Private.
const config = noCharacterModifiers(testConfig({ mushCount: 0 }));
const KLEPTOPHOBIA = "kleptophobia_disorder";
const ROOM = "SICK_BAY";
const KNIFE = "item-test-knife";
const drop = { type: "drop", item: KNIFE } as const;

/** p0 (kleptophobic, carrying a knife) shares the sick bay with `others` of p1-p4; the rest are in the refectory. */
function ship(others = 0, disorder = true): GameState {
  const s = createGame(makeSeats(5), config, 5);
  s.players.forEach((p, i) => {
    p.room = i <= others ? ROOM : "REFECTORY";
    p.ap = 8;
  });
  s.items.push({ id: KNIFE, type: "knife", at: { kind: "player", id: "p0" } });
  if (disorder) addDisease(s, player(s, "p0"), KLEPTOPHOBIA);
  return s;
}

const dropAp = (s: GameState) => costOf(s, "p0", drop)!.ap;

describe("Kleptophobia disorder", () => {
  it("pins the confirmed numbers", () => {
    expect(config.diseases.allDisorders).toContain(KLEPTOPHOBIA);
    expect(config.kleptophobia).toEqual({ dropAp: 2, moraleLoss: 4 });
  });

  it("a drop costs dropAp AP; without it a drop is free, and taking stays free", () => {
    expect(dropAp(ship(0, false))).toBe(0);
    const s = ship();
    expect(dropAp(s)).toBe(config.kleptophobia.dropAp);
    const dropped = mustApply(s, "p0", drop);
    expect(player(dropped, "p0").ap).toBe(player(s, "p0").ap - config.kleptophobia.dropAp);
    expect(costOf(dropped, "p0", { type: "take", item: KNIFE })!.ap).toBe(0);
  });

  it("stacks with Agoraphobia in a crowded room, whichever disorder came first", () => {
    const after = ship(3);
    addDisease(after, player(after, "p0"), "agoraphobia_disorder");
    const before = ship(3, false);
    addDisease(before, player(before, "p0"), "agoraphobia_disorder");
    addDisease(before, player(before, "p0"), KLEPTOPHOBIA);
    for (const s of [after, before]) expect(dropAp(s)).toBe(config.kleptophobia.dropAp + config.agoraphobia.apSurcharge);
  });

  it("can't drop without the AP, and the state is unchanged", () => {
    const s = ship();
    player(s, "p0").ap = config.kleptophobia.dropAp - 1;
    expect(applyAction(s, "p0", drop).ok).toBe(false);
  });

  it("does nothing to a Mush", () => {
    const s = ship();
    player(s, "p0").role = "mush";
    expect(dropAp(s)).toBe(0);
  });

  it("does nothing while a Shrink has it calmed", () => {
    let s = ship(1);
    s = pickSkill(s, "p1", "shrink");
    s = mustApply(s, "p1", { type: "comfort", target: "p0" });
    expect(dropAp(s)).toBe(0);
  });
});
