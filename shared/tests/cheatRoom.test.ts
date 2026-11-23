// The cheat room (#170): dev ships only, door-less, holding only the Superkube.
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
import { KUBE_OPS, kubeChoices, type KubeOpId } from "../src/kube.ts";
import { CHEAT_PLANET_SECTORS } from "../src/actions/warp_to_planet.ts";
import { PLANET_TAG_IDS } from "../src/planets.ts";
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
    expect(dev.equipment[CHEAT_ROOM]!.map((e) => e.type)).toEqual([SUPERKUBE]);
  });

  it("reads the override back out of a resolved config", () => {
    expect(overridesOf(resolveConfig({ cheatRoom: true })).cheatRoom).toBe(true);
    expect(overridesOf(resolveConfig()).cheatRoom).toBeUndefined();
  });

  it("holds nothing but the Superkube: no items on its floor", () => {
    expect(itemsIn(devShip(), { kind: "room", id: CHEAT_ROOM })).toEqual([]);
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

    it("takes you there for free, with no log line, and shows you the Superkube", () => {
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
      // Someone outside doesn't see its equipment (the room they leave sees you vanish).
      const other = viewFor(r.state, "p1");
      expect(other.roomEquipment.some((e) => e.type === SUPERKUBE)).toBe(false);
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

  describe("the Superkube (the kube input)", () => {
    type S = ReturnType<typeof devShip>;
    /** A dev ship with a human `p` already in the cheat room. */
    const inRoom = (): { s: S; p: string } => {
      const s = devShip();
      const human = s.players.find((pl) => pl.role === "human")!;
      human.room = CHEAT_ROOM;
      return { s, p: human.id };
    };
    const kube = (s: S, by: string, op: KubeOpId, arg?: string | number) => applyInput(s, { type: "kube", by, op, ...(arg !== undefined && { arg }) });
    const ok = (r: ReturnType<typeof kube>) => {
      if (!r.ok) throw new Error(r.error);
      return r.state;
    };
    const me = (s: S, id: string) => s.players.find((pl) => pl.id === id)!;

    it("is refused on a ship without the room, from outside it, from a bot, and with a bad argument", () => {
      const plain = createGame(makeSeats(3), { ...resolveConfig(), mushCount: 1 }, 7);
      expect(kube(plain, "p0", "dirty")).toMatchObject({ ok: false, error: "no_cheat_room" });
      expect(kube(devShip(), "p0", "dirty")).toMatchObject({ ok: false, error: "not_in_cheat_room" });
      const { s, p } = inRoom();
      me(s, p).isBot = true;
      expect(kube(s, p, "dirty")).toMatchObject({ ok: false, error: "bot" });
      const fresh = inRoom();
      expect(kube(fresh.s, fresh.p, "hp", -1)).toMatchObject({ ok: false, error: "bad_argument" });
      expect(kube(fresh.s, fresh.p, "hp", "3")).toMatchObject({ ok: false, error: "bad_argument" });
      expect(kube(fresh.s, fresh.p, "dirty", 1)).toMatchObject({ ok: false, error: "bad_argument" });
      expect(kube(fresh.s, fresh.p, "spawn", "no_such_item")).toMatchObject({ ok: false, error: "bad_argument" });
      expect(kube(fresh.s, fresh.p, "teleport", CHEAT_ROOM)).toMatchObject({ ok: false, error: "bad_argument" });
      expect(kube(fresh.s, fresh.p, "teleport", ICARUS_CRAFT)).toMatchObject({ ok: false, error: "bad_argument" });
      expect(kube(fresh.s, fresh.p, "nope" as KubeOpId)).toMatchObject({ ok: false, error: "unknown_option" });
    });

    it("never shows up in the actions", () => {
      const { s, p } = inRoom();
      const types = viewFor(s, p).actions.map((o) => o.action.type as string);
      expect(types.some((t) => t === "kube" || Object.hasOwn(KUBE_OPS, t))).toBe(false);
    });

    it("gives a chosen disease, disorder or injury, including to a Mush", () => {
      const { s, p } = inRoom();
      const { allDiseases, allDisorders, allInjuries } = s.config.diseases;
      let next = s;
      for (const name of [allDiseases[0]!, allDisorders[0]!, allInjuries[0]!]) next = ok(kube(next, p, "ailment", name));
      expect(me(next, p).modifiers).toEqual(expect.arrayContaining([allDiseases[0], allDisorders[0], allInjuries[0]]));
      expect(kube(next, p, "ailment", allDiseases[0]!)).toMatchObject({ ok: false, error: "already_has" });

      const mush = devShip();
      const m = mush.players.find((pl) => pl.role === "mush")!;
      m.room = CHEAT_ROOM;
      expect(me(ok(kube(mush, m.id, "ailment", allDiseases[0]!)), m.id).modifiers).toContain(allDiseases[0]);
      expect(me(ok(kube(mush, m.id, "ailment", allInjuries[0]!)), m.id).modifiers).toContain(allInjuries[0]);
    });

    it("gives a disease the ship's own duration for it, seen only by you", () => {
      const base = resolveConfig({ cheatRoom: true });
      const allDiseaseStats = base.diseases.allDiseases.map((label, i) => ({ label, type: "disease", durationMin: 30 + i, durationMax: 30 + i }));
      const s = createGame(makeSeats(3), { ...base, mushCount: 1, diseases: { ...base.diseases, allDiseaseStats } }, 7);
      const human = s.players.find((pl) => pl.role === "human")!;
      human.room = CHEAT_ROOM;
      const other = s.players.find((pl) => pl.id !== human.id)!.id;
      const name = s.config.diseases.allDiseases[2]!;
      const next = ok(kube(s, human.id, "ailment", name));
      expect(me(next, human.id).diseaseTrackers).toMatchObject([{ name, duration: 32 }]);
      expect(viewFor(next, human.id).statuses).toContain(name);
      expect(viewFor(next, other).players.find((pl) => pl.id === human.id)?.statuses).not.toContain(name);
    });

    it("cures every ailment and contamination", () => {
      const { s, p } = inRoom();
      const { allDiseases, allInjuries } = s.config.diseases;
      let next = ok(kube(s, p, "ailment", allDiseases[1]!));
      next = ok(kube(next, p, "ailment", allInjuries[0]!));
      next = ok(kube(next, p, "contaminate"));
      next = ok(kube(next, p, "cure"));
      expect(me(next, p).modifiers.filter((m) => [...allDiseases, ...allInjuries].includes(m))).toEqual([]);
      expect(me(next, p).diseaseTrackers).toEqual([]);
      expect(next.contamination[p]).toBeUndefined();
    });

    it("sets HP, morale, AP and MP, within 1 (HP) or 0 and the max", () => {
      const { s, p } = inRoom();
      let next = ok(kube(s, p, "hp", 3));
      next = ok(kube(next, p, "morale", 0));
      next = ok(kube(next, p, "ap", 999));
      next = ok(kube(next, p, "mp", 2));
      const pl = me(next, p);
      expect([pl.hp, pl.morale, pl.ap, pl.mp]).toEqual([3, 0, pl.maxAp, 2]);
      expect(me(ok(kube(next, p, "hp", 0)), p)).toMatchObject({ hp: 1, alive: true });
    });

    it("makes you dirty, with no log line", () => {
      const { s, p } = inRoom();
      const next = ok(kube(s, p, "dirty"));
      expect(me(next, p).statuses).toContain("dirty");
      expect(next.log).toEqual(s.log);
    });

    it("adds contamination to a human, refuses a Mush", () => {
      const { s, p } = inRoom();
      expect(ok(kube(s, p, "contaminate")).contamination[p]).toBe(1);
      const mush = devShip();
      const m = mush.players.find((pl) => pl.role === "mush")!;
      m.room = CHEAT_ROOM;
      expect(kube(mush, m.id, "contaminate")).toMatchObject({ ok: false, error: "cannot_contaminate" });
    });

    it("spawns an item on the floor, with a recipe or a skill where it needs one", () => {
      const { s, p } = inRoom();
      const floor = (st: S) => itemsIn(st, { kind: "room", id: CHEAT_ROOM });
      const type = Object.keys(ITEM_TYPES)[0]!;
      const once = ok(kube(s, p, "spawn", type));
      const twice = ok(kube(once, p, "spawn", type));
      expect(floor(twice).filter((i) => i.type === type)).toHaveLength(2);
      expect(new Set(twice.items.map((i) => i.id)).size).toBe(twice.items.length);
      expect(floor(ok(kube(s, p, "spawn", "blueprint")))[0]?.builds).toBeDefined();
    });

    it("teleports you out to any Daedalus room, Laboratory first, with no log line", () => {
      const { s, p } = inRoom();
      expect(kubeChoices(s.config, "room")[0]).toBe("LABORATORY");
      const next = ok(kube(s, p, "teleport", "REFECTORY"));
      expect(me(next, p).room).toBe("REFECTORY");
      expect(next.log).toEqual(s.log);
    });

    it("warps the ship into orbit of a new planet of known sectors, all of the picked tag, that never run out", () => {
      const { s, p } = inRoom();
      expect(kubeChoices(s.config, "sector")).toEqual(PLANET_TAG_IDS);
      expect(kube(s, p, "warpToPlanet", "NOT_A_TAG")).toMatchObject({ ok: false, error: "bad_argument" });
      const next = ok(kube(s, p, "warpToPlanet", "OXYGEN"));
      const planet = next.planets[p]!.find((pl) => pl.id === next.navigation.orbit)!;
      expect(next.navigation.arriving).toBeNull();
      expect(planet).toMatchObject({ inexhaustible: true });
      expect(planet.sectors).toHaveLength(CHEAT_PLANET_SECTORS);
      expect(planet.sectors.every((sector) => sector.tag === "OXYGEN" && sector.known)).toBe(true);
      // From orbit too: a fresh planet of another tag, and the first one is lost.
      const again = ok(kube(next, p, "warpToPlanet", "HYDROCARBON"));
      expect(again.navigation.orbit).not.toBe(next.navigation.orbit);
      expect(again.planets[p]!.map((pl) => pl.sectors[0]!.tag)).toEqual(["HYDROCARBON"]);
      // Only the warper sees the planet, and never the flag.
      const other = s.players.find((pl) => pl.id !== p)!.id;
      expect(viewFor(again, other).planets).toEqual([]);
      expect(viewFor(again, p).planets[0]).not.toHaveProperty("inexhaustible");
    });

    it.each([
      ["returnToSol", "sol", "returnedToSol", "mush"],
      ["returnToEden", "eden", "returnedToEden", "humans"],
    ] as const)("%s ends the game at %s once, with the decided winner", (op, ending, logKey, winner) => {
      const { s, p } = inRoom();
      const next = ok(kube(s, p, op));
      // A Mush is aboard and alive at the start: the Mush win at Sol, humans win at Eden anyway (#478).
      expect(next).toMatchObject({ phase: "ended", winner, ending });
      expect(next.log.at(-1)).toMatchObject({ key: logKey, params: { name: me(s, p).character }, visibleTo: "all" });
      expect(kube(next, p, op)).toMatchObject({ ok: false, error: "game_over" });
    });

    it("replays", () => {
      const setup = { seats: makeSeats(3), config: { ...resolveConfig({ cheatRoom: true }), mushCount: 1 }, seed: 7 };
      const human = createGame(setup.seats, setup.config, setup.seed).players.find((pl) => pl.role === "human")!.id;
      const state = replayGame(setup, [
        { type: "cheatRoom", by: human },
        { type: "kube", by: human, op: "ap", arg: 1 },
        { type: "kube", by: human, op: "teleport", arg: "LABORATORY" },
      ]);
      expect(me(state, human)).toMatchObject({ ap: 1, room: "LABORATORY" });
    });
  });
});
