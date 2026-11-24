import { describe, expect, it } from "vitest";
import { ACTIONS } from "../src/actions.ts";
import { killPlayer } from "../src/death.ts";
import { fullViewFor, perspective, seatStarts } from "../src/fullView.ts";
import { DELOGGED_KEY, logPrivate, logPublic, logSecret } from "../src/log.ts";
import { revealFor } from "../src/replayView.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import type { GameState } from "../src/types.ts";
import { makeSeats, mustApply, nextCycle, nextDay, option, player, testConfig } from "./support.ts";

const base = testConfig();
const ROOM_A = Object.keys(base.rooms).find((r) => base.rooms[r]!.length >= 2)!;
const ROOM_B = base.rooms[ROOM_A]![0]!;

/** p0 is a Mush with Defacer, p1 and p2 humans, all in ROOM_A, with a public, a private and another room's line. */
function ship(): GameState {
  const s = createGame(makeSeats(3), base, 42);
  for (const id of ["p0", "p1", "p2"]) player(s, id).room = ROOM_A;
  player(s, "p0").role = "mush";
  player(s, "p0").mushSkills = ["defacer"];
  player(s, "p1").role = "human";
  player(s, "p2").role = "human";
  logPublic(s, ROOM_A, "oldPublic");
  logPrivate(s, "p1", "oldPrivate");
  logPublic(s, ROOM_B, "elsewhere");
  return s;
}

/** The keys of the room lines `id` sees. */
const keysOf = (s: GameState, id: string): string[] => viewFor(s, id).log.filter((l) => l.room !== undefined).map((l) => l.key);
const delog = (s: GameState = ship()): GameState => mustApply(s, "p0", { type: "delog" });

