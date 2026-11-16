import { describe, expect, it } from "vitest";
import { ACTIONS } from "../src/actions.ts";
import { manoeuvre } from "../src/actions/takeoff.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { addDisease } from "../src/diseases.ts";
import { cameraEquipmentId } from "../src/equipment.ts";
import { commandId, interfaceId, PATROL_SHIPS, patrolShip } from "../src/patrol.ts";
import { PROJECT_COMPLETE, projectStatus } from "../src/projects.ts";
import { parseGameMessage } from "../src/protocol.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import type { Action, GameConfig, GameState } from "../src/types.ts";
import { costOf, makeSeats, mustApply, nextCycle, noHunters, offered, option, player } from "./support.ts";

const BAY = "SPACESHIP_BAY_A";
const LONGANE = patrolShip("PATROL_SHIP_A_0")!;
const JUJUBE = patrolShip("PATROL_SHIP_A_1")!;
const takeoff = (ship = LONGANE): Action => ({ type: "takeoff", equipment: interfaceId(ship) });
const land = (ship = LONGANE): Action => ({ type: "land", equipment: commandId(ship) });
/** Why `id` can't do `action` (null if they can): `applyAction` only says "illegal_action". */
const refusal = (s: GameState, id: string, action: Action) => ACTIONS[action.type]!.check(s, player(s, id), action);
const lines = (s: GameState, id: string, key: string) => viewFor(s, id).log.filter((e) => e.key === key);

/** p0 (a Pilot) and p1 in Bay Alpha, p2 in the laboratory. */
function ship(config: Partial<GameConfig> = {}): GameState {
  const s = createGame(makeSeats(3), noHunters({ ...DEFAULT_CONFIG, mushCount: 1, startItems: [], ...config }), 3);
  player(s, "p0").room = player(s, "p1").room = BAY;
  player(s, "p0").skills = ["pilot"];
  player(s, "p2").room = "LABORATORY";
  return s;
}

describe("patrol ship numbers", () => {
  it("eight ships, each a door-less room holding its command, start docked at full armor and charges (the Pasiphae has none)", () => {
    const s = ship();
    expect(PATROL_SHIPS.map((p) => p.id)).toEqual(["PATROL_SHIP_A_0", "PATROL_SHIP_A_1", "PATROL_SHIP_A_2", "PATROL_SHIP_B_0", "PATROL_SHIP_B_1", "PATROL_SHIP_B_2", "PATROL_SHIP_AA_0", "PATROL_SHIP_AA_1"]);
    for (const p of PATROL_SHIPS) {
      expect(s.config.rooms[p.id]).toEqual([]);
      expect(s.equipment[p.id]).toEqual([{ id: commandId(p), type: p.kind === "pasiphae" ? "PASIPHAE_COMMAND" : "PATROL_COMMAND" }]);
      // Its interface is the bay equipment the map already has.
      expect(s.equipment[p.bay]!.some((e) => e.id === interfaceId(p) && e.type === "PATROL_INTERFACE")).toBe(true);
      expect(s.patrolShips[p.id]).toEqual(p.kind === "pasiphae" ? { armor: 12, charges: 0, out: false, destroyed: false, onPlanet: null } : { armor: 10, charges: 10, out: false, destroyed: false, onPlanet: null });
    }
  });
});

describe("taking off", () => {
  it("anyone in a bay (unless grounded) is offered each docked ship there, for 2 AP", () => {
    const s = ship();
    for (const id of ["p0", "p1"]) {
      expect(offered(s, id).filter((a) => a.type === "takeoff")).toEqual([takeoff(LONGANE), takeoff(JUJUBE), takeoff(patrolShip("PATROL_SHIP_A_2")!)]);
      expect(costOf(s, id, takeoff())).toEqual({ ap: s.config.patrol.takeoff.cost.ap, mp: 0 });
    }
    // A human grounded by Gastroenteritis or Slight Nausea can't fly.
    for (const disease of ["gastroenteritis_disease", "slight_nausea_disease"] as const) {
      const grounded = ship();
      const target = player(grounded, "p1");
      if (target.role === "mush") target.role = "human";
      addDisease(grounded, target, disease);
      expect(offered(grounded, "p1").some((a) => a.type === "takeoff")).toBe(false);
      expect(refusal(grounded, "p1", takeoff())).toBe("cant_fly");
    }
    // A ship in another bay can't be taken from here.
    expect(refusal(s, "p0", takeoff(patrolShip("PATROL_SHIP_B_0")!))).toBe("no_ship");
  });

  it("lets a non-pilot fly a patrol ship or the Pasiphae", () => {
    const pasiphae = patrolShip("PATROL_SHIP_AA_1")!;
    const s = ship({ patrol: { ...DEFAULT_CONFIG.patrol, cleanChance: 1 } });
    const out = mustApply(s, "p1", takeoff());
    expect(player(out, "p1").room).toBe(LONGANE.id);
    const back = mustApply(out, "p1", land());
    expect(player(back, "p1").room).toBe(BAY);

    player(s, "p1").room = pasiphae.bay;
    const outP = mustApply(s, "p1", takeoff(pasiphae));
    expect(player(outP, "p1").room).toBe(pasiphae.id);
    const backP = mustApply(outP, "p1", land(pasiphae));
    expect(player(backP, "p1").room).toBe(pasiphae.bay);
  });

  it("moves the pilot alone into the ship's room and marks the ship out", () => {
    const s = ship();
    const next = mustApply(s, "p0", takeoff());
    expect(player(next, "p0")).toMatchObject({ room: LONGANE.id, ap: player(s, "p0").ap - s.config.patrol.takeoff.cost.ap });
    expect(player(next, "p0").spot).toBeUndefined();
    expect(player(next, "p1").room).toBe(BAY);
    expect(next.patrolShips[LONGANE.id]).toEqual({ armor: 10, charges: 10, out: true, destroyed: false, onPlanet: null });
    // A Pilot always manoeuvres cleanly: the hull is untouched.
    expect(next.ship).toEqual(s.ship);
  });

  it("is secret: the line is in the bay, for whoever is there", () => {
    const next = mustApply(ship(), "p0", takeoff());
    expect(lines(next, "p1", "patrolTakeoff")).toMatchObject([{ room: BAY, params: { name: player(next, "p0").character, room: LONGANE.id } }]);
    expect(lines(next, "p2", "patrolTakeoff")).toEqual([]);
    // Unwitnessed, only the pilot has it.
    const alone = ship();
    player(alone, "p1").room = "LABORATORY";
    const flown = mustApply(alone, "p0", takeoff());
    expect(flown.log.at(-1)).toMatchObject({ key: "patrolTakeoff", visibleTo: ["p0"] });
    expect(lines(flown, "p1", "patrolTakeoff")).toEqual([]);
  });

  it("a camera in the bay shows it to everyone who comes in later", () => {
    const s = ship();
    player(s, "p1").room = "LABORATORY";
    s.equipment[BAY]!.push({ id: cameraEquipmentId(BAY), type: "CAMERA" });
    const next = mustApply(s, "p0", takeoff());
    player(next, "p2").room = BAY;
    expect(lines(next, "p2", "patrolTakeoff")).toHaveLength(1);
  });

  it("ends a push the pilot is part of: the person pushed stays in the bay", () => {
    const s = ship();
    player(s, "p1").pushedBy = "p0";
    const next = mustApply(s, "p0", takeoff());
    expect(player(next, "p1").pushedBy).toBeUndefined();
    expect(player(next, "p1").room).toBe(BAY);
    expect(lines(next, "p1", "accommodationEnded")).toHaveLength(1);
  });

  it("a ship that is out isn't offered again, and taking it fails without changing anything", () => {
    const s = ship();
    player(s, "p1").skills = ["pilot"];
    const next = mustApply(s, "p0", takeoff());
    expect(offered(next, "p1").filter((a) => a.type === "takeoff")).toEqual([takeoff(JUJUBE), takeoff(patrolShip("PATROL_SHIP_A_2")!)]);
    const r = applyAction(next, "p1", takeoff());
    expect(r.ok).toBe(false);
  });

  it("parses from the wire", () => {
    expect(parseGameMessage(JSON.stringify({ type: "action", action: takeoff() }))).toEqual({ type: "action", action: takeoff() });
    expect(parseGameMessage(JSON.stringify({ type: "action", action: { type: "land", equipment: 3 } }))).toBeNull();
  });
});

