import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, PRESELECTION } from "../src/config.ts";
import { logPrivate, logPublic } from "../src/log.ts";
import { swapMinds } from "../src/mind.ts";
import { joinShip } from "../src/preselection.ts";
import { createGame, seatViewFor, viewFor } from "../src/rules.ts";
import type { GameState } from "../src/types.ts";
import { makeSeats, must, mustApply, nextCycle, noHunters, noIncidents, pickSkill, player } from "./support.ts";

// Room log window (owner, 2026-11-05, #365; rules-design.md "Room log window, Tracker"): 8 cycles, 16 for a Tracker
// (`hunt`). Ship-wide lines and chat have no window; room lines older than 16 cycles leave the state.
const config = noHunters(noIncidents({ ...DEFAULT_CONFIG, mushCount: 1, startItems: [], startSkills: [] }));
const ship = (): GameState => createGame(makeSeats(3), config, 3);

/** `s` at `cycle`, as if the log had been written then: lines pushed now carry this cycle. */
function at(s: GameState, cycle: number): GameState {
  s.cycle = cycle;
  return s;
}
const keys = (s: GameState, id: string) => viewFor(s, id).log.map((e) => e.key);
const room = (s: GameState, id: string) => player(s, id).room;

describe("the room log window", () => {
  it("is 8 cycles, 16 with Tracker", () => {
    expect(DEFAULT_CONFIG.logWindow).toEqual({ cycles: 8, tracker: 16 });
  });

  it("shows a room line from 7 cycles ago and drops one from 8", () => {
    const s = ship();
    logPublic(at(s, 2), room(s, "p1"), "old");
    logPublic(at(s, 3), room(s, "p1"), "edge");
    at(s, 10);
    expect(keys(s, "p1")).toContain("edge");
    expect(keys(s, "p1")).not.toContain("old");
  });

  it("covers your private lines too", () => {
    const s = ship();
    logPrivate(at(s, 2), "p1", "mineOld");
    logPrivate(at(s, 3), "p1", "mineEdge");
    at(s, 10);
    expect(keys(s, "p1")).toEqual(expect.arrayContaining(["mineEdge"]));
    expect(keys(s, "p1")).not.toContain("mineOld");
  });

  it("never windows ship-wide lines", () => {
    const s = ship();
    logPublic(at(s, 2), undefined, "shipWide");
    at(s, 40);
    expect(keys(s, "p1")).toEqual(expect.arrayContaining(["crewWakes", "shipWide"]));
  });

  it("is 16 cycles for a Tracker who picked the skill", () => {
    let s = ship();
    logPublic(at(s, 2), room(s, "p1"), "old");
    logPublic(at(s, 3), room(s, "p1"), "edge");
    s = pickSkill(at(s, 18), "p1", "hunt");
    expect(keys(s, "p1")).toContain("edge");
    expect(keys(s, "p1")).not.toContain("old");
    expect(keys(s, "p2")).not.toContain("edge");
  });

  it("is 16 cycles for a Tracker who learned it from a book", () => {
    const s = ship();
    logPublic(at(s, 3), room(s, "p1"), "edge");
    player(s, "p1").bookSkill = "hunt";
    at(s, 18);
    expect(keys(s, "p1")).toContain("edge");
  });

  it("leaves the dead with ship-wide lines only, as before", () => {
    const s = ship();
    logPublic(s, room(s, "p1"), "here");
    logPrivate(s, "p1", "mine");
    logPublic(s, undefined, "shipWide");
    player(s, "p1").alive = false;
    expect(keys(s, "p1")).toEqual(["crewWakes", "shipWide"]);
  });

  it("applies to the replay's seat view too", () => {
    const s = ship();
    logPublic(at(s, 2), room(s, "p1"), "old");
    at(s, 10);
    expect(seatViewFor(s, "p1").log.map((e) => e.key)).not.toContain("old");
  });
});

describe("pruning the log", () => {
  it("drops room lines older than 16 cycles as a cycle begins and keeps ship-wide ones", () => {
    let s = ship();
    logPublic(at(s, 1), room(s, "p1"), "old");
    logPrivate(s, "p1", "mineOld");
    logPublic(at(s, 2), room(s, "p1"), "kept");
    logPublic(s, undefined, "shipWide");
    s = nextCycle(at(s, 16)); // now cycle 17: cycle 1 is 16 back, cycle 2 is 15 back
    const left = s.log.map((e) => e.key);
    expect(left).not.toContain("old");
    expect(left).not.toContain("mineOld");
    expect(left).toEqual(expect.arrayContaining(["crewWakes", "kept", "shipWide"]));
  });
});