describe("defacer", () => {
  it("costs 2 AP, private and recorded", () => {
    expect(base.delog.cost.ap).toBe(2);
    expect(option(ship(), "p0", { type: "delog" })!.cost).toEqual({ ap: base.delog.cost.ap, mp: 0 });
    expect(ACTIONS.delog.visibility).toBe("private");
    expect(ACTIONS.delog.recorded).toBe(true);
    const s = delog();
    expect(player(s, "p0").ap).toBe(player(ship(), "p0").ap - base.delog.cost.ap);
  });

  it("only a Mush with Defacer, never on an expedition; a refusal changes nothing", () => {
    const s = ship();
    expect(option(s, "p1", { type: "delog" })).toBeUndefined();
    expect(applyAction(s, "p1", { type: "delog" }).ok).toBe(false);
    player(s, "p0").mushSkills = [];
    expect(applyAction(s, "p0", { type: "delog" }).ok).toBe(false);
    player(s, "p0").mushSkills = ["defacer"];
    s.expedition = { report: "r1", planet: "planet-b", sectors: [0], nextAt: 0, carried: {}, sabotaged: false, sabotageNext: false, hp: {}, ship: null };
    s.expeditions.push({ id: "r1", members: ["p0"], crew: [player(s, "p0").character], planet: "Name-planet-b", events: [] });
    player(s, "p0").room = s.config.expedition.craft;
    expect(option(s, "p0", { type: "delog" })).toBeUndefined();
    expect(applyAction(s, "p0", { type: "delog" }).ok).toBe(false);
  });

  it("erases every line in the room, private ones too, and leaves only the public notice", () => {
    const s = delog();
    for (const id of ["p0", "p1", "p2"]) {
      expect(keysOf(s, id)).toEqual([DELOGGED_KEY]);
    }
    expect(s.log.some((e) => e.room === ROOM_B && e.key === "elsewhere")).toBe(true);
    // The actor gets no line of their own.
    expect(s.log.filter((e) => e.room === ROOM_A)).toHaveLength(1);
  });

  it("records nothing visible in the room until the cycle ends, keeps swallowed lines for replays, then records again", () => {
    const s = delog();
    const seenBefore = Object.fromEntries(["p0", "p1", "p2"].map((id) => [id, player(s, id).logSeen]));
    logPublic(s, ROOM_A, "during");
    logPrivate(s, "p1", "duringPrivate");
    logSecret(s, "p0", "duringSecret");
    logPublic(s, ROOM_B, "nextDoor");
    // Swallowed lines never advance anyone's `logSeen`.
    for (const id of ["p0", "p1", "p2"]) expect(player(s, id).logSeen).toBe(seenBefore[id]);
    // Moving out shows nothing in the defaced room, but the next room still records the arrival.
    const moved = mustApply(s, "p2", { type: "move", to: ROOM_B });
    for (const id of ["p0", "p1"]) expect(keysOf(moved, id)).toEqual([DELOGGED_KEY]);
    expect(moved.log.some((e) => e.room === ROOM_B && e.key === "entered")).toBe(true);
    // Stored as defaced with `visibleTo: []` (and no `leaked` on a swallowed secret line), revealed only in all-seeing replays (#486).
    const swallowed = moved.log.filter((e) => e.room === ROOM_A && e.key !== DELOGGED_KEY);
    expect(swallowed.map((e) => e.key)).toEqual(["during", "duringPrivate", "duringSecret", "left"]);
    for (const e of swallowed) {
      expect(e.visibleTo).toEqual([]);
      expect(e.defaced).toBe(true);
      expect(e.leaked).toBeUndefined();
    }
    const full = fullViewFor(moved, seatStarts(moved));
    expect(perspective(full, "p1").log.filter((e) => e.room === ROOM_A).map((e) => e.key)).toEqual([DELOGGED_KEY]);
    const revealed = revealFor(full, "p1");
    expect(revealed.view.log.filter((e) => e.room === ROOM_A).map((e) => e.key)).toEqual([DELOGGED_KEY, "during", "duringPrivate", "duringSecret", "left"]);
    for (const e of swallowed) expect(revealed.reveal.seenBy.log[e.id]).toEqual([]);

    const next = nextCycle(moved);
    expect(next.deloggedRooms).toEqual([]);
    expect(next.log.some((e) => e.key === DELOGGED_KEY)).toBe(false);
    logPublic(next, ROOM_A, "after");
    expect(keysOf(next, "p1")).toContain("after");
  });

  it("once a day: no longer offered, refused, and back the next day", () => {
    const s = delog();
    expect(option(s, "p0", { type: "delog" })).toBeUndefined();
    expect(applyAction(s, "p0", { type: "delog" })).toMatchObject({ ok: false });
    const later = nextCycle(s);
    expect(option(later, "p0", { type: "delog" })).toBeUndefined();
    expect(option(nextDay(s), "p0", { type: "delog" })).toBeDefined();
  });

  it("a death in the defaced room gets no visible room line and no NERON announcement, but is kept for replays", () => {
    const s = delog();
    killPlayer(s, player(s, "p1"), "injury");
    for (const id of ["p0", "p1", "p2"]) expect(viewFor(s, id).log.some((e) => e.key === "died")).toBe(false);
    expect(s.log.find((e) => e.key === "died")).toMatchObject({ room: ROOM_A, visibleTo: [], defaced: true });
    expect(s.chat.some((m) => m.system?.key === "diedHuman")).toBe(false);

    const control = ship();
    killPlayer(control, player(control, "p1"), "injury");
    expect(control.chat.some((m) => m.system?.key === "diedHuman")).toBe(true);
  });

  it("never tells anyone else who defaced, the defaced rooms or the daily use, while all-seeing replays name the defacer", () => {
    const s = delog();
    const actor = player(s, "p0").character;
    for (const id of ["p0", "p1", "p2"]) {
      const notice = viewFor(s, id).log.find((l) => l.key === DELOGGED_KEY)!;
      expect(notice.params).toBeUndefined();
      expect(notice.maskedActor).toBeUndefined();
    }
    for (const id of ["p1", "p2"]) {
      const json = JSON.stringify(viewFor(s, id));
      expect(json).not.toContain("deloggedRooms");
      expect(json).not.toContain("delogToday");
      expect(json).not.toContain("maskedActor");
      expect(json).not.toContain("defaced");
    }
    const full = fullViewFor(s, seatStarts(s));
    expect(perspective(full, "p1").log.find((l) => l.key === DELOGGED_KEY)!.maskedActor).toBeUndefined();
    expect(revealFor(full, "p1").view.log.find((l) => l.key === DELOGGED_KEY)!.maskedActor).toBe(actor);
  });
});
