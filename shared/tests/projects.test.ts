import { describe, expect, it } from "vitest";
import { ACTIONS } from "../src/actions.ts";
import { advanceNeron } from "../src/comms.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import projets from "@mush2/assets/derived/data/Data/projets.json";
import { loseProject, offeredProjects } from "../src/projectEffects.ts";
import { PROJECT_COMPLETE, PROJECT_IDS, PROJECT_STATUS, PROJECTS, projectEfficiency, projectSkills } from "../src/projects.ts";
import { parseGameMessage } from "../src/protocol.ts";
import { applyAction, createGame, setCheat, viewFor } from "../src/rules.ts";
import { addStatus } from "../src/statuses.ts";
import type { Action } from "../src/types.ts";
import { makeSeats, must, mustApply, nextCycle, offered, pickSkill, setProgress } from "./support.ts";

const seats = makeSeats(3, "others");
const work = (project: string): Action => ({ type: "project", equipment: "NEXUS_ROOM:NERON_CORE", project });
const AP = DEFAULT_CONFIG.project.cost.ap;

function game(room = "NEXUS_ROOM", seed = 7) {
  const state = createGame(seats, DEFAULT_CONFIG, seed);
  for (const p of state.players) p.room = room;
  return state;
}

describe("NERON projects", () => {
  it("shares its progress formula with research", () => {
    expect(DEFAULT_CONFIG.research.progress).toEqual(DEFAULT_CONFIG.project.progress);
  });

  it("starts with nothing done and 3 randomly drawn projects offered at NERON's core, and not at the BIOS terminal", () => {
    const s = game();
    expect(s.projects).toEqual({});
    const actions = offered(s, "p0").filter((a) => a.type === "project");
    expect(actions).toHaveLength(DEFAULT_CONFIG.project.offerCount);
    expect(actions.map((a) => a.project)).toEqual(s.projectDeck.slice(0, 3));
    expect(actions.every((a) => a.equipment === "NEXUS_ROOM:NERON_CORE")).toBe(true);
    expect(PROJECT_IDS).toHaveLength(40);
    expect([...s.projectDeck].sort()).toEqual([...PROJECT_IDS].sort());
    expect(game("NEXUS_ROOM", 99).projectDeck).not.toEqual(s.projectDeck);
    const drawn = actions.map((a) => a.project);
    const unoffered = PROJECT_IDS.find((id) => !drawn.includes(id))!;
    expect(applyAction(s, "p0", work(unoffered)).ok).toBe(false);
    expect(applyAction(s, "p0", { type: "project", equipment: "NEXUS_ROOM:NERON_BIOS_TERM", project: drawn[0]! }).ok).toBe(false);
  });

  it("pins eMush per-project efficiencies (1 to 18) and uses them in view gain ranges and work rolls", () => {
    const expected: Record<string, number> = {
      PATROL_SHIP_LAUNCHER: 12,
      PATROLSHIP_BLASTER_GUN: 6,
      BAY_DOOR_XXL: 18,
      PATROLSHIP_EXTRA_AMMO: 6,
      TURRET_EXTRA_FIRERATE: 12,
      FIRE_SENSOR: 6,
      DOOR_SENSOR: 18,
      EQUIPMENT_SENSOR: 12,
      QUANTUM_SENSORS: 6,
      CHIPSET_ACCELERATION: 6,
      ICARUS_ANTIGRAV_PROPELLER: 12,
      ICARUS_LARGER_BAY: 6,
      ICARUS_LAVATORY: 12,
      NERON_PROJECT_THREAD: 12,
      ARMOUR_CORRIDOR: 3,
      PLASMA_SHIELD: 1,
      EXTRA_HYDROPONPOTS: 6,
      HYDROPONIC_INCUBATOR: 12,
      HEAT_LAMP: 6,
      AUXILIARY_TERMINAL: 18,
      AUTO_WATERING: 3,
      RADAR_TRANS_VOID: 18,
      MAGNETIC_NET: 6,
      FOOD_RETAILER: 18,
      DISMANTLING: 12,
      AUTO_RETURN_ICARUS: 12,
      EXTRA_DRONE: 6,
      FISSION_COFFEE_ROASTER: 6,
      TRAIL_REDUCER: 3,
      TRASH_LOAD: 18,
      CALL_OF_DIRTY: 18,
      BEAT_BOX: 18,
      THALASSO: 18,
      FLOOR_HEATING: 12,
      NOISE_REDUCER: 18,
      NERON_TARGETING_ASSIST: 3,
      PARASITE_ELIM: 6,
      OXY_MORE: 6,
      BRIC_BROC: 3,
      APERO_KITCHEN: 18,
    };
    expect(Object.fromEntries(PROJECTS.map((p) => [p.id, p.efficiency]))).toEqual(expected);
    expect(projectEfficiency("UNKNOWN_PROJECT")).toBe(6);

    const tiers = [
      ["PLASMA_SHIELD", { min: 1, max: 1 }],
      ["ARMOUR_CORRIDOR", { min: 3, max: 4 }],
      ["FIRE_SENSOR", { min: 6, max: 9 }],
      ["FLOOR_HEATING", { min: 12, max: 18 }],
      ["NOISE_REDUCER", { min: 18, max: 27 }],
    ] as const;

    for (const [id, range] of tiers) {
      const s = game();
      setProgress(s, { project: id }, 0);
      expect(viewFor(s, "p0").relay.projects[id]!.gain).toEqual(range);
      const after = mustApply(s, "p0", work(id));
      expect(after.projects[id]).toBeGreaterThanOrEqual(range.min);
      expect(after.projects[id]).toBeLessThanOrEqual(range.max);
    }

    // Repeating an efficiency-1 project without skills clamps the penalized gain to 0–0%.
    const plasma = game();
    setProgress(plasma, { project: "PLASMA_SHIELD" }, 0);
    const first = mustApply(plasma, "p0", work("PLASMA_SHIELD"));
    expect(first.projects.PLASMA_SHIELD).toBe(1);
    expect(viewFor(first, "p0").relay.projects.PLASMA_SHIELD!.gain).toEqual({ min: 0, max: 0 });
    const repeat = mustApply(first, "p0", work("PLASMA_SHIELD"));
    expect(repeat.projects.PLASMA_SHIELD).toBe(1);
  });

  it("costs AP and advances the chosen project, for anyone, with the relay penalty for repeats and no tokens", () => {
    const s = game();
    setProgress(s, { project: "FIRE_SENSOR" }, 0);
    const ap = s.players[1]!.ap;
    const r = applyAction(s, "p1", work("FIRE_SENSOR"));
    if (!r.ok) throw new Error(r.error);
    const first = r.state.projects.FIRE_SENSOR!;
    expect(first).toBeGreaterThanOrEqual(6);
    expect(first).toBeLessThanOrEqual(9);
    expect(r.state.players[1]!.ap).toBe(ap - AP);
    expect(r.state.research).toEqual({});
    expect(r.state.relay.projects.FIRE_SENSOR).toEqual({ lastBy: "p1", streak: 1 });
    expect("projects" in viewFor(r.state, "p1").yourTokens).toBe(false);
    const again = applyAction(r.state, "p1", work("FIRE_SENSOR"));
    // The repeat is penalised by 2: 4-6.
    const second = again.ok ? again.state.projects.FIRE_SENSOR! - first : -1;
    expect(second).toBeGreaterThanOrEqual(4);
    expect(second).toBeLessThanOrEqual(6);
    // noRelayPenalty cheat waives the repeat penalty on projects too.
    const noPenalty = must(setCheat(r.state, "p1", "noRelayPenalty", true));
    expect(viewFor(noPenalty, "p1").relay.projects.FIRE_SENSOR!.gain).toEqual({ min: 6, max: 9 });
    // Someone else in between resets the streak.
    const other = applyAction(r.state, "p0", work("FIRE_SENSOR"));
    if (!other.ok) throw new Error(other.error);
    const back = applyAction(other.state, "p1", work("FIRE_SENSOR"));
    expect(back.ok && back.state.projects.FIRE_SENSOR! - other.state.projects.FIRE_SENSOR!).toBeGreaterThanOrEqual(6);
  });

  it("adds the skill boost for each of the project's skills the worker has, and none for other skills", () => {
    const cfg = DEFAULT_CONFIG.project.progress;
    const s = game();
    s.rng = 7;
    setProgress(s, { project: "PLASMA_SHIELD" }, 0);
    setProgress(s, { project: "BRIC_BROC" }, 0);
    const you = s.players[0]!;
    you.skills = ["engineer", "physicist"];
    expect(viewFor(s, "p0").relay.projects.PLASMA_SHIELD!.gain.min).toBe(projectEfficiency("PLASMA_SHIELD") + 2 * cfg.skillBoost);
    const r = mustApply(s, "p0", work("PLASMA_SHIELD"));
    expect(r.projects.PLASMA_SHIELD).toBeGreaterThanOrEqual(projectEfficiency("PLASMA_SHIELD") + 2 * cfg.skillBoost);
    you.skills = ["biologist", "medic"];
    const plain = mustApply(s, "p0", work("PLASMA_SHIELD")).projects.PLASMA_SHIELD!;
    expect(plain).toBeLessThanOrEqual(projectEfficiency("PLASMA_SHIELD") + (projectEfficiency("PLASMA_SHIELD") >> 1));
    you.skills = ["designer"];
    expect(mustApply(s, "p0", work("BRIC_BROC")).projects.BRIC_BROC).toBeGreaterThanOrEqual(projectEfficiency("BRIC_BROC") + cfg.skillBoost);
  });

  it("gives the 'plus' projects, tagged ALL in the original, eMush's bonus skills", () => {
    const plus = ["TRASH_LOAD", "CALL_OF_DIRTY", "BEAT_BOX", "THALASSO", "FLOOR_HEATING", "NOISE_REDUCER", "NERON_TARGETING_ASSIST", "PARASITE_ELIM", "APERO_KITCHEN"];
    expect(Object.fromEntries(plus.map((id) => [id, projectSkills(id)]))).toEqual({
      TRASH_LOAD: ["engineer", "metaliciste"],
      CALL_OF_DIRTY: ["engineer", "gunman"],
      BEAT_BOX: ["radio_expert", "creative"],
      THALASSO: ["engineer", "first_aid"],
      FLOOR_HEATING: ["engineer", "designer"],
      NOISE_REDUCER: ["physicist", "biologist"],
      NERON_TARGETING_ASSIST: ["pilot", "gunman"],
      PARASITE_ELIM: ["botanic", "robotics"],
      APERO_KITCHEN: ["cook", "creative"],
    });
    expect(PROJECTS.filter((p) => p.skills.length === 0)).toEqual([]);
  });

  it("gives a Skilful worker one boost on a Botanist or Biologist project, never stacking with those skills", () => {
    const cfg = DEFAULT_CONFIG.project.progress;
    const s = game();
    s.rng = 7;
    setProgress(s, { project: "HEAT_LAMP" }, 0); // engineer, botanic
    setProgress(s, { project: "OXY_MORE" }, 0); // engineer, biologist
    setProgress(s, { project: "PLASMA_SHIELD" }, 0); // engineer, physicist
    const you = s.players[0]!;
    const min = (id: "HEAT_LAMP" | "OXY_MORE" | "PLASMA_SHIELD") => viewFor(s, "p0").relay.projects[id]!.gain.min;
    you.skills = ["skilful"];
    expect(min("HEAT_LAMP")).toBe(projectEfficiency("HEAT_LAMP") + cfg.skillBoost);
    expect(min("OXY_MORE")).toBe(projectEfficiency("OXY_MORE") + cfg.skillBoost);
    expect(min("PLASMA_SHIELD")).toBe(projectEfficiency("PLASMA_SHIELD"));
    you.skills = ["skilful", "botanic"];
    expect(min("HEAT_LAMP")).toBe(projectEfficiency("HEAT_LAMP") + cfg.skillBoost);
    const r = mustApply(s, "p0", work("HEAT_LAMP"));
    expect(r.projects.HEAT_LAMP).toBeLessThanOrEqual(projectEfficiency("HEAT_LAMP") + cfg.skillBoost + ((projectEfficiency("HEAT_LAMP") + cfg.skillBoost) >> 1));
  });

  it("does not make project work dirty", () => {
    const s = game();
    s.rng = 7;
    const [first] = offeredProjects(s);
    const r = applyAction(s, "p0", work(first!));
    if (!r.ok) throw new Error(r.error);
    expect(r.state.players[0]!.statuses).not.toContain("dirty");
  });

  it("completing 1 of the 3 offered projects rotates to 3 new ones and permanently retires the other 2", () => {
    let s = game();
    const firstBatch = offeredProjects(s);
    expect(firstBatch).toHaveLength(3);
    const [chosen, retiredA, retiredB] = firstBatch as [string, string, string];
    // Partial progress on a retired sibling is hidden once retired.
    s.projects[retiredA] = 15;
    s.projects[chosen] = PROJECT_COMPLETE - 1;
    s.players[0]!.ap = 12;
    s = mustApply(s, "p0", work(chosen));
    expect(s.projects[chosen]).toBe(PROJECT_COMPLETE);
    expect(s.log.at(-1)?.key).toBe("projectCompleted");
    const secondBatch = offeredProjects(s);
    expect(secondBatch).toHaveLength(3);
    for (const id of firstBatch) {
      expect(secondBatch).not.toContain(id);
      expect(s.projectDeck).not.toContain(id);
      expect(offered(s, "p0")).not.toContainEqual(work(id));
      expect(applyAction(s, "p0", work(id)).ok).toBe(false);
    }
    const coreView = viewFor(s, "p0");
    expect(coreView.projects).toEqual({ [chosen]: PROJECT_COMPLETE });
    expect(coreView.projects[retiredA]).toBeUndefined();
    expect(Object.keys(coreView.relay.projects)).toEqual(secondBatch);
    // The retired ones are listed as discarded at the core (ids only, in project order), and nowhere else.
    expect(coreView.discardedProjects).toEqual(PROJECT_IDS.filter((id) => id === retiredA || id === retiredB));
    s.players[2]!.room = "REFECTORY";
    expect(viewFor(s, "p2").discardedProjects).toEqual([]);
    s.players[2]!.room = s.players[0]!.room;
    // Exhausting all remaining batches never draws retiredA or retiredB again.
    const seen = new Set<string>(firstBatch);
    while (offeredProjects(s).length > 0) {
      const next = offeredProjects(s)[0]!;
      expect(seen.has(next)).toBe(false);
      for (const id of offeredProjects(s)) seen.add(id);
      s.projects[next] = PROJECT_COMPLETE - 1;
      s.players[0]!.ap = 12;
      s = mustApply(s, "p0", work(next));
    }
    expect(s.projectDeck).toEqual([]);
    expect(s.projects[retiredA]).toBe(15);
    expect(s.projects[retiredB]).toBeUndefined();
  });

  it("lists a project a merchant took as discarded at the core", () => {
    const s = game();
    s.projects.PLASMA_SHIELD = PROJECT_COMPLETE;
    loseProject(s, "PLASMA_SHIELD");
    expect(viewFor(s, "p0").discardedProjects).toEqual(["PLASMA_SHIELD"]);
    expect(viewFor(s, "p0").projects.PLASMA_SHIELD).toBeUndefined();
  });

  it("NERON update picks any unfinished project and only replaces an offered slot if one of the 3 was picked", () => {
    const s = game();
    const initialOffer = offeredProjects(s);
    const unoffered = PROJECT_IDS.find((id) => !initialOffer.includes(id))!;
    // Unoffered project completed by NERON update: leaves the 3 offered slots unchanged and removes it from the deck.
    const forUnoffered = game();
    for (const id of PROJECT_IDS) if (id !== unoffered) forUnoffered.projects[id] = PROJECT_COMPLETE;
    // Restore incomplete markers on initialOffer without putting them above unoffered.
    for (const id of initialOffer) delete forUnoffered.projects[id];
    expect(offeredProjects(forUnoffered)).toEqual(initialOffer);
    for (const id of PROJECT_IDS) if (id !== unoffered) forUnoffered.projects[id] = PROJECT_COMPLETE;
    forUnoffered.comms.neron.progress = 0;
    expect(advanceNeron(forUnoffered, 100)).toBe(unoffered);
    expect(forUnoffered.projects[unoffered]).toBe(PROJECT_COMPLETE);
    expect(forUnoffered.projectDeck).not.toContain(unoffered);

    // Offered project completed by NERON update removes only that project from projectDeck.
    const single = game();
    const batch = offeredProjects(single);
    for (const id of PROJECT_IDS) if (id !== batch[1]!) single.projects[id] = PROJECT_COMPLETE;
    single.comms.neron.progress = 0;
    expect(advanceNeron(single, 100)).toBe(batch[1]!);
    expect(single.projectDeck).not.toContain(batch[1]!);
    // Re-open batch[0], batch[2], and the next card in deck to confirm only batch[1] was removed (not batch[0] or batch[2]).
    const remaining = [batch[0]!, batch[2]!, single.projectDeck.find((id) => id !== batch[0]! && id !== batch[2]!)!];
    for (const id of remaining) delete single.projects[id];
    expect(offeredProjects(single)).toEqual(remaining);
  });

  it("can complete every project", () => {
    let s = game();
    for (const id of PROJECT_IDS) {
      setProgress(s, { project: id }, PROJECT_COMPLETE - 1);
      s.players[0]!.ap = 12;
      const r = applyAction(s, "p0", work(id));
      if (!r.ok) throw new Error(`${id}: ${r.error}`);
      s = r.state;
    }
    expect(PROJECT_IDS.every((id) => s.projects[id] === 100)).toBe(true);
    expect(offered(s, "p0").some((a) => a.type === "project")).toBe(false);
  });

  it("is refused when dirty, too poor, in another room, or for an unknown project, leaving state unchanged", () => {
    const s = game();
    const first = offeredProjects(s)[0]!;
    addStatus(s.players[0]!, "dirty");
    expect(applyAction(s, "p0", work(first)).ok).toBe(false);
    expect(offered(s, "p0").some((a) => a.type === "project")).toBe(false);
    s.players[1]!.ap = AP - 1;
    expect(applyAction(s, "p1", work(first)).ok).toBe(false);
    expect(applyAction(game("LABORATORY"), "p0", work(first)).ok).toBe(false);
    expect(offered(game("LABORATORY"), "p0").some((a) => a.type === "project")).toBe(false);
    expect(applyAction(s, "p2", work("MYCOSCAN")).ok).toBe(false);
    expect(s.projects).toEqual({});
  });

  it("is free with a Computer point, which is spent", () => {
    let s = game();
    const first = offeredProjects(s)[0]!;
    s = pickSkill(s, "p0", "computer");
    const ap = s.players[0]!.ap;
    const comp = s.players[0]!.resources.comp;
    const r = applyAction(s, "p0", work(first));
    if (!r.ok) throw new Error(r.error);
    expect(r.state.players[0]!.ap).toBe(ap);
    expect(r.state.players[0]!.resources.comp).toBe(comp - 1);
    r.state.players[0]!.ap = 0;
    expect(applyAction(r.state, "p0", work(first)).ok).toBe(true);
  });

  it("tells the view which point pays: a Designer point before a Computer point, none once both are spent", () => {
    const s = game();
    const first = offeredProjects(s)[0]!;
    const paidBy = (state: typeof s) => viewFor(state, "p0").actions.find((o) => o.action.type === "project")!.cost.paidBy;
    s.players[0]!.resources.comp = 1;
    s.players[0]!.resources.core = 1;
    expect(paidBy(s)).toBe("core");
    const firstStep = mustApply(s, "p0", work(first));
    expect(firstStep.players[0]!.resources).toMatchObject({ core: 0, comp: 1 });
    expect(paidBy(firstStep)).toBe("comp");
    const secondStep = mustApply(firstStep, "p0", work(first));
    expect(secondStep.players[0]!.resources.comp).toBe(0);
    expect(paidBy(secondStep)).toBeUndefined();
  });

  it("is seen only at NERON's core until complete, and only the room sees the log line (owner, 2026-10-31)", () => {
    let s = game();
    setProgress(s, { project: "FLOOR_HEATING" }, 0);
    s.players[2]!.room = "REFECTORY";
    s = mustApply(s, "p0", work("FLOOR_HEATING"));
    for (const id of ["p0", "p1"]) {
      expect(viewFor(s, id).projects).toEqual(s.projects);
      expect(viewFor(s, id).relay.projects.FLOOR_HEATING).toEqual({
        waiting: 0,
        gain: id === "p0" ? { min: 10, max: 15 } : { min: 12, max: 18 },
        tokens: [],
      });
    }
    expect(viewFor(s, "p2").projects).toEqual({});
    expect(viewFor(s, "p2").relay.projects).toEqual({});
    expect(viewFor(s, "p1").log.some((e) => e.key === "projectWorked")).toBe(true);
    expect(viewFor(s, "p2").log.some((e) => e.key === "projectWorked")).toBe(false);
    // The dead see nothing, even at the core; completion reaches everyone.
    s.players[1]!.alive = false;
    expect(viewFor(s, "p1").projects).toEqual({});
    setProgress(s, { project: "FLOOR_HEATING" }, PROJECT_COMPLETE - 1);
    s.players[0]!.ap = 12;
    s = mustApply(s, "p0", work("FLOOR_HEATING"));
    expect(viewFor(s, "p2").projects).toEqual({ FLOOR_HEATING: PROJECT_COMPLETE });
    expect(viewFor(s, "p2").relay.projects).toEqual({});
  });

  it("parses from the wire, and rejects a missing project", () => {
    expect(parseGameMessage(JSON.stringify({ type: "action", action: work("PLASMA_SHIELD") }))).toEqual({ type: "action", action: work("PLASMA_SHIELD") });
    expect(parseGameMessage(JSON.stringify({ type: "action", action: { type: "project", equipment: "x" } }))).toBeNull();
  });
});