describe("in flight", () => {
  it("the pilot can only land (no doors), and sees their ship's armor and charges; nobody else does", () => {
    const s = mustApply(ship(), "p0", takeoff());
    const types = new Set(offered(s, "p0").map((a) => a.type));
    expect(types.has("move")).toBe(false);
    expect(offered(s, "p0").filter((a) => a.type === "land")).toEqual([land()]);
    expect(viewFor(s, "p0").patrolShip).toEqual({ id: LONGANE.id, armor: 10, maxArmor: 10, charges: 10, debris: null }); // the Pasiphae is intact, so no count
    expect(viewFor(s, "p0").roomEquipment).toEqual([{ id: commandId(LONGANE), type: "PATROL_COMMAND" }]);
    expect(viewFor(s, "p1").patrolShip).toBeNull();
  });

  it("the bay shows the ship's interface as out; other rooms show nothing", () => {
    const s = mustApply(ship(), "p0", takeoff());
    expect(viewFor(s, "p1").roomEquipment.find((e) => e.id === interfaceId(LONGANE))).toEqual({ id: interfaceId(LONGANE), type: "PATROL_INTERFACE", out: true });
    // A docked ship's armor is on its interface (owner, 2026-10-28); a ship that is out shows none.
    expect(viewFor(s, "p1").roomEquipment.find((e) => e.id === interfaceId(JUJUBE))).toEqual({ id: interfaceId(JUJUBE), type: "PATROL_INTERFACE", armor: 10, maxArmor: 10 });
    expect(JSON.stringify(viewFor(s, "p2").roomEquipment)).not.toContain("PATROL_INTERFACE");
  });

  it("with ACTOPI on, the crew sees the pilot in the ship's room; with it off, a room-only dot there", () => {
    const s = mustApply(ship(), "p0", takeoff());
    expect(viewFor(s, "p2").players.find((p) => p.id === "p0")?.room).toBe(LONGANE.id);
    s.bios.actopi = false;
    const view = viewFor(s, "p2");
    expect(view.players.find((p) => p.id === "p0")?.room).toBeUndefined();
    expect(view.unidentified).toContain(LONGANE.id);
  });
});

describe("landing", () => {
  it("brings the pilot back to the bay for 2 AP and docks the ship, with a secret line there", () => {
    const flying = mustApply(ship(), "p0", takeoff());
    expect(costOf(flying, "p0", land())).toEqual({ ap: flying.config.patrol.land.cost.ap, mp: 0 });
    const s = mustApply(flying, "p0", land());
    expect(player(s, "p0").room).toBe(BAY);
    expect(player(s, "p0").ap).toBe(player(flying, "p0").ap - s.config.patrol.land.cost.ap);
    expect(s.patrolShips[LONGANE.id]!.out).toBe(false);
    expect(lines(s, "p1", "patrolLanded")).toMatchObject([{ room: BAY, params: { name: player(s, "p0").character, room: LONGANE.id } }]);
    expect(lines(s, "p2", "patrolLanded")).toEqual([]);
    expect(viewFor(s, "p0").patrolShip).toBeNull();
  });

  it("isn't possible from the ground", () => {
    const s = ship();
    expect(refusal(s, "p0", land())).toBe("not_flying");
    expect(applyAction(s, "p0", land()).ok).toBe(false);
  });
});

