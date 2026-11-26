import { describe, expect, it } from "vitest";
import { ITEM_TYPES } from "../src/itemTypes.ts";
import { createGame } from "../src/rules.ts";
import type { GameState, PlayerId } from "../src/types.ts";
import { makeSeats, player, mustApply, noCharacterModifiers, testConfig } from "./support.ts";

// Owner, 2026-11-05 (docs/plans/balance.md): rations give humans 4 AP; Mush gain no AP from any consumable.
const config = noCharacterModifiers(testConfig({ consume: { dirtyChance: 0 }, startAp: 2 }));

/** p0 is Mush, p1 human, both in one room. */
function ship(): GameState {
  const s = createGame(makeSeats(2), config, 3);
  s.players.forEach((p, i) => (p.role = i === 0 ? "mush" : "human"));
  return s;
}
function eat(s: GameState, id: PlayerId, type: string): GameState {
  const item = `t${s.items.length}`;
  s.items.push({ id: item, type, at: { kind: "player", id } });
  return mustApply(s, id, { type: "consume", item });
}

describe("food AP", () => {
  it("gives 4 AP for a ration, cooked or not", () => {
    expect([ITEM_TYPES.uncooked_ration!.consume!.ap, ITEM_TYPES.cooked_ration!.consume!.ap]).toEqual([4, 4]);
  });

  it("gives a human the ration's AP", () => {
    for (const type of ["uncooked_ration", "cooked_ration"]) {
      expect(player(eat(ship(), "p1", type), "p1").ap).toBe(config.startAp + ITEM_TYPES[type]!.consume!.ap);
    }
  });

  it("gives a Mush no AP from rations, coffee or bananas", () => {
    for (const type of ["uncooked_ration", "cooked_ration", "coffee", "fruit_banana"]) {
      expect(player(eat(ship(), "p0", type), "p0").ap).toBe(config.startAp);
    }
  });
});
