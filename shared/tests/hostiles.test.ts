import { describe, expect, it } from "vitest";
import { HOSTILE_KINDS, HostileNpc, INTRUDER, spawnHostile, type HostileAction } from "../src/hostiles.ts";
import { endsAccommodation, namedTarget } from "../src/actionTarget.ts";
import { breakDoor, doorId } from "../src/doors.ts";
import { normalizeGame } from "../src/normalizeState.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import type { GameConfig, GameState } from "../src/types.ts";
import type { DeepPartial } from "./support.ts";
import { clone, makeSeats, mustApply, nextCycle, offered, player, testConfig } from "./support.ts";

const base = testConfig();
const ROOM = Object.keys(base.rooms).find((r) => base.rooms[r]!.length >= 2)!;
const [NEXT_DOOR] = base.rooms[ROOM]!;
const ELSEWHERE = Object.keys(base.rooms).find((r) => r !== ROOM && !base.rooms[ROOM]!.includes(r))!;

/** p0 and p1 share ROOM with an intruder; p2 is elsewhere. */
function ship(overrides: DeepPartial<GameConfig> = {}): { s: GameState; id: string } {
  const s = createGame(makeSeats(3), testConfig(overrides), 7);
  player(s, "p0").room = player(s, "p1").room = ROOM;
  player(s, "p2").room = ELSEWHERE;
  const id = spawnHostile(s, INTRUDER, ROOM).id;
  return { s, id };
}

const hostile = (s: GameState, id: string) => s.hostiles.find((h) => h.id === id);
const logKeys = (s: GameState) => s.log.map((e) => e.key);
const sure = { punch: { successChance: 1, crit: { chance: 0 } } } as const;

