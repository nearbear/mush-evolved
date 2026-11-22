import { describe, expect, it } from "vitest";
import { addDisease } from "../src/diseases.ts";
import { createGame } from "../src/rules.ts";
import type { GameState } from "../src/types.ts";
import { costOf, makeSeats, noCharacterModifiers, player, testConfig, withoutDrugs } from "./support.ts";

const BROKEN = "broken_foot_injury";
const MASHED = "mashed_foot_injury";
const config = noCharacterModifiers(testConfig());

function ship(): GameState {
  const s = withoutDrugs(createGame(makeSeats(3), config, 1));
  player(s, "p0").room = "LABORATORY";
  return s;
}

const feet = (s: GameState) => player(s, "p0").modifiers.filter((m) => m === BROKEN || m === MASHED);

describe("broken foot injury", () => {
  it("makes a move cost 1 more MP and lowers max HP by 1", () => {
    const plain = ship();
    const s = ship();
    const max = player(s, "p0").maxHp;
    addDisease(s, player(s, "p0"), BROKEN);
    expect(player(s, "p0").maxHp).toBe(max - 1);
    expect(costOf(s, "p0", { type: "move" })?.mp).toBe(costOf(plain, "p0", { type: "move" })!.mp! + 1);
  });

  it("upgrades to Mashed Foot when caught again, and does nothing on top of Mashed Foot", () => {
    const s = ship();
    addDisease(s, player(s, "p0"), BROKEN);
    addDisease(s, player(s, "p0"), BROKEN);
    expect(feet(s)).toEqual([MASHED]);
    addDisease(s, player(s, "p0"), BROKEN);
    expect(feet(s)).toEqual([MASHED]);
  });
});
