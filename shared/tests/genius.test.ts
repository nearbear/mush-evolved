import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { offeredProjects } from "../src/projectEffects.ts";
import { PROJECT_COMPLETE } from "../src/projects.ts";
import { RESEARCH_COMPLETE, RESEARCH_IDS, RESEARCH_REQUIRES } from "../src/research.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import type { Action, GameState } from "../src/types.ts";
import { makeSeats, must, offered, player } from "./support.ts";

const eureka: Action = { type: "become_genius" };
const FREE_RESEARCH = RESEARCH_IDS.find((id) => !RESEARCH_REQUIRES[id])!;
const lab = (research: string): Action => ({ type: "research", equipment: "LABORATORY:RESEARCH_LAB", research });
const core = (project: string): Action => ({ type: "project", equipment: "NEXUS_ROOM:NERON_CORE", project });

function ship(room: string): GameState {
  const s = createGame(makeSeats(3, "others"), { ...DEFAULT_CONFIG, startSkills: [] }, 7);
  for (const p of s.players) p.room = room;
  player(s, "p0").skills = ["genius"];
  return s;
}

describe("Genius skill", () => {
  it("offers Eureka moment only to a Genius, for free, once per game", () => {
    const s = ship("LABORATORY");
    expect(offered(s, "p0")).toContainEqual(eureka);
    expect(offered(s, "p1")).not.toContainEqual(eureka);
    expect(applyAction(s, "p1", eureka).ok).toBe(false);
    const after = must(applyAction(s, "p0", eureka));
    expect(player(after, "p0").ap).toBe(player(s, "p0").ap);
    expect(player(after, "p0").statuses).toContain("genius");
    expect(offered(after, "p0")).not.toContainEqual(eureka);
    const used = clone(after);
    player(used, "p0").statuses = [];
    expect(applyAction(used, "p0", eureka).ok).toBe(false);
  });

  it("completes the next research at once, for the normal price, and uses up the status", () => {
    const s = must(applyAction(ship("LABORATORY"), "p0", eureka));
    const done = must(applyAction(s, "p0", lab(FREE_RESEARCH)));
    expect(done.research[FREE_RESEARCH]).toBe(RESEARCH_COMPLETE);
    expect(player(done, "p0").ap).toBe(player(s, "p0").ap - DEFAULT_CONFIG.research.cost.ap);
    expect(player(done, "p0").statuses).not.toContain("genius");
  });

  it("completes the next project at once", () => {
    const s = must(applyAction(ship("NEXUS_ROOM"), "p0", eureka));
    const first = offeredProjects(s)[0]!;
    const done = must(applyAction(s, "p0", core(first)));
    expect(done.projects[first]).toBe(PROJECT_COMPLETE);
    expect(player(done, "p0").statuses).not.toContain("genius");
    const nextId = offeredProjects(done)[0]!;
    const next = must(applyAction(done, "p0", core(nextId)));
    expect(next.projects[nextId]).toBeLessThan(PROJECT_COMPLETE);
  });

  it("makes the next repair certain, and is used up by it", () => {
    const never = { ...DEFAULT_CONFIG, startSkills: [], repair: { ...DEFAULT_CONFIG.repair, chance: { ...DEFAULT_CONFIG.repair.chance, COFFEE_DISPENSER: 0.0001 } } };
    const s = createGame(makeSeats(3, "others"), never, 7);
    for (const p of s.players) p.room = "REFECTORY";
    player(s, "p0").skills = ["genius"];
    const coffee = s.equipment.REFECTORY!.find((e) => e.type === "COFFEE_DISPENSER")!;
    coffee.broken = true;
    const repair: Action = { type: "repair", equipment: coffee.id };
    const ready = must(applyAction(s, "p0", eureka));
    expect(offered(ready, "p0").find((a) => a.type === "repair")).toBeDefined();
    const fixed = must(applyAction(ready, "p0", repair));
    expect(fixed.equipment.REFECTORY!.find((e) => e.id === coffee.id)!.broken).toBeUndefined();
    expect(player(fixed, "p0").statuses).not.toContain("genius");
  });

  it("makes the next hull patch certain", () => {
    const s = createGame(makeSeats(3, "others"), { ...DEFAULT_CONFIG, startSkills: [], hullRepair: { ...DEFAULT_CONFIG.hullRepair, chance: 0.0001 } }, 7);
    player(s, "p0").skills = ["genius"];
    s.ship.hull = 1;
    s.items.push({ id: "scrap", type: "metal_scraps", at: { kind: "player", id: "p0" } });
    const done = must(applyAction(must(applyAction(s, "p0", eureka)), "p0", { type: "repair_hull", item: "scrap" }));
    expect(done.ship.hull).toBeGreaterThan(1);
    expect(player(done, "p0").statuses).not.toContain("genius");
  });

  it("stays until used, and is private to its holder", () => {
    const s = must(applyAction(ship("LABORATORY"), "p0", eureka));
    expect(viewFor(s, "p0").statuses).toContain("genius");
    expect(viewFor(s, "p1").players.find((p) => p.id === "p0")?.statuses).not.toContain("genius");
    expect(JSON.stringify(viewFor(s, "p1"))).not.toContain("geniusUsed");
  });

  it("doesn't change state when refused", () => {
    const s = ship("LABORATORY");
    const before = JSON.stringify(s);
    applyAction(s, "p1", eureka);
    expect(JSON.stringify(s)).toBe(before);
  });
});

function clone(s: GameState): GameState {
  return JSON.parse(JSON.stringify(s));
}
