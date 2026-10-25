import { describe, expect, it } from "vitest";
import { actionVisibility } from "../src/actions.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { PILGRED_COMPLETE, pilgredGainRange } from "../src/pilgred.ts";
import { parseGameMessage } from "../src/protocol.ts";
import { applyAction, createGame, newCycle, viewFor } from "../src/rules.ts";
import { addStatus } from "../src/statuses.ts";
import type { Action, GameState } from "../src/types.ts";
import { makeSeats, must, nextDay, offered, player, noHunters, pickSkill } from "./support.ts";

const seats = makeSeats(3, "others");
const TERMINAL = "MOTOR_ROOM:PILGRED";
const repair: Action = { type: "repair_pilgred", equipment: TERMINAL };
const cfg = DEFAULT_CONFIG.pilgred;
const base = Math.floor((cfg.progress.rate * cfg.progress.mod) / 10);

function game(room = "MOTOR_ROOM") {
  const state = createGame(seats, noHunters(DEFAULT_CONFIG), 7);
  for (const p of state.players) p.room = room;
  return state;
}

/** One repair by `id`, topping up AP first so long runs never run dry. */
function repairBy(s: GameState, id: string): GameState {
  player(s, id).ap = s.config.maxAp;
  return must(applyAction(s, id, repair));
}

describe("PILGRED repair", () => {
  it("pins the decided numbers: 2 AP, 25% dirty, the original's formula, Physicist points 1 a day up to 2", () => {
    expect([cfg.cost.ap, cfg.dirtyChance, cfg.progress.rate, cfg.progress.mod, cfg.progress.skillBoost, cfg.progress.relayPenalty, cfg.pointsPerDay, cfg.capPoints]).toEqual([
      2, 0.25, 6, 2, 4, 2, 1, 2,
    ]);
  });

  it("starts broken and is offered only at the PILGRED terminal", () => {
    const s = game();
    expect(s.pilgred).toEqual({ progress: 0, lastBy: null, streak: 0 });
    expect(offered(s, "p0")).toContainEqual(repair);
    const elsewhere = game("REFECTORY");
    expect(offered(elsewhere, "p0").some((a) => a.type === "repair_pilgred")).toBe(false);
    expect(applyAction(elsewhere, "p0", repair).ok).toBe(false);
    expect(applyAction(s, "p0", { type: "repair_pilgred", equipment: "MOTOR_ROOM:EMERGENCY_REACTOR" }).ok).toBe(false);
  });

  it("costs AP and gains 1% without a skill, with a private line that gives no percent", () => {
    const s = game();
    const ap = s.players[0]!.ap;
    const r = applyAction(s, "p0", repair);
    if (!r.ok) throw new Error(r.error);
    expect(base).toBe(1);
    expect(r.state.pilgred).toEqual({ progress: base, lastBy: "p0", streak: 1 });
    expect(r.state.players[0]!.ap).toBe(ap - cfg.cost.ap);
    const line = r.state.log.find((e) => e.key === "pilgredRepaired");
    expect(line).toMatchObject({ room: "MOTOR_ROOM", visibleTo: ["p0"] });
    expect(line).not.toHaveProperty("params");
  });

  it("is private: roommates see no log line and no busy bar (owner, 2026-10-21)", () => {
    const r = must(applyAction(game(), "p0", repair));
    expect(actionVisibility("repair_pilgred")).toBe("private");
    expect(viewFor(r, "p1").log.some((e) => e.key === "pilgredRepaired")).toBe(false);
    expect(viewFor(r, "p0").log.some((e) => e.key === "pilgredRepaired")).toBe(true);
  });

  it("is open to Mush and to the dirty", () => {
    const s = game();
    s.players[1]!.role = "mush";
    addStatus(s.players[2]!, "dirty");
    expect(applyAction(s, "p1", repair).ok).toBe(true);
    expect(applyAction(s, "p2", repair).ok).toBe(true);
  });

  it("adds the boost for each of Engineer and Physicist, rolled in [min, min + min/2]", () => {
    const s = game();
    const p = s.players[0]!;
    expect(pilgredGainRange(s, p)).toEqual({ min: base, max: base });
    p.skills = ["engineer"];
    const one = base + cfg.progress.skillBoost;
    expect(pilgredGainRange(s, p)).toEqual({ min: one, max: one + (one >> 1) });
    p.skills = ["engineer", "physicist"];
    const two = base + 2 * cfg.progress.skillBoost;
    expect(pilgredGainRange(s, p)).toEqual({ min: two, max: two + (two >> 1) });
    expect([one, one + (one >> 1), two, two + (two >> 1)]).toEqual([5, 7, 9, 13]);
    for (let seed = 0; seed < 50; seed++) {
      const t = game();
      t.players[0]!.skills = ["engineer", "physicist"];
      t.rng = seed;
      const gain = must(applyAction(t, "p0", repair)).pilgred.progress;
      expect(gain).toBeGreaterThanOrEqual(two);
      expect(gain).toBeLessThanOrEqual(two + (two >> 1));
    }
  });

  it("relaying: each repair in a row by the same player costs the penalty, never below 0, until someone else repairs", () => {
    let s = game();
    s.players[0]!.skills = ["engineer"];
    const one = base + cfg.progress.skillBoost;
    expect(pilgredGainRange(s, s.players[0]!).min).toBe(one);
    s = repairBy(s, "p0");
    expect(pilgredGainRange(s, player(s, "p0")).min).toBe(one - cfg.progress.relayPenalty);
    s = repairBy(s, "p0");
    expect(s.pilgred.streak).toBe(2);
    expect(pilgredGainRange(s, player(s, "p0")).min).toBe(Math.max(0, one - 2 * cfg.progress.relayPenalty));
    // Someone else has no penalty, and their repair resets p0's.
    expect(pilgredGainRange(s, player(s, "p1")).min).toBe(base);
    s = repairBy(s, "p1");
    expect(s.pilgred).toMatchObject({ lastBy: "p1", streak: 1 });
    expect(pilgredGainRange(s, player(s, "p0")).min).toBe(one);
    // An unskilled second repair in a row gains nothing.
    const before = s.pilgred.progress;
    s = repairBy(s, "p1");
    expect(s.pilgred.progress).toBe(before);
  });

  it("is a 25% chance to get dirty", () => {
    let dirty = 0;
    for (let seed = 0; seed < 200; seed++) {
      const s = game();
      s.rng = seed;
      if (must(applyAction(s, "p0", repair)).players[0]!.statuses.includes("dirty")) dirty++;
    }
    expect(dirty).toBeGreaterThan(20);
    expect(dirty).toBeLessThan(80);
  });

  it("completes at 100% with a room line and a crew-wide message, then is no longer offered", () => {
    let s = game();
    s.pilgred.progress = PILGRED_COMPLETE - 1;
    s = repairBy(s, "p0");
    expect(s.pilgred.progress).toBe(PILGRED_COMPLETE);
    expect(s.log.at(-1)).toMatchObject({ key: "pilgredDone", room: "MOTOR_ROOM", visibleTo: "all" });
    expect(s.log.some((e) => e.key === "pilgredRepaired" && e.cycle === s.cycle)).toBe(false);
    expect(s.chat.at(-1)).toMatchObject({ channel: "global", from: null, system: { key: "pilgredDoneCrew", params: { name: s.players[0]!.character } } });
    s.players[1]!.ap = s.config.maxAp;
    expect(offered(s, "p1").some((a) => a.type === "repair_pilgred")).toBe(false);
    expect(applyAction(s, "p1", repair).ok).toBe(false);
  });

  it("clamps at 100%", () => {
    const s = game();
    s.players[0]!.skills = ["engineer", "physicist"];
    s.pilgred.progress = PILGRED_COMPLETE - 1;
    expect(must(applyAction(s, "p0", repair)).pilgred.progress).toBe(PILGRED_COMPLETE);
  });

  it("an illegal repair leaves the state unchanged", () => {
    const s = game("REFECTORY");
    const before = JSON.stringify(s);
    expect(applyAction(s, "p0", repair).ok).toBe(false);
    expect(JSON.stringify(s)).toBe(before);
  });

  it("parses from the wire, and rejects a missing terminal", () => {
    expect(parseGameMessage(JSON.stringify({ type: "action", action: repair }))).toEqual({ type: "action", action: repair });
    expect(parseGameMessage(JSON.stringify({ type: "action", action: { type: "repair_pilgred" } }))).toBeNull();
  });
});

