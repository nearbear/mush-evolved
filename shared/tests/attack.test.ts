import { describe, expect, it } from "vitest";
import { ACTIONS } from "../src/actions.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { carriesHeavy, ITEM_TYPES, startCharges } from "../src/items.ts";
import { parseGameMessage } from "../src/protocol.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import type { WeaponStats } from "../src/types/config.ts";
import type { Action, GameConfig, GameState, PlayerId } from "../src/types.ts";
import { forceDismantleOdds, makeSeats, must, offered, option, player, withoutDrugs } from "./support.ts";

const seats = makeSeats(4);
const base = { ...DEFAULT_CONFIG, mushCount: 1, startInventory: [], startItems: [], startSkills: [] };
const W = base.weapons.types;

/** The config with one weapon's stats changed (to force a hit or a miss). */
function tuned(type: string, change: Partial<WeaponStats>): GameConfig {
  return { ...base, weapons: { ...base.weapons, types: { ...W, [type]: { ...W[type]!, ...change } } } };
}

/** p0, p1 and p2 share the sick bay; p3 is in the refectory. p0 carries one `weapon` (id "w"), charged full. */
function ship(weapon: string, config: GameConfig = base, seed = 3): GameState {
  const s = withoutDrugs(createGame(seats, config, seed));
  player(s, "p0").skills = ["engineer"];
  for (const id of ["p0", "p1", "p2"]) player(s, id).room = "SICK_BAY";
  player(s, "p3").room = "REFECTORY";
  const charges = startCharges(s.config, weapon);
  s.items.push({ id: "w", type: weapon, at: { kind: "player", id: "p0" }, ...(charges !== undefined && { charges }) });
  return s;
}

const shoot = (target: PlayerId): Action => ({ type: "attack", weapon: "w", target });
const blast: Action = { type: "attack", weapon: "w" };
const hp = (s: GameState, id: PlayerId) => player(s, id).hp;

describe("weapon stats", () => {
  it("are the wiki's, with 12% for its unknown chances", () => {
    const row = (t: string) => [W[t]!.damage, W[t]!.accuracy, W[t]!.expoStrength, W[t]!.charges, W[t]!.repairChance];
    expect(row("knife")).toEqual([[1, 5], 0.6, 1, undefined, 0.12]);
    expect(row("blaster")).toEqual([[2, 3], 0.5, 1, 3, 0.12]);
    expect(row("natamy_riffle")).toEqual([[2, 4], 0.5, 1, 3, 0.12]);
    expect(W.natamy_riffle!.mushDamage).toEqual([6, 13]);
    expect(row("sniper_riffle")).toEqual([[3, 5], 0.99, 1, 1, 0.12]);
    expect(row("machine_gun")).toEqual([[2, 3], 0.5, 2, 12, 0.12]);
    expect(row("missile_launcher")).toEqual([[1, 8], 0.5, 3, 1, 0.12]);
    expect(row("grenade")).toEqual([[0, 10], 1, 3, undefined, null]);
    expect([W.missile_launcher!.area, W.grenade!.area, W.grenade!.consumed]).toEqual([{ selfDamage: [1, 4] }, { selfDamage: [0, 3] }, true]);
    expect([W.knife!.dirtyChance, W.blaster!.dirtyChance, base.weapons.cost.ap]).toEqual([0.25, 0, 1]);
  });

  it("dismantle: knife and blaster at 50%, the other weapons at the usual odds; never the grenade", () => {
    expect(ITEM_TYPES.knife!.dismantle!.chance).toBe(0.5);
    expect(option(ship("knife"), "p0", { type: "dismantle", item: "w" })?.chance).toBe(0.5);
    expect(option(ship("machine_gun"), "p0", { type: "dismantle", item: "w" })?.chance).toBe(base.dismantle.successChance);
    expect(option(ship("grenade"), "p0", { type: "dismantle", item: "w" })).toBeUndefined();
  });

  it("dismantling the Lizaro Jungle leaves a metal scrap and a thick tube", () => {
    const restore = forceDismantleOdds(1);
    const s = ship("sniper_riffle");
    const r = must(applyAction(s, "p0", { type: "dismantle", item: "w" }));
    restore();
    expect(r.items.filter((i) => i.at.kind === "room" && i.at.id === "SICK_BAY").map((i) => i.type).sort()).toEqual(["metal_scraps", "thick_tube"]);
  });

  it("Old Faithful is heavy", () => {
    expect(carriesHeavy(ship("machine_gun"), player(ship("machine_gun"), "p0"))).toBe(true);
    expect(carriesHeavy(ship("blaster"), player(ship("blaster"), "p0"))).toBe(false);
  });
});

