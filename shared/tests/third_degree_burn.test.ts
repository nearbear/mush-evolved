import { describe, expect, it } from "vitest";
import { addDisease } from "../src/diseases.ts";
import { soil } from "../src/dirt.ts";
import { cycleChanged } from "../src/modifiers.ts";
import { createGame } from "../src/rules.ts";
import type { GameState } from "../src/types.ts";
import { costOf, makeSeats, noCharacterModifiers, player, testConfig, withoutDrugs } from "./support.ts";

const BURN = "third_degree_50_injury";
const config = noCharacterModifiers(testConfig());

/** p0 and p1 in the lab; p0 holds a medikit. */
function ship(seed = 1): GameState {
  const s = withoutDrugs(createGame(makeSeats(3), config, seed));
  for (const id of ["p0", "p1"]) player(s, id).room = "LABORATORY";
  s.items.push({ id: "kit", type: "medikit", at: { kind: "player", id: "p0" } });
  return s;
}

const burnt = (seed = 1): GameState => {
  const s = ship(seed);
  addDisease(s, player(s, "p0"), BURN);
  return s;
};

describe("third-degree burn covering 50% of the body", () => {
  it("is an injury a random combat injury can give", () => {
    expect(config.diseases.allInjuries).toContain(BURN);
    expect(config.diseases.combatInjuries).toContain(BURN);
  });

  it("makes an action that costs AP cost 1 more", () => {
    expect(costOf(burnt(), "p0", { type: "heal", target: "p1" })?.ap).toBe(config.heal.cost.apOther + 1);
  });

  it("leaves a free action free and doesn't change what moving costs", () => {
    const s = burnt();
    player(s, "p0").resources.heal = 1;
    expect(costOf(s, "p0", { type: "heal", target: "p1" })?.ap).toBe(0);
    const plain = ship();
    const b = burnt();
    for (const state of [plain, b]) player(state, "p0").mp = 0;
    expect(costOf(b, "p0", { type: "move" })).toEqual(costOf(plain, "p0", { type: "move" }));
  });

  it("doesn't change max HP", () => {
    const s = ship();
    const max = player(s, "p0").maxHp;
    addDisease(s, player(s, "p0"), BURN);
    expect(player(s, "p0").maxHp).toBe(max);
  });

  it("rarely gives an incident disease at a cycle change, Mush included", () => {
    let sick = 0;
    let mushSick = 0;
    const runs = 1000;
    for (let seed = 0; seed < runs; seed++) {
      const s = burnt(seed);
      const p0 = player(s, "p0");
      const mush = s.players.find((p) => p.role === "mush")!;
      if (mush.id !== "p0") addDisease(s, mush, BURN);
      cycleChanged(s);
      const caught = p0.modifiers.filter((m) => m.endsWith("_disease"));
      expect(caught.length).toBeLessThanOrEqual(1);
      for (const d of caught) expect(config.diseases.incidentDiseases).toContain(d);
      sick += caught.length;
      mushSick += mush.modifiers.filter((m) => m.endsWith("_disease")).length;
    }
    expect(sick / runs).toBeGreaterThan(0.01);
    expect(sick / runs).toBeLessThan(0.06);
    expect(mushSick).toBeGreaterThan(0);
  });
});

describe("third-degree burn covering 90% of the body", () => {
  const BURN_90 = "third_degree_90_injury";
  const burns = (s: GameState) => player(s, "p0").modifiers.filter((m) => m === BURN || m === BURN_90);
  const diedOfSepsis = (s: GameState) =>
    !player(s, "p0").alive && s.log.some((e) => e.key === "died" && e.params?.cause === "sepsis");

  it("upgrades the 50% burn, and a 50% burn on top of it does nothing; a combat injury can give it", () => {
    const s = burnt();
    addDisease(s, player(s, "p0"), BURN);
    expect(burns(s)).toEqual([BURN_90]);
    addDisease(s, player(s, "p0"), BURN);
    expect(burns(s)).toEqual([BURN_90]);
    expect(config.diseases.combatInjuries).toContain(BURN_90);
  });

  it("costs 1 more AP on actions that cost AP, leaves moves alone, and lowers max HP by 4", () => {
    const plain = ship();
    const s = ship();
    const max = player(s, "p0").maxHp;
    addDisease(s, player(s, "p0"), BURN_90);
    expect(player(s, "p0").maxHp).toBe(max - 4);
    expect(costOf(s, "p0", { type: "heal", target: "p1" })?.ap).toBe(config.heal.cost.apOther + 1);
    for (const state of [plain, s]) player(state, "p0").mp = 0;
    expect(costOf(s, "p0", { type: "move" })).toEqual(costOf(plain, "p0", { type: "move" }));
  });

  it("kills by sepsis on becoming dirty, but not for being dirty already when caught", () => {
    const s = ship();
    addDisease(s, player(s, "p0"), BURN_90);
    soil(s, player(s, "p0"));
    expect(diedOfSepsis(s)).toBe(true);

    const t = ship();
    soil(t, player(t, "p0"));
    addDisease(t, player(t, "p0"), BURN_90);
    expect(player(t, "p0").alive).toBe(true);
  });

  it("keeps the 3% incident-disease roll at a cycle change", () => {
    let sick = 0;
    const runs = 1000;
    for (let seed = 0; seed < runs; seed++) {
      const s = ship(seed);
      addDisease(s, player(s, "p0"), BURN_90);
      cycleChanged(s);
      sick += player(s, "p0").modifiers.filter((m) => m.endsWith("_disease")).length;
    }
    expect(sick / runs).toBeGreaterThan(0.01);
    expect(sick / runs).toBeLessThan(0.06);
  });
});
