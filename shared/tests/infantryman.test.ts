import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { CUSTOMIZED_BLASTER_ITEM, capacity, itemsIn } from "../src/items.ts";
import { resourceAvailable } from "../src/resources.ts";
import { applyAction, applyInput, createGame, viewFor } from "../src/rules.ts";
import { CHARACTER_SKILLS, skillStatus } from "../src/skills.ts";
import type { Action, GameConfig, GameState } from "../src/types.ts";
import { clone } from "../src/helpers.ts";
import { type DeepPartial, makeSeats, must, mustApply, nextDay, offered, option, pickSkill, player, rebelCallAt, testConfig } from "./support.ts";

const TURRET_ROOM = "LASER_TURRET_A_0";
const TURRET = "LASER_TURRET_A_0:TURRET_COMMAND";

function ship(config: DeepPartial<GameConfig> = {}): GameState {
  const s = createGame(makeSeats(6), testConfig(config), 42);
  // Make p0 Chao so he has infantryman on his skill list.
  player(s, "p0").character = "chao";
  player(s, "p0").room = TURRET_ROOM;
  player(s, "p1").room = TURRET_ROOM;
  s.hunters.list.push({ id: "h1", hp: 100, hitChance: s.config.hunters.types.hunter.hitChance, target: null, type: "hunter", countdown: null });
  return s;
}

