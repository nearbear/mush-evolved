import { describe, expect, it } from "vitest";
import { killPlayer } from "../src/death.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import { availableDisorders, disorderChances } from "../src/sanity.ts";
import type { GameConfig, GameState } from "../src/types.ts";
import { makeSeats, must, nextCycle, noCharacterModifiers, player, testConfig } from "./support.ts";

// Sanity (owner, 2026-11-25): starts at 100. A human's death costs every living player 1, those in the room 4 more,
// and the killer (fatal punch, attack or interrogation) 10 more, on top of being a witness. At the next cycle change a
// witness rolls (100 - sanity)%, a killer (100 - sanity) × 2%, and anyone under 5 morale rolls (100 - sanity)% every
// cycle change, one roll per condition, for a random disorder. Mush never develop disorders.
const base = noCharacterModifiers(testConfig({ mushCount: 0 }));
const { sanity } = base;

/** p0 and p1 share the sick bay with p2; p3 is in the refectory. Morale is kept clear of the low-morale roll. */
function ship(config: GameConfig = base, seed = 3): GameState {
  const s = createGame(makeSeats(4), config, seed);
  for (const id of ["p0", "p1", "p2"]) player(s, id).room = "SICK_BAY";
  player(s, "p3").room = "REFECTORY";
  for (const p of s.players) p.morale = config.maxMorale;
  return s;
}

const disorders = (s: GameState, id: string) => player(s, id).modifiers.filter((m) => base.diseases.allDisorders.includes(m));

