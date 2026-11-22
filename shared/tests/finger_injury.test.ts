import { describe, expect, it } from "vitest";
import { addDisease } from "../src/diseases.ts";
import { createGame } from "../src/rules.ts";
import type { GameState } from "../src/types.ts";
import { costOf, makeSeats, noCharacterModifiers, player, testConfig, withoutDrugs } from "./support.ts";

const BROKEN = "broken_finger_injury";
const MISSING = "missing_finger_injury";
const config = noCharacterModifiers(testConfig());

/** p0 and p1 in the lab; p0 holds a medikit. */
function ship(seed = 1): GameState {
  const s = withoutDrugs(createGame(makeSeats(3), config, seed));
  for (const id of ["p0", "p1"]) player(s, id).room = "LABORATORY";
  s.items.push({ id: "kit", type: "medikit", at: { kind: "player", id: "p0" } });
  return s;
}

const fingers = (s: GameState) => player(s, "p0").modifiers.filter((m) => m === BROKEN || m === MISSING);

describe("finger injuries", () => {
  it("each cost 1 more AP on actions that cost AP, leaving moves alone", () => {
    for (const injury of [BROKEN, MISSING]) {
      const plain = ship();
      const s = ship();
      addDisease(s, player(s, "p0"), injury);
      expect(costOf(s, "p0", { type: "heal", target: "p1" })?.ap, injury).toBe(config.heal.cost.apOther + 1);
      for (const state of [plain, s]) player(state, "p0").mp = 0;
      expect(costOf(s, "p0", { type: "move" }), injury).toEqual(costOf(plain, "p0", { type: "move" }));
    }
  });

  it("a Missing Finger lowers max HP by 1; a Broken Finger doesn't", () => {
    const plain = ship();
    for (const [injury, loss] of [[BROKEN, 0], [MISSING, 1]] as const) {
      const s = ship();
      addDisease(s, player(s, "p0"), injury);
      expect(player(s, "p0").maxHp, injury).toBe(player(plain, "p0").maxHp - loss);
    }
  });

  it("a second Broken Finger becomes a Missing Finger, and a Broken Finger on top of it does nothing", () => {
    const s = ship();
    addDisease(s, player(s, "p0"), BROKEN);
    addDisease(s, player(s, "p0"), BROKEN);
    expect(fingers(s)).toEqual([MISSING]);
    addDisease(s, player(s, "p0"), BROKEN);
    expect(fingers(s)).toEqual([MISSING]);
  });

  it("a Missing Finger brings a Haemorrhage about 20% of the time when it appears", () => {
    let bleeding = 0;
    const runs = 500;
    for (let seed = 0; seed < runs; seed++) {
      const s = ship(seed);
      addDisease(s, player(s, "p0"), MISSING);
      if (player(s, "p0").modifiers.includes("haemorrhage_injury")) bleeding++;
    }
    expect(bleeding / runs).toBeGreaterThan(0.12);
    expect(bleeding / runs).toBeLessThan(0.28);
  });

  it("sits in the pools: Broken Finger in combat and blunt, Missing Finger in blade", () => {
    expect(config.diseases.combatInjuries).toContain(BROKEN);
    expect(config.diseases.bluntInjuries).toContain(BROKEN);
    expect(config.diseases.bladeInjuries).toContain(MISSING);
  });
});
