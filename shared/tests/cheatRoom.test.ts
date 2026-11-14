// The cheat room (#170): dev ships only, door-less, one of every item, a coffee machine and the Superkube.
import { describe, expect, it } from "vitest";
import { CHEAT_ROOM, SUPERKUBE } from "../src/cheatRoom.ts";
import { resolveConfig } from "../src/config.ts";
import { daedalusRooms } from "../src/fire.ts";
import { ITEM_TYPES, itemsIn } from "../src/items.ts";
import { overridesOf } from "../src/normalizeState.ts";
import { shortestPath } from "../src/paths.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import { applyInput, replayGame } from "../src/replay.ts";
import { ICARUS_CRAFT } from "../src/patrol.ts";
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

  describe("going in (the cheatRoom input)", () => {
    const go = (s: ReturnType<typeof devShip>, by = "p0") => applyInput(s, { type: "cheatRoom", by });

    it("takes you there for free, with no log line, and shows you its contents", () => {
      const s = devShip();
      const before = s.players[0]!;
      const r = go(s);
      if (!r.ok) throw new Error(r.error);
      const me = r.state.players[0]!;
      expect(me.room).toBe(CHEAT_ROOM);
      expect([me.ap, me.mp]).toEqual([before.ap, before.mp]);
      expect(me.spot).toBeUndefined();
      expect(r.state.log).toEqual(s.log);
      const view = viewFor(r.state, "p0");
      expect(view.roomEquipment.map((e) => e.type)).toContain(SUPERKUBE);
      expect(view.roomItems).toHaveLength(Object.keys(ITEM_TYPES).length);
      // Someone outside sees neither its items nor its equipment (the room they leave sees you vanish).
      const other = viewFor(r.state, "p1");
      expect(other.roomEquipment.some((e) => e.type === SUPERKUBE)).toBe(false);
      expect(other.roomItems.length).toBeLessThan(view.roomItems.length);
    });

    it("gets you out of bed first", () => {
      const s = devShip();
      Object.assign(s.players[0]!, { modifiers: [...s.players[0]!.modifiers, "lying_down"], lyingIn: "BED", lyingSince: 1 });
      const r = go(s);
      if (!r.ok) throw new Error(r.error);
      expect(r.state.players[0]!.room).toBe(CHEAT_ROOM);
      expect(r.state.players[0]!.lyingIn).toBeUndefined();
      expect(r.state.players[0]!.modifiers).not.toContain("lying_down");
    });

    it("is refused without the room, from inside it, when dead, off the ship, or in a push", () => {
      const plain = createGame(makeSeats(3), { ...resolveConfig(), mushCount: 1 }, 7);
      expect(go(plain)).toMatchObject({ ok: false, error: "no_cheat_room" });

      const s = devShip();
      const inside = go(s);
      if (!inside.ok) throw new Error(inside.error);
      expect(go(inside.state)).toMatchObject({ ok: false, error: "already_there" });

      const dead = devShip();
      dead.players[0]!.alive = false;
      expect(go(dead)).toMatchObject({ ok: false, error: "dead" });

      const flying = devShip();
      flying.players[0]!.room = ICARUS_CRAFT;
      expect(go(flying)).toMatchObject({ ok: false, error: "off_ship" });

      const pushed = devShip();
      pushed.players[1]!.room = pushed.players[0]!.room;
      pushed.players[0]!.pushedBy = "p1";
      expect(go(pushed)).toMatchObject({ ok: false, error: "being_pushed" });
      expect(go(pushed, "p1")).toMatchObject({ ok: false, error: "being_pushed" });
    });

    it("replays", () => {
      const setup = { seats: makeSeats(3), config: { ...resolveConfig({ cheatRoom: true }), mushCount: 1 }, seed: 7 };
      const state = replayGame(setup, [{ type: "cheatRoom", by: "p0" }]);
      expect(state.players[0]!.room).toBe(CHEAT_ROOM);
    });
  });
});