describe("shooting from a patrol ship", () => {
  const PASIPHAE = patrolShip("PATROL_SHIP_AA_1")!;
  const shoot = (hunter: string, ship = LONGANE): Action => ({ type: "patrol_attack", equipment: commandId(ship), hunter });
  const shot = (overrides: Partial<GameConfig["patrol"]["shot"]>) => ({ patrol: { ...DEFAULT_CONFIG.patrol, shot: { ...DEFAULT_CONFIG.patrol.shot, ...overrides } } });
  const chanceOf = (s: GameState, id: string) => option(s, id, { type: "patrol_attack" })!.chance;
  /** p0 flying Longane, with two hunters out there. */
  function flying(config: Partial<GameConfig> = {}): GameState {
    const s = mustApply(ship(config), "p0", takeoff());
    s.hunters.list.push({ id: "h1", hp: 6, hitChance: 0.8, target: null, type: "hunter", countdown: null }, { id: "h2", hp: 6, hitChance: 0.8, target: null, type: "hunter", countdown: null });
    return s;
  }

  it("is offered at the command for each hunter, for 1 AP at 40%, doubled for a Pilot", () => {
    const s = flying();
    expect(offered(s, "p0").filter((a) => a.type === "patrol_attack")).toEqual([shoot("h1"), shoot("h2")]);
    expect(costOf(s, "p0", shoot("h1"))).toEqual({ ap: s.config.patrol.shot.cost.ap, mp: 0 });
    expect(chanceOf(s, "p0")).toBeCloseTo(s.config.patrol.shot.chance * s.config.patrol.shot.pilotAccuracyFactor);
    // Nobody else is offered it; someone aboard without the skill (once non-pilots fly) gets the plain odds.
    expect(offered(s, "p1").some((a) => a.type === "patrol_attack")).toBe(false);
    player(s, "p0").skills = [];
    expect(chanceOf(s, "p0")).toBeCloseTo(s.config.patrol.shot.chance);
  });

  it("a hit costs a charge, does 3-6 damage, resets the ship's miss streak, and only the shooter is told", () => {
    let s = flying(shot({ chance: 1 }));
    s.failureStreaks.p0 = { patrol_attack: 2 };
    s.hunters.list[0]!.hp = 10; // above the 6-damage maximum, so the hit can't kill it
    s = mustApply(s, "p0", shoot("h1"));
    expect(s.patrolShips[LONGANE.id]!.charges).toBe(s.config.patrol.charges - 1);
    const hp = s.hunters.list[0]!.hp;
    expect(10 - hp).toBeGreaterThanOrEqual(3);
    expect(s.failureStreaks.p0).toBeUndefined();
    expect(s.log.at(-1)).toMatchObject({ key: "turretHit", visibleTo: ["p0"], params: { damage: 10 - hp } });
  });

  it("does 1 more damage once Cygni is reached, and Cygni only", () => {
    expect(DEFAULT_CONFIG.comms.rebel.cygniPatrolDamage).toBe(1);
    const hit = (base: string | null) => {
      const s = flying(shot({ chance: 1, damage: [4, 4] }));
      s.hunters.list[0]!.hp = 10;
      if (base) s.comms.rebels.push({ base: base as never, calledAt: s.cycle, expiresAt: s.cycle + 10, progress: 100 });
      return 10 - mustApply(s, "p0", shoot("h1")).hunters.list[0]!.hp;
    };
    expect([hit(null), hit("CYGNI"), hit("SIRIUS")]).toEqual([4, 4 + DEFAULT_CONFIG.comms.rebel.cygniPatrolDamage, 4]);
    // A call still being decoded gives nothing yet.
    const partial = flying(shot({ chance: 1, damage: [4, 4] }));
    partial.hunters.list[0]!.hp = 10;
    partial.comms.rebels.push({ base: "CYGNI", calledAt: partial.cycle, expiresAt: partial.cycle + 10, progress: 99 });
    expect(10 - mustApply(partial, "p0", shoot("h1")).hunters.list[0]!.hp).toBe(4);
  });

  it("does 1 more damage once Blaster gun (PATROLSHIP_BLASTER_GUN) is complete, stacking with Cygni", () => {
    expect(projectStatus("PATROLSHIP_BLASTER_GUN")).toBe("full");
    expect(DEFAULT_CONFIG.project.patrolShipBlasterGun.extraDamage).toBe(1);
    const hit = (progress: number, cygni = false) => {
      const s = flying(shot({ chance: 1, damage: [4, 4] }));
      s.hunters.list[0]!.hp = 10;
      s.projects.PATROLSHIP_BLASTER_GUN = progress;
      if (cygni) s.comms.rebels.push({ base: "CYGNI", calledAt: s.cycle, expiresAt: s.cycle + 10, progress: 100 });
      return 10 - mustApply(s, "p0", shoot("h1")).hunters.list[0]!.hp;
    };
    const bonus = DEFAULT_CONFIG.project.patrolShipBlasterGun.extraDamage;
    const cygniBonus = DEFAULT_CONFIG.comms.rebel.cygniPatrolDamage;
    expect([hit(PROJECT_COMPLETE - 1), hit(PROJECT_COMPLETE), hit(PROJECT_COMPLETE, true)]).toEqual([4, 4 + bonus, 4 + bonus + cygniBonus]);
  });

  it("a miss costs a charge too; its streak (x1.25 a miss) is its own, apart from the turrets'", () => {
    let s = flying(shot({ chance: 0 }));
    s = mustApply(s, "p0", shoot("h1"));
    expect([s.patrolShips[LONGANE.id]!.charges, s.failureStreaks.p0?.patrol_attack, s.failureStreaks.p0?.turret_attack, s.hunters.list[0]!.hp]).toEqual([s.config.patrol.charges - 1, 1, undefined, 6]);
    expect(s.log.at(-1)).toMatchObject({ key: "turretMiss", visibleTo: ["p0"] });
    const odds = flying();
    player(odds, "p0").skills = [];
    odds.failureStreaks.p0 = { turret_attack: 3 };
    expect(chanceOf(odds, "p0")).toBeCloseTo(0.4);
    odds.failureStreaks.p0 = { turret_attack: 3, patrol_attack: 2 };
    expect(chanceOf(odds, "p0")).toBeCloseTo(0.4 * 1.25 ** 2);
  });

  it("a kill removes the hunter and is private: the crew sees only the count drop", () => {
    let s = flying(shot({ chance: 1 }));
    s.hunters.list[0]!.hp = 1;
    s = mustApply(s, "p0", shoot("h1"));
    expect(s.hunters.list.map((h) => h.id)).toEqual(["h2"]);
    expect(s.log.at(-1)).toMatchObject({ key: "patrolKill", visibleTo: ["p0"] });
    for (const id of ["p1", "p2"]) {
      expect(lines(s, id, "patrolKill")).toEqual([]);
      expect(viewFor(s, id).hunters.count).toBe(1);
    }
  });

  it("a Shoot point pays for it, and Persistent speeds up the streak; Gunner does nothing here", () => {
    const s = flying();
    player(s, "p0").skills = ["pilot", "gunner"];
    expect(chanceOf(s, "p0")).toBeCloseTo(0.4 * 2);
    player(s, "p0").resources.shoot = 1;
    expect(costOf(s, "p0", shoot("h1"))).toMatchObject({ ap: 0, paidBy: "shoot" });
    player(s, "p0").skills = ["persistent"];
    s.failureStreaks.p0 = { patrol_attack: 2 };
    expect(chanceOf(s, "p0")).toBeCloseTo(0.4 * s.config.persistent.failureMultiplier ** 2);
  });

  it("is refused with no charges, from the Pasiphae, from the ground, at a gone hunter, or in pre-selection; the state stays as it was", () => {
    const s = flying();
    s.patrolShips[LONGANE.id]!.charges = 0;
    const before = structuredClone(s);
    expect(offered(s, "p0").some((a) => a.type === "patrol_attack")).toBe(false);
    expect(applyAction(s, "p0", shoot("h1"))).toEqual({ ok: false, error: "illegal_action" });
    expect(refusal(s, "p0", shoot("h1"))).toBe("no_charges");
    expect(refusal(s, "p0", shoot("h1", JUJUBE))).toBe("cant_shoot");
    expect(refusal(s, "p1", shoot("h1"))).toBe("cant_shoot");
    s.patrolShips[LONGANE.id]!.charges = 1;
    expect(refusal(s, "p0", shoot("nope"))).toBe("no_such_hunter");
    s.preselection = true;
    expect(refusal(s, "p0", shoot("h1"))).toBe("preselection");
    s.preselection = false;
    s.patrolShips[LONGANE.id]!.charges = 0;
    expect(s).toEqual(before);

    const pas = ship();
    player(pas, "p0").room = PASIPHAE.bay;
    const out = mustApply(pas, "p0", takeoff(PASIPHAE));
    out.hunters.list.push({ id: "h1", hp: 6, hitChance: 0.8, target: null, type: "hunter", countdown: null });
    expect(offered(out, "p0").some((a) => a.type === "patrol_attack")).toBe(false);
    expect(refusal(out, "p0", shoot("h1", PASIPHAE))).toBe("cant_shoot");
    expect(viewFor(out, "p0").patrolShip).toMatchObject({ id: PASIPHAE.id, charges: null });
  });

  it("charges come back 1 a cycle up to 10, only while docked", () => {
    let s = flying();
    s.patrolShips[LONGANE.id]!.charges = 5;
    s.patrolShips[JUJUBE.id]!.charges = 5;
    s.patrolShips[patrolShip("PATROL_SHIP_A_2")!.id]!.charges = s.config.patrol.charges;
    s = nextCycle(s);
    expect(s.patrolShips[LONGANE.id]!.charges).toBe(5);
    expect(s.patrolShips[JUJUBE.id]!.charges).toBe(5 + s.config.patrol.rechargePerCycle);
    expect(s.patrolShips[patrolShip("PATROL_SHIP_A_2")!.id]!.charges).toBe(s.config.patrol.charges);
    expect(s.patrolShips[PASIPHAE.id]!.charges).toBe(0);
  });

  it("the pilot sees each hunter's hp but no turret's charges; nobody on the ground does", () => {
    const s = flying();
    expect(viewFor(s, "p0").hunters).toEqual({ count: 2, list: [{ id: "h1", type: "hunter", hp: 6, countdown: null }, { id: "h2", type: "hunter", hp: 6, countdown: null }], turrets: null });
    expect(viewFor(s, "p1").hunters).toEqual({ count: 2, list: null, turrets: null });
  });

  it("parses from the wire", () => {
    expect(parseGameMessage(JSON.stringify({ type: "action", action: shoot("h1") }))).toEqual({ type: "action", action: shoot("h1") });
  });
});

