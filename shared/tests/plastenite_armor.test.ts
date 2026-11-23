import { describe, expect, it } from "vitest";
import { ITEM_TYPES, startCharges } from "../src/items.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import type { WeaponHitOutcome as WeaponOutcome } from "../src/types/config.ts";
import type { GameConfig, GameState, PlayerId } from "../src/types.ts";
import { makeSeats, must, player, testConfig, withoutDrugs } from "./support.ts";

const base = testConfig();
const W = base.weapons.types;
const { absorb } = base.plasteniteArmor;
/** `n` less `reduction`, never below the floor (1 by default; owner, 2026-11-22) unless already under it. */
const protect = (n: number, reduction: number, floor = base.combatDamageFloor) => (n <= 0 ? n : Math.max(Math.min(n, floor), n - reduction));

/** p0, p1 and p2 share the sick bay; p1 wears the armor, p0 carries `weapon` (id "w") if given. */
function ship(config: GameConfig, seed: number, weapon?: string, armored = true): GameState {
  const s = withoutDrugs(createGame(makeSeats(4), config, seed));
  for (const id of ["p0", "p1", "p2"]) player(s, id).room = "SICK_BAY";
  player(s, "p3").room = "REFECTORY";
  if (armored) s.items.push({ id: "armor", type: "plastenite_armor", at: { kind: "player", id: "p1" } });
  if (weapon) {
    const charges = startCharges(s.config, weapon);
    s.items.push({ id: "w", type: weapon, at: { kind: "player", id: "p0" }, ...(charges !== undefined && { charges }) });
  }
  return s;
}

const hp = (s: GameState, id: PlayerId) => player(s, id).hp;
const keys = (s: GameState) => viewFor(s, "p2").log.map((e) => e.key);
const punchCfg = (crit: number, combatDamageFloor = base.combatDamageFloor): GameConfig =>
  testConfig({ punch: { successChance: 1, crit: { chance: crit } }, combatDamageFloor });
const weaponCfg = (type: string, outcome: WeaponOutcome, combatDamageFloor = base.combatDamageFloor): GameConfig =>
  testConfig({ weapons: { types: { [type]: { accuracy: 1, hitOutcomes: [{ ...outcome, weight: 1 }] } } }, combatDamageFloor });

/** HP p1 loses, with and without the armor, on the same seed. */
function compare(config: GameConfig, seed: number, act: Parameters<typeof applyAction>[2], weapon?: string) {
  const armored = must(applyAction(ship(config, seed, weapon), "p0", act));
  const bare = must(applyAction(ship(config, seed, weapon, false), "p0", act));
  return { armored, with: base.startHp - hp(armored, "p1"), without: base.startHp - hp(bare, "p1") };
}

