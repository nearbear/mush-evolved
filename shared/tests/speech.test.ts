import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { killPlayer } from "../src/death.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import type { Action, GameConfig, GameState } from "../src/types.ts";
import { makeSeats, mustApply, nextDay, offered, player, pickSkill } from "./support.ts";

const base: GameConfig = { ...DEFAULT_CONFIG, mushCount: 1, startInventory: [], startItems: [], startSkills: [] };
const fiery: Action = { type: "fiery_speech" };
const boring: Action = { type: "boring_speech" };

/** p0 speaks; p0, p1 and p3 share the sick bay, p2 is in the refectory. */
function ship(skill: string): GameState {
  let s = createGame(makeSeats(4), base, 3);
  player(s, "p0").room = player(s, "p1").room = player(s, "p3").room = "SICK_BAY";
  player(s, "p2").room = "REFECTORY";
  s = pickSkill(s, "p0", skill);
  for (const p of s.players) {
    p.morale = 5;
    p.mp = 2;
    p.ap = 10;
  }
  return s;
}

describe("Leader's Fiery speech", () => {
  it("pins the decided numbers: 2 AP, +2 morale", () => {
    expect([base.speech.fiery.ap, base.speech.fiery.morale]).toEqual([2, 2]);
  });

  it("is offered only to a Leader", () => {
    expect(offered(ship("leadership"), "p0")).toContainEqual(fiery);
    expect(offered(ship("motivator"), "p0")).not.toContainEqual(fiery);
    expect(applyAction(ship("motivator"), "p0", fiery).ok).toBe(false);
  });

  it("costs 2 AP, raises roommates' morale but not the speaker's or other rooms', and logs publicly", () => {
    const s = mustApply(ship("leadership"), "p0", fiery);
    expect(player(s, "p0").ap).toBe(10 - base.speech.fiery.ap);
    expect(player(s, "p0").morale).toBe(5);
    expect(player(s, "p1").morale).toBe(5 + base.speech.fiery.morale);
    expect(player(s, "p3").morale).toBe(5 + base.speech.fiery.morale);
    expect(player(s, "p2").morale).toBe(5);
    expect(viewFor(s, "p1").log.some((l) => l.key === "fierySpeech")).toBe(true);
    expect(viewFor(s, "p2").log.some((l) => l.key === "fierySpeech")).toBe(false);
  });

  it("has no daily limit, caps at max morale and skips the dead", () => {
    let s = ship("leadership");
    player(s, "p1").morale = base.maxMorale - 1;
    s = mustApply(s, "p0", fiery, fiery);
    expect(player(s, "p1").morale).toBe(base.maxMorale);
    expect(player(s, "p3").morale).toBe(5 + 2 * base.speech.fiery.morale);
    killPlayer(s, player(s, "p3"));
    const dead = player(s, "p3").morale;
    s = mustApply(s, "p0", fiery);
    expect(player(s, "p3").morale).toBe(dead);
  });

  it("is refused without the AP and leaves state unchanged", () => {
    const s = ship("leadership");
    player(s, "p0").ap = 1;
    expect(applyAction(s, "p0", fiery).ok).toBe(false);
    expect(player(s, "p1").morale).toBe(5);
  });
});

describe("Motivator's Boring speech", () => {
  it("pins the decided numbers: 2 AP, +3 MP", () => {
    expect([base.speech.boring.ap, base.speech.boring.mp]).toEqual([2, 3]);
  });

  it("is offered only to a Motivator", () => {
    expect(offered(ship("motivator"), "p0")).toContainEqual(boring);
    expect(offered(ship("leadership"), "p0")).not.toContainEqual(boring);
    expect(applyAction(ship("leadership"), "p0", boring).ok).toBe(false);
  });

  it("costs 2 AP, gives roommates 3 MP (capped) but not the speaker or other rooms, and logs publicly", () => {
    const s0 = ship("motivator");
    player(s0, "p3").mp = base.movement.mpCap - 1;
    const s = mustApply(s0, "p0", boring);
    expect(player(s, "p0").ap).toBe(10 - base.speech.boring.ap);
    expect(player(s, "p0").mp).toBe(2);
    expect(player(s, "p1").mp).toBe(2 + base.speech.boring.mp);
    expect(player(s, "p3").mp).toBe(base.movement.mpCap);
    expect(player(s, "p2").mp).toBe(2);
    expect(viewFor(s, "p1").log.some((l) => l.key === "boringSpeech")).toBe(true);
    expect(viewFor(s, "p2").log.some((l) => l.key === "boringSpeech")).toBe(false);
  });

  it("works once a day: no longer offered or allowed until the next day", () => {
    const s = mustApply(ship("motivator"), "p0", boring);
    expect(offered(s, "p0")).not.toContainEqual(boring);
    const again = applyAction(s, "p0", boring);
    expect(again.ok).toBe(false);
    expect(offered(nextDay(s), "p0")).toContainEqual(boring);
  });

  it("sends the daily flag to the speaker only", () => {
    const s = mustApply(ship("motivator"), "p0", boring);
    expect(JSON.stringify(viewFor(s, "p0"))).toContain("boringToday");
    expect(JSON.stringify(viewFor(s, "p1"))).not.toContain("boringToday");
  });
});