describe("NERON participation (NERON_PROJECT_THREAD)", () => {
  const STEP = DEFAULT_CONFIG.project.neronParticipation.percent;

  it("pins the config rate and marks NERON_PROJECT_THREAD as full", () => {
    expect(STEP).toBe(5);
    expect(PROJECT_STATUS.NERON_PROJECT_THREAD).toBe("full");
  });

  it("does not advance projects before NERON_PROJECT_THREAD is complete", () => {
    let s = game();
    const [first] = offeredProjects(s);
    s.projects.NERON_PROJECT_THREAD = 50;
    s.projects[first!] = 20;
    s = nextCycle(s);
    expect(s.projects[first!]).toBe(20);
    expect(s.projects.NERON_PROJECT_THREAD).toBe(50);
  });

  it("advances only offered projects above 0% each cycle without logging when none finish", () => {
    let s = game();
    s.projects.NERON_PROJECT_THREAD = PROJECT_COMPLETE;
    const [a, b, c] = offeredProjects(s) as [string, string, string];
    const unoffered = PROJECT_IDS.find((id) => id !== "NERON_PROJECT_THREAD" && id !== a && id !== b && id !== c)!;
    s.projects[a] = 10;
    s.projects[b] = 0;
    s.projects[unoffered] = 30;
    const logsBefore = s.log.length;
    s = nextCycle(s);
    expect(s.projects[a]).toBe(10 + STEP);
    expect(s.projects[b]).toBe(0);
    expect(s.projects[c]).toBeUndefined();
    expect(s.projects[unoffered]).toBe(30);
    expect(s.log.slice(logsBefore).some((e) => e.key === "neronProjectCompleted")).toBe(false);
  });

  it("completes a project that reaches 100%, applies its effect, retires the batch, and logs ship-wide", () => {
    let s = game();
    s.projects.NERON_PROJECT_THREAD = PROJECT_COMPLETE;
    // Put NOISE_REDUCER, BRIC_BROC, FLOOR_HEATING at the front of projectDeck.
    s.projectDeck = ["NOISE_REDUCER", "BRIC_BROC", "FLOOR_HEATING", ...s.projectDeck.filter((id) => !["NOISE_REDUCER", "BRIC_BROC", "FLOOR_HEATING"].includes(id))];
    s.projects.NOISE_REDUCER = PROJECT_COMPLETE - STEP;
    s.projects.BRIC_BROC = 20;
    s.players[1]!.room = "REFECTORY";
    s.players[2]!.alive = false;
    const maxApBefore = viewFor(s, "p0").maxAp;
    s = nextCycle(s);
    expect(s.projects.NOISE_REDUCER).toBe(PROJECT_COMPLETE);
    expect(s.projects.BRIC_BROC).toBe(20 + STEP);
    expect(viewFor(s, "p0").maxAp).toBe(maxApBefore + DEFAULT_CONFIG.project.noiseReducer.maxAp);
    // Batch retired: next 3 offered projects exclude NOISE_REDUCER, BRIC_BROC, FLOOR_HEATING.
    const nextBatch = offeredProjects(s);
    expect(nextBatch).toHaveLength(3);
    expect(nextBatch).not.toContain("NOISE_REDUCER");
    expect(nextBatch).not.toContain("BRIC_BROC");
    expect(nextBatch).not.toContain("FLOOR_HEATING");
    // Ship-wide log visible in other rooms and to the dead.
    const logLine = s.log.find((e) => e.key === "neronProjectCompleted");
    expect(logLine).toMatchObject({ key: "neronProjectCompleted", params: { project: "NOISE_REDUCER" }, visibleTo: "all" });
    expect(logLine?.room).toBeUndefined();
    expect(viewFor(s, "p1").log.some((e) => e.key === "neronProjectCompleted")).toBe(true);
    expect(viewFor(s, "p2").log.some((e) => e.key === "neronProjectCompleted")).toBe(true);
  });

  it("completes at most one project per cycle when multiple reach 100%", () => {
    let s = game();
    s.projects.NERON_PROJECT_THREAD = PROJECT_COMPLETE;
    s.projectDeck = ["NOISE_REDUCER", "EXTRA_HYDROPONPOTS", "FLOOR_HEATING", ...s.projectDeck.filter((id) => !["NOISE_REDUCER", "EXTRA_HYDROPONPOTS", "FLOOR_HEATING"].includes(id))];
    s.projects.NOISE_REDUCER = PROJECT_COMPLETE - 1;
    s.projects.EXTRA_HYDROPONPOTS = PROJECT_COMPLETE - 1;
    const potsBefore = s.items.filter((i) => i.type === "tree_pot").length;
    s = nextCycle(s);
    expect(s.projects.NOISE_REDUCER).toBe(PROJECT_COMPLETE);
    expect(s.projects.EXTRA_HYDROPONPOTS).toBe(PROJECT_COMPLETE - 1);
    expect(s.items.filter((i) => i.type === "tree_pot")).toHaveLength(potsBefore);
    expect(s.log.filter((e) => e.key === "neronProjectCompleted")).toHaveLength(1);
    expect(offeredProjects(s)).not.toContain("EXTRA_HYDROPONPOTS");
  });
});

