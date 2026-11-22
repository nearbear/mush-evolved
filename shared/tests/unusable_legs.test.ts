import { describe, expect, it } from "vitest";
import { addDisease } from "../src/diseases.ts";
import { moveCost, movementRules } from "../src/modifiers.ts";
import { createGame } from "../src/rules.ts";
import type { GameState } from "../src/types.ts";
import { makeSeats, noCharacterModifiers, player, testConfig, withoutDrugs } from "./support.ts";

const LEGS = "unusable_legs_injury";
const LEG_INJURIES = ["broken_foot_injury", "mashed_foot_injury", "broken_leg_injury", LEGS];
const config = noCharacterModifiers(testConfig());

function ship(): GameState {
  const s = withoutDrugs(createGame(makeSeats(3), config, 1));
  player(s, "p0").room = "LABORATORY";
  return s;
}

const held = (s: GameState) => player(s, "p0").modifiers.filter((m) => LEG_INJURIES.includes(m));
const rules = (s: GameState) => movementRules(s, player(s, "p0"));

describe("unusable legs injury", () => {
  it("upgrades a second Mashed Foot or a second Broken Leg", () => {
    for (const lower of ["mashed_foot_injury", "broken_leg_injury"]) {
      const s = ship();
      addDisease(s, player(s, "p0"), lower);
      addDisease(s, player(s, "p0"), lower);
      expect(held(s), lower).toEqual([LEGS]);
    }
  });

  it("replaces every lower tier when caught directly, and no lower tier joins it afterwards", () => {
    const s = ship();
    for (const lower of ["broken_foot_injury", "broken_leg_injury"]) addDisease(s, player(s, "p0"), lower);
    addDisease(s, player(s, "p0"), LEGS);
    expect(held(s)).toEqual([LEGS]);
    for (const lower of ["broken_foot_injury", "mashed_foot_injury", "broken_leg_injury"]) addDisease(s, player(s, "p0"), lower);
    expect(held(s)).toEqual([LEGS]);
  });

  it("gives a Critical Haemorrhage when it appears, -4 max HP, and -12 max MP down to 0, which stops moving", () => {
    const s = ship();
    const p0 = player(s, "p0");
    const hp = p0.maxHp;
    addDisease(s, p0, LEGS);
    expect(p0.modifiers).toContain("critical_haemorrhage_injury");
    expect(p0.maxHp).toBe(hp - 4 - 2); // and Critical Haemorrhage's own -2
    expect([p0.maxMp, p0.mp]).toEqual([0, 0]);
    p0.ap = 10;
    expect(moveCost(rules(s), p0)).toBeNull();
  });
});

describe("wheelchair and leg injuries", () => {
  it("leaves a wheelchair user's move cost and max MP alone, but not their max HP", () => {
    for (const injury of LEG_INJURIES) {
      const plain = ship();
      const s = ship();
      const p0 = player(s, "p0");
      for (const state of [plain, s]) player(state, "p0").modifiers.push("wheelchair");
      addDisease(s, p0, injury);
      expect(rules(s).mpPerMove, injury).toBe(rules(plain).mpPerMove);
      expect(p0.maxMp, injury).toBe(player(plain, "p0").maxMp);
      expect(p0.maxHp, injury).toBeLessThan(player(plain, "p0").maxHp);
    }
  });
});
