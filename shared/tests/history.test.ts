import { describe, expect, it } from "vitest";
import { ACTIONS } from "../src/actions.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { killPlayer } from "../src/death.ts";
import { historyLength } from "../src/history.ts";
import { swapMinds } from "../src/mind.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import type { Action, GameConfig, GameState, LogEntry, PlayerId } from "../src/types.ts";
import { makeSeats, mustApply, nextDay, offered, player } from "./support.ts";

// No dirt or injury rolls by default, so HP and log lines are exact; one test turns the real odds back on.
const base: GameConfig = {
  ...DEFAULT_CONFIG,
  mushCount: 1,
  startInventory: [],
  startItems: [],
  startSkills: [],
  interrogate: { ...DEFAULT_CONFIG.interrogate, dirtyChance: 0, injuryChance: 0 },
};
const interrogate = (target: PlayerId): Action => ({ type: "interrogate", target });
const chitchat = (target: PlayerId): Action => ({ type: "chitchat", target });

/** p0 holds `skill`; p0, p1 and p3 share the sick bay, p2 is in the refectory. */
function ship(skill: string, config: GameConfig = base): GameState {
  let s = createGame(makeSeats(4), config, 3);
  player(s, "p0").room = player(s, "p1").room = player(s, "p3").room = "SICK_BAY";
  player(s, "p2").room = "REFECTORY";
  s = mustApply(s, "p0", { type: "pick_skill", skill });
  for (const p of s.players) {
    p.ap = 10;
    p.morale = 5;
    p.history = [];
  }
  return s;
}

const revealedTo = (s: GameState, id: PlayerId): LogEntry[] =>
  viewFor(s, id).log.filter((l) => l.key === "historyRevealed" || l.key === "historyNothing");
const revealedActions = (s: GameState, id: PlayerId): (string | number | undefined)[] =>
  revealedTo(s, id).filter((l) => l.key === "historyRevealed").map((l) => l.params?.action);

describe("action history", () => {
  it("records each action the body performs, failed ones included, oldest first", () => {
    let s = ship("leadership");
    s = mustApply(s, "p0", { type: "fiery_speech" }, { type: "punch", target: "p1" }, { type: "punch", target: "p1" });
    expect(player(s, "p0").history).toEqual(["fiery_speech", "punch", "punch"]);
  });

  it("leaves out moving, taking and dropping, Examine, BIOS changes, ending the cycle and picking a skill", () => {
    const unrecorded = Object.entries(ACTIONS).filter(([, def]) => !def.recorded).map(([type]) => type).sort();
    expect(unrecorded).toEqual(["drop", "examine", "move", "pick_skill", "ready", "set_bios", "take"]);
    const s = ship("leadership");
    const move = offered(s, "p0").find((a) => a.type === "move")!;
    expect(player(mustApply(s, "p0", move), "p0").history).toEqual([]);
  });

  it("keeps only the last max(max HP, max morale) actions", () => {
    let s = ship("leadership");
    player(s, "p0").ap = 100;
    player(s, "p1").cheats.push("infiniteHp");
    for (let i = 0; i < historyLength(s) + 3; i++) s = mustApply(s, "p0", { type: "punch", target: "p1" });
    expect(historyLength(s)).toBe(Math.max(base.maxHp, base.maxMorale));
    expect(player(s, "p0").history).toHaveLength(historyLength(s));
  });

  it("records nothing for a refused action", () => {
    const s = ship("leadership");
    player(s, "p0").ap = 0;
    expect(applyAction(s, "p0", { type: "fiery_speech" }).ok).toBe(false);
    expect(player(s, "p0").history).toEqual([]);
  });

  it("stays with the body when a Transfer swaps minds (owner, 2026-10-24)", () => {
    const s = ship("leadership");
    player(s, "p0").history = ["spike"];
    player(s, "p1").history = ["heal"];
    swapMinds(s, player(s, "p0"), player(s, "p1"));
    expect([player(s, "p0").history, player(s, "p1").history]).toEqual([["spike"], ["heal"]]);
  });

  it("is in nobody's view, the owner's included", () => {
    const s = mustApply(ship("leadership"), "p0", { type: "fiery_speech" });
    expect(player(s, "p0").history).toEqual(["fiery_speech"]);
    expect("history" in viewFor(s, "p0").you).toBe(false);
  });
});

