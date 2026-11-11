import { DEFAULT_CONFIG, applyAction, legalIn, newCycle, startGame, viewFor, type Action, type CharacterId, type GameState, type PlayerView } from "@mush2/shared";
import { describe, expect, it } from "vitest";
import { GOAL_MAX_ACTIONS, GoalBot } from "../src/bots.ts";
import { astro } from "../src/bots/goals/astro.ts";
import { canAfford, goTo, roomsWith, travelAp } from "../src/bots/goals/blocks.ts";
import { commsOfficer } from "../src/bots/goals/commsOfficer.ts";
import { contactSol } from "../src/bots/goals/contactSol.ts";
import { SOLO_GOALS } from "../src/bots/goals/index.ts";
import { repairHull } from "../src/bots/goals/repairHull.ts";
import { rest } from "../src/bots/goals/rest.ts";
import { research } from "../src/bots/goals/research.ts";
import { project } from "../src/bots/goals/project.ts";
import { SHRINK_DESK_WORK_WITHIN } from "../src/bots/goals/work.ts";
import { patrolShootHunters } from "../src/bots/goals/patrolShootHunters.ts";
import { shootHunters } from "../src/bots/goals/shootHunters.ts";
import { shower } from "../src/bots/goals/shower.ts";
import { DORMS, shrinkDorm } from "../src/bots/goals/shrinkDorm.ts";
import { snoop } from "../src/bots/goals/snoop.ts";
import { BOT_EAT_AFTER_CYCLES, eat } from "../src/bots/goals/eat.ts";
import { tendPlants } from "../src/bots/goals/tendPlants.ts";
import { helpGoal, helpTasks } from "../src/bots/goals/help.ts";
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
const memory = (scripted = true) => ({
  reserve: 2,
  scripted,
  ended: new Set<string>(),
  today: new Set<string>(),
  visited: new Set<string>(),
  shrinks: new Set<string>(),
  roll: roll0,
});