describe("aboard a ship", () => {
  it("nobody can install a camera or build", () => {
    const s = mustApply(ship(), "p0", takeoff());
    const camera = "cam1";
    const blueprint = "bp1";
    s.items.push({ id: camera, type: "camera", at: { kind: "player", id: "p0" } });
    s.items.push({ id: blueprint, type: "blueprint", builds: "SOFA", at: { kind: "player", id: "p0" } });
    s.items.push({ id: "m1", type: "metal_scraps", at: { kind: "player", id: "p0" } });
    expect(offered(s, "p0").some((a) => a.type === "install" || a.type === "build")).toBe(false);
    expect(refusal(s, "p0", { type: "install", item: camera })).toBe("in_patrol_ship");
    expect(refusal(s, "p0", { type: "build", item: blueprint })).toBe("in_patrol_ship");
  });
});

describe("rough manoeuvres", () => {
  it("cost the hull 2 to 4 through the shield, the ship 1 armor and the pilot 0 to 2 hp, told only to the pilot", () => {
    const s = ship({ patrol: { ...DEFAULT_CONFIG.patrol, cleanChance: 0 } });
    const p1 = player(s, "p1");
    const before = { hull: s.ship.hull, shield: s.ship.plasmaShield, hp: p1.hp };
    manoeuvre(s, p1, LONGANE);
    const entry = s.log.at(-1)!;
    expect(entry).toMatchObject({ key: "patrolRough", visibleTo: ["p1"] });
    const { hull, armor, hp } = entry.params as { hull: number; armor: number; hp: number };
    expect(hull).toBeGreaterThanOrEqual(2);
    expect(hull).toBeLessThanOrEqual(4);
    expect(hp).toBeGreaterThanOrEqual(0);
    expect(hp).toBeLessThanOrEqual(2);
    expect([s.ship.hull, s.ship.plasmaShield, s.patrolShips[LONGANE.id]!.armor, p1.hp]).toEqual([before.hull - hull, before.shield, 10 - armor, before.hp - hp]);
  });

  it("never happen to a Pilot", () => {
    const s = ship({ patrol: { ...DEFAULT_CONFIG.patrol, cleanChance: 0 } });
    const before = JSON.stringify(s);
    manoeuvre(s, player(s, "p0"), LONGANE);
    expect(JSON.stringify(s)).toBe(before);
  });

  it("never happen once XXL bay doors (BAY_DOOR_XXL) is complete", () => {
    expect(projectStatus("BAY_DOOR_XXL")).toBe("full");
    const s = ship({ patrol: { ...DEFAULT_CONFIG.patrol, cleanChance: 0 } });
    s.projects.BAY_DOOR_XXL = PROJECT_COMPLETE;
    const out = mustApply(s, "p1", takeoff());
    expect(out.ship).toEqual(s.ship);
    expect(out.patrolShips[LONGANE.id]!.armor).toBe(s.patrolShips[LONGANE.id]!.armor);
    expect(player(out, "p1").hp).toBe(player(s, "p1").hp);
    expect(lines(out, "p1", "patrolRough")).toEqual([]);
    const back = mustApply(out, "p1", land());
    expect(back.ship).toEqual(s.ship);
    expect(back.patrolShips[LONGANE.id]!.armor).toBe(s.patrolShips[LONGANE.id]!.armor);
    expect(player(back, "p1").hp).toBe(player(s, "p1").hp);
    expect(lines(back, "p1", "patrolRough")).toEqual([]);
  });

  it("destroy the ship and kill the pilot if a rough takeoff drops armor to 0", () => {
    const s = ship({ patrol: { ...DEFAULT_CONFIG.patrol, cleanChance: 0 } });
    s.patrolShips[LONGANE.id]!.armor = 1;
    const next = mustApply(s, "p1", takeoff());
    expect(next.patrolShips[LONGANE.id]).toMatchObject({ armor: 0, destroyed: true });
    expect(player(next, "p1").alive).toBe(false);
    expect(lines(next, "p0", "patrolDestroyed")).toHaveLength(1);
    expect(refusal(next, "p0", takeoff())).toBe("no_ship");
  });

  it("destroy the ship (but spare the pilot in the bay) if a rough landing drops armor to 0", () => {
    const s = mustApply(ship({ patrol: { ...DEFAULT_CONFIG.patrol, cleanChance: 1 } }), "p1", takeoff());
    const roughLanding = { ...s, config: { ...s.config, patrol: { ...s.config.patrol, cleanChance: 0 } } };
    roughLanding.patrolShips[LONGANE.id]!.armor = 1;
    const next = mustApply(roughLanding, "p1", land());
    expect(next.patrolShips[LONGANE.id]).toMatchObject({ armor: 0, destroyed: true, out: false });
    expect(player(next, "p1")).toMatchObject({ alive: true, room: BAY });
    expect(lines(next, "p0", "patrolDestroyed")).toHaveLength(1);
    expect(offered(next, "p0").some((a) => a.type === "takeoff" && a.equipment === interfaceId(LONGANE))).toBe(false);
    expect(refusal(next, "p0", takeoff())).toBe("no_ship");
    const iface = viewFor(next, "p0").roomEquipment.find((e) => e.id === interfaceId(LONGANE));
    expect(iface).toMatchObject({ destroyed: true });
    expect(iface?.armor).toBeUndefined();
  });
});