describe("PILGRED visibility", () => {
  it("shows progress only to the living at the terminal, and never who repaired last", () => {
    const s = game();
    s.pilgred = { progress: 37, lastBy: "p1", streak: 3 };
    s.players[1]!.room = "REFECTORY";
    expect(viewFor(s, "p0").pilgred).toBe(37);
    expect(viewFor(s, "p1").pilgred).toBeNull();
    s.players[2]!.alive = false;
    expect(viewFor(s, "p2").pilgred).toBeNull();
    for (const id of ["p0", "p1", "p2"]) {
      const json = JSON.stringify(viewFor(s, id));
      expect(json).not.toContain("streak");
      expect(json).not.toContain("lastBy");
    }
  });

  it("tells everyone only whether it is repaired, which the crew-wide message already announces", () => {
    const s = game();
    s.players[1]!.room = "REFECTORY";
    s.players[2]!.alive = false;
    s.pilgred.progress = PILGRED_COMPLETE - 1;
    for (const id of ["p0", "p1", "p2"]) expect(viewFor(s, id).pilgredRepaired).toBe(false);
    s.pilgred.progress = PILGRED_COMPLETE;
    for (const id of ["p0", "p1", "p2"]) expect(viewFor(s, id).pilgredRepaired).toBe(true);
  });
});

