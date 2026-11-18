import { addSignal, CHAT_PAGE, DEFAULT_CONFIG, ITRACKIE_ITEM, SHIP_ROOMS, applyAction, applyInput, breakDoor, doorId, doorRooms, legalIn, pushChat, newCycle, shortestPath, startGame, viewFor, type Action, type CharacterId, type GameState, type PlayerView, type ProjectId, rebelCalls } from "@mush2/shared";
import { describe, expect, it } from "vitest";
import { GOAL_MAX_ACTIONS, GoalBot } from "../src/bots.ts";
import { astro, chooseDestination, judgePlanet } from "../src/bots/goals/astro.ts";
import { CANCEL_HOLD_LINE, HOLD_JUMP_LINE, JUMP_NOW_LINE, crewAboard, formatPlanetShare, holdStartCycle, isHoldingJump, isJumpDue, newJumpMemory, parseJumpHold, parsePlanetShare } from "../src/bots/planetShare.ts";
import { canAfford, goTo, roomsWith, travelAp } from "../src/bots/goals/blocks.ts";
import { commsOfficer } from "../src/bots/goals/commsOfficer.ts";
import { contactSol } from "../src/bots/goals/contactSol.ts";
import { expeditionLaunch } from "../src/bots/goals/expeditionLaunch.ts";
import { EXPEDITION_CHANNEL_NAME, expeditionPlan } from "../src/bots/goals/expeditionPlan.ts";
import { expeditionPrep, isFitForExpedition, isPriorityExpeditionClaimant, requiredExpeditionGear } from "../src/bots/goals/expeditionPrep.ts";
import { activeSharedPlanet } from "../src/bots/planetShare.ts";
import { SOLO_GOALS } from "../src/bots/goals/index.ts";
import { repairDoor } from "../src/bots/goals/repairDoor.ts";
import { repairHull } from "../src/bots/goals/repairHull.ts";
import { rest } from "../src/bots/goals/rest.ts";
import { research } from "../src/bots/goals/research.ts";
import { BOT_PROJECT_ORDER, pickProject, project } from "../src/bots/goals/project.ts";
import { SHRINK_DESK_WORK_WITHIN } from "../src/bots/goals/work.ts";
import { onlyAsteroids, shotOrder } from "../src/bots/goals/hunterTargets.ts";
import { patrolShootHunters } from "../src/bots/goals/patrolShootHunters.ts";
import { crewShootHunters, shootHunters } from "../src/bots/goals/shootHunters.ts";
import { shower } from "../src/bots/goals/shower.ts";
import { DORMS, shrinkDorm } from "../src/bots/goals/shrinkDorm.ts";
import { snoop } from "../src/bots/goals/snoop.ts";
import { BOT_EAT_AFTER_CYCLES, eat } from "../src/bots/goals/eat.ts";
import { tendPlants } from "../src/bots/goals/tendPlants.ts";
import { sowHere } from "../src/bots/goals/sow.ts";
import { POT_STORAGES, setOutPots, storageCheckedKey } from "../src/bots/goals/setOutPots.ts";
import { HOLD_HUNTER_TRIGGER, HOLD_MAX_DAYS, HOLD_MIN_OXYGEN, JUMP_WAIT_CYCLES, sharedDestination, targetJump, travel, turnsTo } from "../src/bots/goals/travel.ts";
import { helpGoal, helpTasks } from "../src/bots/goals/help.ts";
import type { BotMemory, GoalDef } from "../src/bots/goals/types.ts";
import { BOT_MEMORY_VERSION } from "../src/bots/memoryStore.ts";
import { formatFireLine, newFireMemory, observeFires, parseFireLine } from "../src/bots/fireShare.ts";
import { formatTankLine, newTankMemory, observeTanks, parseTankLine } from "../src/bots/tankShare.ts";
import { extinguish } from "../src/bots/goals/extinguish.ts";
import { repairOxygen } from "../src/bots/goals/repairOxygen.ts";
import { formatItemLine, newItemMemory, observeItems, parseItemLine, roomsHolding } from "../src/bots/itemShare.ts";
import { newReportMemory } from "../src/bots/reportShare.ts";
import { chooseSkill } from "../src/bots/skillChoice.ts";
import { seats } from "../src/testing/fakes.ts";

// End cycle on, as on the dev server, so a bot with nothing to do ends its cycle instead of waiting for the clock.
const config = { ...DEFAULT_CONFIG, manualCycles: true };

/** A fresh game and a human seat in it (one seat is Mush). */
function setup(seed = 1, cfg: typeof config = config): { game: GameState; id: string } {
  const game = startGame({ seats: seats(0), config: cfg, seed, rulesVersion: "test" });
  return { game, id: game.players.find((p) => p.role === "human")!.id };
}

/** The game with one player's state changed. */
function edit(game: GameState, id: string, change: (p: GameState["players"][number]) => void): GameState {
  const next = structuredClone(game);
  change(next.players.find((p) => p.id === id)!);
  return next;
}

function plainEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || a === null || typeof b !== "object" || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => plainEqual(v, b[i]));
  }
  const ra = a as Record<string, unknown>;
  const rb = b as Record<string, unknown>;
  const keysA = Object.keys(ra).filter((k) => ra[k] !== undefined);
  const keysB = Object.keys(rb).filter((k) => rb[k] !== undefined);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((k) => Object.hasOwn(rb, k) && plainEqual(ra[k], rb[k]));
}

const isLegal = (view: PlayerView, action: Action) => legalIn(view).some((a) => plainEqual(a, action));

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
    const social = bot.takeSocial();
    if (social) {
      const r = applyInput(game, { ...social, by: id });
      expect(r.ok, JSON.stringify(social)).toBe(true);
      if (r.ok) game = r.state;
      continue;
    }
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
  language: "en" as const,
  ended: new Set<string>(),
  today: new Set<string>(),
  once: new Set<string>(),
  visited: new Set<string>(),
  shrinks: new Set<string>(),
  lastExpedition: null as "oxygen" | "fuel" | null,
  asteroidsOnly: null as number | null,
  items: newItemMemory(),
  fires: newFireMemory(),
  tanks: newTankMemory(),
  combustion: null as number | null,
  holdSince: null as number | null,
  jump: newJumpMemory(),
  reports: newReportMemory(),
  heading: null as GameState["navigation"]["heading"] | null,
  cancelHold: false,
  justJumped: false,
  failedReason: null as string | null,
  expeditionPrep: null,
  roll: roll0,
});

