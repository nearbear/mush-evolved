import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, PRESELECTION, resolveConfig } from "../src/config.ts";
import { ITRACKIE_ITEM } from "../src/items.ts";
import { joinShip, preselectionDeadline } from "../src/preselection.ts";
import { applyInput, type Input } from "../src/replay.ts";
import { createGame, viewFor } from "../src/rules.ts";
import type { GameConfig, GameState, PreselectionRules } from "../src/types.ts";
import { makeSeats, must, nextCycle, noIncidents, offered, player } from "./support.ts";

/** Most tests use a small ship so it fills after a few joins. */
const SMALL: PreselectionRules = { ...PRESELECTION, seats: 4 };
const config: GameConfig = noIncidents({ ...DEFAULT_CONFIG, preselection: SMALL });

/** A ship launched empty in pre-selection (on day 1 cycle `startCycle`), then joined by the first `n` seats of makeSeats. */
function ship(n: number, rules: PreselectionRules = SMALL, seed = 7, startCycle = 1): GameState {
  let s = createGame([], { ...config, preselection: rules }, seed, {}, startCycle);
  for (const seat of makeSeats(n)) s = must(joinShip(s, seat));
  return s;
}
const mush = (s: GameState) => s.players.filter((p) => p.role === "mush").map((p) => p.id);
/** Cycles until the deadline cycle has begun. */
function toDeadline(s: GameState): GameState {
  const deadline = preselectionDeadline(s, s.config.preselection!);
  while (s.cycle < deadline) s = nextCycle(s);
  return s;
}

describe("a ship in pre-selection", () => {
  it("launches empty, with nobody Mush, no titles and no rebel call yet", () => {
    const s = createGame([], config, 1);
    expect(s.players).toEqual([]);
    expect(s.preselection).toBe(true);
    expect(Object.values(s.titles).every((t) => t === null)).toBe(true);
    expect(s.comms).toEqual(createGame([], config, 2).comms);
  });

  it("seats a joiner as a human with the start inventory, waking in the cycle they join", () => {
    let s = nextCycle(ship(1));
    s = must(joinShip(s, makeSeats(2)[1]!));
    const p = player(s, "p1");
    expect([p.role, p.alpha, p.ap, p.hp, p.room, p.satietyZeroSince]).toEqual(["human", false, config.startAp, config.startHp, config.startRoom, s.cycle]);
    expect(s.items.filter((i) => i.at.kind === "player" && i.at.id === "p1").map((i) => i.type)).toEqual([ITRACKIE_ITEM]);
    expect(new Set(s.items.map((i) => i.id)).size).toBe(s.items.length);
    expect(viewFor(s, "p1").preselection).toBe(true);
  });

  it("refuses a character already aboard, a seat id already taken, and leaves the state alone", () => {
    const s = ship(2);
    const before = JSON.stringify(s);
    expect(joinShip(s, { ...makeSeats(3)[2]!, character: "chao" })).toEqual({ ok: false, error: "character_taken" });
    expect(joinShip(s, { ...makeSeats(3)[2]!, id: "p0" })).toEqual({ ok: false, error: "duplicate_seat" });
    expect(JSON.stringify(s)).toBe(before);
  });

  it("refuses joiners on a ship launched without pre-selection", () => {
    const s = createGame(makeSeats(3), noIncidents(DEFAULT_CONFIG), 1);
    expect(joinShip(s, makeSeats(4)[3]!)).toEqual({ ok: false, error: "ship_closed" });
  });

  it("offers no combat and no spore actions", () => {
    let s = ship(3);
    expect(offered(s, "p0").some((a) => a.type === "punch")).toBe(false);
    // Even a Mush made early (the dev role cheat) can't extract or spike yet.
    player(s, "p0").role = "mush";
    expect(offered(s, "p0").some((a) => a.type === "extract_spore" || a.type === "spike")).toBe(false);
    s.items.push({ id: "w", type: "knife", at: { kind: "player", id: "p1" } });
    expect(offered(s, "p1").some((a) => a.type === "attack")).toBe(false);
    s = { ...s, preselection: false };
    expect(offered(s, "p1").some((a) => a.type === "attack" || a.type === "punch")).toBe(true);
  });
});