describe("physicist skill", () => {
  it("grants 1 PILGRED point a day, capped at 2, and nothing to others or when picked", () => {
    let s = game();
    s = pickSkill(s, "p0", "physicist");
    expect(s.players[0]!.resources.pilgred).toBe(0);
    s = nextDay(s);
    expect(s.players[0]!.resources.pilgred).toBe(cfg.pointsPerDay);
    expect(s.players[1]!.resources.pilgred).toBe(0);
    s = nextDay(nextDay(s));
    expect(s.players[0]!.resources.pilgred).toBe(cfg.capPoints);
  });

  it("makes a repair free: one PILGRED point, no AP", () => {
    const s = game();
    s.players[0]!.resources.pilgred = 1;
    const ap = s.players[0]!.ap;
    const r = must(applyAction(s, "p0", repair));
    expect(r.players[0]!.resources.pilgred).toBe(0);
    expect(r.players[0]!.ap).toBe(ap);
    const paid = must(applyAction(r, "p0", repair));
    expect(paid.players[0]!.ap).toBe(ap - cfg.cost.ap);
  });
});

describe("return to Sol", () => {
  const COMMAND = "COMMAND_CENTER:PILOT_MODULE";
  const home: Action = { type: "return_to_sol", equipment: COMMAND };

  /** Everyone on the bridge, PILGRED repaired, p0 Commander. */
  function ready(): GameState {
    const s = game("COMMAND_CENTER");
    s.pilgred.progress = PILGRED_COMPLETE;
    s.titles.commander = "p0";
    for (const p of s.players) p.role = "human";
    return s;
  }

  it("pins the decided cost: 2 AP", () => {
    expect(cfg.returnCost.ap).toBe(2);
  });

  it("is offered to the Commander at the Command terminal once PILGRED is repaired, and costs AP", () => {
    const s = ready();
    expect(offered(s, "p0")).toContainEqual(home);
    expect(offered(s, "p1").some((a) => a.type === "return_to_sol")).toBe(false);
    const ap = s.players[0]!.ap;
    const r = must(applyAction(s, "p0", home));
    expect(r.players[0]!.ap).toBe(ap - cfg.returnCost.ap);
  });

  it("humans win when no Mush is alive, and the game ends at once with a ship-wide line", () => {
    const s = ready();
    s.players[2]!.role = "mush";
    s.players[2]!.alive = false;
    const r = must(applyAction(s, "p0", home));
    expect([r.phase, r.winner]).toEqual(["ended", "humans"]);
    expect(r.log.at(-1)).toMatchObject({ key: "returnedToSol", visibleTo: "all", params: { name: s.players[0]!.character } });
    expect(r.log.at(-1)).not.toHaveProperty("room");
    for (const id of ["p0", "p1", "p2"]) {
      const v = viewFor(r, id);
      expect([v.phase, v.winner]).toEqual(["ended", "humans"]);
    }
    // Someone elsewhere sees the line too.
    r.players[1]!.room = "REFECTORY";
    expect(viewFor(r, "p1").log.some((e) => e.key === "returnedToSol")).toBe(true);
  });

  it("Mush win when any Mush is alive, wherever they are", () => {
    const s = ready();
    s.players[2]!.role = "mush";
    s.players[2]!.room = "REFECTORY";
    expect(must(applyAction(s, "p0", home)).winner).toBe("mush");
  });

  it("a Mush Commander can return, and wins", () => {
    const s = ready();
    s.players[0]!.role = "mush";
    expect(must(applyAction(s, "p0", home)).winner).toBe("mush");
  });

  it("is refused before PILGRED is repaired, for a non-Commander, while the title is vacant, and away from the terminal", () => {
    const broken = ready();
    broken.pilgred.progress = PILGRED_COMPLETE - 1;
    expect(offered(broken, "p0").some((a) => a.type === "return_to_sol")).toBe(false);
    expect(applyAction(broken, "p0", home).ok).toBe(false);
    expect(applyAction(ready(), "p1", home).ok).toBe(false);
    const vacant = ready();
    vacant.titles.commander = null;
    for (const id of ["p0", "p1", "p2"]) expect(applyAction(vacant, id, home).ok).toBe(false);
    const away = ready();
    away.players[0]!.room = "MOTOR_ROOM";
    expect(applyAction(away, "p0", home).ok).toBe(false);
    const before = JSON.stringify(broken);
    applyAction(broken, "p0", home);
    expect(JSON.stringify(broken)).toBe(before);
  });

  it("nothing more happens after the game ends", () => {
    const r = must(applyAction(ready(), "p0", home));
    r.players[1]!.ap = r.config.maxAp;
    expect(offered(r, "p1")).toEqual([]);
    expect(applyAction(r, "p1", { type: "move", to: "CORRIDOR_A" }).ok).toBe(false);
    expect(newCycle(r).ok).toBe(false);
  });

  it("parses from the wire, and rejects a missing terminal", () => {
    expect(parseGameMessage(JSON.stringify({ type: "action", action: home }))).toEqual({ type: "action", action: home });
    expect(parseGameMessage(JSON.stringify({ type: "action", action: { type: "return_to_sol" } }))).toBeNull();
  });
});
