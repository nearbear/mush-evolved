import { describe, expect, it } from "vitest";
import { addDisease } from "../src/diseases.ts";
import { actionSuccessRate } from "../src/modifiers.ts";
import { createGame } from "../src/rules.ts";
import type { Action, GameState } from "../src/types.ts";
import { costOf, makeSeats, noCharacterModifiers, player, testConfig, withoutDrugs } from "./support.ts";

const HAND = "shredded_hand_injury";
const ARM = "shattered_arm_injury";
const SHOULDER = "shattered_shoulder_injury";
const FINGERS_AND_BURN = ["broken_finger_injury", "missing_finger_injury", "burnt_hand_injury"];
const config = noCharacterModifiers(testConfig());

function ship(): GameState {
  const s = withoutDrugs(createGame(makeSeats(3), config, 1));
  for (const p of s.players) p.room = "LABORATORY";
  return s;
}

const has = (s: GameState, id: string) => player(s, "p0").modifiers.includes(id);
const shot = (s: GameState) =>
  actionSuccessRate(0.5, { state: s, actor: player(s, "p0"), action: { type: "attack", weapon: "w", target: "t" } as Action, tags: ["aggressive"] });

describe.each([
  [HAND, 2, 2],
  [ARM, 3, 3],
] as const)("%s", (injury, ap, hp) => {
  it(`costs ${ap} more AP on actions that cost AP, -${hp} max HP, and shots x0.6`, () => {
    const plain = ship();
    const s = ship();
    addDisease(s, player(s, "p0"), injury);
    const search = (state: GameState) => costOf(state, "p0", { type: "search" })?.ap;
    expect(search(s)).toBe(search(plain)! + ap);
    expect(player(s, "p0").maxHp).toBe(player(plain, "p0").maxHp - hp);
    expect(shot(s)).toBeCloseTo(0.3);
  });
});

describe("hand and arm cancels", () => {
  it("Shredded Hand removes the finger injuries and Burnt Hand, and none of them can join it", () => {
    const s = ship();
    for (const id of ["broken_finger_injury", "burnt_hand_injury"]) addDisease(s, player(s, "p0"), id);
    addDisease(s, player(s, "p0"), HAND);
    for (const id of FINGERS_AND_BURN) addDisease(s, player(s, "p0"), id);
    expect(FINGERS_AND_BURN.filter((id) => has(s, id))).toEqual([]);
    expect(has(s, HAND)).toBe(true);
  });

  it("Shattered Arm removes Shredded Hand and Busted Arm Joint; Shredded Hand can't join it", () => {
    const s = ship();
    for (const id of [HAND, "busted_arm_joint_injury"]) addDisease(s, player(s, "p0"), id);
    addDisease(s, player(s, "p0"), ARM);
    addDisease(s, player(s, "p0"), HAND);
    addDisease(s, player(s, "p0"), "missing_finger_injury");
    expect([HAND, "busted_arm_joint_injury", "missing_finger_injury"].filter((id) => has(s, id))).toEqual([]);
    expect(has(s, ARM)).toBe(true);
  });

  it("Shattered Shoulder removes Shattered Arm and blocks everything below it", () => {
    const s = ship();
    addDisease(s, player(s, "p0"), ARM);
    addDisease(s, player(s, "p0"), SHOULDER);
    for (const id of [ARM, HAND, ...FINGERS_AND_BURN]) addDisease(s, player(s, "p0"), id);
    expect([ARM, HAND, ...FINGERS_AND_BURN].filter((id) => has(s, id))).toEqual([]);
    expect(has(s, SHOULDER)).toBe(true);
  });

  it("leaves Burned Arm alone, and a second Burnt Hand still upgrades", () => {
    const s = ship();
    addDisease(s, player(s, "p0"), "burnt_hand_injury");
    addDisease(s, player(s, "p0"), "burnt_hand_injury");
    addDisease(s, player(s, "p0"), HAND);
    expect(has(s, "burned_arm_injury")).toBe(true);
  });
});