describe("hostile NPCs", () => {
  it("pins the intruder's placeholder numbers", () => {
    const k = base.hostiles.kinds[INTRUDER]!;
    expect([k.hp, k.startAp, k.maxAp, k.apPerCycle, k.startMp, k.maxMp, k.mpPerCycle]).toEqual([14, 8, 12, 1, 12, 12, 1]);
    expect(k.move.cost.ap).toBe(1);
  });

  it("spawns with its kind's stats, apart from the crew", () => {
    const { s, id } = ship();
    const k = base.hostiles.kinds[INTRUDER]!;
    expect(hostile(s, id)).toEqual({ id, kind: INTRUDER, room: ROOM, hp: k.hp, maxHp: k.hp, ap: k.startAp, maxAp: k.maxAp, mp: k.startMp, maxMp: k.maxMp });
    expect(id).toBe("hostile:1");
    expect(spawnHostile(s, INTRUDER, ROOM).id).toBe("hostile:2");
    expect(s.players.some((p) => p.id === id)).toBe(false);
  });

  it("shows its kind and HP to the living in its room only, never its AP or MP", () => {
    const { s, id } = ship();
    const k = base.hostiles.kinds[INTRUDER]!;
    expect(viewFor(s, "p0").hostiles).toEqual([{ id, kind: INTRUDER, hp: k.hp, maxHp: k.hp }]);
    expect(viewFor(s, "p2").hostiles).toEqual([]);
    player(s, "p1").alive = false;
    expect(viewFor(s, "p1").hostiles).toEqual([]);
  });

  it("can be punched, and dies at 0 HP", () => {
    const { s, id } = ship(sure);
    expect(offered(s, "p0")).toContainEqual({ type: "punch", target: id });
    const hit = mustApply(s, "p0", { type: "punch", target: id });
    expect(hostile(hit, id)!.hp).toBeLessThan(base.hostiles.kinds[INTRUDER]!.hp);
    expect(logKeys(hit)).toContain("punchedHostile");

    hostile(s, id)!.hp = 1;
    const dead = mustApply(s, "p0", { type: "punch", target: id });
    expect(hostile(dead, id)).toBeUndefined();
    expect(logKeys(dead)).toContain("hostileDied");
    expect(viewFor(dead, "p0").hostiles).toEqual([]);
  });

  it("is what an action aimed at it names, so the client shows it on the hostile's panel", () => {
    const { id } = ship();
    expect(namedTarget({ type: "punch", target: id })).toEqual({ kind: "hostile", id });
    expect(namedTarget({ type: "punch", target: "p1" })).toEqual({ kind: "player", id: "p1" });
    // Like acting on a person, punching it walks you away from a wheelchair you push.
    expect(endsAccommodation({ type: "punch", target: id }, "p0", "public")).toBe(true);
  });

  it("can't be punched from another room", () => {
    const { s, id } = ship(sure);
    expect(offered(s, "p2").some((a) => "target" in a && a.target === id)).toBe(false);
    expect(applyAction(s, "p2", { type: "punch", target: id }).ok).toBe(false);
  });

  it("can be attacked with a weapon", () => {
    const { s, id } = ship({ weapons: { types: { blaster: { accuracy: 1 } } } });
    s.items.push({ id: "blaster1", type: "blaster", charges: 3, at: { kind: "player", id: "p0" } });
    expect(offered(s, "p0")).toContainEqual({ type: "attack", weapon: "blaster1", target: id });
    const next = mustApply(s, "p0", { type: "attack", weapon: "blaster1", target: id });
    expect(logKeys(next)).toContain("attackedHostile");
    expect(hostile(next, id)?.hp ?? 0).toBeLessThanOrEqual(base.hostiles.kinds[INTRUDER]!.hp);
  });

  it("can be thrown out by a Wrestler", () => {
    const { s, id } = ship();
    player(s, "p0").skills = ["wrestler"];
    const next = mustApply(s, "p0", { type: "throw_out", target: id, to: NEXT_DOOR! });
    expect(hostile(next, id)!.room).toBe(NEXT_DOOR);
    expect(logKeys(next)).toEqual(expect.arrayContaining(["threwOutHostile", "hostileThrownIn"]));
  });

  it("punches one player in its room at a cycle change, once, as a player's punch", () => {
    const { s, id } = ship(sure);
    const k = base.hostiles.kinds[INTRUDER]!;
    const next = nextCycle(s);
    const punches = next.log.filter((e) => e.key === "hostilePunched");
    expect(punches).toHaveLength(1);
    expect(punches[0]!.params).toMatchObject({ hostile: INTRUDER });
    expect(hostile(next, id)!.ap).toBe(Math.min(k.maxAp, k.startAp + k.apPerCycle) - base.punch.cost.ap);
    const lost = s.players.reduce((n, p) => n + p.hp, 0) - next.players.reduce((n, p) => n + p.hp, 0);
    expect(lost).toBeGreaterThanOrEqual(base.punch.effect.damage[0]);
    expect(lost).toBeLessThanOrEqual(base.punch.effect.damage[1]);
    expect(logKeys(next)).not.toContain("hostileLeft");
  });

  it("logs a miss, and doesn't punch through a Ceasefire (it moves instead)", () => {
    const missed = nextCycle(ship({ punch: { successChance: 0 } }).s);
    expect(logKeys(missed)).toContain("hostilePunchMissed");
    const { s } = ship(sure);
    s.ceasefires[ROOM] = 3;
    const calm = nextCycle(s);
    expect(logKeys(calm).filter((key) => key.startsWith("hostilePunch"))).toEqual([]);
    expect(logKeys(calm)).toContain("hostileLeft");
  });

  it("moves once through an open door when nobody is in its room", () => {
    const { s, id } = ship();
    player(s, "p0").room = player(s, "p1").room = ELSEWHERE;
    const k = base.hostiles.kinds[INTRUDER]!;
    const next = nextCycle(s);
    expect([logKeys(next).filter((key) => key === "hostileLeft").length, logKeys(next).filter((key) => key === "hostileArrived").length]).toEqual([1, 1]);
    expect(base.rooms[ROOM]).toContain(hostile(next, id)!.room);
    expect(hostile(next, id)!.ap).toBe(Math.min(k.maxAp, k.startAp + k.apPerCycle) - k.move.cost.ap);
    expect(hostile(next, id)!.mp).toBe(Math.min(k.maxMp, k.startMp + k.mpPerCycle));
  });

  it("doesn't move through a broken door", () => {
    const { s, id } = ship();
    player(s, "p0").room = player(s, "p1").room = ELSEWHERE;
    for (const to of base.rooms[ROOM]!) breakDoor(s, doorId(ROOM, to));
    const next = nextCycle(s);
    expect(hostile(next, id)!.room).toBe(ROOM);
    expect(hostile(next, id)!.ap).toBe(base.hostiles.kinds[INTRUDER]!.startAp + base.hostiles.kinds[INTRUDER]!.apPerCycle);
  });

  describe("the room's and the target's effects weigh on its actions as on a player's", () => {
    const intruder = HOSTILE_KINDS[INTRUDER]!;
    const punchOf = (s: GameState, id: string, target: string) => intruder.options(s, hostile(s, id)!).find((o) => o.data.type === "punch" && o.data.target === target)!;

    it("Pacifist: its punch costs more in a Pacifist's room", () => {
      const { s, id } = ship();
      player(s, "p1").modifiers.push("pacifist");
      expect(intruder.price(s, hostile(s, id)!, punchOf(s, id, "p0")).ap).toBe(base.punch.cost.ap + base.pacifist.aggressiveApSurcharge);
    });

    it("Bodyguard: punching the VIP costs more while the bodyguard is there", () => {
      const { s, id } = ship();
      player(s, "p0").skills = ["bodyguard"];
      player(s, "p1").protectedBy = "p0";
      expect(intruder.price(s, hostile(s, id)!, punchOf(s, id, "p1")).ap).toBe(base.punch.cost.ap + base.bodyguard.aggressiveApSurcharge);
      expect(intruder.price(s, hostile(s, id)!, punchOf(s, id, "p0")).ap).toBe(base.punch.cost.ap);
    });

    it("a surcharge it can't pay stops the punch, and it moves instead", () => {
      const { s, id } = ship();
      player(s, "p1").modifiers.push("pacifist");
      hostile(s, id)!.ap = 0;
      const next = nextCycle(s);
      expect(logKeys(next).filter((key) => key.startsWith("hostilePunch"))).toEqual([]);
      expect(logKeys(next)).toContain("hostileLeft");
    });

    it("Elusive: its punch lands less often on an Elusive player", () => {
      const { s, id } = ship();
      player(s, "p1").skills = ["escape"];
      expect(intruder.chance(s, hostile(s, id)!, punchOf(s, id, "p1"))).toBeCloseTo(base.punch.successChance * base.escape.meleeSuccessFactor);
      expect(intruder.chance(s, hostile(s, id)!, punchOf(s, id, "p0"))).toBeCloseTo(base.punch.successChance);
    });

    it("Guarding: a guardian holds it, leaving only the door it came in by", () => {
      const { s, id } = ship();
      player(s, "p0").room = player(s, "p1").room = ELSEWHERE;
      player(s, "p2").room = ROOM;
      player(s, "p2").statuses.push("guardian");
      const moves = (st: GameState) => intruder.options(st, hostile(st, id)!).filter((o) => o.data.type === "move");
      // Spawned, it came in by no door: a guardian keeps it in.
      const held = clone(s);
      held.ceasefires[ROOM] = 3; // so it doesn't punch the guardian instead
      expect(moves(held)).toEqual([]);
      hostile(held, id)!.enteredFrom = NEXT_DOOR;
      expect(moves(held).map((o) => o.data)).toEqual([{ type: "move", to: NEXT_DOOR }]);
    });

    it("remembers the door it came in by, from its own move and from being thrown out", () => {
      const { s, id } = ship();
      player(s, "p0").skills = ["wrestler"];
      const thrown = mustApply(s, "p0", { type: "throw_out", target: id, to: NEXT_DOOR! });
      expect(hostile(thrown, id)!.enteredFrom).toBe(ROOM);
      player(s, "p0").room = player(s, "p1").room = ELSEWHERE;
      const moved = nextCycle(s);
      expect(hostile(moved, id)!.enteredFrom).toBe(ROOM);
    });
  });

  describe("the intruder punches back at a melee attack", () => {
    const counters = (s: GameState) => s.log.filter((e) => e.key.startsWith("hostilePunch"));

    it("after a punch that lands, at the attacker, paying the punch's AP", () => {
      const { s, id } = ship(sure);
      const next = mustApply(s, "p0", { type: "punch", target: id });
      expect(counters(next).map((e) => [e.key, e.params?.target])).toEqual([["hostilePunched", player(s, "p0").character]]);
      expect(hostile(next, id)!.ap).toBe(hostile(s, id)!.ap - base.punch.cost.ap);
      expect(player(next, "p0").hp).toBeLessThan(player(s, "p0").hp);
      expect(player(next, "p1").hp).toBe(player(s, "p1").hp);
    });

    it("after a punch that misses too", () => {
      const { s, id } = ship({ punch: { successChance: 0 } });
      const next = mustApply(s, "p0", { type: "punch", target: id });
      expect(logKeys(next)).toContain("punchMissedHostile");
      expect(counters(next).map((e) => e.key)).toEqual(["hostilePunchMissed"]);
    });

    it("after a knife attack, but not a gun", () => {
      const { s, id } = ship({ ...sure, weapons: { types: { knife: { accuracy: 1 }, blaster: { accuracy: 1 } } } });
      s.items.push({ id: "knife1", type: "knife", at: { kind: "player", id: "p0" } }, { id: "blaster1", type: "blaster", charges: 3, at: { kind: "player", id: "p1" } });
      hostile(s, id)!.hp = 99;
      expect(counters(mustApply(s, "p0", { type: "attack", weapon: "knife1", target: id })).length).toBe(1);
      expect(counters(mustApply(s, "p1", { type: "attack", weapon: "blaster1", target: id }))).toEqual([]);
    });

    it("not when it can't pay, Pacifist included, nor when the blow killed it", () => {
      const broke = ship(sure);
      hostile(broke.s, broke.id)!.ap = 0;
      expect(counters(mustApply(broke.s, "p0", { type: "punch", target: broke.id }))).toEqual([]);

      const calm = ship(sure);
      player(calm.s, "p1").modifiers.push("pacifist");
      hostile(calm.s, calm.id)!.ap = base.punch.cost.ap; // enough for a plain punch, not with the surcharge
      expect(counters(mustApply(calm.s, "p0", { type: "punch", target: calm.id }))).toEqual([]);

      const dying = ship(sure);
      hostile(dying.s, dying.id)!.hp = 1;
      const next = mustApply(dying.s, "p0", { type: "punch", target: dying.id });
      expect(logKeys(next)).toContain("hostileDied");
      expect(counters(next)).toEqual([]);
    });

    it("not after being thrown out", () => {
      const { s, id } = ship(sure);
      player(s, "p0").skills = ["wrestler"];
      expect(counters(mustApply(s, "p0", { type: "throw_out", target: id, to: NEXT_DOOR! }))).toEqual([]);
    });
  });

  it("lets a kind with the base's turn spend all its AP", () => {
    class Brute extends HostileNpc {
      readonly kind = INTRUDER;
    }
    const { s, id } = ship(sure);
    new Brute().turn(s, id);
    const k = base.hostiles.kinds[INTRUDER]!;
    // Both cost 1 AP: every point it had after regaining went on a punch or a move.
    expect(hostile(s, id)!.ap).toBe(0);
    expect(logKeys(s).filter((key) => key === "hostilePunched" || key === "hostileLeft").length).toBe(k.startAp + k.apPerCycle);
  });

  it("lets a kind override the base: one with no actions only regains", () => {
    class Statue extends HostileNpc {
      readonly kind = INTRUDER;
      override actions(): readonly HostileAction[] {
        return [];
      }
    }
    const { s, id } = ship();
    const before = clone(s);
    new Statue().turn(s, id);
    expect(hostile(s, id)!.ap).toBe(hostile(before, id)!.ap + base.hostiles.kinds[INTRUDER]!.apPerCycle);
    expect(s.log).toEqual(before.log);
    expect(HOSTILE_KINDS[INTRUDER]).toBeInstanceOf(HostileNpc);
  });

  it("survives a reload, and a game stored before hostiles gets none", () => {
    const { s } = ship();
    const { config: _config, ...stored } = clone(s);
    expect(normalizeGame(stored, {}).hostiles).toEqual(s.hostiles);
    expect(normalizeGame(stored, {}).nextHostileId).toBe(2);
    const { hostiles: _h, nextHostileId: _n, ...old } = stored;
    expect([normalizeGame(old, {}).hostiles, normalizeGame(old, {}).nextHostileId]).toEqual([[], 1]);
  });
});