describe("sanity", () => {
  it("pins the confirmed numbers", () => {
    expect([sanity.start, sanity.deathLoss, sanity.witnessLoss, sanity.killLoss, sanity.killChanceFactor, sanity.lowMorale]).toEqual([100, 1, 4, 10, 2, 5]);
    expect(player(ship(), "p0").sanity).toBe(sanity.start);
  });

  it("pins the disorder thresholds (owner, 2026-11-28)", () => {
    expect(sanity.disorderThresholds).toEqual({
      depression_disorder: 100, agoraphobia_disorder: 100, scopophobia_disorder: 100, kleptophobia_disorder: 95,
      aquaphobia_disorder: 95, kinesiophobia_disorder: 95, pyromania_disorder: 85, sud_disorder: 85,
    });
  });

  it("only disorders whose threshold is above the player's sanity can be gained", () => {
    const s = ship();
    const p0 = player(s, "p0");
    const below = (value: number) => base.diseases.allDisorders.filter((d) => sanity.disorderThresholds[d]! > value).sort();
    for (const value of [100, 99, 95, 90, 85, 84, 0]) {
      p0.sanity = value;
      expect(availableDisorders(s, p0).sort()).toEqual(below(value));
    }
    p0.sanity = 95;
    expect(availableDisorders(s, p0).sort()).toEqual(["agoraphobia_disorder", "depression_disorder", "scopophobia_disorder"]);
    p0.sanity = 85;
    expect(availableDisorders(s, p0)).not.toContain("sud_disorder");
    expect(availableDisorders(s, p0)).not.toContain("pyromania_disorder");
  });

  it("a successful roll draws only from the disorders the player's sanity allows", () => {
    let gained = 0;
    for (let seed = 1; seed <= 20; seed++) {
      let s = ship(base, seed);
      const p0 = player(s, "p0");
      p0.sanity = 90;
      p0.morale = 1;
      const allowed = availableDisorders(s, p0);
      for (let i = 0; i < 10; i++) s = nextCycle(s);
      gained += disorders(s, "p0").length;
      for (const d of disorders(s, "p0")) expect(allowed).toContain(d);
    }
    expect(gained).toBeGreaterThan(0);
  });

  it("a human's death costs everyone 1, witnesses 4 more and the killer 10 more", () => {
    const s = ship();
    killPlayer(s, player(s, "p1"), "assassinated", player(s, "p0"));
    expect(player(s, "p0").sanity).toBe(sanity.start - sanity.deathLoss - sanity.witnessLoss - sanity.killLoss);
    expect(player(s, "p2").sanity).toBe(sanity.start - sanity.deathLoss - sanity.witnessLoss);
    expect(player(s, "p3").sanity).toBe(sanity.start - sanity.deathLoss);
    expect([player(s, "p0").witnessedDeath, player(s, "p0").killedHuman]).toEqual([true, true]);
    expect([player(s, "p2").witnessedDeath, player(s, "p2").killedHuman]).toEqual([true, undefined]);
    expect([player(s, "p3").witnessedDeath, player(s, "p3").killedHuman]).toEqual([undefined, undefined]);
  });

  it("a death with no killer marks only the witnesses", () => {
    const s = ship();
    killPlayer(s, player(s, "p1"), "starvation");
    expect(player(s, "p0").sanity).toBe(sanity.start - sanity.deathLoss - sanity.witnessLoss);
    expect(s.players.some((p) => p.killedHuman)).toBe(false);
  });

  it("a Mush's death costs no sanity, and sanity never drops below 0", () => {
    const s = ship();
    player(s, "p1").role = "mush";
    killPlayer(s, player(s, "p1"), "assassinated", player(s, "p0"));
    expect(player(s, "p0").sanity).toBe(sanity.start);
    const t = ship();
    player(t, "p0").sanity = 2;
    killPlayer(t, player(t, "p1"), "assassinated", player(t, "p0"));
    expect(player(t, "p0").sanity).toBe(0);
  });

  it("a fatal punch names its thrower as the killer", () => {
    const s = ship({ ...base, punch: { ...base.punch, successChance: 1, crit: { chance: 0, damage: [2, 3] } } });
    player(s, "p1").hp = 1;
    const after = must(applyAction(s, "p0", { type: "punch", target: "p1" }));
    expect(player(after, "p1").alive).toBe(false);
    expect(player(after, "p0").killedHuman).toBe(true);
    expect(player(after, "p0").sanity).toBe(sanity.start - sanity.deathLoss - sanity.witnessLoss - sanity.killLoss);
  });

  it("one chance per condition: witness, killer (doubled) and low morale", () => {
    const s = ship();
    const p = player(s, "p0");
    p.sanity = 70;
    expect(disorderChances(s, p)).toEqual([]);
    p.witnessedDeath = true;
    p.killedHuman = true;
    p.morale = sanity.lowMorale - 1;
    expect(disorderChances(s, p)).toEqual([0.3, 0.3 * sanity.killChanceFactor, 0.3]);
    p.morale = sanity.lowMorale;
    expect(disorderChances(s, p)).toHaveLength(2);
  });

  it("a witness at 0 sanity develops a disorder at the next cycle change, privately, and the marks clear", () => {
    let s = ship();
    player(s, "p2").sanity = 0;
    player(s, "p2").witnessedDeath = true;
    player(s, "p0").witnessedDeath = true; // at full sanity: no chance
    s = nextCycle(s);
    expect(disorders(s, "p2")).toHaveLength(1);
    expect(disorders(s, "p0")).toEqual([]);
    expect(s.players.some((p) => p.witnessedDeath || p.killedHuman)).toBe(false);
    expect(viewFor(s, "p2").log.some((l) => l.key === "disorderGained")).toBe(true);
    for (const other of ["p0", "p1", "p3"]) expect(viewFor(s, other).log.some((l) => l.key === "disorderGained")).toBe(false);
  });

  it("low morale rolls at every cycle change, with no death needed", () => {
    let s = ship();
    player(s, "p0").sanity = 0;
    player(s, "p0").morale = sanity.lowMorale - 1;
    s = nextCycle(s);
    expect(disorders(s, "p0")).toHaveLength(1);
  });

  it("a Mush never develops a disorder", () => {
    let s = ship();
    const p = player(s, "p0");
    p.role = "mush";
    p.sanity = 0;
    p.witnessedDeath = p.killedHuman = true;
    p.morale = 0;
    s = nextCycle(s);
    expect(disorders(s, "p0")).toEqual([]);
    expect(player(s, "p0").killedHuman).toBeUndefined();
  });

  it("sanity and the marks are in your own view only", () => {
    const s = ship();
    killPlayer(s, player(s, "p1"), "assassinated", player(s, "p0"));
    expect(viewFor(s, "p0").you).toMatchObject({ sanity: player(s, "p0").sanity, killedHuman: true, witnessedDeath: true });
    const seen = JSON.stringify(viewFor(s, "p2").players);
    expect(seen).not.toContain("sanity");
    expect(seen).not.toContain("killedHuman");
    expect(seen).not.toContain("witnessedDeath");
  });
});
