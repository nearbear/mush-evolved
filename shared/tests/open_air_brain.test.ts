import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { addDisease, removeDisease } from "../src/diseases.ts";
import { soil } from "../src/dirt.ts";
import { applyAction, createGame } from "../src/rules.ts";
import type { GameState } from "../src/types.ts";
import { makeSeats, must, nextCycle, noHunters, noIncidents, player } from "./support.ts";

const BRAIN = "open_air_brain_injury";
const config = noIncidents(noHunters({ ...DEFAULT_CONFIG, characterModifiers: {}, startSkills: [], startItems: [] }));

function ship(): GameState {
  const s = createGame(makeSeats(3, "others"), config, 7);
  for (const p of s.players) p.room = "LABORATORY";
  return s;
}

const diedOfSepsis = (s: GameState, id: string) =>
  !player(s, id).alive && s.log.some((e) => e.key === "died" && e.params?.cause === "sepsis");

describe("open air brain injury", () => {
  it("lowers max health by 5 and max morale by 2 while you have it", () => {
    const s = ship();
    const p0 = player(s, "p0");
    const [hp, morale] = [p0.maxHp, p0.maxMorale];
    addDisease(s, p0, BRAIN);
    expect([p0.maxHp, p0.maxMorale]).toEqual([hp - 5, morale - 2]);
    removeDisease(s, p0, BRAIN);
    expect([p0.maxHp, p0.maxMorale]).toEqual([hp, morale]);
  });

  it("kills of sepsis after the next action resolves", () => {
    const s = ship();
    addDisease(s, player(s, "p0"), BRAIN);
    const r = must(applyAction(s, "p0", { type: "move", to: "CORRIDOR_A" }));
    expect(player(r, "p0").room).toBe("CORRIDOR_A");
    expect(diedOfSepsis(r, "p0")).toBe(true);
    expect(player(r, "p1").alive).toBe(true);
  });

  it("kills of sepsis on becoming dirty, but not when already dirty", () => {
    const s = ship();
    addDisease(s, player(s, "p0"), BRAIN);
    soil(s, player(s, "p0"));
    expect(diedOfSepsis(s, "p0")).toBe(true);

    const t = ship();
    soil(t, player(t, "p0"));
    addDisease(t, player(t, "p0"), BRAIN);
    soil(t, player(t, "p0"));
    expect(player(t, "p0").alive).toBe(true);
  });

  it("kills of sepsis at the next cycle change", () => {
    const s = ship();
    addDisease(s, player(s, "p0"), BRAIN);
    const r = nextCycle(s);
    expect(diedOfSepsis(r, "p0")).toBe(true);
    expect(player(r, "p1").alive).toBe(true);
  });
});