describe("Infantryman", () => {
  it("pins the config numbers and skill status", () => {
    const { infantryman, weapons } = DEFAULT_CONFIG;
    expect([infantryman.accuracyFactor, infantryman.pointsPerDay, infantryman.pointsOnPick]).toEqual([2, 1, 1]);
    expect(weapons.types.customized_blaster).toEqual({
      ...weapons.types.blaster,
      expoStrength: weapons.types.blaster!.expoStrength + 1,
    });
    expect(skillStatus("infantryman")).toBe("full");
    expect(CHARACTER_SKILLS.chao).toContain("infantryman");
    expect(resourceAvailable("shoot", 0, ["infantryman"])).toBe(true);
  });

  it("grants 1 Shoot point on pick and 1 per day, sharing the Gunman cap", () => {
    let s = ship();
    s = pickSkill(s, "p0", "infantryman");
    expect(player(s, "p0").resources.shoot).toBe(s.config.infantryman.pointsOnPick);
    for (let i = 0; i < 4; i++) {
      s.ship.oxygen = 100;
      s.ship.hull = 100;
      s.fires = [];
      for (const p of s.players) {
        p.satiety = 10;
        p.satietyZeroSince = null;
        p.morale = 10;
        p.hp = p.maxHp;
      }
      s = nextDay(s);
    }
    expect(player(s, "p0").resources.shoot).toBe(s.config.gunman.capPoints);
    expect(player(s, "p1").resources.shoot).toBe(0);
  });

  it("doubles turret hit chance without doubling damage, and stacks with Gunner", () => {
    const baseState = ship();
    const baseChance = option(baseState, "p0", { type: "turret_attack" })!.chance;

    const inf = pickSkill(ship(), "p0", "infantryman");
    expect(option(inf, "p0", { type: "turret_attack" })!.chance).toBeCloseTo(baseChance * DEFAULT_CONFIG.infantryman.accuracyFactor);

    // Damage is not doubled by Infantryman alone.
    const hit = pickSkill(ship({ turrets: { chance: 1 } }), "p0", "infantryman");
    const [lo, hi] = DEFAULT_CONFIG.turrets.damage;
    const damage = 100 - must(applyAction(hit, "p0", { type: "turret_attack", equipment: TURRET, hunter: "h1" })).hunters.list[0]!.hp;
    expect(damage).toBeGreaterThanOrEqual(lo);
    expect(damage).toBeLessThanOrEqual(hi);

    // Stacks with Gunner (capped at 0.99).
    player(inf, "p0").skills.push("gunner");
    expect(option(inf, "p0", { type: "turret_attack" })!.chance).toBeCloseTo(0.99);
  });

  it("spawns a customized blaster owned by the taker (or on the floor if inventory is full)", () => {
    const s = pickSkill(ship(), "p0", "infantryman");
    const blaster = itemsIn(s, { kind: "player", id: "p0" }).find((i) => i.type === CUSTOMIZED_BLASTER_ITEM);
    expect(blaster).toMatchObject({ type: CUSTOMIZED_BLASTER_ITEM, owner: "p0", charges: DEFAULT_CONFIG.weapons.types.customized_blaster!.charges });

    // Full inventory drops it in the room.
    const full = ship();
    const used = itemsIn(full, { kind: "player", id: "p0" }).length;
    const cap = capacity(full, { kind: "player", id: "p0" });
    for (let i = used; i < cap; i++) {
      full.items.push({ id: `fill-${i}`, type: "wrench", at: { kind: "player", id: "p0" } });
    }
    const after = pickSkill(full, "p0", "infantryman");
    const roomItems = itemsIn(after, { kind: "room", id: player(after, "p0").room });
    expect(roomItems.some((i) => i.type === CUSTOMIZED_BLASTER_ITEM && i.owner === "p0")).toBe(true);
  });

  it("allows only the owner to fire it, while others can still carry it", () => {
    let s = pickSkill(ship(), "p0", "infantryman");
    const blaster = itemsIn(s, { kind: "player", id: "p0" }).find((i) => i.type === CUSTOMIZED_BLASTER_ITEM)!;

    // Owner can attack with it.
    expect(offered(s, "p0").some((a) => a.type === "attack" && a.weapon === blaster.id && a.target === "p1")).toBe(true);

    // Drop it; p1 (even with infantryman via cheat) can pick it up, drop it, or hide it, but cannot attack with it.
    s = mustApply(s, "p0", { type: "drop", item: blaster.id });
    player(s, "p1").cheats.push("anySkill");
    s = pickSkill(s, "p1", "infantryman");
    s = mustApply(s, "p1", { type: "take", item: blaster.id });

    expect(offered(s, "p1").some((a) => a.type === "attack" && a.weapon === blaster.id)).toBe(false);
    const bad: Action = { type: "attack", weapon: blaster.id, target: "p0" };
    const res = applyAction(s, "p1", bad);
    expect(res.ok).toBe(false);
  });

  it("never leaks the owner field in any player's view", () => {
    const s = pickSkill(ship(), "p0", "infantryman");
    for (const p of s.players) {
      expect(JSON.stringify(viewFor(s, p.id))).not.toContain('"owner"');
    }
  });

  it("gives +1 expedition power over the regular blaster (even when carried by someone else) and counts for Shooter and Centauri", () => {
    const icarusShip = (events: GameConfig["expedition"]["events"]): GameState => {
      const s = createGame(
        makeSeats(6),
        testConfig({ instantExpeditions: true, expedition: { events } }),
        7,
      );
      s.planets.p0 = [{ id: "planet-1", name: "Testia", direction: "east", distance: 1, sectors: [{ tag: "HOT", known: true }] }];
      s.navigation.orbit = "planet-1";
      for (const id of ["p0", "p1", "p2"]) {
        player(s, id).room = "ICARUS";
        player(s, id).boardedIcarus = true;
        s.items.push({ id: `suit-${id}`, type: "space_suit", at: { kind: "player", id } });
      }
      return s;
    };

    const fightEvent = {
      ...DEFAULT_CONFIG.expedition.events,
      LANDING: [{ kind: "nothing" as const, weight: 1 }],
      HOT: [{ kind: "fight" as const, creature: "CHAB_CHAB", weight: 1, negative: true }],
    };
    const base = icarusShip(fightEvent);
    player(base, "p0").skills.push("pilot");
    // Give p1 (not the owner) a customized blaster with 3 charges.
    base.items.push({ id: "cb", type: CUSTOMIZED_BLASTER_ITEM, charges: 3, owner: "p0", at: { kind: "player", id: "p1" } });

    const runFight = (st: GameState): number => {
      const t = mustApply(st, "p0", { type: "icarus_takeoff" });
      return t.expeditions[0]!.events.find((e) => e.kind === "fight")!.fight!.strength;
    };

    // 3 crew + customized blaster (expoStrength 2) = 5.
    expect(runFight(clone(base))).toBe(5);
    // Shooter (gunman) counts the customized blaster as a gun (+1).
    player(base, "p1").skills.push("gunman");
    expect(runFight(clone(base))).toBe(6);
    // Centauri counts the customized blaster as a blaster (+1).
    rebelCallAt(base, "CENTAURI", 100);
    expect(runFight(clone(base))).toBe(7);
  });
});
