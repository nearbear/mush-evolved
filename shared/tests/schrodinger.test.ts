// Schrödinger (owner, 2026-11-21): Raluca's cat arrives with her in the laboratory and moves at each cycle change by
// eMush's cat AI. No actions yet.
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, PRESELECTION } from "../src/config.ts";
import { breakDoor, doorId } from "../src/doors.ts";
import { CAT_ITEM } from "../src/items.ts";
import { shortestPath } from "../src/paths.ts";
import { joinShip } from "../src/preselection.ts";
import { createGame } from "../src/rules.ts";
import type { GameConfig, GameState, ItemState, RoomId, Seat } from "../src/types.ts";
import { makeSeats, must, nextCycle, player, testConfig } from "./support.ts";

const LAB = "LABORATORY";

const quiet = (favoredChance = DEFAULT_CONFIG.schrodinger.favoredChance): GameConfig =>
  testConfig({ schrodinger: { favoredChance } });

/** p0 is Raluca, p1 and p2 someone else. */
const seats = (): Seat[] => makeSeats(3).map((s, i) => (i === 0 ? { ...s, character: "raluca" } : { ...s, character: i === 1 ? "chun" : "kuanti" }));

const cats = (s: GameState): ItemState[] => s.items.filter((i) => i.type === CAT_ITEM);
const cat = (s: GameState): ItemState => {
  const all = cats(s);
  expect(all).toHaveLength(1);
  return all[0]!;
};
const catRoom = (s: GameState): RoomId | null => {
  const at = cat(s).at;
  return at.kind === "room" ? at.id : null;
};
const lines = (s: GameState, key: string) => s.log.filter((e) => e.key === key);
const neighbours = (s: GameState, room: RoomId): RoomId[] => [...s.config.rooms[room]!];

/** A ship with the cat in `room` and everyone parked in `others` (Raluca too unless `raluca` says where she is). */
function ship(favoredChance: number, room: RoomId, others: RoomId, raluca: RoomId | "dead" = others, seed = 5): GameState {
  const s = createGame(seats(), quiet(favoredChance), seed);
  for (const p of s.players) p.room = others;
  const r = player(s, "p0");
  if (raluca === "dead") r.alive = false;
  else r.room = raluca;
  cat(s).at = { kind: "room", id: room };
  return s;
}

/** A room two doors from LAB (not adjacent to it), and the room between. */
function twoAway(s: GameState): { far: RoomId; via: RoomId } {
  for (const via of neighbours(s, LAB)) {
    const far = neighbours(s, via).find((r) => r !== LAB && !neighbours(s, LAB).includes(r) && s.config.rooms[r]);
    if (far) return { far, via };
  }
  throw new Error("no room two doors from the lab");
}

describe("Schrödinger: arrival", () => {
  it("pins the confirmed numbers", () => {
    const { owner, room, favoredChance } = DEFAULT_CONFIG.schrodinger;
    expect([owner, room, favoredChance]).toEqual(["raluca", "LABORATORY", 0.7]);
  });

  it("appears on the laboratory floor when Raluca boards at launch", () => {
    const s = createGame(seats(), quiet(), 1);
    expect(cat(s).at).toEqual({ kind: "room", id: LAB });
    expect(s.log.some((e) => e.key.startsWith("cat"))).toBe(false);
  });

  it("doesn't exist without Raluca aboard", () => {
    const s = createGame(makeSeats(3).map((x) => ({ ...x, character: x.character === "raluca" ? "chun" : x.character })), quiet(), 1);
    expect(cats(s)).toEqual([]);
  });

  it("appears when Raluca joins a ship in pre-selection, and only then", () => {
    let s = createGame([], { ...quiet(), preselection: { ...PRESELECTION, seats: 4 } }, 1);
    const [raluca, chun] = seats();
    s = must(joinShip(s, chun!));
    expect(cats(s)).toEqual([]);
    s = must(joinShip(s, raluca!));
    expect(cat(s).at).toEqual({ kind: "room", id: LAB });
  });
});