describe("attack with a single-target weapon", () => {
  it("a hit costs the AP, spends a charge, deals damage in range and is public", () => {
    const s = ship("blaster", tuned("blaster", { accuracy: 1 }));
    const r = must(applyAction(s, "p0", shoot("p1")));
    const lost = base.startHp - hp(r, "p1");
    expect(lost).toBeGreaterThanOrEqual(W.blaster!.damage[0]);
    expect(lost).toBeLessThanOrEqual(W.blaster!.damage[1]);
    expect(player(r, "p0").ap).toBe(base.startAp - base.weapons.cost.ap);
    expect(r.items.find((i) => i.id === "w")?.charges).toBe(W.blaster!.charges! - 1);
    expect(viewFor(r, "p2").log.some((e) => e.key === "attacked" && e.params?.item === "blaster")).toBe(true);
    expect(hp(r, "p2")).toBe(base.startHp);
  });

  it("a miss still costs the AP and a charge, deals no damage and is public", () => {
    const s = ship("blaster", tuned("blaster", { accuracy: 0 }));
    const r = must(applyAction(s, "p0", shoot("p1")));
    expect(hp(r, "p1")).toBe(base.startHp);
    expect(r.items.find((i) => i.id === "w")?.charges).toBe(W.blaster!.charges! - 1);
    expect(viewFor(r, "p1").log.some((e) => e.key === "attackMissed")).toBe(true);
  });

  it("rolls every damage value in range over many seeds", () => {
    const seen = new Set<number>();
    for (let seed = 1; seed <= 200; seed++) seen.add(base.startHp - hp(must(applyAction(ship("knife", tuned("knife", { accuracy: 1 }), seed), "p0", shoot("p1"))), "p1"));
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it("the Natamy rifle deals its Mush damage to a Mush", () => {
    const s = ship("natamy_riffle", tuned("natamy_riffle", { accuracy: 1 }));
    player(s, "p1").role = "mush";
    player(s, "p2").role = "human";
    const [lo, hi] = W.natamy_riffle!.mushDamage!;
    const onMush = base.startHp - hp(must(applyAction(s, "p0", shoot("p1"))), "p1");
    expect(onMush).toBeGreaterThanOrEqual(lo);
    expect(onMush).toBeLessThanOrEqual(hi);
    const onHuman = base.startHp - hp(must(applyAction(s, "p0", shoot("p2"))), "p2");
    expect(onHuman).toBeLessThanOrEqual(W.natamy_riffle!.damage[1]);
  });

  it("can kill", () => {
    const s = ship("sniper_riffle", tuned("sniper_riffle", { accuracy: 1 }));
    player(s, "p1").hp = 1;
    expect(player(must(applyAction(s, "p0", shoot("p1"))), "p1").alive).toBe(false);
  });

  it("the knife has no charges and can be used again", () => {
    let s = ship("knife");
    s = must(applyAction(s, "p0", shoot("p1")));
    expect(s.items.find((i) => i.id === "w")?.charges).toBeUndefined();
    expect(offered(s, "p0")).toContainEqual(shoot("p1"));
  });

  it("an empty weapon can't be used", () => {
    const s = ship("sniper_riffle");
    const r = must(applyAction(s, "p0", shoot("p1")));
    expect(r.items.find((i) => i.id === "w")?.charges).toBe(0);
    expect(offered(r, "p0").filter((a) => a.type === "attack")).toEqual([]);
    expect(applyAction(r, "p0", shoot("p1")).ok).toBe(false);
  });

  it("offers one attack per living person in the room, only with a carried weapon; illegal attacks leave state unchanged", () => {
    const s = ship("blaster");
    expect(offered(s, "p0").filter((a) => a.type === "attack")).toEqual([shoot("p1"), shoot("p2")]);
    const before = JSON.stringify(s);
    for (const a of [shoot("p0"), shoot("p3"), blast, { type: "attack", weapon: "nope", target: "p1" } as Action]) expect(applyAction(s, "p0", a).ok).toBe(false);
    s.items[s.items.length - 1]!.at = { kind: "room", id: "SICK_BAY" };
    expect(offered(s, "p0").filter((a) => a.type === "attack")).toEqual([]);
    expect(applyAction(s, "p0", shoot("p1")).ok).toBe(false);
    s.items[s.items.length - 1]!.at = { kind: "player", id: "p0" };
    player(s, "p0").ap = 0;
    expect(applyAction(s, "p0", shoot("p1")).ok).toBe(false);
    player(s, "p0").ap = base.startAp;
    expect(JSON.stringify(s)).toBe(before);
  });

  it("shows the weapon's accuracy as the chance", () => {
    expect(option(ship("sniper_riffle"), "p0", shoot("p1"))?.chance).toBe(W.sniper_riffle!.accuracy);
  });
});

describe("area weapons", () => {
  it("the rocket launcher hits everyone in the room, the attacker less, and spends its charge", () => {
    const s = ship("missile_launcher", tuned("missile_launcher", { accuracy: 1 }));
    const r = must(applyAction(s, "p0", blast));
    for (const id of ["p1", "p2"]) {
      const lost = base.startHp - hp(r, id);
      expect(lost).toBeGreaterThanOrEqual(W.missile_launcher!.damage[0]);
      expect(lost).toBeLessThanOrEqual(W.missile_launcher!.damage[1]);
    }
    const self = base.startHp - hp(r, "p0");
    expect(self).toBeGreaterThanOrEqual(W.missile_launcher!.area!.selfDamage[0]);
    expect(self).toBeLessThanOrEqual(W.missile_launcher!.area!.selfDamage[1]);
    expect(hp(r, "p3")).toBe(base.startHp);
    expect(r.items.find((i) => i.id === "w")?.charges).toBe(0);
    expect(viewFor(r, "p1").log.some((e) => e.key === "attackedArea")).toBe(true);
  });

  it("a missed rocket hurts no one", () => {
    const r = must(applyAction(ship("missile_launcher", tuned("missile_launcher", { accuracy: 0 })), "p0", blast));
    for (const id of ["p0", "p1", "p2"]) expect(hp(r, id)).toBe(base.startHp);
    expect(viewFor(r, "p1").log.some((e) => e.key === "attackAreaMissed")).toBe(true);
  });

  it("the grenade is used up and hurts the thrower at most 3", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const r = must(applyAction(ship("grenade", base, seed), "p0", blast));
      expect(r.items.some((i) => i.id === "w")).toBe(false);
      expect(base.startHp - hp(r, "p0")).toBeLessThanOrEqual(3);
      expect(base.startHp - hp(r, "p1")).toBeLessThanOrEqual(10);
    }
  });

  it("is offered once with no target, even alone in the room", () => {
    const s = ship("grenade");
    player(s, "p1").room = player(s, "p2").room = "REFECTORY";
    expect(offered(s, "p0").filter((a) => a.type === "attack")).toEqual([blast]);
  });
});