describe("hunters and ships in flight", () => {
  const hunters = (overrides: Partial<GameConfig["hunters"]>) => ({ hunters: { ...DEFAULT_CONFIG.hunters, waveChance: 0, ...overrides } });
  /** p0 flying Longane, with one hunter out there. */
  function flying(config: Partial<GameConfig> = {}): GameState {
    const s = mustApply(ship(config), "p0", takeoff());
    s.hunters.list.push({ id: "h1", hp: 6, hitChance: 1, target: null, type: "hunter", countdown: null });
    return s;
  }

  it("aim at a ship in flight by their configured chance when one is out, otherwise at the Daedalus", () => {
    expect(nextCycle(flying(hunters({ patrolTargetChance: 1 }))).hunters.list[0]!.target).toEqual({ kind: "patrol", id: LONGANE.id });
    expect(nextCycle(flying(hunters({ patrolTargetChance: 0 }))).hunters.list[0]!.target).toEqual({ kind: "ship" });
    // With nothing in flight, the Daedalus.
    const docked = ship(hunters({ patrolTargetChance: 1 }));
    docked.hunters.list.push({ id: "h1", hp: 6, hitChance: 1, target: null, type: "hunter", countdown: null });
    expect(nextCycle(docked).hunters.list[0]!.target).toEqual({ kind: "ship" });
  });

  it("a hit takes 2-4 armor off the ship, not the hull, keeps the aim, and is a line in the ship's room for the pilot", () => {
    const s = flying();
    s.hunters.list[0]!.target = { kind: "patrol", id: LONGANE.id };
    const next = nextCycle(s);
    const lost = 10 - next.patrolShips[LONGANE.id]!.armor;
    expect(lost).toBeGreaterThanOrEqual(2);
    expect(lost).toBeLessThanOrEqual(4);
    expect(next.ship.hull).toBe(s.ship.hull);
    expect(next.ship.plasmaShield).toBeGreaterThanOrEqual(s.ship.plasmaShield);
    expect(next.hunters.list[0]).toMatchObject({ target: { kind: "patrol", id: LONGANE.id }, hitChance: s.config.hunters.types.hunter.hitChance });
    expect(lines(next, "p0", "hunterHitPatrol")).toMatchObject([{ room: LONGANE.id, params: { room: LONGANE.id, armor: lost } }]);
    for (const id of ["p1", "p2"]) expect(lines(next, id, "hunterHitPatrol")).toEqual([]);
  });

  it("at 0 armor the ship is destroyed for good: NERON tells the crew, the pilot dies, and the bay shows it", () => {
    const s = flying();
    s.hunters.list[0]!.target = { kind: "patrol", id: LONGANE.id };
    s.patrolShips[LONGANE.id]!.armor = 1;
    const next = nextCycle(s);
    expect(next.patrolShips[LONGANE.id]).toMatchObject({ armor: 0, out: true, destroyed: true });
    expect(player(next, "p0").alive).toBe(false);
    expect(next.hunters.list[0]!.target).toBeNull();
    for (const id of ["p1", "p2"]) expect(lines(next, id, "patrolDestroyed")).toMatchObject([{ params: { room: LONGANE.id }, level: "warning" }]);
    // It can't be taken again: the bay's interface shows it destroyed.
    expect(viewFor(next, "p1").roomEquipment.find((e) => e.id === interfaceId(LONGANE))).toMatchObject({ out: true, destroyed: true });
    player(next, "p1").skills = ["pilot"];
    expect(refusal(next, "p1", takeoff())).toBe("no_ship");
    // A destroyed ship is never aimed at, and doesn't recharge.
    next.hunters.list.push({ id: "h9", hp: 6, hitChance: 1, target: null, type: "hunter", countdown: null });
    next.patrolShips[LONGANE.id]!.charges = 0;
    const later = nextCycle(next);
    expect(later.hunters.list.find((h) => h.id === "h9")!.target).toEqual({ kind: "ship" });
    expect(later.patrolShips[LONGANE.id]!.charges).toBe(0);
  });

  it("landing turns the hunters aiming at the ship to the Daedalus", () => {
    const s = flying();
    s.hunters.list[0]!.target = { kind: "patrol", id: LONGANE.id };
    expect(mustApply(s, "p0", land()).hunters.list[0]!.target).toEqual({ kind: "ship" });
  });

  it("a jump (travel or leaving orbit) loses every ship in flight with its pilot", () => {
    const terminal = "COMMAND_CENTER:PILOT_MODULE";
    for (const jump of [{ type: "travel", equipment: terminal }, { type: "leave_orbit", equipment: terminal }] as Action[]) {
      const s = flying();
      player(s, "p2").room = "COMMAND_CENTER";
      s.titles.commander = "p2";
      s.ship.combustion = 2;
      if (jump.type === "leave_orbit") s.navigation.orbit = "planet-x";
      const next = mustApply(s, "p2", jump);
      expect(next.patrolShips[LONGANE.id]).toMatchObject({ out: true, destroyed: true });
      expect(next.patrolShips[JUJUBE.id]).toMatchObject({ out: false, destroyed: false });
      expect(player(next, "p0").alive).toBe(false);
      expect(lines(next, "p1", "patrolLost")).toMatchObject([{ params: { room: LONGANE.id }, level: "warning" }]);
    }
  });

  describe("with Magnetic net (owner, 2026-11-12)", () => {
    it("is marked fully implemented in projectStatus", () => {
      expect(projectStatus("MAGNETIC_NET")).toBe("full");
    });

    const terminal = "COMMAND_CENTER:PILOT_MODULE";
    /** p0 flies Longane, p2 commands from the bridge, p1 waits in Bay Alpha; the net is done. */
    function netted(config: Partial<GameConfig> = {}): GameState {
      const s = flying(config);
      s.projects.MAGNETIC_NET = 100;
      player(s, "p2").room = "COMMAND_CENTER";
      s.titles.commander = "p2";
      s.ship.combustion = 2;
      return s;
    }

    it("a jump (travel or leaving orbit) docks every ship in flight in its bay, its pilot with it", () => {
      for (const jump of [{ type: "travel", equipment: terminal }, { type: "leave_orbit", equipment: terminal }] as Action[]) {
        const s = netted();
        if (jump.type === "leave_orbit") s.navigation.orbit = "planet-x";
        const next = mustApply(s, "p2", jump);
        expect(next.patrolShips[LONGANE.id]).toMatchObject({ out: false, destroyed: false });
        expect(player(next, "p0")).toMatchObject({ alive: true, room: LONGANE.bay });
        expect(lines(next, "p1", "patrolLost")).toEqual([]);
      }
    });

    it("always lands cleanly, without the manoeuvre roll", () => {
      const s = netted({ patrol: { ...DEFAULT_CONFIG.patrol, cleanChance: 0 } });
      player(s, "p0").skills = []; // not a Pilot any more: a normal landing would be rough
      const next = mustApply(s, "p2", { type: "travel", equipment: terminal });
      expect([next.ship.hull, next.patrolShips[LONGANE.id]!.armor]).toEqual([s.ship.hull, s.patrolShips[LONGANE.id]!.armor]);
      expect(lines(next, "p0", "patrolRough")).toEqual([]);
    });

    it("is seen only as a landing in the bay, not ship-wide", () => {
      const next = mustApply(netted(), "p2", { type: "travel", equipment: terminal });
      expect(lines(next, "p1", "patrolLanded")).toMatchObject([{ params: { name: player(next, "p0").character, room: LONGANE.id } }]);
      expect(lines(next, "p2", "patrolLanded")).toEqual([]);
    });

    it("unloads the ship's cargo into the bay and turns its hunters to the Daedalus; the debris outside is still lost", () => {
      const s = netted();
      s.items.push({ id: "scrap", type: "METAL_SCRAPS", at: { kind: "room", id: LONGANE.id } } as GameState["items"][number]);
      s.hunters.list[0]!.target = { kind: "patrol", id: LONGANE.id };
      s.space.push({ id: "floating", type: "METAL_SCRAPS" } as GameState["space"][number]);
      const next = mustApply(s, "p2", { type: "travel", equipment: terminal });
      expect(next.items.find((i) => i.id === "scrap")!.at).toEqual({ kind: "room", id: LONGANE.bay });
      expect(next.space).toEqual([]);
      for (const h of next.hunters.list) expect(h.target).not.toEqual({ kind: "patrol", id: LONGANE.id });
    });

    it("docks a ship with nobody aboard too, silently", () => {
      const s = netted();
      player(s, "p0").room = BAY;
      const next = mustApply(s, "p2", { type: "travel", equipment: terminal });
      expect(next.patrolShips[LONGANE.id]).toMatchObject({ out: false, destroyed: false });
      expect(lines(next, "p1", "patrolLanded")).toEqual([]);
    });
  });
});

