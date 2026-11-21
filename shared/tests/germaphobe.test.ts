import { describe, expect, it } from "vitest";
import { createGame, setCheat, viewFor } from "../src/rules.ts";
import { overheadStatuses } from "../src/statuses.ts";
import type { GameState } from "../src/types.ts";
import { clone, makeSeats, nextCycle, player, testConfig } from "./support.ts";

// Finola's Germaphobe trait (owner, 2026-11-21). Seats: p0 is Finola (human), p1 human in the same room,
// p2 Mush in another room. No incidents: a panic attack would move morale.
const config = testConfig();
function ship(): GameState {
  const s = createGame(makeSeats(3), config, 5);
  for (const p of s.players) {
    p.role = p.id === "p2" ? "mush" : "human";
    p.room = p.id === "p2" ? "REFECTORY" : "LABORATORY";
    p.morale = 8;
  }
  player(s, "p0").modifiers.push("germaphobe");
  return s;
}

/** Morale p0 lost to the trait over one cycle change: the same state without the trait is the baseline. */
function lost(s: GameState): number {
  const plain = clone(s);
  player(plain, "p0").modifiers = player(plain, "p0").modifiers.filter((m) => m !== "germaphobe");
  return player(nextCycle(plain), "p0").morale - player(nextCycle(s), "p0").morale;
}

describe("Germaphobe (Finola)", () => {
  it("is Finola's and costs 1 morale while dirty", () => {
    expect(config.characterModifiers.finola).toEqual(["germaphobe"]);
    expect(config.germaphobe.moraleLoss).toBe(1);
  });

  it("costs nothing while clean, and 1 morale while dirty", () => {
    expect(lost(ship())).toBe(0);
    const s = ship();
    player(s, "p0").statuses.push("dirty");
    expect(lost(s)).toBe(config.germaphobe.moraleLoss);
  });

  it("costs a Mush Finola the same while dirty, and nothing if dead", () => {
    const mush = ship();
    player(mush, "p0").role = "mush";
    player(mush, "p2").role = "human";
    player(mush, "p0").statuses.push("dirty");
    expect(lost(mush)).toBe(config.germaphobe.moraleLoss);

    const dead = ship();
    player(dead, "p0").statuses.push("dirty");
    player(dead, "p0").alive = false;
    expect(lost(dead)).toBe(0);
  });

  it("costs nothing while the ship is invincible", () => {
    const s = ship();
    player(s, "p0").statuses.push("dirty");
    const r = setCheat(s, "p0", "invincible", true);
    if (!r.ok) throw new Error(r.error);
    expect(lost(r.state)).toBe(0);
  });

  it("logs a private line only she sees", () => {
    const s0 = ship();
    player(s0, "p0").statuses.push("dirty");
    const s = nextCycle(s0);
    expect(viewFor(s, "p0").log.some((e) => e.key === "germaphobeMoraleLoss" && e.params?.amount === config.germaphobe.moraleLoss)).toBe(true);
    expect(viewFor(s, "p0").log.some((e) => e.key === "loseMorale")).toBe(false);
    for (const id of ["p1", "p2"]) expect(viewFor(s, id).log.some((e) => e.key === "germaphobeMoraleLoss")).toBe(false);
  });

  it("brought to 0 she is Hopeless, and dies only at the next cycle change", () => {
    const s0 = ship();
    player(s0, "p0").statuses.push("dirty");
    player(s0, "p0").morale = config.germaphobe.moraleLoss;
    const s = nextCycle(s0);
    expect(player(s, "p0").morale).toBe(0);
    expect(player(s, "p0").alive).toBe(true);
    expect(viewFor(s, "p0").statuses).toContain("hopeless");
    expect(player(nextCycle(s), "p0").alive).toBe(false);
  });

  it("is a public trait status (Inspect-only in the room, not overhead)", () => {
    const s = ship();
    expect(viewFor(s, "p0").statuses).toContain("germaphobe");
    expect(viewFor(s, "p1").players.find((p) => p.id === "p0")!.statuses).toContain("germaphobe");
    expect(viewFor(s, "p2").players.find((p) => p.id === "p0")!.statuses).toEqual([]);
    expect(overheadStatuses(viewFor(s, "p0").statuses)).not.toContain("germaphobe");
  });
});
