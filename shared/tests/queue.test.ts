import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { parseGameMessage } from "../src/protocol.ts";
import { clearQueue, nextDue, queueAction, tick } from "../src/queue.ts";
import { applyInput } from "../src/replay.ts";
import { installCameraIn } from "./cameras.ts";
import { createGame, viewFor } from "../src/rules.ts";
import type { Action, GameConfig, GameState, PlayerId } from "../src/types.ts";
import { makeSeats, player, must } from "./support.ts";

const seats = makeSeats(3);
const base: GameConfig = { ...DEFAULT_CONFIG, mushCount: 1, startInventory: [], startItems: [], startSkills: [], punch: { ...DEFAULT_CONFIG.punch, successChance: 1 } };
const D = base.action.durationMs;
const punch = (target: PlayerId): Action => ({ type: "punch", target });
const bond = (target: PlayerId): Action => ({ type: "bond", target });
const hp = (s: GameState, id: PlayerId) => player(s, id).hp;

/** p0 and p1 share the sick bay; p2 is in the refectory. p0 is human, p1 Mush. */
function ship(config: GameConfig = base): GameState {
  const s = createGame(seats, config, 3);
  player(s, "p0").room = player(s, "p1").room = "SICK_BAY";
  player(s, "p2").room = "REFECTORY";
  player(s, "p0").role = "human";
  player(s, "p1").role = "mush";
  player(s, "p2").role = "human";
  return s;
}

