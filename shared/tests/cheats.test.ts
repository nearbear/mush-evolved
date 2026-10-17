import { describe, expect, it } from "vitest";
import { CHEATS, type Cheat } from "../src/cheats.ts";
import { CHARACTERS } from "../src/characters.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { parseGameMessage } from "../src/protocol.ts";
import { applyInput, replayGame, type Input } from "../src/replay.ts";
import { applyAction, createGame, setActopiCheat, setCheat, setRoleCheat, viewFor } from "../src/rules.ts";
import type { GameState, PlayerId, Seat } from "../src/types.ts";

const seats: Seat[] = Array.from({ length: 3 }, (_, i) => ({ id: `p${i}`, name: `Player ${i}`, isBot: false, character: CHARACTERS[i]!.id }));
const fresh = () => createGame(seats, DEFAULT_CONFIG, 7);
const cfg = DEFAULT_CONFIG;

function cheat(state: GameState, id: PlayerId, c: Cheat, on = true): GameState {
  const r = setCheat(state, id, c, on);
  if (!r.ok) throw new Error(r.error);
  return r.state;
}
const player = (s: GameState, id: PlayerId) => s.players.find((p) => p.id === id)!;
const walk = (s: GameState, id: PlayerId, to: string) => {
  const r = applyAction(s, id, { type: "move", to });
  if (!r.ok) throw new Error(r.error);
  return r.state;
};

describe("cheats", () => {
  it("are off by default", () => {
    expect(fresh().players.every((p) => p.cheats.length === 0)).toBe(true);
  });

  it("infinite AP and MP: a move costs nothing and the bars stay full", () => {
    let s = cheat(cheat(fresh(), "p0", "infiniteAp"), "p0", "infiniteMp");
    expect(player(s, "p0")).toMatchObject({ ap: cfg.maxAp, mp: cfg.movement.mpCap });
    const door = viewFor(s, "p0").legalActions.find((a) => a.type === "move")!;
    s = walk(s, "p0", door.type === "move" ? door.to : "");
    expect(player(s, "p0")).toMatchObject({ ap: cfg.maxAp, mp: cfg.movement.mpCap });
  });

  it("without the cheat, the same move spends points", () => {
    const door = viewFor(fresh(), "p0").legalActions.find((a) => a.type === "move")!;
    const s = walk(fresh(), "p0", door.type === "move" ? door.to : "");
    expect(player(s, "p0").ap).toBeLessThan(cfg.startAp);
  });

  it("infinite morale and HP hold through a day change", () => {
    let s = cheat(cheat(fresh(), "p0", "infiniteMorale"), "p0", "infiniteHp");
    expect(player(s, "p0")).toMatchObject({ morale: cfg.maxMorale, hp: cfg.maxHp });
    s.cycle = cfg.cyclesPerDay; // the next cycle starts a day, which costs morale
    for (const p of seats) s = applyOk(s, p.id);
    expect(s.cycle).toBe(cfg.cyclesPerDay + 1);
    expect(player(s, "p0").morale).toBe(cfg.maxMorale);
    expect(player(s, "p1").morale).toBe(cfg.startMorale - cfg.moralePerDay);
  });

  it("are per player and can be switched off", () => {
    let s = cheat(fresh(), "p0", "infiniteAp");
    expect(player(s, "p1").cheats).toEqual([]);
    s = cheat(s, "p0", "infiniteAp", false);
    expect(player(s, "p0").cheats).toEqual([]);
  });

  it("only ever appear in your own view", () => {
    const s = cheat(fresh(), "p0", "infiniteHp");
    expect(viewFor(s, "p0").you.cheats).toEqual(["infiniteHp"]);
    expect(JSON.stringify(viewFor(s, "p1"))).not.toContain("infiniteHp");
  });

  it("replay to the same state", () => {
    const setup = { seats, config: cfg, seed: 7, rulesVersion: "test" };
    const inputs: Input[] = [{ type: "cheat", cheat: "infiniteAp", on: true, by: "p0" }];
    expect(applyInput(fresh(), inputs[0]!).ok).toBe(true);
    expect(player(replayGame(setup, inputs), "p0").cheats).toEqual(["infiniteAp"]);
  });

  it("are parsed from the wire, and junk is rejected", () => {
    for (const c of CHEATS) {
      expect(parseGameMessage(JSON.stringify({ type: "cheat", cheat: c, on: true }))).toEqual({ type: "cheat", cheat: c, on: true });
    }
    expect(parseGameMessage(JSON.stringify({ type: "cheat", cheat: "godMode", on: true }))).toBeNull();
    expect(parseGameMessage(JSON.stringify({ type: "cheat", cheat: "infiniteAp", on: "yes" }))).toBeNull();
  });
});

