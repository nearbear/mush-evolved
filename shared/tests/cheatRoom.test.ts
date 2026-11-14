// The cheat room (#170): dev ships only, door-less, one of every item, a coffee machine and the Superkube.
import { describe, expect, it } from "vitest";
import { CHEAT_ROOM, SUPERKUBE } from "../src/cheatRoom.ts";
import { resolveConfig } from "../src/config.ts";
import { daedalusRooms } from "../src/fire.ts";
import { ITEM_TYPES, itemsIn } from "../src/items.ts";
import { overridesOf } from "../src/normalizeState.ts";
import { shortestPath } from "../src/paths.ts";
import { applyAction, createGame } from "../src/rules.ts";
import { makeSeats } from "./support.ts";

const devShip = () => createGame(makeSeats(3), { ...resolveConfig({ cheatRoom: true }), mushCount: 1 }, 7);

describe("cheat room", () => {
  it("exists only on a ship launched with the cheatRoom override", () => {
    const plain = createGame(makeSeats(3), { ...resolveConfig(), mushCount: 1 }, 7);
    expect(Object.hasOwn(plain.config.rooms, CHEAT_ROOM)).toBe(false);
    expect(Object.hasOwn(plain.equipment, CHEAT_ROOM)).toBe(false);
    expect(plain.items.some((i) => i.at.kind === "room" && i.at.id === CHEAT_ROOM)).toBe(false);

    const dev = devShip();
    expect(dev.config.rooms[CHEAT_ROOM]).toEqual([]);
    expect(dev.equipment[CHEAT_ROOM]!.map((e) => e.type)).toEqual(["COFFEE_DISPENSER", SUPERKUBE]);
  });

  it("reads the override back out of a resolved config", () => {
    expect(overridesOf(resolveConfig({ cheatRoom: true })).cheatRoom).toBe(true);
    expect(overridesOf(resolveConfig()).cheatRoom).toBeUndefined();
  });

  it("holds exactly one of each item type", () => {
    const types = itemsIn(devShip(), { kind: "room", id: CHEAT_ROOM }).map((i) => i.type);
    expect([...types].sort()).toEqual(Object.keys(ITEM_TYPES).sort());
  });

  it("has a working coffee machine", () => {
    const s = devShip();
    s.players[0]!.room = CHEAT_ROOM;
    const r = applyAction(s, "p0", { type: "dispense", equipment: `${CHEAT_ROOM}:COFFEE_DISPENSER` });
    expect(r.ok).toBe(true);
  });

  it("is reached by no route and left out of random events", () => {
    const s = devShip();
    for (const room of Object.keys(s.config.rooms)) {
      if (room !== CHEAT_ROOM) expect(shortestPath(s.config.rooms, room, CHEAT_ROOM)).toBeFalsy();
      expect(s.config.rooms[room]).not.toContain(CHEAT_ROOM);
    }
    expect(daedalusRooms(s)).not.toContain(CHEAT_ROOM);
  });
});
