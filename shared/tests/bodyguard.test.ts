import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { killPlayer } from "../src/death.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import { queueAction, tick } from "../src/queue.ts";
import type { Action, GameState } from "../src/types.ts";
import { costOf, makeSeats, must, mustApply, offered, player, pickSkill, testConfig } from "./support.ts";

const base = testConfig({ startMp: 10 });
const protect = (target: string): Action => ({ type: "protect", target });

/** p0 is a Bodyguard; p0, p1 and p3 share the sick bay, p2 is in the refectory. */
function ship(config = base): GameState {
  const s = createGame(makeSeats(4), config, 3);
  player(s, "p0").room = player(s, "p1").room = player(s, "p3").room = "SICK_BAY";
  player(s, "p2").room = "REFECTORY";
  return pickSkill(s, "p0", "bodyguard");
}

describe("Bodyguard skill and Protect action", () => {
  it("pins the config numbers", () => {
    expect(DEFAULT_CONFIG.bodyguard.cost.ap).toBe(1);
    expect(DEFAULT_CONFIG.bodyguard.aggressiveApSurcharge).toBe(2);
    expect(DEFAULT_CONFIG.bodyguard.guardApDiscount).toBe(1);
  });

  it("discounts Guard by 1 AP (free) for a Bodyguard and stacks with Pacifist", () => {
    const s = ship();
    const discounted = Math.max(0, base.guard.cost.ap - base.bodyguard.guardApDiscount);
    expect(costOf(s, "p0", { type: "guard" })!.ap).toBe(discounted);
    expect(costOf(s, "p1", { type: "guard" })!.ap).toBe(base.guard.cost.ap);

    // Bodyguard can Guard even at 0 AP and spends 0 AP.
    player(s, "p0").ap = 0;
    const guarded = mustApply(s, "p0", { type: "guard" });
    expect(player(guarded, "p0").ap).toBe(0);
    expect(player(guarded, "p0").statuses).toContain("guardian");

    // Stacks with Pacifist in the room (discounted guard + Pacifist surcharge).
    const withPacifist = ship();
    player(withPacifist, "p3").modifiers.push("pacifist");
    expect(costOf(withPacifist, "p0", { type: "guard" })!.ap).toBe(discounted + base.pacifist.aggressiveApSurcharge);
    expect(costOf(withPacifist, "p1", { type: "guard" })!.ap).toBe(base.guard.cost.ap + base.pacifist.aggressiveApSurcharge);
  });

  it("is offered only to a Bodyguard, for unprotected living roommates, never in preselection", () => {
    const s = ship();
    expect(offered(s, "p0").filter((a) => a.type === "protect")).toEqual([protect("p1"), protect("p3")]);
    expect(offered(s, "p1").some((a) => a.type === "protect")).toBe(false);

    // Illegal attempts leave state unchanged.
    for (const [actor, target] of [
      ["p1", "p3"],
      ["p0", "p2"],
      ["p0", "p0"],
    ] as const) {
      const r = applyAction(s, actor, protect(target));
      expect(r.ok).toBe(false);
      expect(s).toEqual(ship());
    }

    // Never in preselection.
    const pre = { ...s, preselection: true };
    expect(offered(pre, "p0").some((a) => a.type === "protect")).toBe(false);
    expect(applyAction(pre, "p0", protect("p1")).ok).toBe(false);

    // Also works when learned from a book.
    const withBook = createGame(makeSeats(4), base, 3);
    player(withBook, "p0").room = player(withBook, "p1").room = "SICK_BAY";
    player(withBook, "p0").bookSkill = "bodyguard";
    expect(offered(withBook, "p0").some((a) => a.type === "protect" && a.target === "p1")).toBe(true);
  });

  it("costs 1 AP, sets public statuses and relation in the room, logs publicly, and hides from other rooms", () => {
    const s = ship();
    const ap = player(s, "p0").ap;
    const next = mustApply(s, "p0", protect("p1"));
    expect(player(next, "p0").ap).toBe(ap - base.bodyguard.cost.ap);
    expect(player(next, "p1").protectedBy).toBe("p0");

    // Own views
    const v0 = viewFor(next, "p0");
    expect(v0.statuses).toContain("protecting");
    expect(v0.you.protecting).toBe("p1");
    expect(v0.players.find((o) => o.id === "p1")?.statuses).toContain("protected");
    expect(v0.players.find((o) => o.id === "p1")?.protectedBy).toBe("p0");

    const v1 = viewFor(next, "p1");
    expect(v1.statuses).toContain("protected");
    expect(v1.you.protectedBy).toBe("p0");
    expect(v1.players.find((o) => o.id === "p0")?.statuses).toContain("protecting");
    expect(v1.players.find((o) => o.id === "p0")?.protecting).toBe("p1");

    // Roommate view
    const v3 = viewFor(next, "p3");
    expect(v3.players.find((o) => o.id === "p0")?.statuses).toContain("protecting");
    expect(v3.players.find((o) => o.id === "p0")?.protecting).toBe("p1");
    expect(v3.players.find((o) => o.id === "p1")?.statuses).toContain("protected");
    expect(v3.players.find((o) => o.id === "p1")?.protectedBy).toBe("p0");
    expect(v3.log.some((e) => e.key === "protected")).toBe(true);

    // Outsider view: sees nothing
    const v2 = viewFor(next, "p2");
    expect(v2.players.find((o) => o.id === "p0")?.statuses).toEqual([]);
    expect(v2.players.find((o) => o.id === "p0")?.protecting).toBeUndefined();
    expect(v2.players.find((o) => o.id === "p1")?.statuses).toEqual([]);
    expect(v2.players.find((o) => o.id === "p1")?.protectedBy).toBeUndefined();
    expect(v2.log.some((e) => e.key === "protected")).toBe(false);
  });

  it("cannot target someone already protected (by self or another bodyguard), and switching replaces the old VIP", () => {
    let s = pickSkill(ship(), "p3", "bodyguard");
    s = mustApply(s, "p0", protect("p1"));

    // Neither p0 nor p3 can protect p1 now.
    expect(offered(s, "p0").filter((a) => a.type === "protect")).toEqual([protect("p3")]);
    expect(offered(s, "p3").filter((a) => a.type === "protect")).toEqual([protect("p0")]);
    expect(applyAction(s, "p3", protect("p1")).ok).toBe(false);
    expect(applyAction(s, "p0", protect("p1")).ok).toBe(false);

    // p0 switches to p3: p1 is no longer protected.
    const switched = mustApply(s, "p0", protect("p3"));
    expect(player(switched, "p1").protectedBy).toBeUndefined();
    expect(player(switched, "p3").protectedBy).toBe("p0");
    expect(viewFor(switched, "p1").statuses).not.toContain("protected");
  });

  it("adds +2 AP to aggressive actions targeting the VIP (including by the bodyguard), but not guard or area attacks", () => {
    let s = ship();
    s.items.push(
      { id: "blaster1", type: "blaster", charges: 3, at: { kind: "player", id: "p3" } },
      { id: "grenade1", type: "grenade", at: { kind: "player", id: "p3" } },
    );
    player(s, "p3").role = "mush";
    player(s, "p3").spores = 1;
    player(s, "p1").role = "human";

    const punchBase = costOf(s, "p3", { type: "punch", target: "p1" })!.ap;
    const spikeBase = costOf(s, "p3", { type: "spike", target: "p1" })!.ap;
    const blasterBase = costOf(s, "p3", { type: "attack", weapon: "blaster1", target: "p1" })!.ap;
    const grenadeBase = costOf(s, "p3", { type: "attack", weapon: "grenade1" })!.ap;
    const guardBase = costOf(s, "p3", { type: "guard" })!.ap;
    const selfPunchBase = costOf(s, "p0", { type: "punch", target: "p1" })!.ap;

    s = mustApply(s, "p0", protect("p1"));
    const extra = base.bodyguard.aggressiveApSurcharge;

    expect(costOf(s, "p3", { type: "punch", target: "p1" })!.ap).toBe(punchBase + extra);
    expect(costOf(s, "p3", { type: "spike", target: "p1" })!.ap).toBe(spikeBase + extra);
    expect(costOf(s, "p3", { type: "attack", weapon: "blaster1", target: "p1" })!.ap).toBe(blasterBase + extra);
    // Bodyguard themselves also pays +2 AP when targeting their VIP.
    expect(costOf(s, "p0", { type: "punch", target: "p1" })!.ap).toBe(selfPunchBase + extra);
    // Unprotected roommate is not taxed.
    expect(costOf(s, "p0", { type: "punch", target: "p3" })!.ap).toBe(punchBase);
    // Room-wide guard and area attack (no target) are not taxed.
    expect(costOf(s, "p3", { type: "guard" })!.ap).toBe(guardBase);
    expect(costOf(s, "p3", { type: "attack", weapon: "grenade1" })!.ap).toBe(grenadeBase);
  });

  it("stacks with Pacifist", () => {
    let s = ship();
    player(s, "p3").modifiers.push("pacifist");
    s = mustApply(s, "p0", protect("p1"));
    expect(costOf(s, "p3", { type: "punch", target: "p1" })!.ap).toBe(
      base.punch.cost.ap + base.pacifist.aggressiveApSurcharge + base.bodyguard.aggressiveApSurcharge,
    );
  });

  it("survives movement: surcharge pauses when apart and resumes when reunited", () => {
    let s = mustApply(ship(), "p0", protect("p1"));
    const punchWith = costOf(s, "p3", { type: "punch", target: "p1" })!.ap;

    const move = offered(s, "p0").find((a) => a.type === "move");
    if (!move || move.type !== "move") throw new Error("expected a move");
    // Bodyguard moves to an adjacent room: protection persists, surcharge pauses.
    s = mustApply(s, "p0", move);
    expect(player(s, "p1").protectedBy).toBe("p0");
    expect(viewFor(s, "p0").statuses).toContain("protecting");
    expect(viewFor(s, "p1").statuses).toContain("protected");
    expect(costOf(s, "p3", { type: "punch", target: "p1" })!.ap).toBe(base.punch.cost.ap);

    // Bodyguard returns: surcharge resumes.
    s = mustApply(s, "p0", { type: "move", to: "SICK_BAY" });
    expect(costOf(s, "p3", { type: "punch", target: "p1" })!.ap).toBe(punchWith);
  });

  it("reprices a queued aggressive action when the bodyguard arrives", () => {
    let s = mustApply(ship(), "p0", protect("p1"));
    const move = offered(s, "p0").find((a) => a.type === "move");
    if (!move || move.type !== "move") throw new Error("expected a move");
    s = mustApply(s, "p0", move);

    // p3 queues a punch on p1 while p0 is away.
    s = must(queueAction(s, "p3", { type: "punch", target: "p1" }, 100));
    expect(player(s, "p3").current).not.toBeNull();

    // p0 moves back into SICK_BAY before p3's punch resolves.
    s = mustApply(s, "p0", { type: "move", to: "SICK_BAY" });
    // p3's queued punch finishes at durationMs, gets repriced and cancelled.
    const due = 100 + base.action.durationMs;
    s = must(tick(s, due));
    expect(player(s, "p3").current).toBeNull();
    expect(player(s, "p3").ap).toBe(base.startAp);
    expect(viewFor(s, "p3").log.some((e) => e.key === "actionCostChanged")).toBe(true);
  });

  it("ends when either the bodyguard or the VIP dies", () => {
    const s = mustApply(ship(), "p0", protect("p1"));

    // Bodyguard dies: VIP loses protection.
    const a = structuredClone(s);
    killPlayer(a, player(a, "p0"), "assassinated");
    expect(player(a, "p1").protectedBy).toBeUndefined();
    expect(viewFor(a, "p1").statuses).not.toContain("protected");
    expect(costOf(a, "p3", { type: "punch", target: "p1" })!.ap).toBe(base.punch.cost.ap);

    // VIP dies: Bodyguard loses protecting status.
    const b = structuredClone(s);
    killPlayer(b, player(b, "p1"), "assassinated");
    expect(player(b, "p1").protectedBy).toBeUndefined();
    expect(viewFor(b, "p0").statuses).not.toContain("protecting");
    expect(viewFor(b, "p0").you.protecting).toBeUndefined();
  });
});
