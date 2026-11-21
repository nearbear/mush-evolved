import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { killPlayer } from "../src/death.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import type { Action, GameState } from "../src/types.ts";
import { makeSeats, must, nextCycle, offered, player, testConfig } from "./support.ts";

const ceasefire: Action = { type: "ceasefire" };

function ship(room = "LABORATORY"): GameState {
  const s = createGame(makeSeats(4, "others"), testConfig(), 7);
  for (const p of s.players) p.room = room;
  player(s, "p0").skills = ["diplomacy"];
  return s;
}

describe("Diplomat's Ceasefire", () => {
  it("pins the config numbers", () => {
    expect([DEFAULT_CONFIG.ceasefire.cost.ap, DEFAULT_CONFIG.ceasefire.durationCycles]).toEqual([1, 3]);
  });

  it("is offered only to a Diplomat (not Polymath, not in preselection) and works once per game", () => {
    const pre = createGame(makeSeats(3, "others"), testConfig({ preselection: true }), 7);
    player(pre, "p0").skills = ["diplomacy"];
    expect(offered(pre, "p0")).not.toContainEqual(ceasefire);
    expect(applyAction(pre, "p0", ceasefire).ok).toBe(false);

    const s = ship();
    player(s, "p1").skills = ["skilful"];
    expect(offered(s, "p0")).toContainEqual(ceasefire);
    expect(offered(s, "p1")).not.toContainEqual(ceasefire);
    expect(offered(s, "p2")).not.toContainEqual(ceasefire);
    expect(applyAction(s, "p1", ceasefire).ok).toBe(false);
    expect(applyAction(s, "p2", ceasefire).ok).toBe(false);

    const after = must(applyAction(s, "p0", ceasefire));
    expect(player(after, "p0").ap).toBe(player(s, "p0").ap - DEFAULT_CONFIG.ceasefire.cost.ap);
    expect(after.ceasefires.LABORATORY).toBe(DEFAULT_CONFIG.ceasefire.durationCycles);
    expect(player(after, "p0").ceasefireUsed).toBe(true);
    expect(offered(after, "p0")).not.toContainEqual(ceasefire);
    expect(after.log.some((l) => l.key === "ceasefire" && l.room === "LABORATORY")).toBe(true);

    // Still unusable after moving to another room or after expiry.
    const moved = must(applyAction(after, "p0", { type: "move", to: "CORRIDOR_A" }));
    expect(offered(moved, "p0")).not.toContainEqual(ceasefire);
    expect(applyAction(moved, "p0", ceasefire).ok).toBe(false);

    let expired = after;
    for (let i = 0; i < DEFAULT_CONFIG.ceasefire.durationCycles; i++) expired = nextCycle(expired);
    expect(expired.ceasefires.LABORATORY).toBeUndefined();
    expect(applyAction(expired, "p0", ceasefire).ok).toBe(false);
  });

  it("cannot be started in a room that already has an active ceasefire", () => {
    const s = ship();
    player(s, "p1").skills = ["diplomacy"];
    const active = must(applyAction(s, "p0", ceasefire));
    const before = JSON.stringify(active);
    const second = applyAction(active, "p1", ceasefire);
    expect(second.ok).toBe(false);
    expect(JSON.stringify(active)).toBe(before);
  });

  it("blocks all aggressive-tagged actions in the room, including guard, while allowing non-aggressive ones and other rooms", () => {
    const s = ship();
    player(s, "p1").skills = ["sturdy", "torturer"];
    player(s, "p2").role = "mush";
    player(s, "p2").mushSkills = ["transfert", "demoralizer"];
    player(s, "p2").spores = 1;
    s.contamination.p0 = 1;
    s.items.push({ id: "knife", type: "knife", at: { kind: "player", id: "p1" } });

    const active = must(applyAction(s, "p0", ceasefire));

    const blocked: Array<[string, Action]> = [
      ["p1", { type: "punch", target: "p0" }],
      ["p1", { type: "attack", weapon: "knife", target: "p0" }],
      ["p1", { type: "guard" }],
      ["p1", { type: "throw_out", target: "p0", to: "CORRIDOR_A" }],
      ["p1", { type: "interrogate", target: "p0" }],
      ["p2", { type: "spike", target: "p0" }],
      ["p2", { type: "body_transfer", target: "p0" }],
      ["p2", { type: "demoralize", target: "p0" }],
    ];
    for (const [actor, action] of blocked) {
      expect(offered(active, actor)).not.toContainEqual(action);
      expect(applyAction(active, actor, action).ok).toBe(false);
    }

    // Non-aggressive actions in the room still work.
    expect(applyAction(active, "p1", { type: "move", to: "CORRIDOR_A" }).ok).toBe(true);

    // Aggressive actions in another room still work.
    let otherRoom = must(applyAction(active, "p1", { type: "move", to: "CORRIDOR_A" }));
    otherRoom = must(applyAction(otherRoom, "p3", { type: "move", to: "CORRIDOR_A" }));
    expect(applyAction(otherRoom, "p1", { type: "guard" }).ok).toBe(true);
  });

  it("persists for 3 cycles even if the diplomat leaves or dies, then expires", () => {
    const s = ship();
    let cur = must(applyAction(s, "p0", ceasefire));
    cur = must(applyAction(cur, "p0", { type: "move", to: "CORRIDOR_A" }));
    killPlayer(cur, player(cur, "p0"), "other");
    expect(cur.ceasefires.LABORATORY).toBe(3);
    expect(applyAction(cur, "p1", { type: "punch", target: "p2" }).ok).toBe(false);

    cur = nextCycle(cur);
    expect(cur.ceasefires.LABORATORY).toBe(2);
    expect(applyAction(cur, "p1", { type: "punch", target: "p2" }).ok).toBe(false);

    cur = nextCycle(cur);
    expect(cur.ceasefires.LABORATORY).toBe(1);
    expect(applyAction(cur, "p1", { type: "punch", target: "p2" }).ok).toBe(false);

    cur = nextCycle(cur);
    expect(cur.ceasefires.LABORATORY).toBeUndefined();
    expect(applyAction(cur, "p1", { type: "punch", target: "p2" }).ok).toBe(true);
  });

  it("keeps ceasefireUsed on the body across Body Transfer", () => {
    const s = ship();
    player(s, "p1").skills = ["diplomacy"];
    player(s, "p2").role = "mush";
    player(s, "p2").mushSkills = ["transfert"];
    s.contamination.p0 = 1;
    // p0 uses ceasefire in LABORATORY, then moves to CORRIDOR_A so p2 can transfer there.
    let cur = must(applyAction(s, "p0", ceasefire));
    cur = must(applyAction(cur, "p0", { type: "move", to: "CORRIDOR_A" }));
    cur = must(applyAction(cur, "p2", { type: "move", to: "CORRIDOR_A" }));
    // p2 transfers into p0's used body -> cannot use ceasefire.
    cur = must(applyAction(cur, "p2", { type: "body_transfer", target: "p0" }));
    expect(player(cur, "p0").mind).toBe("p2");
    expect(player(cur, "p0").ceasefireUsed).toBe(true);
    expect(applyAction(cur, "p0", ceasefire).ok).toBe(false);
    // p0's original mind (now in p2's body) has not used ceasefire on that body; if it had diplomacy it could,
    // and p1 (fresh Diplomat body) can still use ceasefire once the room's expires.
    expect(player(cur, "p2").ceasefireUsed).toBeUndefined();
  });

  it("hides roomCeasefire from other rooms and the dead, and keeps ceasefireUsed private", () => {
    const s = ship();
    let cur = must(applyAction(s, "p0", ceasefire));
    cur = must(applyAction(cur, "p2", { type: "move", to: "CORRIDOR_A" }));
    killPlayer(cur, player(cur, "p3"), "other");

    expect(viewFor(cur, "p0").roomCeasefire).toBe(3);
    expect(viewFor(cur, "p1").roomCeasefire).toBe(3);
    expect(viewFor(cur, "p2").roomCeasefire).toBeNull();
    expect(viewFor(cur, "p3").roomCeasefire).toBeNull();

    expect(viewFor(cur, "p0").you.ceasefireUsed).toBe(true);
    expect(JSON.stringify(viewFor(cur, "p1"))).not.toContain("ceasefireUsed");
  });
});
