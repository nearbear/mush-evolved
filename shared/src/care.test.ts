import { describe, expect, it } from "vitest";
import { CHARACTERS } from "./characters.ts";
import { DEFAULT_CONFIG } from "./config.ts";
import { applyAction, createGame, viewFor } from "./rules.ts";
import type { Action, GameState, PlayerId, Seat } from "./types.ts";

const seats: Seat[] = Array.from({ length: 3 }, (_, i) => ({ id: `p${i}`, name: `Player ${i}`, isBot: false, character: CHARACTERS[i]!.id }));
const config = { ...DEFAULT_CONFIG, mushCount: 1, startInventory: [], startItems: [], startSkills: [] };
const player = (s: GameState, id: PlayerId) => s.players.find((p) => p.id === id)!;
const heal = (target: PlayerId): Action => ({ type: "heal", target });

function mustApply(s: GameState, id: PlayerId, a: Action): GameState {
  const r = applyAction(s, id, a);
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

/** Plays through to the start of the next day. */
function nextDay(s: GameState): GameState {
  const day = Math.floor((s.cycle - 1) / config.cyclesPerDay);
  while (Math.floor((s.cycle - 1) / config.cyclesPerDay) === day) for (const p of s.players) s = mustApply(s, p.id, { type: "ready" });
  return s;
}

/** Everyone is hurt in one room that is not the sick bay; p0 is a medic holding a medikit. */
function ward(): GameState {
  const s = createGame(seats, { ...config, startSkills: [] }, 3);
  player(s, "p0").skills = ["medic"];
  s.players.forEach((p) => {
    p.room = "LABORATORY";
    p.hp = 5;
  });
  s.items.push({ id: "kit", type: "medikit", at: { kind: "player", id: "p0" } });
  return s;
}

describe("medic skill", () => {
  it("grants 2 care points at game start and 2 more each day, stacking", () => {
    const s = createGame(seats, { ...config, startSkills: ["medic"] }, 3);
    expect(player(s, "p0").resources.heal).toBe(2);
    const d2 = nextDay(s);
    expect(player(d2, "p0").resources.heal).toBe(4);
  });

  it("gives nothing to players without the skill", () => {
    const s = nextDay(createGame(seats, config, 3));
    expect(player(s, "p1").resources.heal).toBe(0);
  });

  it("makes a heal free and spends one care point, on others and on yourself", () => {
    let s = ward();
    player(s, "p0").resources.heal = 2;
    s = mustApply(s, "p0", heal("p1"));
    expect(player(s, "p1").hp).toBe(8);
    expect(player(s, "p0").ap).toBe(config.startAp);
    expect(player(s, "p0").resources.heal).toBe(1);
    s = mustApply(s, "p0", heal("p0"));
    expect(player(s, "p0").ap).toBe(config.startAp);
    expect(player(s, "p0").resources.heal).toBe(0);
    s = mustApply(s, "p0", heal("p1"));
    expect(player(s, "p0").ap).toBe(config.startAp - 2);
  });

  it("still needs a medikit or the sick bay", () => {
    const s = ward();
    player(s, "p0").resources.heal = 2;
    s.items[0]!.at = { kind: "room", id: "LABORATORY" };
    expect(applyAction(s, "p0", heal("p1")).ok).toBe(false);
  });

  it("lets care points be spent by anyone who has them, with no skill check at heal time", () => {
    const s = ward();
    player(s, "p1").resources.heal = 1;
    s.items.push({ id: "kit2", type: "medikit", at: { kind: "player", id: "p1" } });
    const r = mustApply(s, "p1", heal("p2"));
    expect(player(r, "p1").ap).toBe(config.startAp);
  });
});

describe("healing in the sick bay", () => {
  function bay(): GameState {
    const s = ward();
    s.items = [];
    s.players.forEach((p) => {
      p.room = "SICK_BAY";
    });
    return s;
  }

  it("works without a medikit, for anyone, at the normal AP cost", () => {
    const s = mustApply(bay(), "p1", heal("p2"));
    expect(player(s, "p2").hp).toBe(8);
    expect(player(s, "p1").ap).toBe(config.startAp - 2);
    const self = mustApply(bay(), "p1", heal("p1"));
    expect(player(self, "p1").ap).toBe(config.startAp - 3);
  });

  it("is not offered outside the sick bay without a medikit", () => {
    const s = bay();
    s.players.forEach((p) => {
      p.room = "LABORATORY";
    });
    expect(viewFor(s, "p1").legalActions.some((a) => a.type === "heal")).toBe(false);
    expect(applyAction(s, "p1", heal("p2")).ok).toBe(false);
  });

  it("uses a care point when one is held", () => {
    const s = bay();
    player(s, "p0").resources.heal = 1;
    const r = mustApply(s, "p0", heal("p1"));
    expect(player(r, "p0").ap).toBe(config.startAp);
    expect(player(r, "p0").resources.heal).toBe(0);
  });

  it("keeps other players' care points out of their views", () => {
    const s = ward();
    player(s, "p0").resources.heal = 2;
    expect(viewFor(s, "p0").you.resources.heal).toBe(2);
    const other = viewFor(s, "p1");
    expect(other.you.resources.heal).toBe(0);
    expect(JSON.stringify(other.players)).not.toContain("resources");
    expect(JSON.stringify(other.players)).not.toContain("medic");
  });
});