/** Plays one bot until it ends its cycle (or 60 turns), every action legal and applied. */
async function untilReady(game: GameState, id: string, bot: GoalBot): Promise<{ game: GameState; taken: Action[] }> {
  const taken: Action[] = [];
  for (let t = 0; t < 60; t++) {
    const view = viewFor(game, id);
    const action = await bot.decideAction(view);
    const social = bot.takeSocial();
    if (social) {
      const r = applyInput(game, { ...social, by: id });
      expect(r.ok, JSON.stringify(social)).toBe(true);
      if (r.ok) game = r.state;
      continue;
    }
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
    expect(canAfford(noMp, room, 0, noMp.you.ap, memory())).toBe(false);
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
    const memory = { reserve: 2, scripted: true, language: "en" as const, ended: new Set<string>(), today: new Set<string>(), visited: new Set<string>(), holdSince: null, jump: newJumpMemory(), roll: roll0 };
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
    const { game: after, taken } = await play(game, id, new GoalBot(1, 2, [snoop]), 8);
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
      { id: "h1", hp: 6, hitChance: 0, target: null, type: "hunter", countdown: null },
      { id: "h2", hp: 2, hitChance: 0, target: null, type: "hunter", countdown: null },
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

  it("has a bot with no shooting skill shoot too, after its own jobs and before research and projects", async () => {
    const noSkill = attacked(null);
    const view = viewFor(noSkill.game, noSkill.id);
    expect(crewShootHunters.options(view, memory()).map((g) => g.id)).toEqual(["crewShootHunters"]);
    // Not at 4 AP, not with no hunters, and never for a bot the skilled goal already covers.
    expect(crewShootHunters.options(viewFor(edit(noSkill.game, noSkill.id, (p) => (p.ap = 4)), noSkill.id), memory())).toEqual([]);
    const gunner = attacked("gunner");
    expect(crewShootHunters.options(viewFor(gunner.game, gunner.id), memory())).toEqual([]);
    // Nor for a Pilot, who saves its AP for a sortie.
    expect(crewShootHunters.options(viewFor(edit(noSkill.game, noSkill.id, (p) => (p.skills = ["pilot"])), noSkill.id), memory())).toEqual([]);
    const { game: quiet, id } = setup();
    expect(crewShootHunters.options(viewFor(edit(quiet, id, (p) => (p.ap = 10)), id), memory())).toEqual([]);
    const rank = (id: string): number => SOLO_GOALS.find((g) => g.id === id)!.priority;
    for (const job of ["commsOfficer", "tendPlants", "setOutPots", "contactSol", "astro", "travel"]) expect(rank(job)).toBeGreaterThan(rank("crewShootHunters"));
    for (const desk of ["research", "project"]) expect(rank("crewShootHunters")).toBeGreaterThan(rank(desk));
    for (const t of Object.values(noSkill.game.equipment).flat().filter((e) => e.type === "TURRET_COMMAND")) noSkill.game.turrets[t.id] = 20;
    const { taken } = await untilReady(noSkill.game, noSkill.id, new GoalBot(1, 2, [crewShootHunters, research, project]));
    expect(taken.some((a) => a.type === "turret_attack")).toBe(true);
    expect(taken.some((a) => a.type === "research" || a.type === "project")).toBe(false);
  });

  it("walks to the nearest turret and shoots the weakest hunter, spending all its AP, the reserve too", async () => {
    const { game: start, id } = attacked();
    for (const t of Object.values(start.equipment).flat().filter((e) => e.type === "TURRET_COMMAND")) start.turrets[t.id] = 20;
    start.hunters.list[0]!.hp = 99;
    start.hunters.list[1]!.hp = 99;
    start.hunters.list.push({ id: "h3", hp: 1, hitChance: 0, target: null, type: "hunter", countdown: null });
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
    game.hunters.list = [{ id: "h1", hp: 6, hitChance: 0, target: null, type: "hunter", countdown: null }];
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
      { id: "h1", hp: 99, hitChance: 0, target: null, type: "hunter", countdown: null },
      { id: "h2", hp: 99, hitChance: 0, target: null, type: "hunter", countdown: null },
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

  it("shoots an Arack first, never an asteroid, and lands when only asteroids are left", async () => {
    const { game, id } = pilot(9, "PATROL_SHIP_A_0");
    game.patrolShips["PATROL_SHIP_A_0"]!.out = true;
    game.hunters.list = [
      { id: "h1", hp: 1, hitChance: 0, target: null, type: "asteroid", countdown: 3 },
      { id: "h2", hp: 2, hitChance: 0, target: null, type: "hunter", countdown: null },
      { id: "h3", hp: 6, hitChance: 0, target: null, type: "spider", countdown: null },
    ];
    expect(await new GoalBot(1).decideAction(viewFor(game, id))).toMatchObject({ type: "patrol_attack", hunter: "h3" });
    game.hunters.list = [game.hunters.list[0]!];
    expect(await new GoalBot(1).decideAction(viewFor(game, id))).toMatchObject({ type: "land" });
  });
});

describe("hunter targets", () => {
  const h = (id: string, type: "hunter" | "spider" | "asteroid", hp: number) => ({ id, type, hp, countdown: type === "asteroid" ? 3 : null });
  const shot = (hunter: string) => ({ action: { hunter } });

  it("orders Aracks first, then by hp, and drops asteroids and unseen hunters", () => {
    const list = [h("a", "asteroid", 1), h("b", "hunter", 2), h("c", "spider", 6), h("d", "hunter", 1)];
    expect(shotOrder([shot("a"), shot("b"), shot("c"), shot("d"), shot("x")], list).map((o) => o.action.hunter)).toEqual(["c", "d", "b"]);
  });

  it("remembers an asteroid-only sky while the public count stays the same", () => {
    const { game, id } = setup();
    const m = memory();
    const view = viewFor(game, id);
    const sky = (count: number, list: ReturnType<typeof h>[] | null) => ({ ...view, hunters: { ...view.hunters, count, list } });
    expect(onlyAsteroids(sky(2, [h("a", "asteroid", 20), h("b", "asteroid", 20)]), m)).toBe(true);
    expect(onlyAsteroids(sky(2, null), m)).toBe(true);
    expect(onlyAsteroids(sky(3, null), m)).toBe(false);
    expect(onlyAsteroids(sky(2, [h("a", "asteroid", 20), h("b", "hunter", 6)]), m)).toBe(false);
    expect(onlyAsteroids(sky(2, null), m)).toBe(false);
  });

  it("keeps a Gunner away from the turrets once it has seen only asteroids there", () => {
    const { game: start, id } = setup();
    const turretRoom = roomsWith(viewFor(start, id), ["TURRET_COMMAND"])[0]!;
    const game = edit(start, id, (p) => {
      p.room = turretRoom;
      p.ap = 10;
      p.skills = ["gunner"];
    });
    game.hunters.list = [{ id: "h1", hp: 20, hitChance: 0, target: null, type: "asteroid", countdown: 3 }];
    const m = memory();
    expect(shootHunters.options(viewFor(game, id), m)).toEqual([]);
    const away = edit(game, id, (p) => (p.room = start.players.find((q) => q.id === id)!.room));
    expect(shootHunters.options(viewFor(away, id), m)).toEqual([]);
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
    game.items = game.items.filter((i) => i.at.kind !== "room" || i.at.id !== "REFECTORY" || i.type === "uncooked_ration");
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
    game.items = game.items.filter((i) => !(i.type === "tree_pot" && !i.plant));
    game.items.push({ id: "test-banana", type: "fruit_banana", at: { kind: "room", id: game.config.botany.gardenRoom } });
    expect(await new GoalBot(1, 2, [eat]).decideAction(viewFor(game, id))).toEqual({ type: "consume", item: "test-banana" });
  });

  it("leaves a banana for sowing while an empty pot is in the garden, unless Hungry", async () => {
    const { game: start, id } = starving(BOT_EAT_AFTER_CYCLES);
    const game = edit(start, id, (p) => (p.room = start.config.botany.gardenRoom));
    game.items.push({ id: "test-banana", type: "fruit_banana", at: { kind: "room", id: game.config.botany.gardenRoom } });
    expect(await new GoalBot(1, 2, [eat, sowHere]).decideAction(viewFor(game, id))).toMatchObject({ type: "sow", item: "test-banana" });
    const hungry = edit(game, id, (p) => p.statuses.push("hungry" as never));
    expect(await new GoalBot(1, 2, [eat, sowHere]).decideAction(viewFor(hungry, id))).toEqual({ type: "consume", item: "test-banana" });
  });
});

/** Plays one bot until it ends its cycle (no new cycle, so no fresh plant sickness or thirst). */
async function oneCycle(game: GameState, id: string, bot: GoalBot): Promise<{ game: GameState; taken: Action[] }> {
  const taken: Action[] = [];
  for (let t = 0; t < 40; t++) {
    const action = await bot.decideAction(viewFor(game, id));
    // A message that isn't an action (an item line, itemShare.ts) is sent as the room sends it; that turn has no action.
    const social = bot.takeSocial();
    if (social) {
      const said = applyInput(game, { ...social, by: id });
      expect(said.ok, JSON.stringify(social)).toBe(true);
      if (said.ok) game = said.state;
      continue;
    }
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

  it("walks to the garden, sows a banana from the floor, then waters every thirsty plant and treats a sick one", async () => {
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
    expect(taken.map((a) => a.type).filter((t) => t !== "move")).toEqual(["sow", "water", "water", "treat"]);
    expect(after.items.some((i) => i.id === "test-banana")).toBe(false);
  });

  it("goes once a day: not again after tending, until the day changes", async () => {
    const { game, id } = gardener(["botanic"]);
    const bot = new GoalBot(1, 2, [tendPlants]);
    const { game: g } = await oneCycle(game, id, bot);
    // Step away from the garden (to an empty room so item-sharing doesn't take the turn): nothing more today.
    const away = edit(g, id, (p) => (p.room = "REFECTORY"));
    away.items = away.items.filter((i) => i.at.kind !== "room" || i.at.id !== "REFECTORY");
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

describe("sowHere and setOutPots", () => {
  const garden = DEFAULT_CONFIG.botany.gardenRoom;
  const onFloor = (g: GameState, room: string) => g.items.filter((i) => i.at.kind === "room" && i.at.id === room);

  it("any bot in the garden sows a floor banana into the empty pot, not into a pot it carries", async () => {
    const { game: start, id } = setup();
    const game = edit(start, id, (p) => {
      p.skills = ["pilot"] as typeof p.skills;
      p.room = garden;
      p.ap = 10;
    });
    game.items.push({ id: "test-banana", type: "fruit_banana", at: { kind: "room", id: garden } });
    game.items.push({ id: "test-pot", type: "tree_pot", at: { kind: "player", id } });
    const { game: after, taken } = await oneCycle(game, id, new GoalBot(1, 2, [sowHere]));
    expect(taken.map((a) => a.type)).toEqual(["sow"]);
    expect(after.items.find((i) => i.id === "test-pot")!.plant).toBeUndefined();
    expect(onFloor(after, garden).filter((i) => i.type === "tree_pot").every((p) => p.plant)).toBe(true);
  });

  it("isn't offered outside the garden, or without a banana", () => {
    const { game: start, id } = setup();
    const inGarden = edit(start, id, (p) => (p.room = garden));
    expect(sowHere.options(viewFor(inGarden, id), memory())).toEqual([]);
    const elsewhere = edit(start, id, (p) => (p.room = POT_STORAGES[0] as typeof p.room));
    elsewhere.items.push({ id: "test-banana", type: "fruit_banana", at: { kind: "player", id } });
    expect(sowHere.options(viewFor(elsewhere, id), memory())).toEqual([]);
  });

  it("a Green Thumb Botanist with a full inventory sets out its pots, fetches the storage's, and sows the banana first", async () => {
    const { game: start, id } = setup();
    let game = edit(start, id, (p) => {
      p.skills = ["botanic", "green_thumb"] as typeof p.skills;
      p.room = garden;
      p.ap = 12;
      p.mp = 12;
      p.resources.garden = 0;
    });
    game.items = game.items.filter((i) => i.at.kind !== "player" || i.at.id !== id);
    game.items.push({ id: "test-talky", type: "super_talky", at: { kind: "player", id } });
    game.items.push({ id: "gt-1", type: "tree_pot", at: { kind: "player", id } }, { id: "gt-2", type: "tree_pot", at: { kind: "player", id } });
    game.items.push({ id: "test-banana", type: "fruit_banana", at: { kind: "room", id: garden } });
    for (const pot of game.items) if (pot.plant) pot.plant.thirst = 1;
    const bot = new GoalBot(1, 2, [sowHere, setOutPots, tendPlants]);
    const allTaken: Action[] = [];
    for (let c = 0; c < 4; c++) {
      const { game: next, taken } = await oneCycle(game, id, bot);
      allTaken.push(...taken);
      game = edit(next, id, (p) => {
        p.ap = 12;
        p.mp = 12;
      });
      if (onFloor(game, garden).filter((i) => i.type === "tree_pot").length === 7) break;
    }
    const kinds = allTaken.map((a) => a.type).filter((t) => t !== "move");
    // The banana first (sown straight from the floor), then the Green Thumb pots, storage pots, and watering.
    expect(kinds[0]).toBe("sow");
    expect(kinds.slice(1, 3)).toEqual(["drop", "drop"]);
    expect(kinds).toContain("take");
    expect(kinds).toContain("water");
    expect(POT_STORAGES.some((r) => onFloor(game, r).some((i) => i.type === "tree_pot"))).toBe(false);
    expect(onFloor(game, garden).filter((i) => i.type === "tree_pot")).toHaveLength(7);
    expect(game.items.some((i) => i.id === "test-banana")).toBe(false);
  });

  it("checks each storage once a game", () => {
    const { game: start, id } = setup();
    const game = edit(start, id, (p) => (p.skills = ["botanic"] as typeof p.skills));
    const m = memory();
    expect(setOutPots.options(viewFor(game, id), m)).toHaveLength(1);
    for (const r of POT_STORAGES) m.once.add(storageCheckedKey(r));
    expect(setOutPots.options(viewFor(game, id), m)).toEqual([]);
    const other = edit(start, id, (p) => (p.skills = ["pilot"] as typeof p.skills));
    expect(setOutPots.options(viewFor(other, id), memory())).toEqual([]);
  });

  it("shares empty non-garden pots via itemShare and fetches them straight from a reported room", async () => {
    const { game: start, id } = setup();
    const potRoom = "STORAGE_B_1";
    const other = start.players.find((p) => p.id !== id)!.id;
    let game = edit(start, id, (p) => {
      p.skills = ["botanic"] as typeof p.skills;
      p.room = garden;
      p.ap = 12;
      p.mp = 12;
    });
    game.items = game.items.filter((i) => i.type !== "tree_pot" || i.at.kind !== "room" || i.at.id === garden);
    game.items = game.items.filter((i) => i.at.kind !== "room" || i.at.id !== potRoom);
    game.items.push({ id: "sp-remote", type: "tree_pot", at: { kind: "room", id: potRoom } });
    game = edit(game, other, (p) => (p.room = potRoom));
    const spotterMem = memory();
    const post = observeItems(viewFor(game, other), spotterMem);
    expect(post?.text).toBe(`Item: tree_pot in ${potRoom}`);
    // Garden pots (empty or planted) are not shared as fetchable items.
    const inGardenMem = memory();
    expect(observeItems(viewFor(game, id), inGardenMem)).toBeNull();
    // Botanist reads the report and goes straight to potRoom, then drops the pot in the garden.
    const bot = new GoalBot(1, 2, [setOutPots]);
    const said = applyInput(game, { ...post!, by: other });
    expect(said.ok).toBe(true);
    if (!said.ok) return;
    const { game: after, taken } = await oneCycle(said.state, id, bot);
    expect(taken.some((a) => a.type === "take" && a.item === "sp-remote")).toBe(true);
    expect(onFloor(after, garden).some((i) => i.id === "sp-remote")).toBe(true);
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
  /**
   * A bot with `skills` and `ap`, standing in the lab, clean and with no free points. Research never soils it: a dirty
   * Shrink stops researching, which these tests don't measure.
   */
  const inLab = (skills: string[], ap: number) => {
    const { game: start, id } = setup(1, { ...config, research: { ...config.research, dirtyChance: 0 } });
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

describe("project order (#428)", () => {
  /** A human at the NERON core with AP, offered `deck` (dealt first), with `progress` already on the ship's projects. */
  function atCore(progress: Record<string, number> = {}, deck: ProjectId[] = ["PATROL_SHIP_LAUNCHER", "FIRE_SENSOR", "PLASMA_SHIELD"]) {
    const { game: start, id } = setup();
    const core = "NEXUS_ROOM";
    const game = edit(start, id, (p) => {
      p.room = core;
      p.ap = 10;
    });
    Object.assign(game.projects, progress);
    game.projectDeck = [...deck, ...game.projectDeck.filter((p) => !deck.includes(p))];
    return { game, id };
  }
  const chosen = (game: GameState, id: string) => {
    const option = pickProject(viewFor(game, id));
    return option?.action.type === "project" ? option.action.project : undefined;
  };

  it("works on Fire Detector ahead of unimplemented projects at 0%", () => {
    expect(BOT_PROJECT_ORDER[0]).toBe("FIRE_SENSOR");
    const { game, id } = atCore();
    expect(chosen(game, id)).toBe("FIRE_SENSOR");
  });

  it("works on Fire Detector ahead of a project someone (a Mush) already started", () => {
    const { game, id } = atCore({ PATROL_SHIP_LAUNCHER: 40 });
    expect(chosen(game, id)).toBe("FIRE_SENSOR");
  });

  it("falls back to the most advanced once Fire Detector is done", () => {
    const { game, id } = atCore({ FIRE_SENSOR: 100, PLASMA_SHIELD: 20 });
    expect(chosen(game, id)).toBe("PLASMA_SHIELD");
  });

  it("falls back to the most advanced when Fire Detector isn't offered", () => {
    const { game, id } = atCore({ PLASMA_SHIELD: 20 }, ["PATROL_SHIP_LAUNCHER", "PLASMA_SHIELD", "BRIC_BROC"]);
    expect(viewFor(game, id).actions.some((o) => o.action.type === "project" && o.action.project === "FIRE_SENSOR")).toBe(false);
    expect(chosen(game, id)).toBe("PLASMA_SHIELD");
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

describe("astro (#222, #417)", () => {
  const stargazer = (skills: string[], ap = 6) => {
    const { game: start, id } = setup();
    const game = edit(start, id, (p) => {
      p.skills = skills as typeof p.skills;
      p.ap = ap;
      p.mp = 12;
    });
    return { game, id };
  };
  type Sector = { tag: string; known: boolean };
  const known = (...tags: string[]): Sector[] => tags.map((tag) => ({ tag, known: true }));
  const planet = (id: string, name: string, distance: number, sectors: Sector[]) =>
    ({ id, name, direction: "north", distance, size: sectors.length, sectors }) as GameState["planets"][string][number];

  /** Like `oneCycle`, but also sends what the bot shares, as the room would. */
  async function astroCycle(game: GameState, id: string, bot: GoalBot): Promise<{ game: GameState; taken: string[] }> {
    const taken: string[] = [];
    for (let t = 0; t < 40; t++) {
      const action = await bot.decideAction(viewFor(game, id));
      const social = bot.takeSocial();
      if (social) {
        const r = applyInput(game, { ...social, by: id });
        expect(r.ok, JSON.stringify(social)).toBe(true);
        if (r.ok) game = r.state;
        taken.push(social.type);
        continue;
      }
      if (!action || action.type === "ready") break;
      const r = applyAction(game, id, action);
      expect(r.ok, JSON.stringify(action)).toBe(true);
      if (r.ok) game = r.state;
      taken.push(action.type);
    }
    return { game, taken };
  }

  it("formats and parses the bots' share text, and rejects anything else", () => {
    const text = formatPlanetShare({ name: "Kaxor", direction: "west", distance: 4, sectors: ["OXYGEN", null, "CAVE"] });
    expect(text).toBe("Planet: Kaxor\nPosition: west, 4 fuel\nSectors: OXYGEN, ?, CAVE");
    expect(parsePlanetShare(text)).toEqual({ name: "Kaxor", direction: "west", distance: 4, sectors: ["OXYGEN", null, "CAVE"] });
    expect(parsePlanetShare("Kaxor is great, go north")).toBeNull();
    expect(parsePlanetShare(text.replace("west", "up"))).toBeNull();
    expect(parsePlanetShare(text.replace("CAVE", "CANDY"))).toBeNull();
  });

  it("judges planets: deadly, too far or useless ones go; ones with oxygen or fuel are kept once fully analyzed", () => {
    const { game, id } = stargazer(["astrophysician"]);
    const view = (sectors: Sector[], distance = 3) => {
      game.planets[id] = [planet("pl-1", "Alpha", distance, sectors)];
      const v = viewFor(game, id);
      return [v, v.planets[0]!] as const;
    };
    expect(judgePlanet(...view(known("OXYGEN", "MANKAROG")))).toBe("delete");
    expect(judgePlanet(...view([{ tag: "VOLCANIC_ACTIVITY", known: true }, { tag: "OXYGEN", known: false }]))).toBe("delete");
    expect(judgePlanet(...view(known("OXYGEN"), game.ship.fuel + 1))).toBe("delete");
    expect(judgePlanet(...view(known("FOREST", "DESERT")))).toBe("delete");
    expect(judgePlanet(...view([{ tag: "OXYGEN", known: true }, { tag: "FOREST", known: false }]))).toBe("analyze");
    expect(judgePlanet(...view(known("OXYGEN", "FOREST")))).toBe("ready");
    expect(judgePlanet(...view(known("HYDROCARBON")))).toBe("ready");
  });

  it("is only for an Astrophysicist, and has nothing to do once its destination is shared and it holds maxPlanets", async () => {
    const other = stargazer(["pilot"]);
    expect(astro.options(viewFor(other.game, other.id), memory())).toEqual([]);
    const { game, id } = stargazer(["astrophysician"]);
    expect(astro.options(viewFor(game, id), memory())).toHaveLength(1);
    game.planets[id] = [planet("pl-1", "Alpha", 3, known("OXYGEN")), planet("pl-2", "Beta", 4, known("HYDROCARBON"))];
    const { game: after, taken } = await astroCycle(game, id, new GoalBot(1, 2, [astro]));
    expect(taken.filter((a) => a !== "move" && a !== "chat")).toEqual(["sharePlanet"]);
    expect(after.sharedPlanets.map((e) => e.planet)).toEqual(["pl-1"]);
    expect(astro.options(viewFor(after, id), memory())).toEqual([]);
  });

  it("deletes useless planets, analyzes, then scans down to the AP reserve, every cycle", async () => {
    const { game, id } = stargazer(["astrophysician"], 6);
    game.planets[id] = [
      planet("pl-1", "Alpha", 3, [
        { tag: "OXYGEN", known: false },
        { tag: "HYDROCARBON", known: false },
      ]),
      planet("pl-2", "Beta", 3, known("FOREST", "DESERT")),
    ];
    const bot = new GoalBot(1, 2, [astro]);
    const { game: after, taken } = await astroCycle(game, id, bot);
    const work = taken.filter((a) => a !== "move" && a !== "chat");
    // Beta goes for free; 6 AP -> 2 AP reserve: analyze Alpha (2 sectors for the Astrophysicist), share it, scan (2 AP).
    expect(work).toEqual(["delete_planet", "analyze_planet", "sharePlanet", "scan_planet"]);
    expect(after.players.find((p) => p.id === id)!.ap).toBe(2);
    expect(parsePlanetShare(after.sharedPlanets[0]!.text)?.name).toBe("Alpha");
    // Not once a day any more (#417): more AP in the next cycle is spent on the search too.
    const next = newCycle(after);
    expect(next.ok).toBe(true);
    if (!next.ok) return;
    const refilled = edit(next.state, id, (p) => (p.ap = 8));
    expect(await bot.decideAction(viewFor(refilled, id))).not.toEqual({ type: "ready" });
  });

  it("prefers a planet with something other than the last expedition's kind, then the nearest", () => {
    const { game, id } = stargazer(["astrophysician"]);
    game.planets[id] = [planet("pl-1", "Near", 2, known("OXYGEN")), planet("pl-2", "Far", 6, known("HYDROCARBON"))];
    const view = viewFor(game, id);
    expect(chooseDestination(view, null)?.name).toBe("Near");
    expect(chooseDestination(view, "fuel")?.name).toBe("Near");
    expect(chooseDestination(view, "oxygen")?.name).toBe("Far");
  });
});

describe("travel: the Commander (#417)", () => {
  type Planet = GameState["planets"][string][number];
  const planet = (id: string, name: string, direction: Planet["direction"], distance: number): Planet =>
    ({ id, name, direction, distance, size: 2, sectors: [{ tag: "OXYGEN", known: true }, { tag: "FOREST", known: true }] }) as Planet;

  /** A Commander with AP to spare, and `planets` found by someone else and shared in the bots' format (or `text`). */
  function commander(planets: Planet[], text?: (p: Planet) => string) {
    const { game: start, id } = setup();
    const game = edit(start, id, (p) => {
      p.ap = 8;
      p.mp = 12;
    });
    const finder = game.players.find((p) => p.id !== id)!.id;
    game.titles.commander = id;
    game.planets[finder] = planets;
    game.sharedPlanets = planets.map((p, i) => ({ id: `sp-${i}`, planet: p.id, text: text?.(p) ?? formatPlanetShare({ ...p, sectors: ["OXYGEN", "FOREST"] }), by: finder, day: 1, cycleOfDay: 1, stale: false }));
    return { game, id };
  }

  it("turns the shorter way", () => {
    expect(turnsTo("north", "east")).toEqual({ left: 3, right: 1 });
    expect(turnsTo("north", "west")).toEqual({ left: 1, right: 3 });
    expect(turnsTo("south", "south")).toEqual({ left: 0, right: 0 });
  });

  it("goes to the latest applicable share in the bots' format that the fuel reaches", () => {
    const { game, id } = commander([planet("pl-1", "Old", "west", 3), planet("pl-2", "New", "east", 4)]);
    expect(sharedDestination(viewFor(game, id))?.name).toBe("New");
    game.sharedPlanets[1]!.stale = true;
    expect(sharedDestination(viewFor(game, id))?.name).toBe("Old");
    game.sharedPlanets[0]!.text = "Old is great, go west";
    expect(sharedDestination(viewFor(game, id))).toBeNull();
    const far = commander([planet("pl-1", "Far", "west", 5)]);
    far.game.ship.fuel = 4;
    expect(sharedDestination(viewFor(far.game, far.id))).toBeNull();
  });

  it("is only for the Commander, and not while traveling or in orbit", () => {
    const { game, id } = commander([planet("pl-1", "Kaxor", "east", 3)]);
    expect(travel.options(viewFor(game, id), memory())).toHaveLength(1);
    expect(travel.options(viewFor({ ...game, titles: { ...game.titles, commander: null } }, id), memory())).toEqual([]);
    expect(travel.options(viewFor({ ...game, navigation: { ...game.navigation, orbit: "pl-9" } }, id), memory())).toEqual([]);
    expect(travel.options(viewFor({ ...game, navigation: { ...game.navigation, arriving: { planet: null } } }, id), memory())).toEqual([]);
  });

  it("checks the chamber, loads exactly the distance from the tanks, turns, travels, and arrives in orbit", async () => {
    const { game, id } = commander([planet("pl-1", "Kaxor", "east", 3)]);
    const fuel = game.ship.fuel;
    const { game: after, taken } = await play(game, id, new GoalBot(1, 2, [travel]), 60);
    const work = taken.map((a) => a.type).filter((t) => t !== "move" && !t.startsWith("report_"));
    expect(work[0]).toBe("check_combustion");
    expect(work.filter((t) => t === "take_fuel")).toHaveLength(3);
    expect(work.filter((t) => t === "load_fuel")).toHaveLength(3);
    // North to east: one right turn.
    expect(taken.filter((a) => a.type === "turn_ship")).toEqual([expect.objectContaining({ side: "right" })]);
    expect(work.at(-1)).toBe("travel");
    expect(after.ship.fuel).toBe(fuel - 3);
    expect(after.ship.combustion).toBe(0);
    expect(after.navigation.orbit ?? after.navigation.arriving?.planet).toBe("pl-1");
  });

  it("unloads what the chamber holds beyond the distance", async () => {
    const { game, id } = commander([planet("pl-1", "Kaxor", "north", 2)]);
    game.ship.combustion = 4;
    const { game: after, taken } = await play(game, id, new GoalBot(1, 2, [travel]), 60);
    const work = taken.map((a) => a.type).filter((t) => t !== "move" && !t.startsWith("report_"));
    expect(work).toEqual(["check_combustion", "unload_fuel", "unload_fuel", "travel"]);
    expect(after.navigation.orbit ?? after.navigation.arriving?.planet).toBe("pl-1");
  });

  it("fetches fuel from the other tank when the nearest one is broken", async () => {
    const { game, id } = commander([planet("pl-1", "Kaxor", "north", 2)]);
    game.equipment.STORAGE_A_1 = game.equipment.STORAGE_A_1!.map((e) => (e.type === "FUEL_TANK" ? { ...e, broken: true } : e));
    const { game: after, taken } = await play(game, id, new GoalBot(1, 2, [travel]), 80);
    expect(taken.filter((a) => a.type === "take_fuel").map((a) => (a as { equipment: string }).equipment)).toEqual(["STORAGE_B_1:FUEL_TANK", "STORAGE_B_1:FUEL_TANK"]);
    expect(after.navigation.orbit ?? after.navigation.arriving?.planet).toBe("pl-1");
  });

  it("turns the long way round when the short way's reactor is broken", async () => {
    const { game, id } = commander([planet("pl-1", "Kaxor", "east", 2)]);
    game.ship.combustion = 2;
    game.equipment.MOTOR_ROOM = game.equipment.MOTOR_ROOM!.map((e) => (e.id === "MOTOR_ROOM:reac_b" ? { ...e, broken: true } : e));
    const { taken } = await play(game, id, new GoalBot(1, 2, [travel]), 60);
    expect(taken.filter((a) => a.type === "turn_ship").map((a) => (a as { side: string }).side)).toEqual(["left", "left", "left"]);
    expect(taken.at(-1)?.type).toBe("travel");
  });

  it("may spend the AP reserve: at 2 AP on the bridge, fuel loaded, it still turns and travels when a jump triggers", async () => {
    const { game: start, id } = commander([planet("pl-1", "Kaxor", "east", 2)]);
    const game = edit(start, id, (p) => {
      p.ap = 2;
      p.room = "COMMAND_CENTER";
    });
    game.ship.combustion = 2;
    game.hunters.list = Array.from({ length: HOLD_HUNTER_TRIGGER }, (_, i) => ({
      id: `h-${i}`,
      hp: 4,
      hitChance: 0,
      target: null,
      type: "hunter" as const,
      countdown: null,
    }));
    const { game: after, taken } = await play(game, id, new GoalBot(1, 2, [travel]), 40);
    expect(taken.map((a) => a.type).filter((t) => t !== "move")).toEqual(["check_combustion", "turn_ship", "travel"]);
    expect(after.log.find((l) => l.key === "shipTraveled")?.cycle).toBe(game.cycle);
    expect(after.navigation.orbit ?? after.navigation.arriving?.planet).toBe("pl-1");
  });
});

describe("travel: the Commander leaves orbit (#417)", () => {
  /** A Commander in orbit around Orbis (2 sectors, shared in the bots' format) with AP to spare, the chamber empty. */
  function inOrbit() {
    const { game: start, id } = setup();
    const game = edit(start, id, (p) => {
      p.ap = 8;
      p.mp = 12;
    });
    const finder = game.players.find((p) => p.id !== id)!.id;
    game.titles.commander = id;
    game.ship.combustion = 0;
    game.planets[finder] = [
      { id: "pl-1", name: "Orbis", direction: "north", distance: 2, size: 2, picture: 1, revealed: 2, sectors: [{ tag: "OXYGEN", known: true, explored: true }, { tag: "FOREST", known: true, explored: true }] },
    ] as GameState["planets"][string];
    game.navigation = { ...game.navigation, arriving: null, orbit: "pl-1" };
    game.sharedPlanets = [{ id: "sp-1", planet: "pl-1", text: formatPlanetShare({ name: "Orbis", direction: "north", distance: 2, sectors: ["OXYGEN", "FOREST"] }), by: finder, day: 1, cycleOfDay: 1, stale: false }];
    game.sharedReports = [{ id: "sr-1", report: "ex-1", text: "Planet: Orbis\nExplored: OXYGEN, FOREST", by: finder, day: 1, cycleOfDay: 1 }] as GameState["sharedReports"];
    return { game, id };
  }
  const explored = () => {
    const m = memory();
    m.reports.explored.set("Orbis", ["OXYGEN", "FOREST"]);
    return m;
  };

  it("waits while a sector is unexplored by the shared reports, an expedition is out, or a ship is in flight", () => {
    const { game, id } = inOrbit();
    expect(travel.options(viewFor(game, id), explored())).toHaveLength(1);
    const half = memory();
    half.reports.explored.set("Orbis", ["OXYGEN"]);
    expect(travel.options(viewFor(game, id), half)).toEqual([]);
    expect(travel.options(viewFor(game, id), memory())).toEqual([]);
    const flying = edit(game, game.players.find((p) => p.id !== id && p.alive)!.id, (p) => (p.room = "ICARUS_CRAFT"));
    expect(travel.options(viewFor(flying, id), explored())).toEqual([]);
    expect(travel.options(viewFor({ ...game, titles: { ...game.titles, commander: null } }, id), explored())).toEqual([]);
  });

  it("checks the chamber, loads 1 fuel, and leaves orbit from the bridge", async () => {
    const { game, id } = inOrbit();
    const fuel = game.ship.fuel;
    const bot = new GoalBot(1, 2, [travel]);
    let state = game;
    const work: string[] = [];
    for (let t = 0; t < 60 && !work.includes("leave_orbit"); t++) {
      const r = await play(state, id, bot, 1);
      state = r.game;
      work.push(...r.taken.map((a) => a.type).filter((type) => type !== "move" && !type.startsWith("report_")));
    }
    expect(work).toEqual(["check_combustion", "take_fuel", "load_fuel", "leave_orbit"]);
    expect(state.navigation.orbit).toBeNull();
    expect(state.log.some((l) => l.key === "leftOrbit")).toBe(true);
    expect(state.ship.fuel).toBe(fuel - 1);
    expect(state.ship.combustion).toBe(0);
  });
});

describe("travel holds & escape jumps (#421)", () => {
  type Planet = GameState["planets"][string][number];
  const makeHunters = (n: number): GameState["hunters"]["list"] =>
    Array.from({ length: n }, (_, i) => ({ id: `h-${i}`, hp: 4, hitChance: 0, target: null, type: "hunter", countdown: null }));
  const planet = (id: string, name: string, direction: Planet["direction"], distance: number): Planet =>
    ({ id, name, direction, distance, size: 2, sectors: [{ tag: "OXYGEN", known: true }] }) as Planet;

  function commander(planets: Planet[] = []) {
    const { game: start, id } = setup();
    const game = edit(start, id, (p) => {
      p.ap = 8;
      p.mp = 12;
    });
    const finder = game.players.find((p) => p.id !== id)!.id;
    game.titles.commander = id;
    game.planets[finder] = planets;
    game.sharedPlanets = planets.map((p, i) => ({
      id: `sp-${i}`,
      planet: p.id,
      text: formatPlanetShare({ ...p, sectors: ["OXYGEN"] }),
      by: finder,
      day: 1,
      cycleOfDay: 1,
      stale: false,
    }));
    return { game, id };
  }

  it("parses and tracks the jump-hold chat lines cleanly", () => {
    expect(parseJumpHold(HOLD_JUMP_LINE)).toBe("hold");
    expect(parseJumpHold(JUMP_NOW_LINE)).toBe("now");
    expect(parseJumpHold(CANCEL_HOLD_LINE)).toBe("off");
    expect(parseJumpHold("Jump now!")).toBeNull();
    const { game, id } = commander();
    expect(isHoldingJump(viewFor(game, id), memory())).toBe(false);
    const held = applyInput(game, { type: "chat", channel: "global", text: HOLD_JUMP_LINE, by: id });
    expect(held.ok).toBe(true);
    if (!held.ok) return;
    expect(isHoldingJump(viewFor(held.state, id), memory())).toBe(true);
    expect(holdStartCycle(viewFor(held.state, id), memory())).toBe(held.state.cycle);
    const off = applyInput(held.state, { type: "chat", channel: "global", text: CANCEL_HOLD_LINE, by: id });
    expect(off.ok).toBe(true);
    if (!off.ok) return;
    expect(isHoldingJump(viewFor(off.state, id), memory())).toBe(false);
  });

  it("prepares and holds a jump with 'Jump: hold' until 8 hunters attack, then jumps and posts 'Jump: off'", async () => {
    const { game, id } = commander([planet("pl-1", "Kaxor", "east", 2)]);
    const bot = new GoalBot(1, 2, [travel]);
    const { game: prepared, taken } = await untilReady(game, id, bot);
    expect(taken.filter((a) => a.type === "travel")).toEqual([]);
    expect(prepared.ship.combustion).toBe(2);
    expect(prepared.navigation.heading).toBe("east");
    expect(prepared.players.find((p) => p.id === id)!.room).toBe("COMMAND_CENTER");
    expect(isHoldingJump(viewFor(prepared, id), memory())).toBe(true);

    // 7 hunters: still holds.
    prepared.hunters.list = makeHunters(HOLD_HUNTER_TRIGGER - 1);
    const next = newCycle(edit(prepared, id, (p) => (p.ap = 6)));
    expect(next.ok).toBe(true);
    if (!next.ok) return;
    const { game: stillHeld } = await untilReady(next.state, id, bot);
    expect(stillHeld.navigation.arriving).toBeNull();
    expect(isHoldingJump(viewFor(stillHeld, id), memory())).toBe(true);

    // 8 hunters: jumps and posts 'Jump: off'.
    stillHeld.hunters.list = makeHunters(HOLD_HUNTER_TRIGGER);
    const next2 = newCycle(stillHeld);
    expect(next2.ok).toBe(true);
    if (!next2.ok) return;
    const { game: jumped, taken: taken2 } = await untilReady(next2.state, id, bot);
    expect(taken2.map((a) => a.type)).toContain("travel");
    expect(jumped.navigation.arriving?.planet).toBe("pl-1");
    expect(isHoldingJump(viewFor(jumped, id), memory())).toBe(false);
  });

  it("with someone out in a patrol ship at the trigger, posts 'Jump: now' and jumps only once the minimap shows them aboard", async () => {
    const { game, id } = commander([]);
    const bot = new GoalBot(1, 2, [travel]);
    const { game: held } = await untilReady(game, id, bot);
    expect(held.ship.combustion).toBe(1);

    const pilotId = held.players.find((p) => p.id !== id && p.alive)!.id;
    let out = edit(held, pilotId, (p) => (p.room = "PATROL_SHIP_A_0"));
    out.patrolShips["PATROL_SHIP_A_0"]!.out = true;
    out.hunters.list = makeHunters(HOLD_HUNTER_TRIGGER);
    expect(crewAboard(viewFor(out, id))).toBe(false);
    const next = newCycle(out);
    expect(next.ok).toBe(true);
    if (!next.ok) return;
    out = next.state;
    const { game: waiting, taken } = await untilReady(out, id, bot);
    expect(taken.map((a) => a.type)).not.toContain("travel");
    expect(isJumpDue(viewFor(waiting, id), memory())).toBe(true);
    expect(waiting.navigation.arriving).toBeNull();

    // Back aboard: the decision stands even if the count fell below the trigger, and the ship jumps.
    let landed = edit(waiting, pilotId, (p) => (p.room = "SPACESHIP_BAY_A"));
    landed.patrolShips["PATROL_SHIP_A_0"]!.out = false;
    landed.hunters.list = makeHunters(HOLD_HUNTER_TRIGGER - 2);
    expect(crewAboard(viewFor(landed, id))).toBe(true);
    const { game: jumped, taken: taken2 } = await untilReady(landed, id, bot);
    expect(taken2.map((a) => a.type)).toContain("travel");
    expect(jumped.navigation.arriving).toEqual({ planet: null });
    expect(isHoldingJump(viewFor(jumped, id), memory())).toBe(false);
  });

  it("jumps anyway 2 cycles after 'Jump: now' if someone is still out", async () => {
    const { game, id } = commander([]);
    const bot = new GoalBot(1, 2, [travel]);
    const { game: held } = await untilReady(game, id, bot);
    const pilotId = held.players.find((p) => p.id !== id && p.alive)!.id;
    let state = edit(held, pilotId, (p) => (p.room = "PATROL_SHIP_A_0"));
    state.patrolShips["PATROL_SHIP_A_0"]!.out = true;
    state.hunters.list = makeHunters(HOLD_HUNTER_TRIGGER);
    for (let i = 0; i <= JUMP_WAIT_CYCLES; i++) {
      const next = newCycle(state);
      expect(next.ok).toBe(true);
      if (!next.ok) return;
      const { game: after, taken } = await untilReady(next.state, id, bot);
      state = after;
      if (i < JUMP_WAIT_CYCLES) {
        expect(taken.map((a) => a.type)).not.toContain("travel");
        state.players.find((p) => p.id === pilotId)!.room = "PATROL_SHIP_A_0"; // still out
      } else expect(taken.map((a) => a.type)).toContain("travel");
    }
    expect(state.navigation.arriving).toEqual({ planet: null });
  });

  it("prepares a 1-fuel escape jump when no destination is shared (and never runs for a human Commander)", async () => {
    const { game, id } = commander([]);
    expect(targetJump(viewFor({ ...game, titles: { ...game.titles, commander: null } }, id), 0)).not.toBeNull();
    expect(travel.options(viewFor({ ...game, titles: { ...game.titles, commander: null } }, id), memory())).toEqual([]);

    const bot = new GoalBot(1, 2, [travel]);
    const { game: held } = await untilReady(game, id, bot);
    expect(held.ship.combustion).toBe(1);
    expect(isHoldingJump(viewFor(held, id), memory())).toBe(true);

    held.hunters.list = makeHunters(HOLD_HUNTER_TRIGGER);
    const next = newCycle(held);
    expect(next.ok).toBe(true);
    if (!next.ok) return;
    const { game: jumped, taken } = await untilReady(next.state, id, bot);
    expect(taken.map((a) => a.type)).toContain("travel");
    expect(jumped.navigation.arriving).toEqual({ planet: null });
    expect(isHoldingJump(viewFor(jumped, id), memory())).toBe(false);
  });

  it("upgrades a held 1-fuel escape jump when an Astrophysicist shares a planet mid-hold", async () => {
    const { game, id } = commander([]);
    const bot = new GoalBot(1, 2, [travel]);
    const { game: held } = await untilReady(game, id, bot);
    expect(held.ship.combustion).toBe(1);
    expect(isHoldingJump(viewFor(held, id), memory())).toBe(true);

    const finder = held.players.find((p) => p.id !== id)!.id;
    const pl = planet("pl-2", "Boreas", "west", 3);
    held.planets[finder] = [pl];
    held.sharedPlanets.push({
      id: "sp-late",
      planet: pl.id,
      text: formatPlanetShare({ ...pl, sectors: ["OXYGEN"] }),
      by: finder,
      day: held.day,
      cycleOfDay: ((held.cycle - 1) % DEFAULT_CONFIG.cyclesPerDay) + 1,
      stale: false,
    });
    const next = newCycle(edit(held, id, (p) => (p.ap = 8)));
    expect(next.ok).toBe(true);
    if (!next.ok) return;
    const { game: upgraded } = await untilReady(next.state, id, bot);
    expect(upgraded.ship.combustion).toBe(3);
    expect(upgraded.navigation.heading).toBe("west");
    expect(upgraded.navigation.arriving).toBeNull();
  });

  it("stops waiting after 4 days of holding, or when oxygen drops to 8 or below", async () => {
    const { game: o2Start, id: o2Id } = commander([planet("pl-1", "Kaxor", "north", 1)]);
    o2Start.ship.combustion = 1;
    const o2Bot = new GoalBot(1, 2, [travel]);
    const { game: o2Held } = await untilReady(o2Start, o2Id, o2Bot);
    expect(isHoldingJump(viewFor(o2Held, o2Id), memory())).toBe(true);
    o2Held.ship.oxygen = HOLD_MIN_OXYGEN;
    const o2Next = newCycle(o2Held);
    expect(o2Next.ok).toBe(true);
    if (!o2Next.ok) return;
    const { game: o2Jumped } = await untilReady(o2Next.state, o2Id, o2Bot);
    expect(o2Jumped.navigation.arriving?.planet).toBe("pl-1");
    expect(isHoldingJump(viewFor(o2Jumped, o2Id), memory())).toBe(false);

    // 4 days: backdate the hold (as the bot read it) rather than play 32 cycles (starvation and hull damage would end the game first).
    const { game: timeStart, id: timeId } = commander([planet("pl-1", "Kaxor", "north", 1)]);
    timeStart.ship.combustion = 1;
    const timeBot = new GoalBot(1, 2, [travel]);
    const { game: timeHeld } = await untilReady(timeStart, timeId, timeBot);
    const holdLine = timeHeld.chat.find((m) => m.channel === "global" && m.text === HOLD_JUMP_LINE)!;
    const waitCycles = HOLD_MAX_DAYS * DEFAULT_CONFIG.cyclesPerDay;
    holdLine.cycle = timeHeld.cycle + 1 - (waitCycles - 1);
    memoryOf(timeBot).jump.since = memoryOf(timeBot).holdSince = holdLine.cycle;
    timeHeld.hunters.points = 0;
    const almost = newCycle(timeHeld);
    expect(almost.ok).toBe(true);
    if (!almost.ok) return;
    almost.state.hunters.list = [];
    almost.state.hunters.points = 0;
    const { game: stillHolding } = await untilReady(almost.state, timeId, timeBot);
    expect(stillHolding.navigation.arriving).toBeNull();
    expect(isHoldingJump(viewFor(stillHolding, timeId), memory())).toBe(true);
    const last = newCycle(stillHolding);
    expect(last.ok).toBe(true);
    if (!last.ok) return;
    last.state.hunters.list = [];
    const { game: timedOut } = await untilReady(last.state, timeId, timeBot);
    expect(timedOut.navigation.arriving?.planet).toBe("pl-1");
    expect(isHoldingJump(viewFor(timedOut, timeId), memory())).toBe(false);
  });

  it("keeps 1 AP and bridge reach while running other goals during a hold, and wakes from rest on jump trigger", async () => {
    const { game: start, id } = commander([planet("pl-1", "Kaxor", "north", 1)]);
    start.ship.combustion = 1;
    const bot = new GoalBot(1, 2, SOLO_GOALS);
    const { game: initialHold } = await untilReady(start, id, bot);
    expect(isHoldingJump(viewFor(initialHold, id), memory())).toBe(true);

    // At 1 AP, 0 MP on the bridge with other goals available, the Commander keeps that 1 AP and bridge reach.
    const atBridge = edit(initialHold, id, (p) => {
      p.room = "COMMAND_CENTER";
      p.ap = 1;
      p.mp = 0;
    });
    const { game: held } = await untilReady(atBridge, id, bot);
    expect(held.players.find((p) => p.id === id)!.ap).toBeGreaterThanOrEqual(1);
    expect(canAfford(viewFor(held, id), "MEDBAY", 0, 0, memory())).toBe(false);
    // With 1 AP and enough MP for the round trip to BEDROOM_A, can afford a 0-AP goal there, but not a 1-AP goal.
    const roundTripMp = 8;
    const spareMp = edit(held, id, (p) => {
      p.room = "COMMAND_CENTER";
      p.ap = 1;
      p.mp = roundTripMp;
    });
    expect(canAfford(viewFor(spareMp, id), "BEDROOM_A", 0, 0, memory())).toBe(true);
    expect(canAfford(viewFor(spareMp, id), "BEDROOM_A", 1, 0, memory())).toBe(false);

    // Put Commander to rest on the ship while holding, then wake at 8 hunters to jump.
    const resting = edit(held, id, (p) => {
      p.room = "BEDROOM_A";
      p.ap = 2;
      p.mp = 12;
      p.lyingIn = held.equipment.BEDROOM_A!.find((e) => e.type === "BED")!.id;
      p.modifiers.push("lying_down");
    });
    const sleepBot = bot; // keeps its chamber reading in memory (the log line stays in the chamber room)
    const s1 = await sleepBot.decideAction(viewFor(resting, id));
    expect(s1).toEqual({ type: "ready" });
    expect(sleepBot.current).toMatch(/^rest:/);
    resting.hunters.list = makeHunters(HOLD_HUNTER_TRIGGER);
    const woken = newCycle(resting);
    expect(woken.ok).toBe(true);
    if (!woken.ok) return;
    const { game: jumped, taken } = await untilReady(woken.state, id, sleepBot);
    expect(taken.map((a) => a.type)).toContain("travel");
    expect(jumped.navigation.arriving?.planet).toBe("pl-1");
  });

  /** Pushes enough unrelated global lines that every earlier page leaves the state (#427). */
  const scrollGlobal = (game: GameState, by: string): void => {
    for (let i = 0; i <= 2 * CHAT_PAGE; i++) pushChat(game, "global", { from: by, isBot: false, text: `filler ${i}` });
  };
  const memoryOf = (bot: GoalBot) => (bot as unknown as { memory: ReturnType<typeof memory> }).memory;

  it("keeps a hold through chat pagination: no re-post, and the clock runs from the first line (#427)", async () => {
    const { game: start, id } = commander([planet("pl-1", "Kaxor", "north", 1)]);
    start.ship.combustion = 1;
    const bot = new GoalBot(1, 2, [travel]);
    const { game: held } = await untilReady(start, id, bot);
    const since = holdStartCycle(viewFor(held, id), memory())!;
    scrollGlobal(held, held.players.find((p) => p.id !== id)!.id);
    expect(viewFor(held, id).chat.some((m) => m.text === HOLD_JUMP_LINE)).toBe(false);
    held.hunters.points = 0;
    const next = newCycle(held);
    expect(next.ok).toBe(true);
    if (!next.ok) return;
    next.state.hunters.list = [];
    const { game: again, taken } = await untilReady(next.state, id, bot);
    expect(taken.map((a) => a.type)).not.toContain("travel");
    expect(again.chat.some((m) => m.text === HOLD_JUMP_LINE)).toBe(false); // not posted again
    expect(memoryOf(bot).holdSince).toBe(since);
    expect(memoryOf(bot).jump.since).toBe(since);

    // The trigger still fires off the remembered hold: the ship jumps and posts "Jump: off".
    again.hunters.list = makeHunters(HOLD_HUNTER_TRIGGER);
    const { game: jumped, taken: taken2 } = await untilReady(again, id, bot);
    expect(taken2.map((a) => a.type)).toContain("travel");
    expect(jumped.chat.at(-1)?.text).toBe(CANCEL_HOLD_LINE);
    await bot.decideAction(viewFor(jumped, id));
    expect(memoryOf(bot).holdSince).toBeNull();
    expect(memoryOf(bot).jump.since).toBeNull();
  });

  it("keeps a hold across a room restart: no second 'Jump: hold', and the same holdSince (#440)", async () => {
    const { game: start, id } = commander([planet("pl-1", "Kaxor", "north", 1)]);
    start.ship.combustion = 1;
    const before = new GoalBot(1, 2, [travel]);
    const { game: held } = await untilReady(start, id, before);
    const since = holdStartCycle(viewFor(held, id), memory())!;
    scrollGlobal(held, held.players.find((p) => p.id !== id)!.id);
    held.hunters.points = 0;
    const next = newCycle(held);
    expect(next.ok).toBe(true);
    if (!next.ok) return;
    next.state.hunters.list = [];
    // Stored as Durable Object storage does (structured clone), then read back by the bot the restarted room makes.
    const stored = structuredClone(before.snapshot());
    const fresh = new GoalBot(2, 2, [travel]);
    const { game: unrestored } = await untilReady(structuredClone(next.state), id, fresh);
    expect(unrestored.chat.some((m) => m.text === HOLD_JUMP_LINE)).toBe(true); // what a restart did before
    const bot = new GoalBot(2, 2, [travel]);
    expect(bot.restore(stored)).toBe(true);
    const { game: again, taken } = await untilReady(next.state, id, bot);
    expect(taken.map((a) => a.type)).not.toContain("travel");
    expect(again.chat.some((m) => m.text === HOLD_JUMP_LINE)).toBe(false);
    expect(memoryOf(bot).holdSince).toBe(since);
    expect(memoryOf(bot).jump.since).toBe(since);
  });

  it("restores every remembered fact, drops another version's snapshot, and fills fields added since (#440)", async () => {
    const { game, id } = commander([]);
    const bot = new GoalBot(1, 2, []);
    await bot.decideAction(viewFor(game, id));
    const full = (b: GoalBot) => (b as unknown as { memory: BotMemory }).memory;
    const m = full(bot);
    m.shrinks.add(id); // a Shrink that has announced itself
    m.once.add("setOutPots");
    m.today.add("tendPlants");
    m.items.rooms.set("extinguisher", new Set(["LABORATORY"]));
    m.fires.burning.add("FRONT_CORRIDOR");
    m.cancelHold = true;
    m.heading = "east";
    const stored = structuredClone(bot.snapshot());

    const restored = new GoalBot(7, 2, []);
    expect(restored.restore(stored)).toBe(true);
    expect(restored.snapshot()).toEqual(bot.snapshot());
    const r = full(restored);
    expect(r.shrinks.has(id)).toBe(true);
    expect(r.items.rooms.get("extinguisher")?.has("LABORATORY")).toBe(true);
    expect(r.fires.burning.has("FRONT_CORRIDOR")).toBe(true);

    const other = new GoalBot(7, 2, []);
    expect(other.restore({ ...stored, version: BOT_MEMORY_VERSION + 1 })).toBe(false);
    expect(other.restore(undefined)).toBe(false);
    expect(memoryOf(other).shrinks.size).toBe(0);
    expect(other.snapshot()).toEqual(new GoalBot(7, 2, []).snapshot());

    // A field this build has and the stored snapshot lacks comes out at a fresh bot's value.
    const { heading: _, ...older } = stored;
    const filled = new GoalBot(7, 2, []);
    expect(filled.restore(older)).toBe(true);
    expect(full(filled).heading).toBeNull();
    expect(memoryOf(filled).shrinks.has(id)).toBe(true);
  });

  it("lets a pilot remember a due jump after its line scrolls out of chat (#427)", () => {
    const { game: start, id: commanderId } = commander([]);
    const pilotId = start.players.find((p) => p.id !== commanderId)!.id;
    const game = edit(start, pilotId, (p) => {
      p.room = "SPACESHIP_BAY_A";
      p.ap = 10;
      p.mp = 12;
      p.skills = ["pilot"];
      p.resources.shoot = 0;
    });
    game.hunters.list = makeHunters(3);
    const nowRes = applyInput(game, { type: "chat", channel: "global", text: JUMP_NOW_LINE, by: commanderId });
    expect(nowRes.ok).toBe(true);
    if (!nowRes.ok) return;
    const pilotMemory = memory();
    expect(patrolShootHunters.options(viewFor(nowRes.state, pilotId), pilotMemory)).toEqual([]);
    scrollGlobal(nowRes.state, commanderId);
    const view = viewFor(nowRes.state, pilotId);
    expect(view.chat.some((m) => m.text === JUMP_NOW_LINE)).toBe(false);
    // A fresh reader has lost the line; the pilot that read it still stays docked.
    expect(patrolShootHunters.options(view, memory())).toHaveLength(1);
    expect(patrolShootHunters.options(view, pilotMemory)).toEqual([]);
    expect(isJumpDue(view, pilotMemory)).toBe(true);
  });

  it("clears holdSince when 'Jump: off' is read (#427)", async () => {
    const { game, id: commanderId } = commander([]);
    const other = game.players.find((p) => p.id !== commanderId)!.id;
    const bot = new GoalBot(1, 2, []);
    const held = applyInput(game, { type: "chat", channel: "global", text: HOLD_JUMP_LINE, by: commanderId });
    expect(held.ok).toBe(true);
    if (!held.ok) return;
    await bot.decideAction(viewFor(held.state, other));
    expect(memoryOf(bot).holdSince).toBe(held.state.cycle);
    const off = applyInput(held.state, { type: "chat", channel: "global", text: CANCEL_HOLD_LINE, by: commanderId });
    expect(off.ok).toBe(true);
    if (!off.ok) return;
    await bot.decideAction(viewFor(off.state, other));
    expect(memoryOf(bot).holdSince).toBeNull();
    expect(isHoldingJump(viewFor(off.state, other), memoryOf(bot))).toBe(false);
  });

  it("keeps turret gunners shooting but patrol pilots docked (landing if airborne) while a jump hold is active in chat", async () => {
    const { game: start, id: commanderId } = commander([]);
    const turret = start.players.find((p) => p.id !== commanderId)!;
    const pilot = start.players.find((p) => p.id !== commanderId && p.id !== turret.id)!;
    const turretRoom = roomsWith(viewFor(start, turret.id), ["TURRET_COMMAND"])[0]!;
    const bayRoom = roomsWith(viewFor(start, pilot.id), ["PATROL_INTERFACE"])[0]!;
    let game = edit(start, turret.id, (p) => {
      p.room = turretRoom;
      p.ap = 8;
      p.skills = ["gunman"];
      p.resources.shoot = 0;
    });
    game = edit(game, pilot.id, (p) => {
      p.room = bayRoom;
      p.ap = 10;
      p.skills = ["pilot"];
      p.resources.shoot = 0;
    });
    game.hunters.list = makeHunters(3);
    for (const t of Object.values(game.equipment).flat().filter((e) => e.type === "TURRET_COMMAND")) game.turrets[t.id] = 10;

    // Without hold, gunner and pilot want to shoot.
    expect(shootHunters.options(viewFor(game, turret.id), memory())).toHaveLength(1);
    expect(patrolShootHunters.options(viewFor(game, pilot.id), memory())).toHaveLength(1);

    // A held jump changes nothing: both still fight.
    const heldRes = applyInput(game, { type: "chat", channel: "global", text: HOLD_JUMP_LINE, by: commanderId });
    expect(heldRes.ok).toBe(true);
    if (!heldRes.ok) return;
    expect(shootHunters.options(viewFor(heldRes.state, turret.id), memory())).toHaveLength(1);
    expect(patrolShootHunters.options(viewFor(heldRes.state, pilot.id), memory())).toHaveLength(1);
    // ...until its public trigger is met: the jump is due, so the pilot stays docked before any "Jump: now".
    const triggered = structuredClone(heldRes.state);
    triggered.hunters.list = makeHunters(HOLD_HUNTER_TRIGGER);
    expect(patrolShootHunters.options(viewFor(triggered, pilot.id), memory())).toEqual([]);

    // 'Jump: now': the gunner still shoots; the pilot stays docked, and lands without shooting if airborne.
    const nowRes = applyInput(heldRes.state, { type: "chat", channel: "global", text: JUMP_NOW_LINE, by: commanderId });
    expect(nowRes.ok).toBe(true);
    if (!nowRes.ok) return;
    game = nowRes.state;
    expect(isJumpDue(viewFor(game, pilot.id), memory())).toBe(true);
    expect(holdStartCycle(viewFor(game, pilot.id), memory())).toBe(heldRes.state.cycle);
    expect(shootHunters.options(viewFor(game, turret.id), memory())).toHaveLength(1);
    expect(patrolShootHunters.options(viewFor(game, pilot.id), memory())).toEqual([]);

    const airborne = edit(game, pilot.id, (p) => {
      p.room = "PATROL_SHIP_A_0";
    });
    airborne.patrolShips["PATROL_SHIP_A_0"]!.out = true;
    expect(await new GoalBot(1, 2, [patrolShootHunters]).decideAction(viewFor(airborne, pilot.id))).toEqual({
      type: "land",
      equipment: "PATROL_SHIP_A_0:PATROL_COMMAND",
    });

    // After 'Jump: off', both resume fighting.
    const offRes = applyInput(game, { type: "chat", channel: "global", text: CANCEL_HOLD_LINE, by: commanderId });
    expect(offRes.ok).toBe(true);
    if (!offRes.ok) return;
    expect(shootHunters.options(viewFor(offRes.state, turret.id), memory())).toHaveLength(1);
    expect(patrolShootHunters.options(viewFor(offRes.state, pilot.id), memory())).toHaveLength(1);
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
    start.signals.list = start.signals.list.filter((sig) => sig.kind !== "rebel");
    addSignal(start, "rebel", start.cycle + 10, { rebel: { base: "WOLF", progress: 95 } });
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
    rebelCalls(game)[0]!.rebel!.progress = 100;
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

describe("item sharing (itemShare.ts) and walking to scrap", () => {
  /** A game with every metal scrap in one room, and a bot placed in `room` (default: with the scrap). */
  function scrapGame(at: "with" | "away" = "with"): { game: GameState; id: string; scrapRoom: string; other: string } {
    const { game: start, id } = setup();
    const scrapRoom = "CORRIDOR_A";
    start.items = start.items.filter((i) => i.at.kind !== "room" || i.at.id !== scrapRoom);
    for (let k = 0; k < 4; k++) {
      start.items.push({ id: `test-scrap-${k}`, type: "metal_scraps", at: { kind: "room", id: scrapRoom } });
    }
    // Only scrap is reported here (extinguishers are too, #429).
    start.items = start.items.filter((i) => i.type !== "extinguisher");
    const other = start.players.find((p) => p.id !== id && p.role === "human")!.id;
    const far = SHIP_ROOMS.map((r) => r.id).find((r) => r !== scrapRoom && (shortestPath(start.config.rooms, r, scrapRoom)?.length ?? 0) === 2)!;
    const game = edit(start, id, (p) => {
      p.room = at === "with" ? scrapRoom : far;
      p.ap = 10;
      p.mp = 12;
    });
    return { game, id, scrapRoom, other };
  }

  it("reads only its own format, a shared type and a real room", () => {
    const line = { type: "metal_scraps" as const, room: "CORRIDOR_A", present: true };
    expect(parseItemLine(formatItemLine(line))).toEqual(line);
    expect(parseItemLine(formatItemLine({ ...line, present: false }))).toEqual({ ...line, present: false });
    for (const text of ["Item: gold in CORRIDOR_A", "Item: metal_scraps in NOWHERE", "item: metal_scraps in CORRIDOR_A", "Item: metal_scraps in CORRIDOR_A please"]) expect(parseItemLine(text)).toBeNull();
  });

  it("says once where it sees scrap, and another bot learns the room from the line", () => {
    const { game, id, scrapRoom, other } = scrapGame();
    const m = memory();
    const post = observeItems(viewFor(game, id), m);
    expect(post).toEqual({ type: "chat", channel: "global", text: `Item: metal_scraps in ${scrapRoom}` });
    expect(roomsHolding(m, "metal_scraps")).toEqual([scrapRoom]);
    const said = applyInput(game, { ...post!, by: id });
    expect(said.ok).toBe(true);
    if (!said.ok) return;
    // Nobody repeats it: not the bot that said it, not another bot standing there.
    expect(observeItems(viewFor(said.state, id), m)).toBeNull();
    const elsewhere = edit(said.state, other, (p) => (p.room = SHIP_ROOMS.map((r) => r.id).find((r) => r !== scrapRoom)!));
    const theirs = memory();
    expect(observeItems(viewFor(elsewhere, other), theirs)).toBeNull();
    expect(roomsHolding(theirs, "metal_scraps")).toEqual([scrapRoom]);
    // The scrap is gone: the first bot to stand there says so, and the room is forgotten.
    const gone = structuredClone(said.state);
    gone.items = gone.items.filter((i) => i.type !== "metal_scraps");
    expect(observeItems(viewFor(gone, id), m)?.text).toBe(`Item: no metal_scraps in ${scrapRoom}`);
    expect(roomsHolding(m, "metal_scraps")).toEqual([]);
  });

  it("walks to a room it knows holds scrap and patches the hull there, only below 50", async () => {
    const { game: start, id, scrapRoom } = scrapGame("away");
    start.ship.hull = 40;
    const m = memory();
    expect(repairHull.options(viewFor(start, id), m)).toEqual([]);
    m.items.rooms.set("metal_scraps", new Set([scrapRoom]));
    expect(repairHull.options(viewFor(start, id), m).map((g) => g.key)).toEqual([`repairHull:${scrapRoom}`]);
    start.ship.hull = 50;
    expect(repairHull.options(viewFor(start, id), m)).toEqual([]);
    // End to end: told by a line in chat, the bot walks there and tries until the AP reserve.
    start.ship.hull = 40;
    const told = applyInput(start, { type: "chat", channel: "global", text: formatItemLine({ type: "metal_scraps", room: scrapRoom, present: true }), by: id });
    expect(told.ok).toBe(true);
    if (!told.ok) return;
    const { game: end, taken } = await untilReady(told.state, id, new GoalBot(1, 2, [repairHull]));
    expect(taken.filter((a) => a.type === "move")).toHaveLength(2);
    expect(taken.filter((a) => a.type === "repair_hull").length).toBeGreaterThan(0);
    const me = end.players.find((p) => p.id === id)!;
    expect(me.room).toBe(scrapRoom);
    expect(me.ap).toBe(2);
  });
});

describe("fires (fireShare.ts, extinguish goal, #429)", () => {
  /** A game where `room` has just caught fire, announced by NERON as the rules do (fire.ts `startFire`). */
  function ignite(game: GameState, room: string): GameState {
    const next = structuredClone(game);
    next.fires.push(room);
    pushChat(next, "global", { from: null, isBot: false, text: "", system: { key: "fireStarted" } });
    return next;
  }
  /** A bot with 10 AP and 0 MP standing in `room`. */
  function at(room: string, ap = 10): { game: GameState; id: string } {
    const { game, id } = setup();
    return {
      game: edit(game, id, (p) => {
        p.room = room;
        p.ap = ap;
        p.mp = 0;
      }),
      id,
    };
  }
  const fire = "LABORATORY";

  it("reads only its own format and a real room", () => {
    expect(parseFireLine(formatFireLine({ room: "CORRIDOR_A" }))).toEqual({ room: "CORRIDOR_A" });
    for (const text of ["Fire: clear in NOWHERE", "fire: clear in CORRIDOR_A", "Fire: in CORRIDOR_A", "Fire: clear in CORRIDOR_A now"]) expect(parseFireLine(text)).toBeNull();
  });

  it("counts fires from the alert bar, says a searched room is clear, and learns burning rooms from reports (#444)", () => {
    const { game: start, id } = at("CORRIDOR_A");
    const game = ignite(start, fire);
    const m = memory();
    const seen = observeFires(viewFor(game, id), m);
    expect(seen.news).toBe(true);
    expect(seen.post?.text).toBe("Fire: clear in CORRIDOR_A");
    expect(m.fires.active).toBe(1);
    // Another bot reads the clear line and skips that room.
    const said = applyInput(game, { ...seen.post!, by: id });
    expect(said.ok).toBe(true);
    if (!said.ok) return;
    const other = said.state.players.find((p) => p.id !== id && p.alive)!.id;
    const theirs = memory();
    observeFires(viewFor(edit(said.state, other, (p) => (p.room = "CORRIDOR_C")), other), theirs);
    expect(theirs.fires.checked.has("CORRIDOR_A")).toBe(true);
    // In the burning room: it knows at once, posts nothing, and the reflex reports it.
    const there = edit(said.state, id, (p) => (p.room = fire));
    const found = observeFires(viewFor(there, id), m);
    expect(found.post).toBeNull();
    expect([...m.fires.burning]).toEqual([fire]);
    const reported = applyInput(there, { type: "action", by: id, action: { type: "report_fire" } });
    expect(reported.ok).toBe(true);
    if (!reported.ok) return;
    // The other bot learns it from the report.
    observeFires(viewFor(edit(reported.state, other, (p) => (p.room = "CORRIDOR_C")), other), theirs);
    expect([...theirs.fires.burning]).toEqual([fire]);
    // Put out: every count drops.
    const out = structuredClone(reported.state);
    out.fires = [];
    expect(observeFires(viewFor(out, id), m).post).toBeNull();
    expect(m.fires.active).toBe(0);
    expect(m.fires.burning.size).toBe(0);
  });

  it("reports a fire and broken equipment it stands next to, before its goal (#444)", async () => {
    const { game: start, id } = at(fire);
    const game = ignite(start, fire);
    const broken = structuredClone(game);
    const equipment = broken.equipment[fire]!.find((e) => broken.config.repair.chance[e.type] !== undefined)!;
    equipment.broken = true;
    const bot = new GoalBot(1, 2, [extinguish]);
    const first = await bot.decideAction(viewFor(broken, id));
    expect(first?.type).toMatch(/^report_(fire|equipment)$/);
    const r1 = applyInput(broken, { type: "action", by: id, action: first! });
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    const second = await bot.decideAction(viewFor(r1.state, id));
    expect(second?.type).toMatch(/^report_(fire|equipment)$/);
    expect(second?.type).not.toBe(first?.type);
    const r2 = applyInput(r1.state, { type: "action", by: id, action: second! });
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(r2.state.reports).toHaveLength(2);
    // Nothing left to report: it gets on with the fire.
    expect((await bot.decideAction(viewFor(r2.state, id)))?.type).not.toMatch(/^report_/);
  });

  it("with the Fire sensor, trusts it and posts nothing", () => {
    const { game: start, id } = at("CORRIDOR_A");
    const game = ignite(start, fire);
    game.projects.FIRE_SENSOR = 100;
    const m = memory();
    expect(observeFires(viewFor(game, id), m).post).toBeNull();
    expect([...m.fires.burning]).toEqual([fire]);
    expect(m.fires.active).toBe(1);
  });

  it("fetches an extinguisher it heard about, puts out a known fire (reserve included), and leaves it in a corridor", async () => {
    const { game: start, id } = at("CORRIDOR_A", 6);
    const game = ignite(start, fire);
    if (!game.items.some((i) => i.type === "extinguisher" && i.at.kind === "room" && i.at.id === "CORRIDOR_A")) {
      game.items.push({ id: "test-ext", type: "extinguisher", at: { kind: "room", id: "CORRIDOR_A" } });
    }
    // Someone reported the fire; the extinguisher in CORRIDOR_A it sees itself.
    game.reports.push({ kind: "fire", room: fire, by: game.players.find((p) => p.id !== id)!.id });
    const bot = new GoalBot(3, 2, [extinguish]);
    const { game: end, taken } = await play(game, id, bot, 40);
    expect(taken.some((a) => a.type === "take")).toBe(true);
    expect(taken.some((a) => a.type === "extinguish")).toBe(true);
    // Back in a corridor and dropped once the fire is out.
    expect(taken.slice(0, 6).map((a) => a.type)).toEqual(["take", "move", "extinguish", "extinguish", "move", "drop"]);
    expect(taken[4]).toEqual({ type: "move", to: "CORRIDOR_A" });
    // Later cycles bring new random fires, so only the first round is pinned down. Hunters may still destroy the
    // ship in 40 turns (the seed decides), which isn't the bot's doing.
    if (!end.log.some((e) => e.key === "shipDestroyed")) expect(end.players.find((p) => p.id === id)!.alive).toBe(true);
  });

  it("searches only above the AP reserve", () => {
    const { game: start, id } = at("CORRIDOR_A", 2);
    const game = ignite(start, fire);
    const m = memory();
    observeFires(viewFor(game, id), m);
    expect(extinguish.options(viewFor(game, id), m)).toEqual([]);
    const rich = edit(game, id, (p) => (p.ap = 6));
    expect(extinguish.options(viewFor(rich, id), m).map((g) => g.key)).toEqual(["extinguish:search"]);
  });

  it("a fire heard about drops a lower goal", async () => {
    const { game: placed, id } = at("CORRIDOR_A");
    const start = edit(placed, id, (p) => (p.mp = 6)); // exploring walks on MP alone
    const bot = new GoalBot(1, 2, [extinguish, ...SOLO_GOALS.filter((g) => g.id === "explore")]);
    // The first turns post what it sees on the floor (itemShare.ts); then it explores.
    for (let i = 0; i < 4 && bot.current === null; i++) await bot.decideAction(viewFor(start, id));
    expect(bot.current).toMatch(/^explore:/);
    const burning = ignite(start, fire);
    // That turn it says CORRIDOR_A is clear; the next it searches.
    await bot.decideAction(viewFor(burning, id));
    expect(bot.current).toBeNull();
    await bot.decideAction(viewFor(burning, id));
    expect(bot.current).toBe("extinguish:search");
  });
});

describe("oxygen tanks (tankShare.ts, repairOxygen goal, #443)", () => {
  const FRONT = "STORAGE_A_0";
  const REAR = "STORAGE_B_0";
  /** A game where the tank in `room` has just broken, announced by NERON as the rules do (breakage.ts). */
  function breakTank(game: GameState, room: string): GameState {
    const next = structuredClone(game);
    next.equipment[room]!.find((e) => e.type === "OXYGEN_TANK")!.broken = true;
    pushChat(next, "global", { from: null, isBot: false, text: "", system: { key: "equipmentBroken", params: { equipment: "OXYGEN_TANK" } } });
    return next;
  }
  /** A bot with `ap` AP and 0 MP standing in `room`. */
  function at(room: string, ap = 10): { game: GameState; id: string } {
    const { game, id } = setup();
    return {
      game: edit(game, id, (p) => {
        p.room = room;
        p.ap = ap;
        p.mp = 0;
      }),
      id,
    };
  }

  it("reads only its own format and a tank room", () => {
    expect(parseTankLine(formatTankLine({ kind: "claim", room: FRONT }))).toEqual({ kind: "claim", room: FRONT });
    expect(parseTankLine(formatTankLine({ kind: "fine", room: REAR }))).toEqual({ kind: "fine", room: REAR });
    for (const text of ["Tank: going to CORRIDOR_A", "tank: going to STORAGE_A_0", "Tank: fine in NOWHERE", "Tank: going to STORAGE_A_0 now"]) expect(parseTankLine(text)).toBeNull();
  });

  it("suspects every tank room on NERON's notice, says a working one is fine, and learns the broken one from reports", () => {
    const { game: start, id } = at(FRONT);
    const game = breakTank(start, REAR);
    const m = memory();
    const seen = observeTanks(viewFor(game, id), m);
    expect(seen.news).toBe(true);
    expect(seen.post?.text).toBe(`Tank: fine in ${FRONT}`);
    expect([...m.tanks.suspect]).toEqual([REAR]);
    const said = applyInput(game, { ...seen.post!, by: id });
    expect(said.ok).toBe(true);
    if (!said.ok) return;
    // Another bot reads the line and suspects only the rear tank.
    const other = said.state.players.find((p) => p.id !== id && p.alive)!.id;
    const theirs = memory();
    observeTanks(viewFor(edit(said.state, other, (p) => (p.room = "CORRIDOR_A")), other), theirs);
    expect([...theirs.tanks.suspect]).toEqual([REAR]);
    // Reported: known broken, no longer a suspect.
    const reported = structuredClone(said.state);
    reported.reports.push({ kind: "equipment", equipment: reported.equipment[REAR]!.find((e) => e.type === "OXYGEN_TANK")!.id, by: id });
    observeTanks(viewFor(edit(reported, other, (p) => (p.room = "CORRIDOR_A")), other), theirs);
    expect([...theirs.tanks.broken]).toEqual([REAR]);
    expect(theirs.tanks.suspect.size).toBe(0);
  });

  it("with the Anomaly detector, searches nothing", () => {
    const { game: start, id } = at("CORRIDOR_A");
    const game = breakTank(start, REAR);
    game.projects.EQUIPMENT_SENSOR = 100;
    const m = memory();
    observeTanks(viewFor(game, id), m);
    expect([...m.tanks.broken]).toEqual([REAR]);
    expect(m.tanks.suspect.size).toBe(0);
  });

  it("claims a tank, walks there, reports it and repairs it", async () => {
    const { game: start, id } = at("CORRIDOR_A", 12);
    const game = breakTank(start, FRONT);
    game.config = { ...game.config, repair: { ...game.config.repair, chance: { ...game.config.repair.chance, OXYGEN_TANK: 1 } } };
    const bot = new GoalBot(1, 2, [repairOxygen]);
    const { game: end, taken } = await play(game, id, bot, 20);
    expect(end.equipment[FRONT]!.find((e) => e.type === "OXYGEN_TANK")!.broken).toBeUndefined();
    expect(taken.map((a) => a.type)).toContain("report_equipment");
    expect(taken.some((a) => a.type === "repair")).toBe(true);
    expect(end.chat.some((c) => c.text === `Tank: going to ${FRONT}`)).toBe(true);
  });

  it("leaves a tank room another bot claimed this cycle", () => {
    const { game: start, id } = at("CORRIDOR_A");
    const broken = breakTank(start, FRONT);
    const other = broken.players.find((p) => p.id !== id && p.alive)!.id;
    const claimed = applyInput(broken, { type: "chat", channel: "global", text: formatTankLine({ kind: "claim", room: FRONT }), by: other });
    expect(claimed.ok).toBe(true);
    if (!claimed.ok) return;
    const m = memory();
    observeTanks(viewFor(claimed.state, id), m);
    // The rear tank is still a suspect nobody claimed; the front one is someone else's.
    expect(repairOxygen.options(viewFor(claimed.state, id), m).map((g) => g.key)).toEqual([`repairOxygen:go:${REAR}`]);
    const next = newCycle(claimed.state);
    expect(next.ok).toBe(true);
    if (!next.ok) return;
    const view = viewFor(edit(next.state, id, (p) => (p.ap = 10)), id);
    observeTanks(view, m);
    expect(repairOxygen.options(view, m).map((g) => g.key)[0]).toMatch(/^repairOxygen:go:/);
    expect(m.tanks.claims.size).toBe(0);
  });
});

describe("expeditionPlan: Pilot creates channel & expedition plan on travel", () => {
  const pilotSetup = (largerBay = false) => {
    const { game: base, id } = setup();
    let game = edit(base, id, (p) => {
      p.skills = ["pilot"];
    });
    if (largerBay) {
      game = { ...game, projects: { ...game.projects, ICARUS_LARGER_BAY: 100 } };
    }
    const traveling = { ...game, navigation: { ...game.navigation, arriving: { planet: null, distance: 1 } } };
    return { game: traveling, id };
  };

  it("is only offered to a Pilot with an iTrackie while traveling", () => {
    const { game, id } = pilotSetup();
    const nonPilot = edit(game, id, (p) => (p.skills = []));
    expect(expeditionPlan.options(viewFor(nonPilot, id), memory())).toEqual([]);
    const notTraveling = { ...game, navigation: { ...game.navigation, arriving: null } };
    expect(expeditionPlan.options(viewFor(notTraveling, id), memory())).toEqual([]);
    const noITrackie = { ...game, items: game.items.filter((i) => !(i.at.kind === "player" && i.at.id === id && i.type === ITRACKIE_ITEM)) };
    expect(expeditionPlan.options(viewFor(noITrackie, id), memory())).toEqual([]);
    expect(expeditionPlan.options(viewFor(game, id), memory())).toHaveLength(1);
  });

  it("creates an Expedition channel and posts a plan for ICARUS with up to maxCrew onCall slots", async () => {
    const { game: start, id } = pilotSetup(false);
    const bot = new GoalBot(1, 2, [expeditionPlan]);
    const { game: after } = await play(start, id, bot, 2);
    const channel = after.channels.find((c) => c.name === EXPEDITION_CHANNEL_NAME && c.createdBy === id);
    expect(channel).toBeDefined();
    expect(channel!.members.length).toBeGreaterThan(1);
    const plan = after.plans.find((p) => p.channel === channel!.id && p.status === "open");
    expect(plan).toMatchObject({
      author: id,
      room: DEFAULT_CONFIG.expedition.room,
      purpose: "expedition",
    });
    expect(plan!.slots).toHaveLength(DEFAULT_CONFIG.expedition.maxCrew - 1);
    expect(plan!.slots.every((s) => s.kind === "onCall")).toBe(true);
    expect(expeditionPlan.options(viewFor(after, id), memory())).toEqual([]);
  });

  it("uses largerBayCrew (6) when ICARUS_LARGER_BAY is completed", async () => {
    const { game: start, id } = pilotSetup(true);
    const bot = new GoalBot(1, 2, [expeditionPlan]);
    const { game: after } = await play(start, id, bot, 2);
    const plan = after.plans.find((p) => p.purpose === "expedition" && p.status === "open");
    expect(plan).toBeDefined();
    expect(plan!.slots).toHaveLength(DEFAULT_CONFIG.expedition.largerBayCrew - 1);
  });

  it("cancels the open plan if the ship finishes traveling without orbiting, and reuses the channel on the next jump", async () => {
    const { game: start, id } = pilotSetup(false);
    const bot = new GoalBot(1, 2, [expeditionPlan]);
    const { game: posted } = await play(start, id, bot, 2);
    expect(posted.plans.filter((p) => p.status === "open")).toHaveLength(1);

    // Arrive in empty space (no orbit): newCycle clears traveling and orbit stays null.
    const next = newCycle(posted);
    expect(next.ok).toBe(true);
    if (!next.ok) return;
    const { game: cancelled, taken } = await play(next.state, id, bot, 1);
    expect(taken).toContainEqual({ type: "cancel_plan", plan: posted.plans[0]!.id });
    expect(cancelled.plans.find((p) => p.id === posted.plans[0]!.id)!.status).toBe("cancelled");

    // Next jump: reuses the existing Expedition channel instead of creating a duplicate.
    const jump2 = { ...cancelled, navigation: { ...cancelled.navigation, arriving: { planet: null, distance: 1 } } };
    const { game: reposted } = await play(jump2, id, bot, 2);
    expect(reposted.channels.filter((c) => c.name === EXPEDITION_CHANNEL_NAME)).toHaveLength(1);
    expect(reposted.plans.filter((p) => p.status === "open")).toHaveLength(1);
  });
});

describe("expeditionPrep: priority claiming, gear rules, drop iTrackie, and ICARUS wait", () => {
  function prepSetup(sectors: string[] = ["HYDROCARBON", "FOREST", "INTELLIGENT", "CAVE", "MOUNTAIN"]) {
    const { game: base, id: pilot } = setup();
    const humans = base.players.filter((p) => p.alive && p.role === "human" && p.id !== pilot && !p.modifiers.includes("wheelchair"));
    const botA = humans[0]!.id;
    const botB = humans[1]!.id;
    // Share a planet in the bots' format and start traveling toward it.
    let game: GameState = {
      ...base,
      navigation: { ...base.navigation, arriving: { planet: "planet-1", distance: 2 } },
      sharedPlanets: [
        {
          id: "share-1",
          planet: "planet-1",
          by: pilot,
          day: 1,
          cycleOfDay: 1,
          stale: false,
          text: formatPlanetShare({ name: "Testaria", direction: "north", distance: 2, sectors }),
        },
      ],
    };
    const chRes = applyInput(game, {
      type: "createChannel",
      by: pilot,
      name: EXPEDITION_CHANNEL_NAME,
      members: [botA, botB],
    });
    expect(chRes.ok).toBe(true);
    if (!chRes.ok) throw new Error("createChannel failed");
    game = chRes.state;
    const channelId = game.channels[game.channels.length - 1]!.id;
    const planRes = applyInput(game, {
      type: "postPlan",
      by: pilot,
      plan: {
        channel: channelId,
        room: DEFAULT_CONFIG.expedition.room,
        purpose: "expedition",
        slots: [{ kind: "onCall" }, { kind: "onCall" }],
      },
    });
    expect(planRes.ok).toBe(true);
    if (!planRes.ok) throw new Error("postPlan failed");
    return { game: planRes.state, pilot, botA, botB, planId: planRes.state.plans[0]!.id };
  }

  it("reads the active non-stale shared planet while traveling or orbiting", () => {
    const { game, botA } = prepSetup(["OXYGEN", "HYDROCARBON"]);
    const info = activeSharedPlanet(viewFor(game, botA));
    expect(info).toEqual({ name: "Testaria", direction: "north", distance: 2, sectors: ["OXYGEN", "HYDROCARBON"] });
    const staleOnly = { ...game, sharedPlanets: game.sharedPlanets.map((s) => ({ ...s, stale: true })) };
    expect(activeSharedPlanet(viewFor(staleOnly, botA))).toBeNull();
  });

  it("computes required gear from the planet's sectors and bot skills", () => {
    const { game, botA } = prepSetup();
    const plain = viewFor(edit(game, botA, (p) => (p.skills = [])), botA);
    expect(requiredExpeditionGear(["HYDROCARBON", "FOREST", "INTELLIGENT", "CAVE", "MOUNTAIN"], plain)).toEqual([
      "space_suit",
      "drill",
      "quad_compass",
      "white_flag",
      "rope",
    ]);
    // With OXYGEN, no space_suit; with only 1 rope tag, no rope; with diplomacy, no white_flag.
    const diplomat = viewFor(edit(game, botA, (p) => (p.skills = ["diplomacy"])), botA);
    expect(requiredExpeditionGear(["OXYGEN", "CAVE", "INTELLIGENT"], diplomat)).toEqual(["quad_compass"]);
    // Polymath also covers INTELLIGENT without white_flag.
    const polymath = viewFor(edit(game, botA, (p) => (p.skills = ["polymath"])), botA);
    expect(requiredExpeditionGear(["OXYGEN", "INTELLIGENT"], polymath)).toEqual([]);
  });

  it("identifies priority claimants and unfit bots accurately", () => {
    const { game, botA } = prepSetup(["INTELLIGENT"]);
    expect(isPriorityExpeditionClaimant(viewFor(edit(game, botA, (p) => (p.skills = ["diplomacy"])), botA), ["INTELLIGENT"])).toBe(true);
    expect(isPriorityExpeditionClaimant(viewFor(edit(game, botA, (p) => (p.skills = ["diplomacy"])), botA), ["FOREST"])).toBe(false);
    expect(isPriorityExpeditionClaimant(viewFor(edit(game, botA, (p) => (p.skills = ["sprint"])), botA), ["FOREST"])).toBe(true);
    expect(isPriorityExpeditionClaimant(viewFor(edit(game, botA, (p) => (p.skills = ["survival"])), botA), ["FOREST"])).toBe(true);
    expect(isPriorityExpeditionClaimant(viewFor(edit(game, botA, (p) => (p.skills = ["botanic"])), botA), ["FOREST"])).toBe(true);
    expect(isPriorityExpeditionClaimant(viewFor(edit(game, botA, (p) => (p.skills = ["polymath"])), botA), ["FOREST"])).toBe(true);

    // Gunman only counts as priority when carrying a working gun.
    const gunmanNoGun = viewFor(edit(game, botA, (p) => (p.skills = ["gunman"])), botA);
    expect(isPriorityExpeditionClaimant(gunmanNoGun, ["FOREST"])).toBe(false);
    const withBlaster = {
      ...edit(game, botA, (p) => (p.skills = ["gunman"])),
      items: [...game.items, { id: "test-gun", type: "blaster", at: { kind: "player" as const, id: botA }, charges: 3 }],
    };
    expect(isPriorityExpeditionClaimant(viewFor(withBlaster, botA), ["FOREST"])).toBe(true);

    // Unfit checks.
    expect(isFitForExpedition(viewFor(edit(game, botA, (p) => (p.hp = 4)), botA))).toBe(false);
    expect(isFitForExpedition(viewFor(edit(game, botA, (p) => p.modifiers.push("wheelchair")), botA))).toBe(false);
    expect(isFitForExpedition(viewFor(edit(game, botA, (p) => { p.satiety = 0; p.satietyZeroSince = -30; }), botA))).toBe(false);
  });

  it("lets priority bots claim immediately and non-priority fit bots claim after a 1-cycle wait", async () => {
    const { game: start, botA, botB, planId } = prepSetup(["FOREST"]);
    let game = edit(start, botA, (p) => (p.skills = ["sprint"]));
    game = edit(game, botB, (p) => (p.skills = []));
    const memA = memory();
    const memB = memory();
    const goalBotB = new GoalBot(2, 2, [expeditionPrep]);

    // Cycle 0: priority botA is offered claim_slot immediately; non-priority botB waits.
    expect(expeditionPrep.options(viewFor(game, botA), memA)).toHaveLength(1);
    expect(expeditionPrep.options(viewFor(game, botB), memB)).toEqual([]);
    await goalBotB.decideAction(viewFor(game, botB));
    goalBotB.takeSocial();
    expect(game.plans.find((p) => p.id === planId)!.slots[0]!.holder).toBeNull();

    const { game: afterA } = await untilReady(game, botA, new GoalBot(1, 2, [expeditionPrep]));
    const planAfterA = afterA.plans.find((p) => p.id === planId)!;
    expect(planAfterA.slots[0]!.holder).toBe(botA);
    expect(planAfterA.slots[1]!.holder).toBeNull();

    // Advance 1 cycle (still traveling): now non-priority fit botB can claim the remaining slot.
    const next = newCycle(afterA);
    expect(next.ok).toBe(true);
    if (!next.ok) return;
    const stillTraveling = { ...next.state, navigation: { ...next.state.navigation, arriving: { planet: "planet-1", distance: 1 } } };
    expect(expeditionPrep.options(viewFor(stillTraveling, botB), memB)).toHaveLength(1);
    const { game: afterB } = await untilReady(stillTraveling, botB, goalBotB);
    const planAfterB = afterB.plans.find((p) => p.id === planId)!;
    expect(planAfterB.slots[1]!.holder).toBe(botB);
  });

  it("fetches needed gear from known rooms, walks to ICARUS, drops iTrackie before takeoff, and recovers it after", async () => {
    const { game: start, botA } = prepSetup(["HYDROCARBON", "OXYGEN"]);
    let game = edit(start, botA, (p) => {
      p.skills = ["survival"];
      p.room = "CORRIDOR_A";
      p.ap = 10;
      p.mp = 12;
    });
    const bot = new GoalBot(1, 2, [expeditionPrep]);
    // Teach botA that drill is in STORAGE_FRONT via itemShare global chat.
    const shared = applyInput(game, { type: "chat", channel: "global", text: "Item: drill in STORAGE_FRONT", by: botA });
    expect(shared.ok).toBe(true);
    if (!shared.ok) return;
    game = shared.state;

    // While traveling: botA claims slot, walks to STORAGE_FRONT, picks up drill, walks to ICARUS, and waits.
    const { game: inIcarus } = await untilReady(game, botA, bot);
    const me = inIcarus.players.find((p) => p.id === botA)!;
    expect(me.room).toBe(DEFAULT_CONFIG.expedition.room);
    expect(inIcarus.items.some((i) => i.at.kind === "player" && i.at.id === botA && i.type === "drill")).toBe(true);
    // Still holds iTrackie while traveling (not orbiting yet).
    expect(inIcarus.items.some((i) => i.at.kind === "player" && i.at.id === botA && i.type === ITRACKIE_ITEM)).toBe(true);

    // Ship arrives in orbit: botA drops iTrackie in ICARUS to free an inventory slot and stays in ICARUS.
    const orbiting: GameState = {
      ...inIcarus,
      navigation: { ...inIcarus.navigation, arriving: null, orbit: "planet-1" },
    };
    const next = newCycle(orbiting);
    expect(next.ok).toBe(true);
    if (!next.ok) return;
    const { game: readyForTakeoff, taken } = await untilReady(next.state, botA, bot);
    expect(taken.some((a) => a.type === "drop")).toBe(true);
    expect(readyForTakeoff.items.some((i) => i.at.kind === "player" && i.at.id === botA && i.type === ITRACKIE_ITEM)).toBe(false);
    expect(readyForTakeoff.players.find((p) => p.id === botA)!.room).toBe(DEFAULT_CONFIG.expedition.room);

    // Even after view.plans disappears (no iTrackie), botA stays waiting in ICARUS for takeoff.
    const next2 = newCycle(readyForTakeoff);
    expect(next2.ok).toBe(true);
    if (!next2.ok) return;
    const { game: stillWaiting } = await untilReady(next2.state, botA, bot);
    expect(stillWaiting.players.find((p) => p.id === botA)!.room).toBe(DEFAULT_CONFIG.expedition.room);

    // After expedition completes (expeditions array grows), botA recovers its iTrackie from ICARUS floor.
    const afterExpedition: GameState = {
      ...stillWaiting,
      expeditions: [
        {
          id: "exp-1",
          planet: "Testaria",
          day: 1,
          cycle: stillWaiting.cycle,
          members: [botA],
          lostAt: [],
          events: [],
        },
      ],
    };
    const next3 = newCycle(afterExpedition);
    expect(next3.ok).toBe(true);
    if (!next3.ok) return;
    const { game: recovered } = await untilReady(next3.state, botA, bot);
    expect(recovered.items.some((i) => i.at.kind === "player" && i.at.id === botA && i.type === ITRACKIE_ITEM)).toBe(true);
  });

  it("drops expedition gear to recover iTrackie if inventory is full on return, then shares the report", async () => {
    const { game: start, botA } = prepSetup(["HYDROCARBON"]);
    let game = edit(start, botA, (p) => {
      p.room = DEFAULT_CONFIG.expedition.room;
      p.ap = 6;
      p.mp = 6;
    });
    // Drop iTrackie in ICARUS and fill all 3 inventory slots with gear.
    game = {
      ...game,
      items: [
        ...game.items.filter((i) => !(i.at.kind === "player" && i.at.id === botA && i.type !== ITRACKIE_ITEM)),
        { id: "gear-suit", type: "space_suit", at: { kind: "player", id: botA } },
        { id: "gear-drill", type: "drill", at: { kind: "player", id: botA } },
        { id: "gear-compass", type: "quad_compass", at: { kind: "player", id: botA } },
      ].map((i) =>
        i.at.kind === "player" && i.at.id === botA && i.type === ITRACKIE_ITEM
          ? { ...i, at: { kind: "room" as const, id: DEFAULT_CONFIG.expedition.room } }
          : i,
      ),
      navigation: { ...game.navigation, arriving: null, orbit: "planet-1" },
      expeditions: [
        {
          id: "exp-1",
          planet: "Testaria",
          day: 1,
          cycle: game.cycle,
          members: [botA],
          crew: [game.players.find((p) => p.id === botA)!.character],
          events: [
            { sector: "LANDING", kind: "nothing" },
            { sector: "HYDROCARBON", kind: "fuel", amount: 2 },
          ],
        },
      ],
    };

    const bot = new GoalBot(1, 2, [expeditionPrep]);
    const { game: after } = await play(game, botA, bot, 4);
    expect(after.items.some((i) => i.at.kind === "player" && i.at.id === botA && i.type === ITRACKIE_ITEM)).toBe(true);
    expect(after.sharedReports).toHaveLength(1);
    expect(after.sharedReports[0]!.text).toBe("Planet: Testaria\nExplored: HYDROCARBON");
  });
});

describe("expeditionLaunch: Pilot walks to ICARUS, summons open plan, and launches", () => {
  function orbitSetup(opts: { sectors?: { tag: string; explored: boolean }[]; instant?: boolean } = {}) {
    const cfg = opts.instant ? { ...config, instantExpeditions: true } : config;
    const { game: base, id: pilot } = setup(1, cfg);
    const crew = base.players.find((p) => p.alive && p.role === "human" && p.id !== pilot && !p.modifiers.includes("wheelchair"))!.id;
    const sectors = (opts.sectors ?? [
      { tag: "FOREST", explored: false },
      { tag: "OXYGEN", explored: false },
    ]).map((s) => ({ tag: s.tag as GameState["planets"][string][number]["sectors"][number]["tag"], explored: s.explored }));

    let game = edit(base, pilot, (p) => {
      p.skills = ["pilot"];
      p.modifiers = [];
      p.room = "LABORATORY";
      p.ap = 10;
      p.mp = 12;
    });
    game = edit(game, crew, (p) => {
      p.room = "SPACESHIP_BAY_A";
      p.ap = 10;
      p.mp = 12;
    });
    game = {
      ...game,
      planets: {
        ...game.planets,
        [pilot]: [
          {
            id: "planet-orbit",
            name: "Orbis",
            direction: "north",
            distance: 1,
            picture: 1,
            sectors,
            revealed: sectors.length,
          },
        ],
      },
      navigation: { ...game.navigation, arriving: null, orbit: "planet-orbit" },
      sharedPlanets: [
        {
          id: "sp-1",
          planet: "planet-orbit",
          by: pilot,
          day: 1,
          cycleOfDay: 1,
          stale: false,
          text: formatPlanetShare({ name: "Orbis", direction: "north", distance: 1, sectors: sectors.map((s) => s.tag) }),
        },
      ],
    };
    const chRes = applyInput(game, { type: "createChannel", by: pilot, name: EXPEDITION_CHANNEL_NAME, members: [crew] });
    expect(chRes.ok).toBe(true);
    if (!chRes.ok) throw new Error("createChannel failed");
    game = chRes.state;
    const channelId = game.channels[game.channels.length - 1]!.id;
    const planRes = applyInput(game, {
      type: "postPlan",
      by: pilot,
      plan: {
        channel: channelId,
        room: DEFAULT_CONFIG.expedition.room,
        purpose: "expedition",
        slots: [{ kind: "onCall", holder: crew, outcome: null }],
      },
    });
    expect(planRes.ok).toBe(true);
    if (!planRes.ok) throw new Error("postPlan failed");
    const planId = planRes.state.plans[0]!.id;
    const claimRes = applyAction(planRes.state, crew, { type: "claim_slot", plan: planId, slot: 0 });
    expect(claimRes.ok).toBe(true);
    if (!claimRes.ok) throw new Error("claim_slot failed");
    return { game: claimRes.state, pilot, crew, planId };
  }

  it("is only offered to a Pilot in orbit when unexplored sectors remain and no other Pilot owns the open plan", () => {
    const { game, pilot, crew } = orbitSetup();
    const nonPilot = edit(game, pilot, (p) => (p.skills = []));
    expect(expeditionLaunch.options(viewFor(nonPilot, pilot), memory())).toEqual([]);

    const notOrbiting = { ...game, navigation: { ...game.navigation, orbit: null } };
    expect(expeditionLaunch.options(viewFor(notOrbiting, pilot), memory())).toEqual([]);

    const allExplored = orbitSetup({ sectors: [{ tag: "FOREST", explored: true }] }).game;
    const allExploredInIcarus = edit(allExplored, pilot, (p) => (p.room = DEFAULT_CONFIG.expedition.room));
    expect(expeditionLaunch.options(viewFor(allExploredInIcarus, pilot), memory())).toEqual([]);

    const withReport = {
      ...allExplored,
      sharedReports: [{ id: "sr-1", report: "ex-1", text: "Planet: Orbis\nExplored: FOREST", by: crew, day: 1, cycleOfDay: 1 }],
    };
    const mem = memory();
    mem.reports.explored.set("Orbis", ["FOREST"]);
    expect(expeditionLaunch.options(viewFor(withReport, pilot), mem)).toEqual([]);

    const otherPilot = edit(game, crew, (p) => (p.skills = ["pilot"]));
    expect(expeditionLaunch.options(viewFor(otherPilot, crew), memory())).toEqual([]);

    expect(expeditionLaunch.options(viewFor(game, pilot), memory())).toHaveLength(1);
  });

  it("walks to ICARUS, runs summon on the open plan, and launches with icarus_takeoff", async () => {
    const { game: start, pilot, crew, planId } = orbitSetup({ instant: true });
    const bot = new GoalBot(1, 2, [expeditionLaunch]);
    const { game: after, taken } = await untilReady(start, pilot, bot);

    expect(taken.some((a) => a.type === "summon" && a.plan === planId)).toBe(true);
    expect(taken.some((a) => a.type === "icarus_takeoff")).toBe(true);
    expect(after.plans.find((p) => p.id === planId)!.status).toBe("called");
    // Summoned crew member walked to ICARUS and joined the expedition.
    expect(after.expeditions.length).toBeGreaterThanOrEqual(1);
    expect(after.expeditions[0]!.members).toContain(pilot);
    expect(after.expeditions[0]!.members).toContain(crew);
  });

  it("waits in ICARUS when short on AP and launches on the next cycle", async () => {
    const { game: start, pilot } = orbitSetup({ instant: true });
    const lowAp = edit(start, pilot, (p) => {
      p.room = DEFAULT_CONFIG.expedition.room;
      p.ap = 1;
    });
    const bot = new GoalBot(1, 2, [expeditionLaunch]);
    const { game: summoned, taken: taken1 } = await untilReady(lowAp, pilot, bot);
    expect(taken1.some((a) => a.type === "summon")).toBe(true);
    expect(taken1.some((a) => a.type === "icarus_takeoff")).toBe(false);
    expect(summoned.players.find((p) => p.id === pilot)!.room).toBe(DEFAULT_CONFIG.expedition.room);

    const next = newCycle(edit(summoned, pilot, (p) => (p.ap = 6)));
    expect(next.ok).toBe(true);
    if (!next.ok) return;
    const { game: launched, taken: taken2 } = await untilReady(next.state, pilot, bot);
    expect(taken2.some((a) => a.type === "icarus_takeoff")).toBe(true);
    expect(launched.expeditions).toHaveLength(1);
  });
});

describe("repairDoor goal", () => {
  it("repairs a broken door in its current room while preserving BOT_AP_RESERVE", async () => {
    const { game: base, id } = setup();
    const neighbor = base.config.rooms["LABORATORY"]![0]!;
    const door = doorId("LABORATORY", neighbor);
    const broken = edit(base, id, (p) => {
      p.room = "LABORATORY";
      p.ap = 5;
      p.statuses = ["genius"]; // 100% repair success
    });
    breakDoor(broken, door);

    // At reserve (ap = 2), repairDoor is not offered (would dip below BOT_AP_RESERVE = 2).
    const atReserve = edit(broken, id, (p) => (p.ap = 2));
    expect(repairDoor.options(viewFor(atReserve, id), memory())).toEqual([]);

    // With spare AP above reserve, the bot repairs the broken door in its room.
    const bot = new GoalBot(1, 2, [repairDoor]);
    const { game: after, taken } = await play(broken, id, bot, 4);
    expect(taken).toContainEqual({ type: "repair", door });
    expect(after.doors[door]).toBeUndefined();
  });

  it("routes to a reported broken door on the nearest reachable side", async () => {
    const { game: base, id } = setup();
    // Pick a door not adjacent to CORRIDOR_A so the bot has to walk to the nearer endpoint.
    const door = doorId("CORRIDOR_C", base.config.rooms["CORRIDOR_C"]![0]!);
    const [a, b] = doorRooms(door);
    const closer = shortestPath(base.config.rooms, "CORRIDOR_A", a)!.length <= shortestPath(base.config.rooms, "CORRIDOR_A", b)!.length ? a : b;
    const otherId = base.players.find((p) => p.id !== id)!.id;

    const broken = edit(base, id, (p) => {
      p.room = "CORRIDOR_A";
      p.ap = 10;
      p.mp = 12;
      p.statuses = ["genius"];
    });
    breakDoor(broken, door);
    broken.reports.push({ kind: "door", door, by: otherId });

    expect(repairDoor.options(viewFor(broken, id), memory()).map((g) => g.key)).toEqual([`repairDoor:go:${door}`]);

    const bot = new GoalBot(1, 2, [repairDoor]);
    const { game: after, taken } = await play(broken, id, bot, 10);
    expect(taken.some((a) => a.type === "move")).toBe(true);
    expect(taken).toContainEqual({ type: "repair", door });
    expect(after.doors[door]).toBeUndefined();
    expect(after.players.find((p) => p.id === id)!.room).toBe(closer);
  });

  it("skips a reported broken door whose sides are unreachable", () => {
    const { game: base, id } = setup();
    const otherId = base.players.find((p) => p.id !== id)!.id;
    const distantDoor = doorId("CORRIDOR_C", base.config.rooms["CORRIDOR_C"]![0]!);

    // Isolate the bot in LABORATORY by breaking every door out of LABORATORY, and mark here ended so only reported distant doors are considered.
    const isolated = edit(base, id, (p) => {
      p.room = "LABORATORY";
      p.ap = 10;
      p.mp = 12;
    });
    for (const exit of isolated.config.rooms["LABORATORY"]!) {
      breakDoor(isolated, doorId("LABORATORY", exit));
    }
    breakDoor(isolated, distantDoor);
    isolated.reports.push({ kind: "door", door: distantDoor, by: otherId });

    const mem = memory();
    for (const exit of isolated.config.rooms["LABORATORY"]!) mem.ended.add(`repairDoor:here:${doorId("LABORATORY", exit)}`);
    expect(repairDoor.options(viewFor(isolated, id), mem)).toEqual([]);
  });

  it("doesn't walk to the other side of a reported door it can't repair from this side (Rubella)", async () => {
    const { game: base, id } = setup();
    const otherId = base.players.find((p) => p.id !== id)!.id;
    const neighbor = base.config.rooms["LABORATORY"]![0]!;
    const door = doorId("LABORATORY", neighbor);
    const sick = edit(base, id, (p) => {
      p.room = "LABORATORY";
      p.ap = 10;
      p.mp = 12;
      p.modifiers.push("rubella_disease");
    });
    breakDoor(sick, door);
    sick.reports.push({ kind: "door", door, by: otherId });

    expect(repairDoor.options(viewFor(sick, id), memory())).toEqual([]);
    const { taken } = await play(sick, id, new GoalBot(1, 2, [repairDoor]), 10);
    expect(taken.filter((a) => a.type === "move")).toEqual([]);
  });

  it("doesn't swing to the other side after its repair here ended", () => {
    const { game: base, id } = setup();
    const otherId = base.players.find((p) => p.id !== id)!.id;
    const neighbor = base.config.rooms["LABORATORY"]![0]!;
    const door = doorId("LABORATORY", neighbor);
    const broken = edit(base, id, (p) => {
      p.room = "LABORATORY";
      p.ap = 10;
      p.mp = 12;
    });
    breakDoor(broken, door);
    broken.reports.push({ kind: "door", door, by: otherId });

    const mem = memory();
    mem.ended.add(`repairDoor:here:${door}`);
    expect(repairDoor.options(viewFor(broken, id), mem)).toEqual([]);
    // From across the ship, the same report is still worth walking to.
    const far = edit(broken, id, (p) => (p.room = "CORRIDOR_A"));
    if (!doorRooms(door).includes("CORRIDOR_A")) expect(repairDoor.options(viewFor(far, id), memory()).map((g) => g.key)).toEqual([`repairDoor:go:${door}`]);
  });

  it("ending the repair of one door here leaves another broken door here open", () => {
    const { game: base, id } = setup();
    const [n1, n2] = base.config.rooms["LABORATORY"]!;
    const first = doorId("LABORATORY", n1!);
    const second = doorId("LABORATORY", n2!);
    const broken = edit(base, id, (p) => {
      p.room = "LABORATORY";
      p.ap = 10;
    });
    breakDoor(broken, first);
    breakDoor(broken, second);

    const mem = memory();
    mem.ended.add(`repairDoor:here:${first}`);
    expect(repairDoor.options(viewFor(broken, id), mem).map((g) => g.key)).toEqual([`repairDoor:here:${second}`]);
  });
});
