import { DEFAULT_CONFIG, applyAction, legalIn, newCycle, startGame, viewFor, type Action, type CharacterId, type GameState, type PlayerView } from "@mush2/shared";
import { describe, expect, it } from "vitest";
import { GOAL_MAX_ACTIONS, GoalBot } from "../src/bots.ts";
import { canAfford, goTo, roomsWith, travelAp } from "../src/bots/goals/blocks.ts";
import { SOLO_GOALS } from "../src/bots/goals/index.ts";
import { repairHull } from "../src/bots/goals/repairHull.ts";
import { rest } from "../src/bots/goals/rest.ts";
import { research } from "../src/bots/goals/research.ts";
import { shower } from "../src/bots/goals/shower.ts";
import type { GoalDef } from "../src/bots/goals/types.ts";
import { chooseSkill } from "../src/bots/skillChoice.ts";
import { seats } from "../src/testing/fakes.ts";

// End cycle on, as on the dev server, so a bot with nothing to do ends its cycle instead of waiting for the clock.
const config = { ...DEFAULT_CONFIG, manualCycles: true };

/** A fresh game and a human seat in it (one seat is Mush). */
function setup(seed = 1): { game: GameState; id: string } {
  const game = startGame({ seats: seats(0), config, seed, rulesVersion: "test" });
  return { game, id: game.players.find((p) => p.role === "human")!.id };
}

/** The game with one player's state changed. */
function edit(game: GameState, id: string, change: (p: GameState["players"][number]) => void): GameState {
  const next = structuredClone(game);
  change(next.players.find((p) => p.id === id)!);
  return next;
}

const isLegal = (view: PlayerView, action: Action) => legalIn(view).some((a) => JSON.stringify(a) === JSON.stringify(action));

/**
 * Plays one bot for `turns` turns: each action it returns must be legal and is applied; `ready` or null starts a new
 * cycle. Returns the final state and every action taken.
 */
async function play(game: GameState, id: string, bot: GoalBot, turns: number): Promise<{ game: GameState; taken: Action[] }> {
  const taken: Action[] = [];
  for (let t = 0; t < turns; t++) {
    const me = game.players.find((p) => p.id === id)!;
    if (game.phase !== "playing" || !me.alive) break;
    const view = viewFor(game, id);
    const action = await bot.decideAction(view);
    if (action === null || action.type === "ready") {
      const next = newCycle(game);
      if (!next.ok) break;
      game = next.state;
      continue;
    }
    expect(isLegal(view, action), JSON.stringify(action)).toBe(true);
    const result = applyAction(game, id, action);
    expect(result.ok).toBe(true);
    if (result.ok) game = result.state;
    taken.push(action);
  }
  return { game, taken };
}

const roll0 = () => 0;

describe("chooseSkill", () => {
  const pick = (character: CharacterId, have: string[] = [], offered?: string[]) =>
    chooseSkill(character, offered ?? allOf(character).filter((s) => !have.includes(s)), have, roll0);
  const allOf = (character: CharacterId): string[] => {
    const lists: Partial<Record<CharacterId, string[]>> = {
      jinsu: ["leadership", "pilot", "cold_blood", "gunman", "logistics", "space_tactics"],
      paola: ["radio_expert", "logistics", "gunman", "biologist", "rebel", "gunner"],
      terrence: ["robotics", "engineer", "pilot", "gunman", "computer", "metaliciste"],
      frieda: ["astrophysician", "pilot", "survival", "computer", "radio_expert", "antic_perfume"],
      gioele: ["sturdy", "paranoid", "caffeinomaniac", "astrophysician", "panic", "juge"],
      kuanti: ["designer", "optimistic", "astrophysician", "engineer", "leadership", "politician"],
      ian: ["botanic", "biologist", "mycologist", "green_thumb", "fireman", "frugivore"],
    };
    return lists[character]!;
  };

  it("takes Logistics Expert first, then Pilot, then Shooter once a pilot", () => {
    expect(pick("jinsu")).toBe("logistics");
    expect(pick("jinsu", ["logistics"])).toBe("pilot");
    expect(pick("jinsu", ["logistics", "pilot"])).toBe("gunman");
  });

  it("never takes Shooter without Pilot, even at random", () => {
    expect(pick("paola")).toBe("logistics");
    expect(pick("paola", ["logistics"])).not.toBe("gunman");
    expect(chooseSkill("paola", ["gunman", "rebel"], ["logistics"], () => 0)).toBe("rebel");
    expect(chooseSkill("paola", ["gunman", "rebel"], ["logistics"], (n) => n - 1)).toBe("rebel");
  });

  it("only prefers Pilot for Frieda and Terrence, after their musts", () => {
    expect(pick("terrence")).toBe("engineer");
    expect(pick("terrence", ["engineer"])).toBe("pilot");
    expect(pick("terrence", ["engineer", "pilot"])).toBe("gunman");
    expect(pick("frieda")).toBe("astrophysician");
    expect(pick("frieda", ["astrophysician"])).toBe("computer");
    expect(pick("frieda", ["astrophysician", "computer"])).toBe("pilot");
  });

  it("keeps character-only skills to their characters", () => {
    expect(pick("gioele")).toBe("paranoid");
    expect(pick("gioele", ["paranoid"])).not.toBe("astrophysician");
    expect(pick("kuanti")).toBe("engineer");
    expect(pick("kuanti", ["engineer"])).toBe("designer");
    expect(pick("ian")).toBe("botanic");
    expect(pick("ian", ["botanic"])).toBe("green_thumb");
  });

  it("falls back to a seeded random skill, and never a Mush skill", () => {
    expect(chooseSkill("stephen", ["cook", "sturdy"], [], () => 1)).toBe("sturdy");
    expect(chooseSkill("stephen", ["anonymous_mush_skill"], [], roll0)).toBeNull();
  });
});