describe("debris", () => {
  const PASIPHAE = patrolShip("PATROL_SHIP_AA_1")!;
  const collect = (ship = LONGANE): Action => ({ type: "collect_scrap", equipment: commandId(ship) });
  const collecting = (overrides: Partial<GameConfig["patrol"]["collect"]>) => ({ patrol: { ...DEFAULT_CONFIG.patrol, collect: { ...DEFAULT_CONFIG.patrol.collect, ...overrides } } });
  const debris = (s: GameState, ...types: string[]) => {
    for (const type of types) s.space.push({ id: `debris-${s.space.length}`, type });
  };
  const inRoom = (s: GameState, room: string) => s.items.filter((i) => i.at.kind === "room" && i.at.id === room);
  /** p0 flying Longane, no hunters left, the Pasiphae destroyed (so a patrol ship may collect). */
  const flying = (config: Partial<GameConfig> = {}) => {
    const s = mustApply(ship(config), "p0", takeoff());
    s.patrolShips[PASIPHAE.id]!.destroyed = true;
    return s;
  };

  it("a destroyed hunter drops 1 or 2 pieces, by the weights in config", () => {
    for (const [count, type] of [[1, "metal_scraps"], [2, "space_capsule"]] as const) {
      const s = ship({ hunters: { ...DEFAULT_CONFIG.hunters, waveChance: 0, debris: { count: count === 1 ? [0, 1] : [0, 0, 1], types: { [type]: 1 } } } });
      s.hunters.list.push({ id: "h1", hp: 1, hitChance: 0.8, target: null, type: "hunter", countdown: null });
      player(s, "p1").room = "LASER_TURRET_A_0";
      const next = mustApply({ ...s, config: { ...s.config, turrets: { ...s.config.turrets, chance: 1 } } }, "p1", { type: "turret_attack", equipment: "LASER_TURRET_A_0:TURRET_COMMAND", hunter: "h1" });
      expect(next.hunters.list).toEqual([]);
      expect(next.space.map((d) => d.type)).toEqual(Array(count).fill(type));
      // Debris is never sent to anyone on the ground.
      expect(JSON.stringify(viewFor(next, "p1"))).not.toContain(next.space[0]!.id);
    }
  });

  it("the pilot sees how many pieces are out there, not which; nobody else does", () => {
    const s = flying();
    debris(s, "metal_scraps", "space_capsule");
    expect(viewFor(s, "p0").patrolShip!.debris).toBe(2);
    for (const id of ["p0", "p1", "p2"]) expect(JSON.stringify(viewFor(s, id))).not.toContain("debris-");
  });

  it("collect is offered from the command for 2 AP, shown disabled while there is no debris", () => {
    const s = flying();
    expect(offered(s, "p0").some((a) => a.type === "collect_scrap")).toBe(false);
    expect(refusal(s, "p0", collect())).toBe("no_debris");
    expect(option(s, "p0", collect())?.lacks).toEqual(["debris"]);
    debris(s, "metal_scraps");
    expect(option(s, "p0", collect())?.lacks).toEqual([]);
    expect(offered(s, "p0").filter((a) => a.type === "collect_scrap")).toEqual([collect()]);
    expect(costOf(s, "p0", collect())).toEqual({ ap: s.config.patrol.collect.cost.ap, mp: 0 });
    expect(refusal(s, "p1", collect())).toBe("not_flying");
  });

  it("a patrol ship can't collect while the Pasiphae exists, docked or flying; the Pasiphae itself can (owner, 2026-11-11)", () => {
    const s = mustApply(ship(), "p0", takeoff());
    debris(s, "metal_scraps");
    expect(s.patrolShips[PASIPHAE.id]).toMatchObject({ destroyed: false, out: false });
    expect(offered(s, "p0").some((a) => a.type === "collect_scrap")).toBe(false);
    expect(refusal(s, "p0", collect())).toBe("pasiphae_intact");
    expect(option(s, "p0", collect())?.lacks).toEqual(["pasiphae"]);
    // Nor does its pilot learn how much debris is out there.
    expect(viewFor(s, "p0").patrolShip!.debris).toBeNull();
    expect(applyAction(s, "p0", collect())).toEqual({ ok: false, error: "illegal_action" });

    player(s, "p1").room = PASIPHAE.bay;
    player(s, "p1").skills = ["pilot"];
    const both = mustApply(s, "p1", { type: "takeoff", equipment: interfaceId(PASIPHAE) });
    expect(refusal(both, "p0", collect())).toBe("pasiphae_intact");
    expect(offered(both, "p1")).toContainEqual(collect(PASIPHAE));
    expect(viewFor(both, "p1").patrolShip!.debris).toBe(1);

    s.patrolShips[PASIPHAE.id]!.destroyed = true;
    expect(offered(s, "p0")).toContainEqual(collect());
    expect(viewFor(s, "p0").patrolShip!.debris).toBe(1);
  });

  it("brings pieces into the ship's room, privately; a try that catches nothing says so", () => {
    let s = flying(collecting({ pieces: { patrol: [0, 1], pasiphae: [0, 1] } }));
    debris(s, "metal_scraps", "plastic_scraps");
    s = mustApply(s, "p0", collect());
    expect(s.space).toHaveLength(1);
    expect(inRoom(s, LONGANE.id)).toHaveLength(1);
    expect(lines(s, "p0", "scrapCollected")).toMatchObject([{ params: { count: 1 } }]);
    for (const id of ["p1", "p2"]) expect(lines(s, id, "scrapCollected")).toEqual([]);
    // Never more than there is.
    s = mustApply({ ...s, config: { ...s.config, ...collecting({ pieces: { patrol: [0, 0, 0, 1], pasiphae: [0, 1] } }) } }, "p0", collect());
    expect(s.space).toEqual([]);
    expect(inRoom(s, LONGANE.id)).toHaveLength(2);

    let none = flying(collecting({ pieces: { patrol: [1], pasiphae: [1] } }));
    debris(none, "metal_scraps");
    none = mustApply(none, "p0", collect());
    expect(none.space).toHaveLength(1);
    expect(lines(none, "p0", "scrapNotFound")).toHaveLength(1);
  });

  it("the Pasiphae brings in 1 to 3", () => {
    const s = ship(collecting({ pieces: { patrol: [1], pasiphae: [0, 0, 0, 1] } }));
    player(s, "p0").room = PASIPHAE.bay;
    let next = mustApply(s, "p0", { type: "takeoff", equipment: interfaceId(PASIPHAE) });
    debris(next, "metal_scraps", "metal_scraps", "metal_scraps", "space_capsule");
    next = mustApply(next, "p0", collect(PASIPHAE));
    expect(inRoom(next, PASIPHAE.id)).toHaveLength(3);
  });

  it("with no hunters left it's safe; while hunters remain it costs 2-4 armor and the pilot 0 or 2-4 hp, told only to the pilot", () => {
    const safe = flying();
    debris(safe, "metal_scraps");
    const after = mustApply(safe, "p0", collect());
    expect(after.patrolShips[LONGANE.id]!.armor).toBe(10);
    expect(player(after, "p0").hp).toBe(player(safe, "p0").hp);
    // Asteroids don't shoot (owner, 2026-11-12, #388): with only asteroids around it's safe too.
    const rocks = flying();
    debris(rocks, "metal_scraps");
    rocks.hunters.list.push({ id: "a1", hp: 20, hitChance: 1, target: null, type: "asteroid", countdown: 6 });
    expect(mustApply(rocks, "p0", collect()).patrolShips[LONGANE.id]!.armor).toBe(10);

    const s = flying(collecting({ hp: { noneChance: 0, range: [2, 4] } }));
    debris(s, "metal_scraps");
    s.hunters.list.push({ id: "h1", hp: 6, hitChance: 0.8, target: null, type: "hunter", countdown: null });
    const next = mustApply(s, "p0", collect());
    const armor = 10 - next.patrolShips[LONGANE.id]!.armor;
    const hp = player(s, "p0").hp - player(next, "p0").hp;
    expect([armor >= 2 && armor <= 4, hp >= 2 && hp <= 4]).toEqual([true, true]);
    expect(lines(next, "p0", "scrapUnderFire")).toMatchObject([{ params: { armor, hp } }]);
    for (const id of ["p1", "p2"]) expect(lines(next, id, "scrapUnderFire")).toEqual([]);
  });

  it("at 0 armor the ship is destroyed and everything aboard, the pilot's body too, floats off as debris", () => {
    const s = flying();
    debris(s, "metal_scraps");
    s.hunters.list.push({ id: "h1", hp: 6, hitChance: 0.8, target: null, type: "hunter", countdown: null });
    s.patrolShips[LONGANE.id]!.armor = 1;
    s.items.push({ id: "carried", type: "wrench", at: { kind: "player", id: "p0" } });
    const next = mustApply(s, "p0", collect());
    expect(next.patrolShips[LONGANE.id]).toMatchObject({ destroyed: true });
    expect(player(next, "p0").alive).toBe(false);
    expect(inRoom(next, LONGANE.id)).toEqual([]);
    expect(next.space.map((d) => d.type).sort()).toEqual(["corpse", "metal_scraps", "wrench"]);
    expect(next.space.find((d) => d.type === "corpse")).toMatchObject({ of: "p0" });
    expect(lines(next, "p1", "patrolDestroyed")).toHaveLength(1);
  });

  it("landing unloads the ship's room into the bay, with a secret line there counting what isn't hidden", () => {
    const s = flying();
    s.items.push({ id: "a", type: "metal_scraps", at: { kind: "room", id: LONGANE.id } }, { id: "b", type: "space_capsule", at: { kind: "room", id: LONGANE.id } });
    s.items.push({ id: "c", type: "wrench", at: { kind: "room", id: LONGANE.id }, hiddenBy: "p0" });
    const next = mustApply(s, "p0", land());
    expect(inRoom(next, LONGANE.id)).toEqual([]);
    expect(inRoom(next, BAY).map((i) => i.id).sort()).toEqual(["a", "b", "c"]);
    expect(next.items.find((i) => i.id === "c")!.hiddenBy).toBe("p0");
    expect(lines(next, "p1", "patrolUnloaded")).toMatchObject([{ params: { name: player(s, "p0").character, count: 2 } }]);
    expect(lines(next, "p2", "patrolUnloaded")).toEqual([]);
    // Nothing aboard, no line.
    expect(lines(mustApply(flying(), "p0", land()), "p1", "patrolUnloaded")).toEqual([]);
  });

  it("a jump leaves every piece behind, wrecks' included", () => {
    const s = flying();
    debris(s, "metal_scraps");
    s.items.push({ id: "a", type: "metal_scraps", at: { kind: "room", id: LONGANE.id } });
    player(s, "p2").room = "COMMAND_CENTER";
    s.titles.commander = "p2";
    s.ship.combustion = 2;
    const next = mustApply(s, "p2", { type: "travel", equipment: "COMMAND_CENTER:PILOT_MODULE" });
    expect(next.space).toEqual([]);
    expect(next.items.some((i) => i.id === "a")).toBe(false);
  });

  it("parses from the wire", () => {
    expect(parseGameMessage(JSON.stringify({ type: "action", action: collect() }))).toEqual({ type: "action", action: collect() });
  });
});

