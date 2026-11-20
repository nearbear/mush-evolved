import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { applyAction, createGame, setCheat, viewFor } from "../src/rules.ts";
import type { GameState, PlayerId } from "../src/types.ts";
import { clone, makeSeats, mustApply, nextCycle, noHunters, noIncidents, option, player } from "./support.ts";

// Raluca's Antisocial trait (owner, 2026-11-19, #470). Seats: p0 is the Antisocial one (human), p1 human, p2 Mush,
// p3 human; p0 alone in the laboratory, everyone else in the refectory. No incidents: a panic attack would move morale.
const config = noIncidents(noHunters({ ...DEFAULT_CONFIG, mushCount: 1, startInventory: [], startItems: [] }));
function ship(): GameState {
  const s = createGame(makeSeats(4), config, 5);
  for (const p of s.players) {
    p.role = p.id === "p2" ? "mush" : "human";
    p.room = p.id === "p0" ? "LABORATORY" : "REFECTORY";
    p.morale = 8;
  }
  player(s, "p0").modifiers.push("antisocial");
  return s;
}

/** Morale p0 lost to the trait over one cycle change: the same state without the trait is the baseline. */
function lost(s: GameState): number {
  const plain = clone(s);
  player(plain, "p0").modifiers = player(plain, "p0").modifiers.filter((m) => m !== "antisocial");
  return player(nextCycle(plain), "p0").morale - player(nextCycle(s), "p0").morale;
}
const join = (s: GameState, ...ids: PlayerId[]) => {
  for (const id of ids) player(s, id).room = player(s, "p0").room;
  return s;
};

describe("Antisocial (Raluca)", () => {
  it("is Raluca's and costs 1 morale", () => {
    expect(config.characterModifiers.raluca).toEqual(["antisocial"]);
    expect(config.antisocial.moraleLoss).toBe(1);
  });

  it("costs nothing alone, and the same 1 with one or two roommates", () => {
    expect(lost(ship())).toBe(0);
    expect(lost(join(ship(), "p1"))).toBe(config.antisocial.moraleLoss);
    expect(lost(join(ship(), "p1", "p3"))).toBe(config.antisocial.moraleLoss);
  });

  it("counts a Mush roommate, but not a corpse", () => {
    expect(lost(join(ship(), "p2"))).toBe(config.antisocial.moraleLoss);
    const s = join(ship(), "p1");
    player(s, "p1").alive = false;
    expect(lost(s)).toBe(0);
  });

  it("counts crew aboard the Icarus with her", () => {
    const s = ship();
    player(s, "p0").room = "ICARUS";
    expect(lost(join(s, "p1"))).toBe(config.antisocial.moraleLoss);
  });

  it("costs a Mush Raluca the same", () => {
    const s = join(ship(), "p1");
    player(s, "p0").role = "mush";
    player(s, "p2").role = "human";
    expect(lost(s)).toBe(config.antisocial.moraleLoss);
  });

  it("costs nothing while the ship is invincible", () => {
    const r = setCheat(join(ship(), "p1"), "p0", "invincible", true);
    if (!r.ok) throw new Error(r.error);
    expect(lost(r.state)).toBe(0);
  });

  it("logs a private line only she sees", () => {
    const s = nextCycle(join(ship(), "p1"));
    expect(viewFor(s, "p0").log.some((e) => e.key === "antisocialMoraleLoss" && e.params?.amount === config.antisocial.moraleLoss)).toBe(true);
    expect(viewFor(s, "p0").log.some((e) => e.key === "loseMorale")).toBe(false);
    for (const id of ["p1", "p2", "p3"]) expect(viewFor(s, id).log.some((e) => e.key === "antisocialMoraleLoss")).toBe(false);
  });

  it("brought to 0 she is Hopeless, and dies only at the next cycle change", () => {
    const s0 = join(ship(), "p1");
    player(s0, "p0").morale = config.antisocial.moraleLoss;
    const s = nextCycle(s0);
    expect(player(s, "p0").morale).toBe(0);
    expect(player(s, "p0").alive).toBe(true);
    expect(viewFor(s, "p0").statuses).toContain("hopeless");
    expect(player(nextCycle(s), "p0").alive).toBe(false);
  });

  it("is a public trait status", () => {
    const s = join(ship(), "p1");
    expect(viewFor(s, "p0").statuses).toContain("antisocial");
    expect(viewFor(s, "p1").players.find((p) => p.id === "p0")!.statuses).toContain("antisocial");
  });

  it("can't Bond: offered disabled with the reason, refused if sent; others can still Bond with her", () => {
    const s = join(ship(), "p1");
    expect(option(s, "p0", { type: "bond", target: "p1" })?.lacks).toEqual(["antisocial"]);
    const refused = applyAction(s, "p0", { type: "bond", target: "p1" });
    expect(refused.ok).toBe(false);
    expect(viewFor(mustApply(s, "p1", { type: "bond", target: "p0" }), "p1").bonds.to).toEqual(["p0"]);
  });
});
