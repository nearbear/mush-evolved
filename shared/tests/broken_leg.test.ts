import { describe, expect, it } from "vitest";
import { addDisease, removeDisease } from "../src/diseases.ts";
import { createGame } from "../src/rules.ts";
import type { GameState } from "../src/types.ts";
import { costOf, makeSeats, noCharacterModifiers, player, testConfig, withoutDrugs } from "./support.ts";

const LEG = "broken_leg_injury";
const config = noCharacterModifiers(testConfig());

function ship(): GameState {
  const s = withoutDrugs(createGame(makeSeats(3), config, 1));
  player(s, "p0").room = "LABORATORY";
  return s;
}

describe("broken leg injury", () => {
  it("is an injury a random combat injury can give", () => {
    expect(config.diseases.allInjuries).toContain(LEG);
    expect(config.diseases.combatInjuries).toContain(LEG);
  });

  it("makes a move cost 1 more MP, and lowers max HP by 1 and max MP by 5 while you have it", () => {
    const plain = ship();
    const s = ship();
    const p0 = player(s, "p0");
    const [hp, mp] = [p0.maxHp, p0.maxMp];
    addDisease(s, p0, LEG);
    expect([p0.maxHp, p0.maxMp]).toEqual([hp - 1, mp - 5]);
    expect(costOf(s, "p0", { type: "move" })?.mp).toBe(costOf(plain, "p0", { type: "move" })!.mp! + 1);
    removeDisease(s, p0, LEG);
    expect([p0.maxHp, p0.maxMp]).toEqual([hp, mp]);
  });
});