describe("logSeen", () => {
  it("counts each line as you could see it, and keeps counting lines that left the window", () => {
    let s = ship();
    const start = player(s, "p1").logSeen;
    expect(start).toBe(viewFor(s, "p1").log.length);
    logPublic(s, room(s, "p1"), "here");
    logPublic(s, "NOWHERE", "elsewhere");
    logPrivate(s, "p2", "theirs");
    logPrivate(s, "p1", "mine");
    expect(viewFor(s, "p1").logSeen).toBe(start + 2);
    // Twenty cycles on, both room lines are gone; the count still has them, plus every cycle's ship-wide line.
    const before = viewFor(s, "p1").logSeen;
    const lastId = s.nextLogId - 1;
    for (let i = 0; i < 20; i++) s = nextCycle(s);
    const view = viewFor(s, "p1");
    expect(view.log.map((e) => e.key)).not.toContain("here");
    expect(view.logSeen).toBe(before + s.log.filter((e) => e.id > lastId && e.room === undefined).length);
  });

  it("counts only ship-wide lines for the dead", () => {
    const s = ship();
    player(s, "p1").alive = false;
    const start = player(s, "p1").logSeen;
    logPublic(s, room(s, "p1"), "here");
    logPrivate(s, "p1", "mine");
    logPublic(s, undefined, "shipWide");
    expect(player(s, "p1").logSeen).toBe(start + 1);
  });

  it("starts at the lines already there for someone boarding in pre-selection", () => {
    let s = createGame([], { ...config, preselection: { ...PRESELECTION, seats: 4 } }, 7);
    logPublic(s, undefined, "shipWide");
    s = must(joinShip(s, makeSeats(1)[0]!));
    expect(player(s, "p0").logSeen).toBe(viewFor(s, "p0").log.length);
  });

  it("starts over for both bodies in a Transfer, at what each view shows", () => {
    const s = ship();
    logPrivate(at(s, 2), "p1", "agedOut");
    at(s, 12);
    player(s, "p1").logSeen = 500;
    player(s, "p2").logSeen = 600;
    swapMinds(s, player(s, "p1"), player(s, "p2"));
    for (const id of ["p1", "p2"]) expect(player(s, id).logSeen).toBe(viewFor(s, id).log.length);
  });

  it("is in your own view only", () => {
    const s = ship();
    player(s, "p1").logSeen = 987_654;
    expect(JSON.stringify(viewFor(s, "p1"))).toContain("987654");
    for (const id of ["p0", "p2"]) expect(JSON.stringify(viewFor(s, id))).not.toContain("987654");
  });
});

// Crew moves (owner, 2026-11-21; eMushpedia Traqueur): only a Tracker sees where someone came from or went to, in the
// log and by the door they stand at. No exception for your own moves; drones and Schrödinger keep their direction.
describe("the direction of crew moves", () => {
  const FROM = Object.keys(config.rooms).find((r) => config.rooms[r]!.length >= 2)!;
  const TO = config.rooms[FROM]![0]!;
  /** p0 walks FROM -> TO; p1 (no Tracker) and p2 (Tracker, from a book) watch from `watch`. */
  function walked(watch: string): GameState {
    const s = ship();
    for (const id of ["p0", "p1", "p2"]) player(s, id).room = id === "p0" ? FROM : watch;
    player(s, "p2").bookSkill = "hunt";
    return mustApply(s, "p0", { type: "move", to: TO });
  }
  const line = (s: GameState, id: string, key: string) => viewFor(s, id).log.find((e) => e.key === key);

  it("keeps the room in the state, whoever looks", () => {
    const s = walked(TO);
    expect(s.log.filter((e) => e.key === "left" || e.key === "entered").map((e) => e.params?.room)).toEqual([TO, FROM]);
  });

  it("shows a leaver's destination only to a Tracker", () => {
    const s = walked(FROM);
    expect(line(s, "p1", "leftRoom")?.params).toEqual({ name: player(s, "p0").character });
    expect(line(s, "p1", "left")).toBeUndefined();
    expect(line(s, "p2", "left")?.params?.room).toBe(TO);
    expect(line(s, "p2", "leftRoom")).toBeUndefined();
  });

  it("shows a newcomer's origin only to a Tracker, the mover included", () => {
    const s = walked(TO);
    expect(line(s, "p1", "enteredRoom")?.params?.room).toBeUndefined();
    expect(line(s, "p2", "entered")?.params?.room).toBe(FROM);
    expect(line(s, "p0", "enteredRoom")?.params?.room).toBeUndefined();
  });

  it("shows the door a newcomer stands at only to a Tracker", () => {
    const s = walked(TO);
    expect(player(s, "p0").spot).toEqual({ kind: "door", door: FROM });
    const spotSeenBy = (id: string) => viewFor(s, id).players.find((o) => o.id === "p0")?.spot;
    expect(spotSeenBy("p1")).toBeUndefined();
    expect(spotSeenBy("p2")).toEqual({ kind: "door", door: FROM });
    expect(viewFor(s, "p0").you.spot).toEqual({ kind: "door", door: FROM });
    player(s, "p0").spot = { kind: "cell", x: 1, y: 1 };
    expect(spotSeenBy("p1")).toEqual({ kind: "cell", x: 1, y: 1 });
  });

  it("shows older moves' direction once Tracker is learned", () => {
    const s = walked(TO);
    player(s, "p1").bookSkill = "hunt";
    expect(line(s, "p1", "entered")?.params?.room).toBe(FROM);
  });

  it("leaves drones' and Schrödinger's moves directional", () => {
    const s = ship();
    logPublic(s, room(s, "p1"), "droneLeft", { drone: "Robbie", serial: 1, room: TO });
    logPublic(s, room(s, "p1"), "catEntered", { room: TO });
    expect(line(s, "p1", "droneLeft")?.params?.room).toBe(TO);
    expect(line(s, "p1", "catEntered")?.params?.room).toBe(TO);
  });
});