describe("the space capsule", () => {
  const open = (item: string): Action => ({ type: "open_capsule", item });

  it("opens for 1 AP, carried or in the room, into one of its contents where it was, with a public line", () => {
    for (const at of [{ kind: "player", id: "p1" }, { kind: "room", id: BAY }] as const) {
      const s = ship();
      s.items.push({ id: "cap", type: "space_capsule", at });
      expect(offered(s, "p1")).toContainEqual(open("cap"));
      expect(costOf(s, "p1", open("cap"))).toEqual({ ap: s.config.spaceCapsule.cost.ap, mp: 0 });
      const next = mustApply(s, "p1", open("cap"));
      const item = next.items.find((i) => i.id === "cap")!;
      expect(s.config.spaceCapsule.contents).toContain(item.type);
      expect(item.at).toEqual(at);
      expect(player(next, "p1").ap).toBe(player(s, "p1").ap - s.config.spaceCapsule.cost.ap);
      for (const id of ["p0", "p1"]) expect(lines(next, id, "capsuleOpened")).toMatchObject([{ params: { item: item.type } }]);
      expect(lines(next, "p2", "capsuleOpened")).toEqual([]);
    }
  });

  it("draws each content in turn across seeds", () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const s = createGame(makeSeats(1), noHunters({ ...DEFAULT_CONFIG, mushCount: 0, startItems: [] }), seed);
      s.items.push({ id: "cap", type: "space_capsule", at: { kind: "player", id: "p0" } });
      seen.add(mustApply(s, "p0", open("cap")).items.find((i) => i.id === "cap")!.type);
    }
    expect([...seen].sort()).toEqual([...DEFAULT_CONFIG.spaceCapsule.contents].sort());
  });

  it("isn't offered for anything else, or out of reach", () => {
    const s = ship();
    s.items.push({ id: "w", type: "wrench", at: { kind: "player", id: "p1" } }, { id: "cap", type: "space_capsule", at: { kind: "room", id: "LABORATORY" } });
    expect(refusal(s, "p1", open("w"))).toBe("cant_open");
    expect(refusal(s, "p1", open("cap"))).toBe("cant_open");
  });
});

