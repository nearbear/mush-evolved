import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { addDisease, diseaseStats } from "../src/diseases.ts";
import { movementRules } from "../src/modifiers.ts";
import { createGame, viewFor } from "../src/rules.ts";
import type { GameState } from "../src/types.ts";
import { makeSeats, nextCycle, noCharacterModifiers, player, testConfig, withoutDrugs } from "./support.ts";

const QUINCKE = "quincks_oedema_disease";
const BURNS = ["burnt_hand_injury", "burned_arm_injury"];
const config = noCharacterModifiers(testConfig());

const ship = (seed = 1): GameState => {
  const s = withoutDrugs(createGame(makeSeats(3), config, seed));
  for (const p of s.players) p.role = "human";
  return s;
};
const burns = (s: GameState) => player(s, "p0").modifiers.filter((m) => BURNS.includes(m));

describe("Quincke's Oedema", () => {
  it("uses the owner's numbers: 1-3 cycles, a disease no pool gives yet", () => {
    const stats = diseaseStats({ config: DEFAULT_CONFIG } as GameState, QUINCKE);
    expect([stats?.durationMin, stats?.durationMax]).toEqual([1, 3]);
    expect(DEFAULT_CONFIG.diseases.allDiseases).toContain(QUINCKE);
    const { incidentDiseases, expeditionDiseases, expeditionCombatDiseases } = DEFAULT_CONFIG.diseases;
    for (const pool of [incidentDiseases, expeditionDiseases, expeditionCombatDiseases]) expect(pool).not.toContain(QUINCKE);
  });

  it("costs 6 HP and gives a Burnt Hand or a Burned Arm when caught, each over many seeds", () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 20; seed++) {
      const s = ship(seed);
      const p0 = player(s, "p0");
      p0.hp = 8;
      addDisease(s, p0, QUINCKE);
      expect(p0.hp).toBe(8 - 6);
      expect(burns(s)).toHaveLength(1);
      seen.add(burns(s)[0]!);
    }
    expect([...seen].sort()).toEqual([...BURNS].sort());
  });

  it("-4 max HP (with the burn's -1) and every move costs 1 more MP while you have it", () => {
    const s = ship();
    const p0 = player(s, "p0");
    const [maxHp, perMove] = [p0.maxHp, movementRules(s, p0).mpPerMove];
    addDisease(s, p0, QUINCKE);
    expect(p0.maxHp).toBe(maxHp - 4 - 1);
    expect(movementRules(s, p0).mpPerMove).toBe(perMove + 1);
    expect(viewFor(s, "p0").movement.mpPerMove).toBe(perMove + 1);
  });

  it("can kill: the death cause is injury, and no burn is given to the dead", () => {
    const s = ship();
    const p0 = player(s, "p0");
    p0.hp = 6;
    addDisease(s, p0, QUINCKE);
    expect(p0.alive).toBe(false);
    expect(burns(s)).toEqual([]);
    expect(JSON.stringify(s.log)).toContain("injury");
  });

  it("a Mush carries it with none of its effects", () => {
    const s = ship();
    const p0 = player(s, "p0");
    p0.role = "mush";
    const [hp, maxHp, perMove] = [p0.hp, p0.maxHp, movementRules(s, p0).mpPerMove];
    addDisease(s, p0, QUINCKE);
    expect(p0.modifiers).toContain(QUINCKE);
    expect([p0.hp, p0.maxHp, movementRules(s, p0).mpPerMove, burns(s)]).toEqual([hp, maxHp, perMove, []]);
  });

  it("wears off within 3 cycles, giving back the max HP but not the burn", () => {
    let s = ship();
    const p0 = player(s, "p0");
    const maxHp = p0.maxHp;
    addDisease(s, p0, QUINCKE);
    for (let i = 0; i < 4; i++) s = nextCycle(s);
    const after = player(s, "p0");
    expect(after.modifiers).not.toContain(QUINCKE);
    expect(after.maxHp).toBe(maxHp - 1);
    expect(burns(s)).toHaveLength(1);
  });
});