describe("BIOS projects crew lock", () => {
  it("blocks non-Designers from accessing NERON's core and working projects, hides in-progress project data, allows Designers and freeHacking, and leaves coup and become_genius unaffected", () => {
    const s = game();
    const [first, second] = offeredProjects(s);
    s.projects[first!] = 25;
    s.projects[second!] = PROJECT_COMPLETE;
    s.bios.crew_lock = "projects";
    const act = work(first!);
    const openCore: Action = { type: "access", equipment: "NEXUS_ROOM:NERON_CORE" };

    // Non-Designer is blocked from both access and project (not offered, refused with "crew_lock"),
    // and their view hides in-progress projects and relay data (completed projects remain visible).
    // Other terminals in the room (BIOS) remain accessible.
    expect(offered(s, "p0").some((a) => a.type === "access" && a.equipment === "NEXUS_ROOM:NERON_CORE")).toBe(false);
    expect(offered(s, "p0").some((a) => a.type === "access" && a.equipment === "NEXUS_ROOM:NERON_BIOS_TERM")).toBe(true);
    expect(ACTIONS.access.check(s, s.players[0]!, openCore)).toBe("crew_lock");
    expect(applyAction(s, "p0", openCore).ok).toBe(false);
    expect(offered(s, "p0").some((a) => a.type === "project")).toBe(false);
    expect(ACTIONS.project.check(s, s.players[0]!, act)).toBe("crew_lock");
    expect(applyAction(s, "p0", act).ok).toBe(false);
    const lockedView = viewFor(s, "p0");
    expect(lockedView.projects[first!]).toBeUndefined();
    expect(lockedView.projects[second!]).toBe(PROJECT_COMPLETE);
    expect(lockedView.relay.projects).toEqual({});

    // Designer is allowed to access, see progress, and work.
    s.players[0]!.skills = ["designer"];
    expect(offered(s, "p0").some((a) => a.type === "access" && a.equipment === "NEXUS_ROOM:NERON_CORE")).toBe(true);
    expect(applyAction(s, "p0", openCore).ok).toBe(true);
    expect(viewFor(s, "p0").projects[first!]).toBe(25);
    expect(first! in viewFor(s, "p0").relay.projects).toBe(true);
    expect(offered(s, "p0").some((a) => a.type === "project" && a.project === first)).toBe(true);
    expect(applyAction(s, "p0", act).ok).toBe(true);

    // freeHacking bypasses the lock.
    const hacked = must(setCheat(s, "p1", "freeHacking", true));
    expect(offered(hacked, "p1").some((a) => a.type === "access" && a.equipment === "NEXUS_ROOM:NERON_CORE")).toBe(true);
    expect(applyAction(hacked, "p1", openCore).ok).toBe(true);
    expect(offered(hacked, "p1").some((a) => a.type === "project" && a.project === first)).toBe(true);
    expect(applyAction(hacked, "p1", act).ok).toBe(true);

    // coup and become_genius are unaffected for non-Designers.
    const coupState = game();
    coupState.bios.crew_lock = "projects";
    coupState.titles.commander = "p0";
    coupState.players[1]!.skills = ["politician", "genius"];
    expect(offered(coupState, "p1").some((a) => a.type === "coup")).toBe(true);
    expect(offered(coupState, "p1").some((a) => a.type === "become_genius")).toBe(true);

    // Non-projects locks do not block non-Designers.
    for (const lock of ["piloting", "research"] as const) {
      const unlocked = game();
      unlocked.bios.crew_lock = lock;
      expect(offered(unlocked, "p1").some((a) => a.type === "access" && a.equipment === "NEXUS_ROOM:NERON_CORE")).toBe(true);
      expect(offered(unlocked, "p1").some((a) => a.type === "project")).toBe(true);
      expect(applyAction(unlocked, "p1", act).ok).toBe(true);
    }
  });
});
