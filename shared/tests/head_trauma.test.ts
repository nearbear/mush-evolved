import { describe, expect, it } from "vitest";
import { addDisease, removeDisease } from "../src/diseases.ts";
import { applyAction, createGame } from "../src/rules.ts";
import type { GameState } from "../src/types.ts";
import { makeSeats, must, nextCycle, noCharacterModifiers, player, testConfig } from "./support.ts";

const TRAUMA = "head_trauma_injury";
const config = noCharacterModifiers(testConfig());
// Fixed rng states, so the rates are the same every run; the bounds only have to fit them.
const RUNS = 200;
const SLOW = 20_000;

function ship(): GameState {
  const s = createGame(makeSeats(3, "others"), config, 7);
  for (const p of s.players) p.room = "LABORATORY";
  addDisease(s, player(s, "p0"), TRAUMA);
  return s;
}

const diedOfSepsis = (s: GameState) => !player(s, "p0").alive && s.log.some((e) => e.key === "died" && e.params?.cause === "sepsis");

/** Share of `RUNS` different rng states in which `step` kills p0 of sepsis. */
function deathRate(step: (s: GameState) => GameState): number {
  const base = ship();
  let deaths = 0;
  for (let i = 0; i < RUNS; i++) {
    const s = structuredClone(base);
    s.rng = (i * 2654435761) >>> 0;
    if (diedOfSepsis(step(s))) deaths++;
  }
  return deaths / RUNS;
}

describe("head trauma injury", () => {
  it("lowers max health and max morale by 3 while you have it", () => {
    const s = createGame(makeSeats(3, "others"), config, 7);
    const p0 = player(s, "p0");
    const [hp, morale] = [p0.maxHp, p0.maxMorale];
    addDisease(s, p0, TRAUMA);
    expect([p0.maxHp, p0.maxMorale]).toEqual([hp - 3, morale - 3]);
    removeDisease(s, p0, TRAUMA);
    expect([p0.maxHp, p0.maxMorale]).toEqual([hp, morale]);
  });

  it("kills of sepsis about half the time after an action, once the action has resolved", () => {
    const rate = deathRate((s) => {
      const r = must(applyAction(s, "p0", { type: "move", to: "CORRIDOR_A" }));
      expect(player(r, "p0").room).toBe("CORRIDOR_A");
      return r;
    });
    expect(rate).toBeGreaterThan(0.4);
    expect(rate).toBeLessThan(0.6);
  }, SLOW);

  it("kills of sepsis about a quarter of the time at a cycle change", () => {
    const rate = deathRate(nextCycle);
    expect(rate).toBeGreaterThan(0.17);
    expect(rate).toBeLessThan(0.33);
  }, SLOW);
});