describe("timed actions", () => {
  it("defaults to 2 seconds, a queue of 3, resolving at the end", () => {
    expect(base.action).toEqual({ durationMs: 2000, queueCap: 3, resolveAt: "end" });
  });

  it("the instantActions cheat skips the bar and does the action at once", () => {
    const s = ship();
    player(s, "p0").cheats = ["instantActions"];
    const done = must(queueAction(s, "p0", punch("p1"), 1000));
    expect(player(done, "p0").current).toBeNull();
    expect(hp(done, "p1")).toBe(base.startHp - base.punch.effect.damage);
  });

  it("an action starts a bar and happens, and is paid for, only when the bar runs out", () => {
    const started = must(queueAction(ship(), "p0", punch("p1"), 1000));
    expect(player(started, "p0").current).toEqual({ action: punch("p1"), since: 1000, until: 1000 + D });
    expect([hp(started, "p1"), player(started, "p0").ap]).toEqual([base.startHp, base.startAp]);
    expect(nextDue(started)).toBe(1000 + D);

    expect(tick(started, 1000 + D - 1).ok).toBe(false);
    const done = must(tick(started, 1000 + D));
    expect(hp(done, "p1")).toBe(base.startHp - base.punch.effect.damage);
    expect(player(done, "p0").ap).toBe(base.startAp - base.punch.cost.ap);
    expect(player(done, "p0").current).toBeNull();
    expect(nextDue(done)).toBeNull();
  });

  it("queues actions behind the one under way and starts each when the last ends", () => {
    let s = must(queueAction(ship(), "p0", punch("p1"), 0));
    s = must(queueAction(s, "p0", punch("p1"), 10));
    s = must(queueAction(s, "p0", bond("p1"), 20));
    expect(player(s, "p0").queue).toEqual([punch("p1"), bond("p1")]);

    s = must(tick(s, D));
    expect(player(s, "p0").current).toEqual({ action: punch("p1"), since: D, until: 2 * D });
    expect(player(s, "p0").queue).toEqual([bond("p1")]);
    s = must(tick(s, 2 * D));
    s = must(tick(s, 3 * D));
    expect(hp(s, "p1")).toBe(base.startHp - 2 * base.punch.effect.damage);
    expect(s.bonds.p0).toEqual(["p1"]);
    expect(player(s, "p0").current).toBeNull();
  });

  it("refuses a fourth waiting action", () => {
    let s = must(queueAction(ship(), "p0", punch("p1"), 0));
    for (let i = 0; i < base.action.queueCap; i++) s = must(queueAction(s, "p0", punch("p1"), 0));
    expect(queueAction(s, "p0", punch("p1"), 0)).toEqual({ ok: false, error: "queue_full" });
  });

  it("refuses an action that isn't legal now, leaving the state unchanged", () => {
    const s = ship();
    expect(queueAction(s, "p0", punch("p2"), 0).ok).toBe(false);
    expect(queueAction(s, "p0", { type: "move", to: "NOWHERE" }, 0).ok).toBe(false);
    expect(player(s, "p0").current).toBeNull();
  });

  it("drops an action whose target left before it happened, at no cost, telling only the actor", () => {
    let s = must(queueAction(ship(), "p0", punch("p1"), 0));
    player(s, "p1").room = "REFECTORY";
    s = must(tick(s, D));
    expect([hp(s, "p1"), player(s, "p0").ap]).toEqual([base.startHp, base.startAp]);
    const line = s.log.at(-1)!;
    expect([line.key, line.params, line.visibleTo]).toEqual(["actionDropped", { action: "punch" }, ["p0"]]);
  });

  it("drops queued actions that are no longer possible and starts the next one that is", () => {
    const poor = ship();
    player(poor, "p0").ap = 1;
    let s = must(queueAction(poor, "p0", punch("p1"), 0));
    s = must(queueAction(s, "p0", punch("p1"), 0)); // affordable now, not once the first is paid
    s = must(queueAction(s, "p0", { type: "examine", target: { kind: "player", id: "p1" } }, 0));
    s = must(tick(s, D));
    expect(player(s, "p0").current?.action.type).toBe("examine");
    expect(s.log.filter((e) => e.key === "actionDropped")).toHaveLength(1);
  });

  it("ready and access are not timed: they happen at once, even while busy", () => {
    let s = must(queueAction(ship(), "p0", punch("p1"), 0));
    s = must(queueAction(s, "p0", { type: "ready" }, 0));
    expect(player(s, "p0").ready).toBe(true);
    expect(player(s, "p0").queue).toEqual([]);
  });

  it("an action queued before End cycle still happens, but nothing new can be queued once ready", () => {
    let s = must(queueAction(ship(), "p0", punch("p1"), 0));
    s = must(queueAction(s, "p0", { type: "ready" }, 0));
    expect(queueAction(s, "p0", punch("p1"), 0).ok).toBe(false);
    s = must(tick(s, D));
    expect(hp(s, "p1")).toBe(base.startHp - base.punch.effect.damage);
  });

  it("an action under way carries over into the next cycle", () => {
    let s = must(queueAction(ship(), "p0", punch("p1"), 0));
    for (const id of ["p0", "p1", "p2"]) s = must(queueAction(s, id, { type: "ready" }, 0));
    expect(s.cycle).toBe(2);
    s = must(tick(s, D));
    expect(hp(s, "p1")).toBe(base.startHp - base.punch.effect.damage);
  });

  it("dying ends your bar and empties your queue", () => {
    let s = must(queueAction(ship(), "p1", punch("p0"), 0));
    s = must(queueAction(s, "p1", punch("p0"), 0));
    s = must(queueAction(s, "p0", punch("p1"), 0));
    player(s, "p1").hp = base.punch.effect.damage;
    // p0's punch is due first and kills p1, whose own punch is due at the same moment.
    player(s, "p1").current!.until = D + 1;
    s = must(tick(s, D + 1));
    expect(player(s, "p1").alive).toBe(false);
    expect([player(s, "p1").current, player(s, "p1").queue]).toEqual([null, []]);
    expect(hp(s, "p0")).toBe(base.startHp);
  });

  it("settles bars that end together in seat order", () => {
    let s = must(queueAction(ship(), "p1", punch("p0"), 0));
    s = must(queueAction(s, "p0", punch("p1"), 0));
    player(s, "p0").hp = player(s, "p1").hp = base.punch.effect.damage;
    s = must(tick(s, D));
    expect([player(s, "p0").alive, player(s, "p1").alive]).toEqual([true, false]);
  });

  it("Clear queue cancels the waiting actions and the one under way, at no cost", () => {
    let s = must(queueAction(ship(), "p0", punch("p1"), 0));
    s = must(queueAction(s, "p0", punch("p1"), 0));
    s = must(clearQueue(s, "p0"));
    expect([player(s, "p0").current, player(s, "p0").queue]).toEqual([null, []]);
    expect(nextDue(s)).toBeNull();
    expect(clearQueue(s, "p0")).toEqual({ ok: false, error: "nothing_queued" });
    expect([hp(s, "p1"), player(s, "p0").ap]).toEqual([base.startHp, base.startAp]);
  });

  describe('with resolveAt "start"', () => {
    const start: GameConfig = { ...base, action: { ...base.action, resolveAt: "start" } };

    it("the action happens at once and the bar is a cooldown before the next", () => {
      let s = must(queueAction(ship(start), "p0", punch("p1"), 0));
      expect(hp(s, "p1")).toBe(base.startHp - base.punch.effect.damage);
      s = must(queueAction(s, "p0", punch("p1"), 0));
      expect(hp(s, "p1")).toBe(base.startHp - base.punch.effect.damage);
      s = must(tick(s, D));
      expect(hp(s, "p1")).toBe(base.startHp - 2 * base.punch.effect.damage);
      expect(player(s, "p0").current?.until).toBe(2 * D);
    });

    it("Clear queue can't undo what already happened: it clears only the waiting actions", () => {
      const s = must(queueAction(ship(start), "p0", punch("p1"), 0));
      expect(clearQueue(s, "p0").ok).toBe(false);
      const cleared = must(clearQueue(must(queueAction(s, "p0", punch("p1"), 0)), "p0"));
      expect(player(cleared, "p0").current).not.toBeNull();
      expect(player(cleared, "p0").queue).toEqual([]);
    });
  });

  it("goes through applyInput with the server's time, and parses clearQueue from the wire", () => {
    let s = must(applyInput(ship(), { type: "action", action: punch("p1"), by: "p0", at: 5 }));
    s = must(applyInput(s, { type: "tick", at: 5 + D }));
    expect(hp(s, "p1")).toBe(base.startHp - base.punch.effect.damage);
    expect(parseGameMessage(JSON.stringify({ type: "clearQueue", extra: 1 }))).toEqual({ type: "clearQueue" });
  });
});