describe("renovating a ship", () => {
  const renovate = (ship = LONGANE): Action => ({ type: "renovate", equipment: interfaceId(ship) });
  const odds = (chance: number) => ({ patrol: { ...DEFAULT_CONFIG.patrol, renovate: { ...DEFAULT_CONFIG.patrol.renovate, chance } } });
  /** Longane docked at 3 armor, p1 (no skills) carrying a metal scrap. */
  function damaged(config: Partial<GameConfig> = {}): GameState {
    const s = ship(config);
    s.patrolShips[LONGANE.id]!.armor = 3;
    s.items.push({ id: "scrap", type: "metal_scraps", at: { kind: "player", id: "p1" } });
    return s;
  }

  it("is offered to anyone alive at a docked, damaged ship's interface with a metal scrap in reach, for 2 AP at 12%", () => {
    const s = damaged();
    expect(offered(s, "p1").filter((a) => a.type === "renovate")).toEqual([renovate()]);
    expect(costOf(s, "p1", renovate())).toEqual({ ap: s.config.patrol.renovate.cost.ap, mp: 0 });
    expect(option(s, "p1", renovate())!.chance).toBeCloseTo(s.config.patrol.renovate.chance);
    // A scrap lying in the bay works too.
    s.items.find((i) => i.id === "scrap")!.at = { kind: "room", id: BAY };
    expect(offered(s, "p1")).toContainEqual(renovate());
  });

  it("anyone in the bay sees the docked ship's armor, so the offer reveals nothing; nobody elsewhere does", () => {
    const s = damaged();
    for (const id of ["p0", "p1"]) expect(viewFor(s, id).roomEquipment.find((e) => e.id === interfaceId(LONGANE))).toMatchObject({ armor: 3, maxArmor: s.config.patrol.armor.patrol });
    expect(JSON.stringify(viewFor(s, "p2"))).not.toContain(interfaceId(LONGANE));
  });

    it("an Engineer's odds are doubled", () => {
    const s = damaged();
    player(s, "p1").skills = ["engineer"];
    expect(option(s, "p1", renovate())!.chance).toBeCloseTo(s.config.patrol.renovate.chance * s.config.patrol.renovate.engineerFactor);
  });

  it("carrying the oscilloscope multiplies the odds of renovating and of a hull repair; lying in the room it does nothing", () => {
    const s = damaged();
    s.ship.hull = s.config.ship.hull.max - 1;
    const hull: Action = { type: "repair_hull", item: "scrap" };
    const base = [s.config.patrol.renovate.chance, s.config.hullRepair.chance];
    s.items.push({ id: "osc", type: "oscilloscope", at: { kind: "room", id: BAY } });
    expect([option(s, "p1", renovate())!.chance, option(s, "p1", hull)!.chance]).toEqual(base);
    s.items.find((i) => i.id === "osc")!.at = { kind: "player", id: "p1" };
    expect([option(s, "p1", renovate())!.chance, option(s, "p1", hull)!.chance]).toEqual(base.map((c) => c * s.config.oscilloscope.repairFactor));
  });

  it("the oscilloscope starts in Alpha Bay 2", () => {
    expect(DEFAULT_CONFIG.startItems).toContainEqual({ type: "oscilloscope", room: "SPACESHIP_BAY_AA" });
    expect(createGame(makeSeats(3), DEFAULT_CONFIG, 1).items.filter((i) => i.type === "oscilloscope")).toMatchObject([{ at: { kind: "room", id: "SPACESHIP_BAY_AA" } }]);
  });

  it("isn't offered for a ship at full armor, out, in another bay, or without a scrap; refusing leaves the state as it was", () => {
    const full = ship();
    full.items.push({ id: "scrap", type: "metal_scraps", at: { kind: "player", id: "p1" } });
    expect(refusal(full, "p1", renovate())).toBe("no_ship");
    const out = damaged();
    out.patrolShips[LONGANE.id]!.out = true;
    expect(refusal(out, "p1", renovate())).toBe("no_ship");
    const elsewhere = damaged();
    player(elsewhere, "p1").room = "SPACESHIP_BAY_B";
    expect(refusal(elsewhere, "p1", renovate())).toBe("no_ship");
    const noScrap = damaged();
    noScrap.items = [];
    expect(offered(noScrap, "p1").some((a) => a.type === "renovate")).toBe(false);
    expect(refusal(noScrap, "p1", renovate())).toBe("no_scrap");
    // A scrap someone else hid isn't in reach.
    noScrap.items.push({ id: "hid", type: "metal_scraps", at: { kind: "room", id: BAY }, hiddenBy: "p0" });
    expect(refusal(noScrap, "p1", renovate())).toBe("no_scrap");
    expect(applyAction(noScrap, "p1", renovate())).toMatchObject({ ok: false });
  });

  it("a success brings the ship back to full armor, uses the scrap, and is public in the bay", () => {
    const s = damaged(odds(1));
    const next = mustApply(s, "p1", renovate());
    expect(next.patrolShips[LONGANE.id]!.armor).toBe(s.config.patrol.armor.patrol);
    expect(next.items.some((i) => i.id === "scrap")).toBe(false);
    expect(player(next, "p1").ap).toBe(player(s, "p1").ap - s.config.patrol.renovate.cost.ap);
    for (const id of ["p0", "p1"]) expect(lines(next, id, "patrolRenovated")).toMatchObject([{ params: { name: player(s, "p1").character, room: LONGANE.id } }]);
    expect(lines(next, "p2", "patrolRenovated")).toEqual([]);
  });

  it("brings the Pasiphae back to 12", () => {
    const s = ship(odds(1));
    const pasiphae = patrolShip("PATROL_SHIP_AA_1")!;
    player(s, "p1").room = pasiphae.bay;
    s.patrolShips[pasiphae.id]!.armor = 1;
    s.items.push({ id: "scrap", type: "metal_scraps", at: { kind: "player", id: "p1" } });
    expect(mustApply(s, "p1", renovate(pasiphae)).patrolShips[pasiphae.id]!.armor).toBe(s.config.patrol.armor.pasiphae);
  });

  it("a failure still uses the scrap (a carried one first) and only the renovator is told", () => {
    const s = damaged(odds(0));
    s.items.push({ id: "floor", type: "metal_scraps", at: { kind: "room", id: BAY } });
    const next = mustApply(s, "p1", renovate());
    expect(next.patrolShips[LONGANE.id]!.armor).toBe(3);
    expect(next.items.some((i) => i.id === "scrap")).toBe(false);
    expect(next.items.some((i) => i.id === "floor")).toBe(true);
    expect(lines(next, "p1", "patrolRenovateFailed")).toHaveLength(1);
    for (const id of ["p0", "p2"]) expect(lines(next, id, "patrolRenovateFailed")).toEqual([]);
    expect(lines(next, "p0", "patrolRenovated")).toEqual([]);
  });

  it("parses from the wire", () => {
    expect(parseGameMessage(JSON.stringify({ type: "action", action: renovate() }))).toEqual({ type: "action", action: renovate() });
  });
});
