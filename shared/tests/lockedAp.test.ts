import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { actNow } from "../src/queue.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import type { GameState } from "../src/types.ts";
import { makeSeats, must, nextCycle, offered, option, player } from "./support.ts";

// Locked AP (docs/plans/action-plans.md): AP held by claimed plan jobs stays in `ap` but can't be spent live.
const base = { ...DEFAULT_CONFIG, manualCycles: true, mushCount: 1, startInventory: [], startItems: [], startSkills: [], punch: { ...DEFAULT_CONFIG.punch, successChance: 1 } };
const PUNCH = base.punch.cost.ap;
const punch = { type: "punch", target: "p1" } as const;
const door = base.rooms.SICK_BAY![0]!;

/** p0 and p1 in the sick bay, p2 in the refectory. */
function ship(): GameState {
  const s = createGame(makeSeats(3), base, 3);
  player(s, "p0").room = player(s, "p1").room = "SICK_BAY";
  player(s, "p2").room = "REFECTORY";
  return s;
}

describe("locked AP", () => {
  it("starts at 0", () => {
    expect(ship().players.map((p) => p.lockedAp)).toEqual([0, 0, 0]);
  });

  it("can't pay for a live action, and shows as lacking AP", () => {
    const s = ship();
    player(s, "p0").ap = PUNCH + 1;
    player(s, "p0").lockedAp = 2;
    expect(option(s, "p0", punch)?.lacks).toEqual(["ap"]);
    expect(applyAction(s, "p0", punch).ok).toBe(false);

    player(s, "p0").lockedAp = 1;
    const after = must(applyAction(s, "p0", punch));
    // The lock is untouched: only free AP was spent.
    expect(player(after, "p0").ap).toBe(1);
    expect(player(after, "p0").lockedAp).toBe(1);
  });

  it("can't be converted to MP for a move", () => {
    const s = ship();
    player(s, "p0").mp = 0;
    player(s, "p0").ap = base.movement.apPerConversion;
    player(s, "p0").lockedAp = 1;
    expect(offered(s, "p0")).not.toContainEqual({ type: "move", to: door });
    expect(applyAction(s, "p0", { type: "move", to: door }).ok).toBe(false);

    player(s, "p0").lockedAp = 0;
    expect(player(must(applyAction(s, "p0", { type: "move", to: door })), "p0").room).toBe(door);
  });

  it("counts toward the cycle gain's cap", () => {
    const s = ship();
    player(s, "p0").ap = base.maxAp;
    player(s, "p0").lockedAp = 2;
    const after = nextCycle(s);
    expect(player(after, "p0").ap).toBe(base.maxAp);
    expect(player(after, "p0").lockedAp).toBe(2);
  });

  it("is in your own view only", () => {
    const s = ship();
    player(s, "p1").lockedAp = 3;
    expect(viewFor(s, "p1").you.lockedAp).toBe(3);
    for (const o of viewFor(s, "p0").players) expect(o).not.toHaveProperty("lockedAp");
  });
});

describe("actNow", () => {
  it("does a timed action at once, with no bar, paying as live", () => {
    const s = ship();
    const hp = player(s, "p1").hp;
    const after = must(actNow(s, "p0", punch));
    expect(player(after, "p1").hp).toBeLessThan(hp);
    expect(player(after, "p0").ap).toBe(player(s, "p0").ap - PUNCH);
    expect(player(after, "p0").current).toBeNull();
  });

  it("refuses an illegal action and leaves the state alone", () => {
    const s = ship();
    expect(actNow(s, "p0", { type: "punch", target: "p2" })).toEqual({ ok: false, error: "illegal_action" });
  });

  it("gets a lying player up, as a live action does", () => {
    const s = ship();
    player(s, "p0").modifiers.push("lying_down");
    expect(player(must(actNow(s, "p0", punch)), "p0").modifiers).not.toContain("lying_down");
  });
});
