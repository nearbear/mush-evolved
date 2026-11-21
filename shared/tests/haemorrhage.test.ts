import { describe, expect, it } from "vitest";
import { addDisease, removeDisease } from "../src/diseases.ts";
import { createGame } from "../src/rules.ts";
import type { GameState } from "../src/types.ts";
import { makeSeats, nextCycle, noCharacterModifiers, player, testConfig } from "./support.ts";

const config = noCharacterModifiers(testConfig());

function ship(): GameState {
  return createGame(makeSeats(3, "others"), config, 7);
}

describe.each([
  ["haemorrhage_injury", 1],
  ["critical_haemorrhage_injury", 2],
] as const)("%s", (injury, loss) => {
  it(`lowers max health by ${loss} while you have it`, () => {
    const s = ship();
    const p0 = player(s, "p0");
    const max = p0.maxHp;
    addDisease(s, p0, injury);
    expect(p0.maxHp).toBe(max - loss);
    removeDisease(s, p0, injury);
    expect(p0.maxHp).toBe(max);
  });

  it(`costs ${loss} health at each cycle change, and can kill (blood loss)`, () => {
    const s = ship();
    addDisease(s, player(s, "p0"), injury);
    player(s, "p0").hp = 5;
    player(s, "p1").hp = 5;
    const r = nextCycle(s);
    expect(player(r, "p0").hp).toBe(5 - loss);
    expect(player(r, "p1").hp).toBe(5);

    player(r, "p0").hp = loss;
    const dead = nextCycle(r);
    expect(player(dead, "p0").alive).toBe(false);
    expect(dead.log.some((e) => e.key === "died" && e.params?.cause === "bled")).toBe(true);
  });
});
