import { describe, expect, it } from "vitest";
import { applyAction, createGame } from "../src/rules.ts";
import { SKILL_STATUS } from "../src/skills.ts";
import type { WeaponHitOutcome as WeaponOutcome } from "../src/types/config.ts";
import type { GameConfig, GameState, PlayerId } from "../src/types.ts";
import { makeSeats, must, player, testConfig, withoutDrugs } from "./support.ts";

// Hard-boiled (Mush skill `tough`; owner, 2026-11-22, eMushpedia): -1 on each non-critical punch or weapon hit,
// stacking with Plastenite Armor, together never below `combatDamageFloor` (1, a difference from eMush's 0).

const base = testConfig();
const reduce = (n: number, reduction: number) => Math.max(Math.min(n, base.combatDamageFloor), n - reduction);

/** p0, p1 and p2 share the sick bay; p1 is a Mush, Hard-boiled if `tough`, wearing armor if `armored`; p0 carries a knife. */
function ship(config: GameConfig, seed: number, tough: boolean, armored = false): GameState {
  const s = withoutDrugs(createGame(makeSeats(4), config, seed));
  for (const id of ["p0", "p1", "p2"]) player(s, id).room = "SICK_BAY";
  player(s, "p3").room = "REFECTORY";
  player(s, "p1").role = "mush";
  if (tough) player(s, "p1").mushSkills.push("tough");
  if (armored) s.items.push({ id: "armor", type: "plastenite_armor", at: { kind: "player", id: "p1" } });
  s.items.push({ id: "w", type: "knife", at: { kind: "player", id: "p0" } });
  return s;
}

const lost = (s: GameState, id: PlayerId) => base.startHp - player(s, id).hp;
const punch = { type: "punch", target: "p1" } as const;
const stab = { type: "attack", weapon: "w", target: "p1" } as const;
const punchCfg = (crit: number): GameConfig => testConfig({ punch: { successChance: 1, crit: { chance: crit } } });
const knifeCfg = (outcome: Omit<WeaponOutcome, "weight">): GameConfig =>
  testConfig({ weapons: { types: { knife: { accuracy: 1, hitOutcomes: [{ ...outcome, weight: 1 }] } } } });

/** HP p1 loses from `act` as Hard-boiled (with or without armor) and as a plain Mush, on the same seed. */
function compare(config: GameConfig, seed: number, act: Parameters<typeof applyAction>[2], armored = false) {
  const tough = must(applyAction(ship(config, seed, true, armored), "p0", act));
  const bare = must(applyAction(ship(config, seed, false), "p0", act));
  return { with: lost(tough, "p1"), without: lost(bare, "p1") };
}

describe("Hard-boiled", () => {
  it("absorbs 1, never below 1, and is fully implemented", () => {
    expect([base.tough.absorb, base.combatDamageFloor]).toEqual([1, 1]);
    expect(SKILL_STATUS.tough).toBe("full");
  });

  it("takes 1 off a plain punch, never below 1", () => {
    const seen = new Set<number>();
    for (let seed = 1; seed <= 30; seed++) {
      const r = compare(punchCfg(0), seed, punch);
      expect(r.with).toBe(reduce(r.without, base.tough.absorb));
      expect(r.with).toBeGreaterThanOrEqual(1);
      seen.add(r.without);
    }
    expect([...seen].sort()).toEqual([1, 2]);
  });

  it("doesn't stop a critical punch or a critical weapon hit", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const p = compare(punchCfg(1), seed, punch);
      expect(p.with).toBe(p.without);
      const k = compare(knifeCfg({ critical: true, log: "KNIFE_PLUS_2_DAMAGE_RANDOM_INJURY", effects: { damageDelta: 2 } }), seed, stab);
      expect(k.with).toBe(k.without);
    }
  });

  it("stacks with Plastenite Armor on a weapon hit, together never below 1", () => {
    const seen = new Set<number>();
    for (let seed = 1; seed <= 40; seed++) {
      const cfg = knifeCfg({ log: "KNIFE_SUCCESSFUL_HIT_10_HAEMORRHAGE", effects: { damageDelta: 1 } });
      const alone = compare(cfg, seed, stab);
      expect(alone.with).toBe(reduce(alone.without, base.tough.absorb));
      const both = compare(cfg, seed, stab, true);
      expect(both.with).toBe(reduce(both.without, base.tough.absorb + base.plasteniteArmor.absorb));
      seen.add(both.without - both.with);
    }
    expect(seen.has(2)).toBe(true); // the seeds include a hit big enough to show both
  });
});