describe("attack rules", () => {
  it("is aggressive, so Pacifist applies", () => {
    expect(ACTIONS.attack.tags).toEqual(["aggressive"]);
  });

  it("is melee with a knife, and only then; a punch is melee too", () => {
    const tagsOf = (weapon: string) => option(ship(weapon), "p0", (a) => a.type === "attack").tags;
    expect(tagsOf("knife")).toEqual(["aggressive", "melee"]);
    expect(tagsOf("blaster")).toEqual(["aggressive"]);
    expect(ACTIONS.punch.tags).toEqual(["aggressive", "melee"]);
  });

  it("the knife may make you dirty; guns don't", () => {
    const dirtyAfter = (weapon: string) => {
      let n = 0;
      for (let seed = 1; seed <= 200; seed++) if (player(must(applyAction(ship(weapon, base, seed), "p0", shoot("p1"))), "p0").statuses.includes("dirty")) n++;
      return n;
    };
    expect(dirtyAfter("blaster")).toBe(0);
    expect(dirtyAfter("knife")).toBeGreaterThan(0);
  });

  it("is not leaked to other rooms", () => {
    const r = must(applyAction(ship("blaster", tuned("blaster", { accuracy: 1 })), "p0", shoot("p1")));
    expect(JSON.stringify(viewFor(r, "p3").log)).not.toContain("attack");
  });

  it("charged weapons start full, also from a start item", () => {
    const s = createGame(seats, { ...base, startItems: [{ type: "machine_gun", room: "SICK_BAY" }] }, 1);
    expect(s.items.find((i) => i.type === "machine_gun")?.charges).toBe(12);
  });

  it("parses from client input", () => {
    const parse = (action: unknown) => parseGameMessage(JSON.stringify({ type: "action", action }));
    expect(parse(shoot("p1"))).toEqual({ type: "action", action: shoot("p1") });
    expect(parse(blast)).toEqual({ type: "action", action: blast });
    expect(parse({ type: "attack", weapon: "w", target: 3 })).toBeNull();
    expect(parse({ type: "attack" })).toBeNull();
  });
});