describe("Schrödinger: Raluca alive", () => {
  it("stays in her room, whatever the roll", () => {
    const s = nextCycle(ship(0, LAB, LAB));
    expect(catRoom(s)).toBe(LAB);
    expect(lines(s, "catLeft")).toEqual([]);
  });

  it("on the favoured roll, steps toward her along the shortest path, with public lines in both rooms", () => {
    const base = ship(1, LAB, LAB);
    const { far } = twoAway(base);
    player(base, "p0").room = far;
    const s = nextCycle(base);
    const step = shortestPath(s.config.rooms, LAB, far)![0]!;
    expect(catRoom(s)).toBe(step);
    expect(lines(s, "catLeft")).toEqual([expect.objectContaining({ room: LAB, visibleTo: "all", params: { room: step } })]);
    expect(lines(s, "catEntered")).toEqual([expect.objectContaining({ room: step, visibleTo: "all", params: { room: LAB } })]);
  });

  it("otherwise takes a random step", () => {
    const base = ship(0, LAB, LAB);
    player(base, "p0").room = twoAway(base).far;
    expect(neighbours(base, LAB)).toContain(catRoom(nextCycle(base)));
  });
});

describe("Schrödinger: Raluca dead", () => {
  it("with people in his room, on the favoured roll, steps to an empty neighbour", () => {
    const base = ship(1, LAB, LAB, "dead");
    const next = neighbours(base, LAB);
    // Someone in every neighbour but the last.
    for (const [i, r] of next.slice(0, -1).entries()) base.players.push({ ...player(base, "p1"), id: `x${i}`, room: r });
    expect(catRoom(nextCycle(base))).toBe(next.at(-1));
  });

  it("counts any living player as people, but not the dead", () => {
    const base = ship(1, LAB, LAB, "dead");
    for (const p of base.players) if (p.id !== "p1") p.alive = false;
    expect(neighbours(base, LAB)).toContain(catRoom(nextCycle(base)));
    for (const p of base.players) p.alive = false;
    base.players[1]!.alive = true;
    base.players[1]!.room = "REFECTORY";
    expect(catRoom(nextCycle(base))).toBe(LAB);
  });

  it("in an empty room, stays on the favoured roll", () => {
    const s = nextCycle(ship(1, LAB, "REFECTORY", "dead"));
    expect(catRoom(s)).toBe(LAB);
    expect(lines(s, "catLeft")).toEqual([]);
  });

  it("in an empty room, otherwise takes a random step, only through a working door", () => {
    const base = ship(0, LAB, "REFECTORY", "dead");
    const [open, ...rest] = neighbours(base, LAB);
    for (const r of rest) breakDoor(base, doorId(LAB, r));
    expect(catRoom(nextCycle(base))).toBe(open);
  });

  it("stays when every door out is broken", () => {
    const base = ship(0, LAB, "REFECTORY", "dead");
    for (const r of neighbours(base, LAB)) breakDoor(base, doorId(LAB, r));
    const s = nextCycle(base);
    expect(catRoom(s)).toBe(LAB);
    expect(lines(s, "catLeft")).toEqual([]);
  });
});

describe("Schrödinger: carried", () => {
  it("acts from his carrier's room, and a move takes him out of their hands", () => {
    const base = ship(1, LAB, LAB, "dead");
    cat(base).at = { kind: "player", id: "p1" };
    const s = nextCycle(base);
    expect(neighbours(s, LAB)).toContain(catRoom(s));
    expect(lines(s, "catLeft")).toEqual([expect.objectContaining({ room: LAB })]);
  });

  it("stays in their hands when he doesn't move", () => {
    const base = ship(0, LAB, LAB);
    cat(base).at = { kind: "player", id: "p1" };
    expect(cat(nextCycle(base)).at).toEqual({ kind: "player", id: "p1" });
  });
});