/** Plays one bot until it ends its cycle (or 60 turns), every action legal and applied. */
async function untilReady(game: GameState, id: string, bot: GoalBot): Promise<{ game: GameState; taken: Action[] }> {
  const taken: Action[] = [];
  for (let t = 0; t < 60; t++) {
    const view = viewFor(game, id);
    const action = await bot.decideAction(view);
    if (action === null || action.type === "ready") break;
    expect(isLegal(view, action), JSON.stringify(action)).toBe(true);
    const result = applyAction(game, id, action);
    expect(result.ok).toBe(true);
    if (result.ok) game = result.state;
    taken.push(action);
  }
  return { game, taken };
}

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
    expect(pick("terrence", ["engineer"])).toBe("metaliciste");
    expect(pick("terrence", ["engineer", "metaliciste"])).toBe("pilot");
    expect(pick("terrence", ["engineer", "metaliciste", "pilot"])).toBe("gunman");
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
    // About 4s alone; the 5s default times out under the full parallel suite.
  }, 20_000);

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
    const memory = { reserve: 2, scripted: true, language: "en" as const, ended: new Set<string>(), today: new Set<string>(), visited: new Set<string>(), roll: roll0 };
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

  it("snoops once as a Scrapper in a storage room, and not elsewhere", async () => {
    const { game: start, id } = setup();
    const game = edit(start, id, (p) => {
      p.skills = ["metaliciste"];
      p.room = "STORAGE_FRONT";
    });
    const { game: after, taken } = await play(game, id, new GoalBot(1, 2, [snoop]), 3);
    expect(taken).toEqual([{ type: "snoop" }]);
    const mine = (g: typeof game) => g.items.filter((i) => i.at.kind === "player" && i.at.id === id).length;
    expect(mine(after)).toBe(mine(game) + 1);
    const elsewhere = edit(start, id, (p) => {
      p.skills = ["metaliciste"];
      p.room = "LABORATORY";
    });
    expect(await new GoalBot(1, 2, [snoop]).decideAction(viewFor(elsewhere, id))).toEqual({ type: "ready" });
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

describe("shootHunters", () => {
  /** A game where hunters attack: two weak and one strong, with a Gunner bot given plenty of AP. */
  function attacked(skill: "gunman" | "gunner" | null = "gunner"): { game: GameState; id: string } {
    const { game: start, id } = setup();
    const game = edit(start, id, (p) => {
      p.ap = 10;
      p.mp = 12;
      p.skills = skill ? [skill] : [];
      p.resources.shoot = 0;
    });
    game.hunters.list = [
      { id: "h1", hp: 6, hitChance: 0, target: null },
      { id: "h2", hp: 2, hitChance: 0, target: null },
    ];
    return { game, id };
  }

  it("isn't offered while no hunter attacks, or without Shooter or Gunner", () => {
    const { game: start, id } = setup();
    expect(shootHunters.options(viewFor(edit(start, id, (p) => (p.skills = ["gunner"])), id), memory())).toEqual([]);
    const noSkill = attacked(null);
    expect(shootHunters.options(viewFor(noSkill.game, noSkill.id), memory())).toEqual([]);
    const shooter = attacked("gunman");
    expect(shootHunters.options(viewFor(shooter.game, shooter.id), memory())).toHaveLength(1);
    const gunner = attacked("gunner");
    expect(shootHunters.options(viewFor(gunner.game, gunner.id), memory())).toHaveLength(1);
  });

  it("walks to the nearest turret and shoots the weakest hunter, spending all its AP, the reserve too", async () => {
    const { game: start, id } = attacked();
    for (const t of Object.values(start.equipment).flat().filter((e) => e.type === "TURRET_COMMAND")) start.turrets[t.id] = 20;
    start.hunters.list[0]!.hp = 99;
    start.hunters.list[1]!.hp = 99;
    start.hunters.list.push({ id: "h3", hp: 1, hitChance: 0, target: null });
    const { game: end, taken } = await untilReady(start, id, new GoalBot(1, 2, [shootHunters]));
    const shots = taken.filter((a) => a.type === "turret_attack");
    expect(shots[0]).toMatchObject({ hunter: "h3" });
    expect(taken.slice(0, taken.indexOf(shots[0]!)).every((a) => a.type === "move")).toBe(true);
    expect(end.players.find((p) => p.id === id)!.ap).toBe(0);
  });

  it("is offered to a scripted bot only at 5 AP or more, to a model whenever it can afford a shot", () => {
    const { game: start, id } = attacked();
    const turretRoom = roomsWith(viewFor(start, id), ["TURRET_COMMAND"])[0]!;
    const game = edit(start, id, (p) => {
      p.room = turretRoom;
      p.ap = 4;
    });
    expect(shootHunters.options(viewFor(game, id), memory(true))).toEqual([]);
    expect(shootHunters.options(viewFor(game, id), memory(false))).toHaveLength(1);
    expect(shootHunters.options(viewFor(edit(game, id, (p) => (p.ap = 5)), id), memory(true))).toHaveLength(1);
  });

  it("gets a resting bot up when hunters attack and it has 5 AP, and leaves it in bed with 4", async () => {
    const { game: start, id } = setup();
    const bed = roomsWith(viewFor(start, id), ["BED"])[0]!;
    let game = edit(start, id, (p) => {
      p.room = bed;
      p.ap = 1;
      p.skills = ["gunner"];
    });
    const bot = new GoalBot(1, 2, [shootHunters, rest]);
    const lie = await bot.decideAction(viewFor(game, id));
    expect(lie?.type).toBe("lie_down");
    const r = applyAction(game, id, lie!);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    game = r.state;
    game.hunters.list = [{ id: "h1", hp: 6, hitChance: 0, target: null }];
    let cycles = 0;
    const nextCycle = (ap: number): PlayerView => {
      const view = viewFor(edit(game, id, (p) => (p.ap = ap)), id);
      return { ...view, cycle: view.cycle + ++cycles };
    };
    expect(await bot.decideAction(nextCycle(4))).toEqual({ type: "ready" });
    expect(bot.current).toMatch(/^rest:/);
    expect((await bot.decideAction(nextCycle(5)))?.type).not.toBe("ready");
    expect(bot.current).toMatch(/^shootHunters:/);
  });

  it("fails at a turret room with no charges left, and the next turret room is offered", () => {
    const { game: start, id } = attacked();
    const turretRoom = roomsWith(viewFor(start, id), ["TURRET_COMMAND"])[0]!;
    const game = edit(start, id, (p) => {
      p.room = turretRoom;
    });
    for (const t of game.equipment[turretRoom]!.filter((e) => e.type === "TURRET_COMMAND")) game.turrets[t.id] = 0;
    const view = viewFor(game, id);
    const m = memory();
    const [goal] = shootHunters.options(view, m);
    expect(goal!.key).toBe(`shootHunters:${turretRoom}`);
    expect(goal!.step(view, m)).toEqual({ kind: "failed", reason: "no_charges" });
    m.ended.add(goal!.key);
    expect(shootHunters.options(view, m)[0]!.key).not.toBe(goal!.key);
  });
});

describe("patrolShootHunters", () => {
  const BAY = "SPACESHIP_BAY_A";
  /** A Pilot in bay A while two tough hunters attack. */
  function pilot(ap: number, room = BAY): { game: GameState; id: string } {
    const { game: start, id } = setup();
    const game = edit(start, id, (p) => {
      p.room = room;
      p.ap = ap;
      p.mp = 12;
      if (!p.skills.includes("pilot")) p.skills.push("pilot");
      p.resources.shoot = 0;
    });
    game.hunters.list = [
      { id: "h1", hp: 99, hitChance: 0, target: null },
      { id: "h2", hp: 99, hitChance: 0, target: null },
    ];
    return { game, id };
  }

  it("is offered to a scripted Pilot at 9 AP, not at 8, and never to someone who can't fly", () => {
    expect(patrolShootHunters.options(viewFor(pilot(8).game, pilot(8).id), memory())).toEqual([]);
    const { game, id } = pilot(9);
    expect(patrolShootHunters.options(viewFor(game, id), memory())[0]!.key).toBe(`patrolShootHunters:${BAY}`);
    expect(patrolShootHunters.options(viewFor(edit(game, id, (p) => (p.skills = [])), id), memory())).toEqual([]);
    // A model may take off as soon as one sortie (takeoff, a shot, the landing) is paid for.
    expect(patrolShootHunters.options(viewFor(pilot(5).game, pilot(5).id), memory(false))).toHaveLength(1);
  });

  it("takes off, shoots until only the AP to land is left, and lands", async () => {
    const { game, id } = pilot(9);
    const { game: end, taken } = await untilReady(game, id, new GoalBot(1, 2, [patrolShootHunters]));
    // 9 AP: 2 to take off, 5 shots of 1, 2 to land.
    expect(taken.map((a) => a.type)).toEqual(["takeoff", ...Array(5).fill("patrol_attack"), "land"]);
    const me = end.players.find((p) => p.id === id)!;
    expect(me.room).toBe(BAY);
    expect(me.ap).toBe(0);
  });

  it("never takes out the Pasiphae", () => {
    const { game, id } = pilot(9, "SPACESHIP_BAY_AA");
    game.patrolShips["PATROL_SHIP_AA_0"]!.out = true;
    const view = viewFor(game, id);
    const [goal] = patrolShootHunters.options(view, memory());
    expect(goal!.step(view, memory())).toEqual({ kind: "failed", reason: "no_ship" });
  });

  it("aboard, is the only goal offered, and lands once the hunters are gone", async () => {
    const { game, id } = pilot(6, "PATROL_SHIP_A_0");
    game.patrolShips["PATROL_SHIP_A_0"]!.out = true;
    game.hunters.list = [];
    const bot = new GoalBot(1);
    expect(await bot.decideAction(viewFor(game, id))).toEqual({ type: "land", equipment: "PATROL_SHIP_A_0:PATROL_COMMAND" });
    expect(bot.current).toBe("patrolShootHunters:aboard");
  });
});

describe("eat", () => {
  /** A human with satiety at 0 for `cycles` cycles and plenty of AP. */
  const starving = (cycles: number, ap = 10) => {
    const { game: start, id } = setup();
    const game = edit(start, id, (p) => {
      p.satiety = 0;
      p.satietyZeroSince = start.cycle - cycles;
      p.ap = ap;
    });
    return { game, id };
  };

  it(`goes for food after ${BOT_EAT_AFTER_CYCLES} cycles at 0 satiety, not before`, () => {
    const early = starving(BOT_EAT_AFTER_CYCLES - 1);
    expect(eat.options(viewFor(early.game, early.id), memory())).toEqual([]);
    const due = starving(BOT_EAT_AFTER_CYCLES);
    expect(viewFor(due.game, due.id).statuses).not.toContain("hungry");
    expect(eat.options(viewFor(due.game, due.id), memory())).toHaveLength(1);
  });

  it("walks to the refectory, cooks a ration, and eats it", async () => {
    const { game, id } = starving(BOT_EAT_AFTER_CYCLES);
    const { taken } = await play(game, id, new GoalBot(1, 2, [eat]), 30);
    const cook = taken.findIndex((a) => a.type === "cook");
    expect(cook).toBeGreaterThanOrEqual(0);
    expect(taken[cook + 1]).toEqual({ type: "consume", item: (taken[cook] as { item: string }).item });
  });

  it("eats a ration raw when cooking would dip into the AP reserve", async () => {
    const { game: start, id } = starving(BOT_EAT_AFTER_CYCLES, 2);
    const game = edit(start, id, (p) => (p.room = "REFECTORY"));
    const bot = new GoalBot(1, 2, [eat]);
    expect((await bot.decideAction(viewFor(game, id)))?.type).toBe("consume");
  });

  it("tries the garden once the refectory has failed", () => {
    const { game, id } = starving(BOT_EAT_AFTER_CYCLES);
    const view = viewFor(game, id);
    const m = memory();
    for (const room of roomsWith(view, ["KITCHEN", "COFFEE_DISPENSER"])) m.ended.add(`eat:${room}`);
    expect(eat.options(view, m).map((g) => g.key)).toEqual([`eat:${view.config.gardenRoom}`]);
  });

  it("eats a banana it finds in the garden", async () => {
    const { game: start, id } = starving(BOT_EAT_AFTER_CYCLES);
    const game = edit(start, id, (p) => (p.room = start.config.botany.gardenRoom));
    game.items.push({ id: "test-banana", type: "fruit_banana", at: { kind: "room", id: game.config.botany.gardenRoom } });
    expect(await new GoalBot(1, 2, [eat]).decideAction(viewFor(game, id))).toEqual({ type: "consume", item: "test-banana" });
  });
});

/** Plays one bot until it ends its cycle (no new cycle, so no fresh plant sickness or thirst). */
async function oneCycle(game: GameState, id: string, bot: GoalBot): Promise<{ game: GameState; taken: Action[] }> {
  const taken: Action[] = [];
  for (let t = 0; t < 40; t++) {
    const action = await bot.decideAction(viewFor(game, id));
    if (!action || action.type === "ready") break;
    const r = applyAction(game, id, action);
    expect(r.ok, JSON.stringify(action)).toBe(true);
    if (r.ok) game = r.state;
    taken.push(action);
  }
  return { game, taken };
}

describe("tendPlants", () => {
  /** A bot with the given skills, plenty of AP, no garden points, and every garden plant thirsty. */
  const gardener = (skills: string[]) => {
    const { game: start, id } = setup();
    const game = edit(start, id, (p) => {
      p.skills = skills as typeof p.skills;
      p.ap = 10;
      p.resources.garden = 0;
    });
    for (const pot of game.items) if (pot.plant) pot.plant.thirst = 1;
    return { game, id };
  };

  it("is only for the Botanist role", () => {
    const other = gardener(["pilot"]);
    expect(tendPlants.options(viewFor(other.game, other.id), memory())).toEqual([]);
    for (const skill of ["botanic", "skilful"]) {
      const g = gardener([skill]);
      expect(tendPlants.options(viewFor(g.game, g.id), memory())).toHaveLength(1);
    }
  });

  it("walks to the garden, waters every thirsty plant, treats a sick one, and sows a banana from the floor", async () => {
    const { game, id } = gardener(["botanic"]);
    const garden = game.config.botany.gardenRoom;
    const sick = game.items.find((i) => i.plant && i.at.kind === "room" && i.at.id === garden)!;
    sick.plant!.sick = true;
    game.items.push({ id: "test-banana", type: "fruit_banana", at: { kind: "room", id: garden } });
    const bot = new GoalBot(1, 2, [tendPlants]);
    const { game: after, taken } = await oneCycle(game, id, bot);
    const pots = after.items.filter((i) => i.type === "tree_pot" && i.at.kind === "room" && i.at.id === garden);
    expect(pots.every((p) => p.plant && p.plant.thirst === 0)).toBe(true);
    expect(pots.some((p) => p.plant?.sick)).toBe(false);
    expect(taken.map((a) => a.type).filter((t) => t !== "move")).toEqual(["water", "water", "treat", "take", "sow"]);
    expect(after.items.some((i) => i.id === "test-banana")).toBe(false);
  });

  it("goes once a day: not again after tending, until the day changes", async () => {
    const { game, id } = gardener(["botanic"]);
    const bot = new GoalBot(1, 2, [tendPlants]);
    const { game: g } = await oneCycle(game, id, bot);
    // Step away from the garden: nothing more today.
    const away = edit(g, id, (p) => (p.room = "REFECTORY"));
    expect(await bot.decideAction(viewFor(away, id))).toEqual({ type: "ready" });
    const tomorrow = edit(away, id, () => {});
    tomorrow.cycle += tomorrow.config.cyclesPerDay;
    expect((await bot.decideAction(viewFor(tomorrow, id)))?.type).toBe("move");
  });

  it("keeps the AP reserve, and garden points pay in the garden", () => {
    const { game: start, id } = gardener(["botanic"]);
    const garden = start.config.botany.gardenRoom;
    const broke = edit(start, id, (p) => {
      p.room = garden;
      p.ap = 2;
    });
    expect(tendPlants.options(viewFor(broke, id), memory())).toEqual([]);
    const points = edit(broke, id, (p) => (p.resources.garden = 2));
    expect(tendPlants.options(viewFor(points, id), memory())).toHaveLength(1);
  });

  it("marks today only once the garden jobs are done, so an interrupted Botanist comes back", () => {
    const { game: start, id } = gardener(["botanic"]);
    const garden = start.config.botany.gardenRoom;
    const inGarden = edit(start, id, (p) => (p.room = garden));
    const m = memory();
    const [goal] = tendPlants.options(viewFor(inGarden, id), m);
    expect(goal!.step(viewFor(inGarden, id), m).kind).toBe("act");
    expect(m.today.has(`tendPlants:${garden}`)).toBe(false);
  });
});

describe("shrinkDorm", () => {
  /** A bot with the given skills and AP, standing in the refectory on `day`. */
  const crew = (skills: string[], ap = 4, day = 1) => {
    const { game: start, id } = setup();
    const game = edit(start, id, (p) => {
      p.skills = skills as typeof p.skills;
      p.ap = ap;
      p.room = "REFECTORY";
    });
    game.cycle = (day - 1) * game.config.cyclesPerDay + 1;
    return { game, id };
  };
  const room = (game: GameState, id: string) => game.players.find((p) => p.id === id)!.room;

  it("is only for a Shrink, and alternates between the two dorms by day", () => {
    const other = crew(["pilot"]);
    expect(shrinkDorm.options(viewFor(other.game, other.id), memory())).toEqual([]);
    const keys = [1, 2, 3].map((day) => {
      const s = crew(["shrink"], 4, day);
      const view = viewFor(s.game, s.id);
      expect(view.day).toBe(day);
      return shrinkDorm.options(view, memory())[0]?.key;
    });
    expect(new Set(keys).size).toBe(2);
    expect(keys[0]).toBe(keys[2]);
    expect(keys.map((k) => k?.split(":")[1]).every((r) => DORMS.includes(r!))).toBe(true);
  });

  it("walks to today's dorm, lies down when its AP isn't full, and stays until the cycle ends", async () => {
    const { game, id } = crew(["shrink"]);
    const dorm = shrinkDorm.options(viewFor(game, id), memory())[0]!.key.split(":")[1];
    const bot = new GoalBot(1, 2, [shrinkDorm]);
    const { game: after, taken } = await oneCycle(game, id, bot);
    expect(room(after, id)).toBe(dorm);
    expect(taken.at(-1)?.type).toBe("lie_down");
    expect(await bot.decideAction(viewFor(after, id))).toEqual({ type: "ready" });
  });

  it("with full AP, waits in the dorm without lying down", async () => {
    const { game: start, id } = crew(["shrink"]);
    const game = edit(start, id, (p) => (p.ap = viewFor(start, id).maxAp));
    const { game: after, taken } = await oneCycle(game, id, new GoalBot(1, 2, [shrinkDorm]));
    expect(DORMS).toContain(room(after, id));
    expect(taken.every((a) => a.type === "move")).toBe(true);
  });

  it("goes once a day, stays across cycles on the same day, and comes back if interrupted before the cycle ends", async () => {
    const { game, id } = crew(["shrink"]);
    const m = memory();
    const [walking] = shrinkDorm.options(viewFor(game, id), m);
    expect(walking!.step(viewFor(game, id), m).kind).toBe("act");
    expect(m.today.has("shrinkDorm")).toBe(false);

    const bot = new GoalBot(1, 2, [shrinkDorm]);
    const { game: g } = await oneCycle(game, id, bot);
    expect(bot.current).toMatch(/^shrinkDorm:/);
    // Still in the dorm on the next cycle of the same day: keeps the goal across the cycle boundary.
    const nextCycleSameDay = edit(g, id, () => {});
    nextCycleSameDay.cycle += 1;
    expect(await bot.decideAction(viewFor(nextCycleSameDay, id))).toEqual({ type: "ready" });
    expect(bot.current).toMatch(/^shrinkDorm:/);

    // If hurt in the dorm before the cycle ended, today is cleared so the Shrink can return once safe.
    const hurt = edit(nextCycleSameDay, id, (p) => {
      p.hp -= 1;
      p.room = "REFECTORY";
      p.lyingIn = undefined;
    });
    expect((await bot.decideAction(viewFor(hurt, id)))?.type).toBe("move");

    const { game: g2 } = await oneCycle(hurt, id, bot);
    const away = edit(g2, id, (p) => {
      p.room = "REFECTORY";
      p.lyingIn = undefined;
    });
    away.cycle += 1;
    expect(await bot.decideAction(viewFor(away, id))).toEqual({ type: "ready" });
    away.cycle += away.config.cyclesPerDay;
    expect((await bot.decideAction(viewFor(away, id)))?.type).toBe("move");
  });

  it("holds off on sending ready while a living human player is not yet ready", async () => {
    const { game: start, id } = crew(["shrink"]);
    const human = start.players.find((p) => p.id !== id && p.alive)!;
    const withHuman = edit(start, human.id, (p) => {
      p.isBot = false;
      p.ready = false;
    });
    const bot = new GoalBot(1, 2, []);
    expect(await bot.decideAction(viewFor(withHuman, id))).toBeNull();
    const humanReady = edit(withHuman, human.id, (p) => (p.ready = true));
    expect(await bot.decideAction(viewFor(humanReady, id))).toEqual({ type: "ready" });
  });
});

describe("a Shrink holds its AP", () => {
  /** A bot with `skills` and `ap`, standing in the lab, clean and with no free points. */
  const inLab = (skills: string[], ap: number) => {
    const { game: start, id } = setup(3);
    const lab = roomsWith(viewFor(start, id), ["RESEARCH_LAB"])[0]!;
    const game = edit(start, id, (p) => {
      p.skills = skills as typeof p.skills;
      p.ap = ap;
      p.room = lab;
      p.resources.comp = 0;
      p.resources.core = 0;
    });
    return { game, id };
  };
  const ap = (game: GameState, id: string) => game.players.find((p) => p.id === id)!.ap;

  it("researches and works on projects only within 4 AP of its max", () => {
    const max = viewFor(setup().game, setup().id).maxAp;
    const line = max - SHRINK_DESK_WORK_WITHIN;
    const cost = DEFAULT_CONFIG.research.cost.ap;
    for (const goal of [research, project]) {
      const held = inLab(["shrink"], line + cost - 1);
      expect(goal.options(viewFor(held.game, held.id), memory()), goal.id).toEqual([]);
      const other = inLab(["pilot"], line + cost - 1);
      expect(goal.options(viewFor(other.game, other.id), memory()).length, goal.id).toBeGreaterThan(0);
    }
    const full = inLab(["shrink"], max);
    expect(research.options(viewFor(full.game, full.id), memory())).toHaveLength(1);
    const dirtyShrink = edit(inLab(["shrink"], line + cost).game, inLab(["shrink"], line + cost).id, (p) => p.statuses.push("dirty"));
    expect(shower.options(viewFor(dirtyShrink, inLab(["shrink"], line + cost).id), memory())).toEqual([]);
    const dirtyFull = edit(full.game, full.id, (p) => p.statuses.push("dirty"));
    expect(shower.options(viewFor(dirtyFull, full.id), memory())).toHaveLength(1);
  });

  it("near the cap, works only down to the line", async () => {
    const max = viewFor(setup().game, setup().id).maxAp;
    const { game, id } = inLab(["shrink"], max);
    const { game: after, taken } = await oneCycle(game, id, new GoalBot(1, 2, [research]));
    expect(taken.some((a) => a.type === "research")).toBe(true);
    expect(ap(after, id)).toBeGreaterThanOrEqual(max - SHRINK_DESK_WORK_WITHIN);
    expect(ap(after, id)).toBeLessThan(max - SHRINK_DESK_WORK_WITHIN + DEFAULT_CONFIG.research.cost.ap);
  });
});

describe("help", () => {
  const name = (id: string) => id;
  /** The bot and another human, both in `room`. */
  function pair(room: string, change: (p: GameState["players"][number]) => void = () => {}) {
    const { game: start, id } = setup();
    const other = start.players.find((p) => p.id !== id && p.alive)!.id;
    let game = edit(start, id, (p) => {
      p.room = room;
      p.ap = 10;
      change(p);
    });
    game = edit(game, other, (p) => (p.room = room));
    return { game, id, other };
  }
  /** Steps a goal to the end, applying each action; returns the actions and how it ended. */
  function run(game: GameState, id: string, goal: ReturnType<typeof helpGoal>) {
    const taken: Action[] = [];
    const m = memory(false);
    for (let i = 0; i < 30; i++) {
      const view = viewFor(game, id);
      const step = goal.step(view, m);
      if (step.kind !== "act") return { game, taken, end: step };
      expect(isLegal(view, step.action), JSON.stringify(step.action)).toBe(true);
      const r = applyAction(game, id, step.action);
      expect(r.ok).toBe(true);
      if (r.ok) game = r.state;
      taken.push(step.action);
    }
    throw new Error("didn't end");
  }

  it("offers healing to anyone, comforting to a Shrink, a speech to a Leader", () => {
    const { game, id } = setup();
    expect(helpTasks(viewFor(game, id))).toEqual(["heal"]);
    expect(helpTasks(viewFor(edit(game, id, (p) => (p.skills = ["shrink", "leadership"])), id))).toEqual(["heal", "comfort", "fiery_speech"]);
  });

  it("walks to the room it was told, then heals the person there", () => {
    const { game: g, id, other } = pair("SICK_BAY");
    const game = edit(g, id, (p) => (p.room = "REFECTORY"));
    const { taken, end } = run(game, id, helpGoal({ task: "heal", target: other, room: "SICK_BAY", times: 1, spendReserve: false }, name));
    expect(taken.length).toBeGreaterThan(1);
    expect(taken.slice(0, -1).every((a) => a.type === "move")).toBe(true);
    expect(taken.at(-1)).toEqual({ type: "heal", target: other });
    expect(end.kind).toBe("done");
  });

  it("fails on arrival when the person isn't there", () => {
    const { game: g, id, other } = pair("SICK_BAY");
    const game = edit(g, other, (p) => (p.room = "BRIDGE"));
    expect(run(game, id, helpGoal({ task: "heal", target: other, room: "SICK_BAY", times: 1, spendReserve: false }, name)).end).toEqual({ kind: "failed", reason: "not_here" });
  });

  it("comforts as many times as asked, keeping the reserve unless told it may spend it", () => {
    const shrink = (ap: number) => pair("LABORATORY", (p) => ((p.skills = ["shrink"]), (p.ap = ap)));
    const comfort = (other: string, times: number, spendReserve: boolean) => helpGoal({ task: "comfort", target: other, room: "LABORATORY", times, spendReserve }, name);
    const a = shrink(10);
    expect(run(a.game, a.id, comfort(a.other, 3, false)).taken).toHaveLength(3);
    const b = shrink(4);
    expect(run(b.game, b.id, comfort(b.other, 5, false)).taken).toHaveLength(2);
    const c = shrink(4);
    expect(run(c.game, c.id, comfort(c.other, 5, true)).taken).toHaveLength(4);
  });
});

describe("astro (#222)", () => {
  const stargazer = (skills: string[], ap = 6) => {
    const { game: start, id } = setup();
    const game = edit(start, id, (p) => {
      p.skills = skills as typeof p.skills;
      p.ap = ap;
      p.mp = 12;
    });
    return { game, id };
  };

  it("is only for an Astrophysicist, and stops when all maxPlanets are fully analyzed", () => {
    const other = stargazer(["pilot"]);
    expect(astro.options(viewFor(other.game, other.id), memory())).toEqual([]);
    const { game, id } = stargazer(["astrophysician"]);
    expect(astro.options(viewFor(game, id), memory())).toHaveLength(1);
    game.planets[id] = [
      { id: "pl-1", name: "Alpha", direction: "north", distance: 3, size: 2, sectors: [{ tag: "OXYGEN", known: true }] },
      { id: "pl-2", name: "Beta", direction: "south", distance: 4, size: 2, sectors: [{ tag: "HYDROCARBON", known: true }] },
    ];
    expect(astro.options(viewFor(game, id), memory())).toEqual([]);
  });

  it("analyzes an unanalyzed planet before scanning, works down to the AP reserve, and goes once a day", async () => {
    const { game, id } = stargazer(["astrophysician"], 6);
    game.planets[id] = [
      {
        id: "pl-1",
        name: "Alpha",
        direction: "north",
        distance: 3,
        size: 2,
        sectors: [
          { tag: "OXYGEN", known: false },
          { tag: "HYDROCARBON", known: false },
        ],
      },
    ];
    const bot = new GoalBot(1, 2, [astro]);
    const { game: after, taken } = await oneCycle(game, id, bot);
    const work = taken.filter((a) => a.type !== "move");
    // 6 AP -> 2 AP reserve = 4 AP spent: first analyze_planet (2 AP, reveals 2 sectors for Astrophysicist), then scan_planet (2 AP).
    expect(work.map((a) => a.type)).toEqual(["analyze_planet", "scan_planet"]);
    expect(after.players.find((p) => p.id === id)!.ap).toBe(2);
    // Done for today, even with more AP later in the same day.
    const refilled = edit(after, id, (p) => (p.ap = 8));
    expect(await bot.decideAction(viewFor(refilled, id))).toEqual({ type: "ready" });
    // Tomorrow it is offered again.
    refilled.cycle += refilled.config.cyclesPerDay;
    expect(await bot.decideAction(viewFor(refilled, id))).not.toEqual({ type: "ready" });
  });
});

describe("contactSol and commsOfficer (#222)", () => {
  it("Radio Expert tries contact_sol while the link is down, down to the AP reserve or until linked", async () => {
    const { game: start, id } = setup();
    expect(contactSol.options(viewFor(edit(start, id, (p) => (p.skills = ["pilot"])), id), memory())).toEqual([]);
    const game = edit(start, id, (p) => {
      p.skills = ["radio_expert"];
      p.ap = 6;
      p.mp = 12;
    });
    const bot = new GoalBot(1, 2, [contactSol]);
    const { game: after, taken } = await oneCycle(game, id, bot);
    const tries = taken.filter((a) => a.type === "contact_sol");
    expect(tries.length).toBeGreaterThanOrEqual(1);
    expect(after.comms.linked || after.players.find((p) => p.id === id)!.ap === 2).toBe(true);
    after.comms.linked = true;
    expect(contactSol.options(viewFor(after, id), memory())).toEqual([]);
  });

  it("Comms Officer decodes open rebel calls first, then contacts Xyloph, then updates NERON while linked", async () => {
    const { game: start, id } = setup();
    start.comms.linked = true;
    // Not the Comms Officer -> not offered.
    start.titles.comms_officer = start.players.find((p) => p.id !== id)!.id;
    expect(commsOfficer.options(viewFor(start, id), memory())).toEqual([]);

    start.titles.comms_officer = id;
    start.comms.rebels = [{ base: "WOLF", calledAt: 1, expiresAt: start.cycle + 10, progress: 95 }];
    const game = edit(start, id, (p) => {
      p.room = "COMMAND_CENTER";
      p.ap = 8;
      p.resources.comp = 0;
    });
    const m = memory();
    const [goal] = commsOfficer.options(viewFor(game, id), m);
    expect(goal).toBeDefined();
    // 1. Open rebel call -> decode_rebel
    const step1 = goal!.step(viewFor(game, id), m);
    expect(step1).toMatchObject({ kind: "act", action: { type: "decode_rebel", base: "WOLF" } });
    // 2. Once rebel call is contacted, Xyloph entries remain -> contact_xyloph
    game.comms.rebels[0]!.progress = 100;
    const step2 = goal!.step(viewFor(game, id), m);
    expect(step2).toMatchObject({ kind: "act", action: { type: "contact_xyloph" } });
    // 3. Once all Xyloph entries are found -> update_neron
    game.comms.xyloph = [
      "NOTHING",
      "SNOW_CRASH",
      "WIREFLESS_INFIDELITY",
      "MUSH_GENOME_DATA",
      "LOST_ANALYSIS",
      "NILS_CARLSSON_CONTACT",
      "NERON_BOOST",
      "KIVANC_TERZI_CONTACT",
      "COOK_BIBLE",
      "ZONG_CHUN_SAMPLE",
      "SCHOOL_MANUALS",
      "WORKSHOP_MANUALS",
    ];
    const step3 = goal!.step(viewFor(game, id), m);
    expect(step3).toMatchObject({ kind: "act", action: { type: "update_neron" } });
  });
});