describe("Mush selection", () => {
  it("happens when the ship fills: 1 Mush, an alpha, titles issued, the rebel base calls", () => {
    const s3 = ship(3);
    expect(s3.preselection).toBe(true);
    const s = must(joinShip(s3, makeSeats(4)[3]!));
    expect(s.preselection).toBe(false);
    expect(mush(s)).toHaveLength(1);
    const m = player(s, mush(s)[0]!);
    expect([m.alpha, m.satietyZeroSince]).toEqual([true, null]);
    expect(Object.values(s.titles).some((t) => t !== null)).toBe(true);
    expect(s.comms).not.toEqual(s3.comms);
    expect(joinShip(s, makeSeats(5)[4]!)).toEqual({ ok: false, error: "ship_closed" });
  });

  it("tells the Mush privately and the crew only that the Mush were chosen", () => {
    const s = ship(4);
    const [m] = mush(s);
    for (const p of s.players) {
      const view = viewFor(s, p.id);
      expect(view.log.some((e) => e.key === "chosenMush")).toBe(p.id === m);
      expect(view.chat.filter((c) => c.system?.key === "mushChosen").map((c) => c.system)).toEqual([{ key: "mushChosen" }]);
      // Nobody else learns who it is: other seats carry no role.
      expect(view.players.some((o) => "role" in o || "alpha" in o)).toBe(false);
    }
  });

  it("is the same for the same seed and inputs (replays)", () => {
    const run = () => {
      let s = createGame([], config, 42);
      for (const seat of makeSeats(4)) s = must(applyInput(s, { type: "join", seat } satisfies Input));
      return mush(s);
    };
    expect(run()).toEqual(run());
  });

  it("happens on the seat count's last join: a 4-seat ship's 4th, not a 16-seat ship's", () => {
    expect([ship(3).preselection, ship(4).preselection]).toEqual([true, false]);
    const big = ship(15, PRESELECTION);
    expect(big.preselection).toBe(true);
    expect(must(joinShip(big, makeSeats(16)[15]!)).preselection).toBe(false);
  });

  it("happens at the last cycle of the deadline day: day 1 for a 1-day ship, day 5 for a 5-day one", () => {
    for (const day of [1, 5]) {
      const rules = { ...SMALL, endsOn: { day, cycle: DEFAULT_CONFIG.cyclesPerDay } };
      const last = day * DEFAULT_CONFIG.cyclesPerDay;
      expect(preselectionDeadline(ship(0, rules), rules)).toBe(last);
      // Skips ahead: an idle crew starves long before day 5.
      let s = { ...ship(3, rules), cycle: last - 2 };
      s = nextCycle(s);
      expect(s.preselection).toBe(true);
      s = nextCycle(s);
      expect([s.cycle, s.preselection]).toEqual([last, false]);
    }
  });

  it("happens when day 3 cycle 8 begins if the ship hasn't filled, whatever cycle it launched in", () => {
    for (const startCycle of [1, 5]) {
      let s = ship(3, SMALL, 7, startCycle);
      const deadline = preselectionDeadline(s, SMALL);
      while (s.cycle < deadline - 1) s = nextCycle(s);
      expect(s.preselection).toBe(true);
      s = nextCycle(s);
      expect([s.cycle, s.preselection, mush(s).length, s.phase]).toEqual([deadline, false, 1, "playing"]);
    }
  });

  it("gives 2 Mush to more than `twoMushAbove` players", () => {
    const rules = { ...PRESELECTION, seats: 16 };
    expect(mush(toDeadline(ship(rules.twoMushAbove, rules)))).toHaveLength(1);
    expect(mush(toDeadline(ship(rules.twoMushAbove + 1, rules)))).toHaveLength(2);
  });

  it("with a fixed Mush count, picks that many from a full ship", () => {
    for (const mushCount of [1, 2, 3]) {
      const rules = { ...PRESELECTION, seats: 16, mushCount };
      expect(mush(toDeadline(ship(9, rules)))).toHaveLength(mushCount);
    }
  });

  it("lowers a fixed count to the players aboard minus 2, with at least 1", () => {
    const rules = { ...PRESELECTION, seats: 16, mushCount: 3 };
    for (const [aboard, wanted] of [[5, 3], [4, 2], [2, 1]] as const) {
      expect(mush(toDeadline(ship(aboard, rules)))).toHaveLength(wanted);
    }
  });

  it("counts a Mush made by the dev role cheat toward the count", () => {
    for (const mushCount of ["auto", 2] as const) {
      const s = ship(9, { ...PRESELECTION, seats: 16, mushCount });
      player(s, "p4").role = "mush";
      const after = toDeadline(s);
      expect(mush(after)).toHaveLength(2);
      expect(mush(after)).toContain("p4");
    }
  });

  it("treats a stored ship's rules without a Mush count as Auto", () => {
    const { mushCount: _, ...old } = PRESELECTION;
    const rules = resolveConfig({ preselection: old as PreselectionRules }).preselection!;
    expect(rules.mushCount).toBe("auto");
    expect(mush(toDeadline(ship(9, rules)))).toHaveLength(2);
  });

  it("with fewer than `minPlayers` aboard, kills every human at once: the Mush win (stopgap)", () => {
    for (const n of [1, 2]) {
      const s = toDeadline(ship(n));
      expect(mush(s)).toHaveLength(1);
      expect(s.players.filter((p) => p.alive).map((p) => p.id)).toEqual(mush(s));
      expect([s.phase, s.winner, s.ending]).toEqual(["ended", "mush", "humans_dead"]);
    }
    expect(toDeadline(ship(3)).phase).toBe("playing");
  });

  it("issues no titles before selection, even when someone dies", () => {
    const s = ship(2);
    const quiet = JSON.stringify(s.titles);
    player(s, "p0").hp = 1;
    player(s, "p0").satietyZeroSince = -100; // starving
    const after = nextCycle(s);
    expect(player(after, "p0").alive).toBe(false);
    expect(JSON.stringify(after.titles)).toBe(quiet);
  });
});
