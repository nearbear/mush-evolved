import { describe, expect, it } from "vitest";
import { ACTIONS } from "../src/actions.ts";
import { manoeuvre } from "../src/actions/takeoff.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { cameraEquipmentId } from "../src/equipment.ts";
import { commandId, interfaceId, PATROL_SHIPS, patrolShip } from "../src/patrol.ts";
import { parseGameMessage } from "../src/protocol.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import type { Action, GameConfig, GameState } from "../src/types.ts";
import { costOf, makeSeats, mustApply, noHunters, offered, player } from "./support.ts";

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
  it("are the owner's (eMush's)", () => {
    expect(DEFAULT_CONFIG.patrol).toEqual({
      takeoff: { cost: { ap: 2 } },
      land: { cost: { ap: 2 } },
      armor: { patrol: 10, pasiphae: 12 },
      cleanChance: 0.2,
      rough: { hull: [2, 4], armor: 1, hp: [0, 2] },
    });
  });

  it("eight ships, each a door-less room holding its command, start docked at full armor", () => {
    const s = ship();
    expect(PATROL_SHIPS.map((p) => p.id)).toEqual(["PATROL_SHIP_A_0", "PATROL_SHIP_A_1", "PATROL_SHIP_A_2", "PATROL_SHIP_B_0", "PATROL_SHIP_B_1", "PATROL_SHIP_B_2", "PATROL_SHIP_AA_0", "PATROL_SHIP_AA_1"]);
    for (const p of PATROL_SHIPS) {
      expect(s.config.rooms[p.id]).toEqual([]);
      expect(s.equipment[p.id]).toEqual([{ id: commandId(p), type: p.kind === "pasiphae" ? "PASIPHAE_COMMAND" : "PATROL_COMMAND" }]);
      // Its interface is the bay equipment the map already has.
      expect(s.equipment[p.bay]!.some((e) => e.id === interfaceId(p) && e.type === "PATROL_INTERFACE")).toBe(true);
      expect(s.patrolShips[p.id]).toEqual({ armor: p.kind === "pasiphae" ? 12 : 10, out: false });
    }
  });
});

describe("taking off", () => {
  it("a Pilot in a bay is offered each docked ship there, for 2 AP; nobody else is", () => {
    const s = ship();
    expect(offered(s, "p0").filter((a) => a.type === "takeoff")).toEqual([takeoff(LONGANE), takeoff(JUJUBE), takeoff(patrolShip("PATROL_SHIP_A_2")!)]);
    expect(costOf(s, "p0", takeoff())).toEqual({ ap: s.config.patrol.takeoff.cost.ap, mp: 0 });
    expect(offered(s, "p1").some((a) => a.type === "takeoff")).toBe(false);
    expect(refusal(s, "p1", takeoff())).toBe("cant_fly");
    // A ship in another bay can't be taken from here.
    expect(refusal(s, "p0", takeoff(patrolShip("PATROL_SHIP_B_0")!))).toBe("no_ship");
  });

  it("moves the pilot alone into the ship's room and marks the ship out", () => {
    const s = ship();
    const next = mustApply(s, "p0", takeoff());
    expect(player(next, "p0")).toMatchObject({ room: LONGANE.id, ap: player(s, "p0").ap - s.config.patrol.takeoff.cost.ap });
    expect(player(next, "p0").spot).toBeUndefined();
    expect(player(next, "p1").room).toBe(BAY);
    expect(next.patrolShips[LONGANE.id]).toEqual({ armor: 10, out: true });
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
  it("the pilot can only land (no doors), and sees their ship's armor; nobody else does", () => {
    const s = mustApply(ship(), "p0", takeoff());
    const types = new Set(offered(s, "p0").map((a) => a.type));
    expect(types.has("move")).toBe(false);
    expect(offered(s, "p0").filter((a) => a.type === "land")).toEqual([land()]);
    expect(viewFor(s, "p0").patrolShip).toEqual({ id: LONGANE.id, armor: 10, maxArmor: 10 });
    expect(viewFor(s, "p0").roomEquipment).toEqual([{ id: commandId(LONGANE), type: "PATROL_COMMAND" }]);
    expect(viewFor(s, "p1").patrolShip).toBeNull();
  });

  it("the bay shows the ship's interface as out; other rooms show nothing", () => {
    const s = mustApply(ship(), "p0", takeoff());
    expect(viewFor(s, "p1").roomEquipment.find((e) => e.id === interfaceId(LONGANE))).toEqual({ id: interfaceId(LONGANE), type: "PATROL_INTERFACE", out: true });
    expect(viewFor(s, "p1").roomEquipment.find((e) => e.id === interfaceId(JUJUBE))).toEqual({ id: interfaceId(JUJUBE), type: "PATROL_INTERFACE" });
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

describe("rough manoeuvres (for when non-pilots can fly)", () => {
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
});