describe("Torturer's Interrogate", () => {
  it("pins the decided numbers: 1 AP, 1 damage, 15% dirt, 10% injury", () => {
    const { cost, damage, dirtyChance, injuryChance } = DEFAULT_CONFIG.interrogate;
    expect([cost.ap, damage, dirtyChance, injuryChance]).toEqual([1, 1, 0.15, 0.1]);
  });

  it("is offered only to a Torturer, on living people in the room", () => {
    expect(offered(ship("torturer"), "p0")).toEqual(expect.arrayContaining([interrogate("p1"), interrogate("p3")]));
    expect(offered(ship("torturer"), "p0")).not.toContainEqual(interrogate("p2"));
    expect(offered(ship("leadership"), "p0")).not.toContainEqual(interrogate("p1"));
    expect(applyAction(ship("leadership"), "p0", interrogate("p1")).ok).toBe(false);
    expect(applyAction(ship("torturer"), "p0", interrogate("p2")).ok).toBe(false);
  });

  it("costs 1 AP, deals 1 damage, and reveals one action per missing HP, newest first, to the torturer only", () => {
    const s0 = ship("torturer");
    player(s0, "p1").history = ["bond", "heal", "spike", "punch", "shower"];
    player(s0, "p1").hp = base.maxHp - 2; // 3 missing after the hit
    const s = mustApply(s0, "p0", interrogate("p1"));
    expect(player(s, "p0").ap).toBe(10 - base.interrogate.cost.ap);
    expect(player(s, "p1").hp).toBe(base.maxHp - 2 - base.interrogate.damage);
    expect(revealedActions(s, "p0")).toEqual(["shower", "punch", "spike"]);
    for (const id of ["p1", "p2", "p3"]) expect(revealedTo(s, id)).toEqual([]);
  });

  it("is public room history", () => {
    const s = mustApply(ship("torturer"), "p0", interrogate("p1"));
    for (const id of ["p0", "p1", "p3"]) expect(viewFor(s, id).log.some((l) => l.key === "interrogated")).toBe(true);
    expect(viewFor(s, "p2").log.some((l) => l.key === "interrogated")).toBe(false);
  });

  it("reveals fewer when the history is shorter, and says so when there is nothing", () => {
    const s0 = ship("torturer");
    player(s0, "p1").history = ["bond"];
    player(s0, "p1").hp = 5;
    expect(revealedActions(mustApply(s0, "p0", interrogate("p1")), "p0")).toEqual(["bond"]);
    player(s0, "p1").history = [];
    expect(revealedTo(mustApply(s0, "p0", interrogate("p1")), "p0").map((l) => l.key)).toEqual(["historyNothing"]);
  });

  it("can kill, and still reveals", () => {
    const s0 = ship("torturer");
    player(s0, "p1").hp = 1;
    player(s0, "p1").history = ["spike"];
    const s = mustApply(s0, "p0", interrogate("p1"));
    expect(player(s, "p1").alive).toBe(false);
    expect(revealedActions(s, "p0")).toEqual(["spike"]);
  });

  it("works once a day, whoever the target", () => {
    const s = mustApply(ship("torturer"), "p0", interrogate("p1"));
    expect(offered(s, "p0").some((a) => a.type === "interrogate")).toBe(false);
    expect(applyAction(s, "p0", interrogate("p3")).ok).toBe(false);
    expect(offered(nextDay(s), "p0")).toContainEqual(interrogate("p3"));
  });

  it("goes in the torturer's own history after the reveal", () => {
    const s = mustApply(ship("torturer"), "p0", interrogate("p1"));
    expect(player(s, "p0").history).toEqual(["interrogate"]);
  });

  it("is aggressive, so Pacifist's surcharge applies", () => {
    expect(ACTIONS.interrogate.tags).toContain("aggressive");
  });

  it("is refused without the AP and leaves state unchanged", () => {
    const s = ship("torturer");
    player(s, "p0").ap = 0;
    expect(applyAction(s, "p0", interrogate("p1")).ok).toBe(false);
  });

  it("rolls the decided dirt and injury chances", () => {
    expect(ACTIONS.interrogate.dirtChanceMods?.(ship("torturer", DEFAULT_CONFIG), player(ship("torturer"), "p0"), interrogate("p1"))).toBe(0.15);
    expect(ACTIONS.interrogate.injuryChanceMods?.(ship("torturer", DEFAULT_CONFIG), player(ship("torturer"), "p0"), interrogate("p1"))).toBe(0.1);
  });

  it("sends the daily flag to the torturer only", () => {
    const s = mustApply(ship("torturer"), "p0", interrogate("p1"));
    expect(JSON.stringify(viewFor(s, "p0"))).toContain("interrogatedToday");
    expect(JSON.stringify(viewFor(s, "p1"))).not.toContain("interrogatedToday");
  });
});

