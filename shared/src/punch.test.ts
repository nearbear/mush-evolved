import { describe, expect, it } from "vitest";
import { CHARACTERS } from "./characters.ts";
import { DEFAULT_CONFIG } from "./config.ts";
import { parseGameMessage } from "./protocol.ts";
import { applyAction, createGame, viewFor } from "./rules.ts";
import type { Action, GameConfig, GameState, PlayerId, Seat } from "./types.ts";

const seats: Seat[] = Array.from({ length: 3 }, (_, i) => ({ id: `p${i}`, name: `Player ${i}`, isBot: false, character: CHARACTERS[i]!.id }));
const base = { ...DEFAULT_CONFIG, mushCount: 1, startInventory: [], startItems: [], startSkills: [] };
const player = (s: GameState, id: PlayerId) => s.players.find((p) => p.id === id)!;
const punch = (target: PlayerId): Action => ({ type: "punch", target });

/** p0 and p1 share a room; p2 is elsewhere. */
function ship(config: GameConfig = base, seed = 3): GameState {
  const s = createGame(seats, config, seed);
  player(s, "p0").room = player(s, "p1").room = "SICK_BAY";
  player(s, "p2").room = "REFECTORY";
  return s;
}

describe("punch", () => {
  it("defaults to 1 AP, 2 damage and a 40% miss chance", () => {
    expect([base.punchAp, base.punchDamage, base.punchMissOdds]).toEqual([1, 2, 0.4]);
  });

  it("a hit costs 1 AP, deals 2 damage and is public", () => {
    const s = ship({ ...base, punchMissOdds: 0 });
    const r = applyAction(s, "p0", punch("p1"));
    if (!r.ok) throw new Error(r.error);
    expect(player(r.state, "p1").hp).toBe(base.startHp - 2);
    expect(player(r.state, "p0").ap).toBe(base.startAp - 1);
    expect(viewFor(r.state, "p1").log.some((e) => e.key === "punched")).toBe(true);
  });

  it("a miss still costs the AP, deals no damage and is public", () => {
    const s = ship({ ...base, punchMissOdds: 1 });
    const r = applyAction(s, "p0", punch("p1"));
    if (!r.ok) throw new Error(r.error);
    expect(player(r.state, "p1").hp).toBe(base.startHp);
    expect(player(r.state, "p0").ap).toBe(base.startAp - 1);
    expect(viewFor(r.state, "p1").log.some((e) => e.key === "punchMissed")).toBe(true);
  });

  it("misses about 40% of the time", () => {
    let misses = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const r = applyAction(ship(base, seed), "p0", punch("p1"));
      if (r.ok && player(r.state, "p1").hp === base.startHp) misses++;
    }
    expect(misses / 300).toBeGreaterThan(0.3);
    expect(misses / 300).toBeLessThan(0.5);
  });

  it("a hit to 0 HP kills", () => {
    const s = ship({ ...base, punchMissOdds: 0 });
    player(s, "p1").hp = 1;
    const r = applyAction(s, "p0", punch("p1"));
    if (!r.ok) throw new Error(r.error);
    expect(player(r.state, "p1").hp).toBe(0);
    expect(player(r.state, "p1").alive).toBe(false);
  });

  it("only targets living others in your room; illegal punches leave state unchanged", () => {
    const s = ship();
    const v = viewFor(s, "p0").legalActions.filter((a) => a.type === "punch");
    expect(v).toEqual([punch("p1")]);
    for (const t of ["p0", "p2"]) expect(applyAction(s, "p0", punch(t)).ok).toBe(false);
    player(s, "p1").alive = false;
    expect(applyAction(s, "p0", punch("p1")).ok).toBe(false);
    player(s, "p1").alive = true;
    player(s, "p0").ap = 0;
    expect(applyAction(s, "p0", punch("p1")).ok).toBe(false);
    expect(player(s, "p1").hp).toBe(base.startHp);
  });

  it("is not leaked to other rooms", () => {
    const s = ship({ ...base, punchMissOdds: 0 });
    const r = applyAction(s, "p0", punch("p1"));
    if (!r.ok) throw new Error(r.error);
    expect(JSON.stringify(viewFor(r.state, "p2"))).not.toContain("punch");
  });

  it("parses from client input", () => {
    expect(parseGameMessage(JSON.stringify({ type: "action", action: { type: "punch", target: "p1" } }))).toEqual({ type: "action", action: punch("p1") });
  });
});