describe("who sees an action bar", () => {
  const busy = (s: GameState, viewer: PlayerId, of: PlayerId) => viewFor(s, viewer).players.find((o) => o.id === of)?.busy;

  it("you see your own action and queue; nobody else ever sees which action or the queue", () => {
    let s = must(queueAction(ship(), "p0", bond("p1"), 0));
    s = must(queueAction(s, "p0", punch("p1"), 0));
    expect(viewFor(s, "p0").you.current?.action).toEqual(bond("p1"));
    expect(viewFor(s, "p0").you.queue).toEqual([punch("p1")]);
    for (const viewer of ["p1", "p2"]) {
      const seen = viewFor(s, viewer).players.find((o) => o.id === "p0")!;
      expect(Object.keys(seen)).not.toContain("current");
      expect(Object.keys(seen)).not.toContain("queue");
      expect(JSON.stringify(seen)).not.toMatch(/bond|punch/);
    }
  });

  it("a public action's bar shows to people in the room, not elsewhere", () => {
    const s = must(queueAction(ship(), "p0", punch("p1"), 0));
    expect(busy(s, "p1", "p0")).toEqual({ since: 0, until: D });
    expect(busy(s, "p2", "p0")).toBeUndefined();
  });

  it("a private action's bar shows to nobody else", () => {
    const s = must(queueAction(ship(), "p0", bond("p1"), 0));
    expect(busy(s, "p1", "p0")).toBeUndefined();
  });

  it("a secret action's bar shows to witnesses", () => {
    const s = must(queueAction(ship(), "p1", { type: "extract_spore" }, 0));
    expect(busy(s, "p0", "p1")).toEqual({ since: 0, until: D });
  });

  it("a covert action's bar shows only on camera", () => {
    const mush = ship();
    player(mush, "p1").spores = 1;
    const unfilmed = must(queueAction(mush, "p1", { type: "spike", target: "p0" }, 0));
    expect(busy(unfilmed, "p0", "p1")).toBeUndefined();
    installCameraIn(mush, "SICK_BAY");
    const filmed = must(queueAction(mush, "p1", { type: "spike", target: "p0" }, 0));
    expect(busy(filmed, "p0", "p1")).toEqual({ since: 0, until: D });
  });
});