describe("Chitchat with a Confident", () => {
  it("pins the decided numbers: 1 AP, +2 morale", () => {
    expect([DEFAULT_CONFIG.chitchat.cost.ap, DEFAULT_CONFIG.chitchat.morale]).toEqual([1, 2]);
  });

  it("is offered to others in the Confident's room, never to the Confident or other rooms", () => {
    const s = ship("confident");
    expect(offered(s, "p1")).toContainEqual(chitchat("p0"));
    expect(offered(s, "p2")).not.toContainEqual(chitchat("p0"));
    expect(offered(s, "p0").some((a) => a.type === "chitchat")).toBe(false);
    expect(offered(ship("leadership"), "p1").some((a) => a.type === "chitchat")).toBe(false);
    expect(applyAction(s, "p2", chitchat("p0")).ok).toBe(false);
    expect(applyAction(ship("leadership"), "p1", chitchat("p0")).ok).toBe(false);
  });

  it("costs 1 AP, gives 2 morale, and reveals the Confident's morale's worth of actions to the Confident only", () => {
    const s0 = ship("confident");
    player(s0, "p0").morale = 2;
    player(s0, "p1").history = ["bond", "heal", "spike"];
    const s = mustApply(s0, "p1", chitchat("p0"));
    expect(player(s, "p1").ap).toBe(10 - base.chitchat.cost.ap);
    expect(player(s, "p1").morale).toBe(5 + base.chitchat.morale);
    expect(player(s, "p0").morale).toBe(2);
    expect(revealedActions(s, "p0")).toEqual(["spike", "heal"]);
    for (const id of ["p1", "p2", "p3"]) expect(revealedTo(s, id)).toEqual([]);
  });

  it("doesn't reveal the chitchat itself, which then goes in the history", () => {
    const s0 = ship("confident");
    player(s0, "p1").history = [];
    const s = mustApply(s0, "p1", chitchat("p0"));
    expect(revealedTo(s, "p0").map((l) => l.key)).toEqual(["historyNothing"]);
    expect(player(s, "p1").history).toEqual(["chitchat"]);
  });

  it("reveals nothing from a Confident at 0 morale", () => {
    const s0 = ship("confident");
    player(s0, "p0").morale = 0;
    player(s0, "p1").history = ["spike"];
    expect(revealedTo(mustApply(s0, "p1", chitchat("p0")), "p0").map((l) => l.key)).toEqual(["historyNothing"]);
  });

  it("is public room history", () => {
    const s = mustApply(ship("confident"), "p1", chitchat("p0"));
    for (const id of ["p0", "p1", "p3"]) expect(viewFor(s, id).log.some((l) => l.key === "chitchatted")).toBe(true);
    expect(viewFor(s, "p2").log.some((l) => l.key === "chitchatted")).toBe(false);
  });

  it("caps the morale gain at max morale", () => {
    const s0 = ship("confident");
    player(s0, "p1").morale = base.maxMorale - 1;
    expect(player(mustApply(s0, "p1", chitchat("p0")), "p1").morale).toBe(base.maxMorale);
  });

  it("works once a day for the one who chitchats, not for the Confident", () => {
    const s = mustApply(ship("confident"), "p1", chitchat("p0"));
    expect(offered(s, "p1").some((a) => a.type === "chitchat")).toBe(false);
    expect(applyAction(s, "p1", chitchat("p0")).ok).toBe(false);
    expect(offered(s, "p3")).toContainEqual(chitchat("p0"));
    expect(offered(nextDay(s), "p1")).toContainEqual(chitchat("p0"));
  });

  it("can't be had with a dead Confident", () => {
    const s = ship("confident");
    killPlayer(s, player(s, "p0"));
    expect(applyAction(s, "p1", chitchat("p0")).ok).toBe(false);
  });

  it("sends the daily flag to the one who chitchatted only", () => {
    const s = mustApply(ship("confident"), "p1", chitchat("p0"));
    expect(JSON.stringify(viewFor(s, "p1"))).toContain("chitchatToday");
    expect(JSON.stringify(viewFor(s, "p0"))).not.toContain("chitchatToday");
  });
});