function applyOk(s: GameState, id: PlayerId): GameState {
  const r = applyAction(s, id, { type: "ready" });
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

describe("ACTOPI cheat", () => {
  const apart = () => {
    const s = fresh();
    s.players[1]!.room = "REFECTORY";
    return s;
  };
  const set = (s: GameState, mode: "default" | "on" | "off") => {
    const r = setActopiCheat(s, "p0", mode);
    if (!r.ok) throw new Error(r.error);
    return r.state;
  };

  it("does nothing by default", () => {
    expect(viewFor(apart(), "p0").unidentified).toEqual([]);
    expect(viewFor(set(apart(), "default"), "p0").unidentified).toEqual([]);
  });

  it("forces ACTOPI off for you only, even while the ship has it on", () => {
    const s = set(apart(), "off");
    expect(s.actopi).toBe(true);
    expect(viewFor(s, "p0").unidentified).toEqual(["REFECTORY"]);
    expect(viewFor(s, "p2").unidentified).toEqual([]);
  });

  it("forces ACTOPI on for you while the ship has it off", () => {
    const s = apart();
    s.actopi = false;
    expect(viewFor(s, "p0").unidentified).toEqual(["REFECTORY"]);
    const forced = set(s, "on");
    expect(viewFor(forced, "p0").unidentified).toEqual([]);
    expect(viewFor(forced, "p0").players.find((p) => p.id === "p1")!.room).toBe("REFECTORY");
    expect(viewFor(forced, "p2").unidentified).toEqual(["REFECTORY"]);
  });

  it("parses, rejects junk, and replays", () => {
    expect(parseGameMessage(JSON.stringify({ type: "actopiCheat", mode: "off" }))).toEqual({ type: "actopiCheat", mode: "off" });
    expect(parseGameMessage(JSON.stringify({ type: "actopiCheat", mode: "maybe" }))).toBeNull();
    const setup = { seats, config: cfg, seed: 7, rulesVersion: "test" };
    const inputs: Input[] = [{ type: "actopiCheat", mode: "off", by: "p0" }];
    expect(player(replayGame(setup, inputs), "p0").actopiCheat).toBe("off");
  });
});

describe("spores and role cheats", () => {
  const mushId = () => fresh().players.find((p) => p.role === "mush")!.id;
  const humanId = () => fresh().players.find((p) => p.role === "human")!.id;

  it("infinite spores keeps a Mush stocked after spending, and does nothing for a human", () => {
    const m = mushId();
    const s = cheat(cheat(fresh(), m, "infiniteSpores"), humanId(), "infiniteSpores");
    expect(player(s, m).spores).toBeGreaterThan(50);
    expect(player(s, humanId()).spores).toBe(0);
  });

  it("role cheats switch at once, both ways, and are parsed from the wire", () => {
    const h = humanId();
    let r = setRoleCheat(fresh(), h, "mush");
    if (!r.ok) throw new Error(r.error);
    expect(player(r.state, h).role).toBe("mush");
    r = setRoleCheat(r.state, h, "human");
    if (!r.ok) throw new Error(r.error);
    expect(player(r.state, h)).toMatchObject({ role: "human", spores: 0 });
    expect(parseGameMessage(JSON.stringify({ type: "roleCheat", role: "mush" }))).toEqual({ type: "roleCheat", role: "mush" });
    expect(parseGameMessage(JSON.stringify({ type: "roleCheat", role: "god" }))).toBeNull();
  });
});