describe("Plastenite Armor", () => {
  it("absorbs 1 damage, never below 1, and is implemented", () => {
    expect([absorb, base.combatDamageFloor]).toEqual([1, 1]);
    expect(ITEM_TYPES.plastenite_armor?.notImplemented).toBeFalsy();
  });

  it("takes 1 off a plain punch but never below 1", () => {
    const seen = new Set<number>();
    for (let seed = 1; seed <= 30; seed++) {
      const r = compare(punchCfg(0), seed, { type: "punch", target: "p1" });
      expect(r.with).toBe(protect(r.without, absorb));
      expect(r.with).toBeGreaterThanOrEqual(1);
      expect(keys(r.armored)).toContain("punched");
      seen.add(r.without);
    }
    expect([...seen].sort()).toEqual([1, 2]); // a 1-damage punch goes through whole
  });

  it("with a floor of 0 (eMush's), a fully absorbed punch logs punchArmor", () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) {
      const r = compare(punchCfg(0, 0), seed, { type: "punch", target: "p1" });
      expect(r.with).toBe(Math.max(0, r.without - absorb));
      const k = keys(r.armored);
      expect(k).toContain(r.with === 0 ? "punchArmor" : "punched");
      seen.add(r.with === 0 ? "punchArmor" : "punched");
    }
    expect([...seen].sort()).toEqual(["punchArmor", "punched"]);
  });

  it("doesn't stop a critical punch", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const r = compare(punchCfg(1), seed, { type: "punch", target: "p1" });
      expect(r.with).toBe(r.without);
      expect(keys(r.armored)).toContain("punchCrit");
    }
  });

  it("takes 1 off a plain weapon hit, never below 1", () => {
    const shot = { type: "attack", weapon: "w", target: "p1" } as const;
    for (let seed = 1; seed <= 60; seed++) {
      const r = compare(weaponCfg("knife", { weight: 1, log: "KNIFE_SUCCESSFUL_HIT_10_HAEMORRHAGE" }), seed, shot, "knife");
      expect(r.with).toBe(protect(r.without, absorb));
      expect(keys(r.armored)).toContain("KNIFE_SUCCESSFUL_HIT_10_HAEMORRHAGE");
    }
  });

  it("with a floor of 0, logs attackArmor when it absorbs a weapon hit whole", () => {
    const shot = { type: "attack", weapon: "w", target: "p1" } as const;
    const seen = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) {
      const r = compare(weaponCfg("knife", { weight: 1, log: "KNIFE_SUCCESSFUL_HIT_10_HAEMORRHAGE" }, 0), seed, shot, "knife");
      expect(r.with).toBe(Math.max(0, r.without - absorb));
      const key = r.with === 0 ? "attackArmor" : "KNIFE_SUCCESSFUL_HIT_10_HAEMORRHAGE";
      expect(keys(r.armored)).toContain(key);
      seen.add(key);
    }
    expect(seen.size).toBe(2);
  });

  it("doesn't stop a critical weapon hit or an instant kill", () => {
    const shot = { type: "attack", weapon: "w", target: "p1" } as const;
    for (let seed = 1; seed <= 10; seed++) {
      const r = compare(weaponCfg("knife", { weight: 1, critical: true, log: "KNIFE_PLUS_2_DAMAGE_RANDOM_INJURY", effects: { damageDelta: 2 } }), seed, shot, "knife");
      expect(r.with).toBe(r.without);
    }
    const killed = compare(weaponCfg("knife", { weight: 1, critical: true, log: "KNIFE_INSTAGIB_BLED", effects: { instantKill: "target" } }), 1, shot, "knife");
    expect(player(killed.armored, "p1").alive).toBe(false);
  });

  it("takes 1 off each armored victim of an area hit, not the attacker's own damage", () => {
    const grenade = W.grenade!;
    const cfg = weaponCfg("grenade", grenade.hitOutcomes.find((o) => !o.critical)!);
    for (let seed = 1; seed <= 10; seed++) {
      const armored = ship(cfg, seed, "grenade");
      armored.items.push({ id: "armor0", type: "plastenite_armor", at: { kind: "player", id: "p0" } });
      const a = must(applyAction(armored, "p0", { type: "attack", weapon: "w" }));
      const b = must(applyAction(ship(cfg, seed, "grenade", false), "p0", { type: "attack", weapon: "w" }));
      expect(base.startHp - hp(a, "p1")).toBe(protect(base.startHp - hp(b, "p1"), absorb));
      expect(hp(a, "p2")).toBe(hp(b, "p2"));
      expect(hp(a, "p0")).toBe(hp(b, "p0")); // self-damage goes through
    }
  });

  it("two armors absorb no more than one; a broken one absorbs nothing", () => {
    const cfg = punchCfg(0);
    for (let seed = 1; seed <= 10; seed++) {
      const two = ship(cfg, seed);
      two.items.push({ id: "armor2", type: "plastenite_armor", at: { kind: "player", id: "p1" } });
      const broken = ship(cfg, seed);
      broken.items.find((i) => i.id === "armor")!.broken = true;
      const r = compare(cfg, seed, { type: "punch", target: "p1" });
      expect(base.startHp - hp(must(applyAction(two, "p0", { type: "punch", target: "p1" })), "p1")).toBe(r.with);
      expect(base.startHp - hp(must(applyAction(broken, "p0", { type: "punch", target: "p1" })), "p1")).toBe(r.without);
    }
  });
});