describe("goal building blocks", () => {
  const { game, id } = setup();
  const view = viewFor(game, id);

  it("walks the shortest path one move at a time", () => {
    const far = roomsWith(view, ["PILGRED"])[0]!;
    const step = goTo(view, far);
    expect(step?.kind).toBe("act");
    expect(goTo(view, view.you.room)).toBeNull();
  });

  it("prices a walk in AP only once the MP runs out", () => {
    const room = roomsWith(view, ["PILGRED"])[0]!;
    const noMp = { ...view, you: { ...view.you, mp: 0 } };
    expect(travelAp(view, view.you.room)).toBe(0);
    expect(travelAp(noMp, room)).toBeGreaterThan(0);
    expect(canAfford(noMp, room, 0, noMp.you.ap)).toBe(false);
  });
});

describe("GoalBot", () => {
  it("only ever returns legal actions, for every character, over many cycles", async () => {
    for (let seed = 1; seed <= 4; seed++) {
      let { game, id } = setup(seed);
      for (const character of ["jinsu", "frieda", "ian", "raluca"] as CharacterId[]) {
        game = edit(game, id, (p) => (p.character = character));
        await play(game, id, new GoalBot(seed), 150);
      }
    }
  });

  it("picks its skills first, in the owner's order", async () => {
    const { game: start, id } = setup();
    const game = edit(start, id, (p) => {
      p.character = "jinsu";
      p.skills = [];
    });
    const { taken } = await play(game, id, new GoalBot(1), 3);
    expect(taken).toEqual([
      { type: "pick_skill", skill: "logistics" },
      { type: "pick_skill", skill: "pilot" },
      { type: "pick_skill", skill: "gunman" },
    ]);
  });

  it("researches down to the 2 AP reserve, then stops", async () => {
    const { game: start, id } = setup();
    const lab = roomsWith(viewFor(start, id), ["RESEARCH_LAB"])[0]!;
    const game = edit(start, id, (p) => {
      p.room = lab;
      p.ap = 5;
      p.resources.comp = 0;
      p.statuses = p.statuses.filter((s) => s !== "dirty");
    });
    const bot = new GoalBot(1, 2, [research]);
    const view = viewFor(game, id);
    const first = await bot.decideAction(view);
    expect(first?.type).toBe("research");
    const after = applyAction(game, id, first!);
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    const me = after.state.players.find((p) => p.id === id)!;
    // 5 - 2 = 3 left; another round would leave 1, under the reserve.
    expect(me.ap).toBe(3);
    expect(await bot.decideAction(viewFor(after.state, id))).toEqual({ type: "ready" });
  });

  it("walks to a bed, lies down, and stays down across cycles until its AP is full", async () => {
    const { game: start, id } = setup();
    let game = edit(start, id, (p) => (p.ap = 1));
    const bot = new GoalBot(1, 2, [rest]);
    let lay = false;
    for (let t = 0; t < 30 && !lay; t++) {
      const action = await bot.decideAction(viewFor(game, id));
      expect(action).not.toBeNull();
      const r = applyAction(game, id, action!);
      expect(r.ok).toBe(true);
      if (r.ok) game = r.state;
      lay = action!.type === "lie_down";
    }
    expect(lay).toBe(true);
    expect(bot.current).toMatch(/^rest:/);
    expect(await bot.decideAction(viewFor(game, id))).toEqual({ type: "ready" });
    const next = newCycle(game);
    expect(next.ok).toBe(true);
    if (!next.ok) return;
    expect(await bot.decideAction(viewFor(next.state, id))).toEqual({ type: "ready" });
    expect(bot.current).toMatch(/^rest:/);
    expect(next.state.players.find((p) => p.id === id)!.lyingIn).toBeDefined();
  });

  it("leaves PILGRED alone in single player, where the human is the Mush", () => {
    expect(SOLO_GOALS.map((g) => g.id)).not.toContain("repairPilgred");
  });

  it("patches the hull only below 50, and doesn't shower while it could", () => {
    const { game: start, id } = setup();
    const game = edit(start, id, (p) => {
      p.statuses = [...p.statuses.filter((s) => s !== "dirty"), "dirty"];
      p.ap = 10;
    });
    const view = viewFor(game, id);
    const memory = { reserve: 2, ended: new Set<string>(), visited: new Set<string>(), roll: roll0 };
    const patch = { action: { type: "repair_hull" as const, item: "scrap" }, cost: { ap: 1, mp: 0 }, chance: 0.25, tags: [], lacks: [] };
    const withHull = (hull: number): PlayerView => ({ ...view, ship: { ...view.ship, hull }, actions: [...view.actions, patch] });
    expect(repairHull.options(withHull(50), memory)).toEqual([]);
    expect(shower.options(withHull(50), memory)).toHaveLength(1);
    expect(repairHull.options(withHull(49), memory)).toHaveLength(1);
    expect(shower.options(withHull(49), memory)).toEqual([]);
  });

  it("can rest in the same bed again later in the cycle", async () => {
    const { game: start, id } = setup();
    const bed = roomsWith(viewFor(start, id), ["BED"])[0]!;
    const game = edit(start, id, (p) => {
      p.room = bed;
      p.ap = 3;
    });
    const bot = new GoalBot(1, 2, [rest]);
    const view = viewFor(game, id);
    expect((await bot.decideAction(view))?.type).toBe("lie_down");
    await bot.decideAction({ ...view, you: { ...view.you, ap: view.maxAp } });
    expect((await bot.decideAction(view))?.type).toBe("lie_down");
  });

  it("eats when hungry: food at hand, or a coffee from the dispenser", async () => {
    const { game: start, id } = setup();
    const game = edit(start, id, (p) => {
      p.satiety = 0;
      p.satietyZeroSince = start.cycle - 100;
    });
    expect(viewFor(game, id).statuses).toContain("hungry");
    const { taken } = await play(game, id, new GoalBot(1, 2, SOLO_GOALS.filter((g) => g.id === "eat")), 25);
    expect(taken.some((a) => a.type === "consume")).toBe(true);
  });

  it("doesn't choose a failed goal again this cycle, and does next cycle", async () => {
    const { game, id } = setup();
    let tries = 0;
    const always: GoalDef = { id: "stuck", priority: 1, options: () => [{ id: "stuck", key: "stuck", label: "test", step: () => (tries++, { kind: "failed", reason: "test" }) }] };
    const bot = new GoalBot(1, 2, [always]);
    const view = viewFor(game, id);
    expect(await bot.decideAction(view)).toEqual({ type: "ready" });
    expect(await bot.decideAction(view)).toEqual({ type: "ready" });
    expect(tries).toBe(1);
    await bot.decideAction({ ...view, cycle: view.cycle + 1 });
    expect(tries).toBe(2);
  });

  it("never sends an action its view doesn't offer, and gives the goal up instead", async () => {
    const { game, id } = setup();
    const bogus: GoalDef = {
      id: "bogus",
      priority: 1,
      options: () => [{ id: "bogus", key: "bogus", label: "test", step: () => ({ kind: "act", action: { type: "move", to: "NOWHERE" } }) }],
    };
    const bot = new GoalBot(1, 2, [bogus]);
    expect(await bot.decideAction(viewFor(game, id))).toEqual({ type: "ready" });
  });

  it("gives a goal up after too many actions", async () => {
    const { game, id } = setup();
    const view = viewFor(game, id);
    const move = legalIn(view).find((a) => a.type === "move")!;
    const forever: GoalDef = { id: "forever", priority: 1, options: () => [{ id: "forever", key: "forever", label: "test", step: () => ({ kind: "act", action: move }) }] };
    const bot = new GoalBot(1, 2, [forever]);
    for (let i = 0; i < GOAL_MAX_ACTIONS; i++) expect(await bot.decideAction(view)).toEqual(move);
    expect(await bot.decideAction(view)).toEqual({ type: "ready" });
  });

  it("drops a goal the room refused, and chooses again", async () => {
    const { game, id } = setup();
    const view = viewFor(game, id);
    const move = legalIn(view).find((a) => a.type === "move")!;
    const once: GoalDef = { id: "once", priority: 1, options: () => [{ id: "once", key: "once", label: "test", step: () => ({ kind: "act", action: move }) }] };
    const bot = new GoalBot(1, 2, [once]);
    expect(await bot.decideAction(view)).toEqual(move);
    bot.refused();
    expect(await bot.decideAction(view)).toEqual({ type: "ready" });
  });

  it("thinks again when it loses HP, or a new cycle starts", async () => {
    const { game, id } = setup();
    const view = viewFor(game, id);
    const move = legalIn(view).find((a) => a.type === "move")!;
    let chosen = 0;
    const counting: GoalDef = {
      id: "count",
      priority: 1,
      options: () => [{ id: "count", key: `count:${++chosen}`, label: "test", step: () => ({ kind: "act", action: move }) }],
    };
    const bot = new GoalBot(1, 2, [counting]);
    await bot.decideAction(view);
    await bot.decideAction(view);
    expect(chosen).toBe(1);
    await bot.decideAction({ ...view, you: { ...view.you, hp: view.you.hp - 1 } });
    expect(chosen).toBe(2);
    await bot.decideAction({ ...view, cycle: view.cycle + 1, you: { ...view.you, hp: view.you.hp - 1 } });
    expect(chosen).toBe(3);
  });
});
