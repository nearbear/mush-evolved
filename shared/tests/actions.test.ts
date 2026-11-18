import { describe, expect, it } from "vitest";
import { ACTIONS } from "../src/actions.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { RESEARCH_IDS } from "../src/research.ts";
import { researchAllowed } from "../src/actions/research.ts";
import { affordable, applyAction, createGame, legalActions, viewFor } from "../src/rules.ts";
import { CHARACTER_SKILLS } from "../src/skills.ts";
import type { Action } from "../src/types.ts";
import { makeSeats, offered, option } from "./support.ts";

const seats = makeSeats(4, "all");

const sorted = (actions: Action[]) => actions.map((a) => JSON.stringify(a)).sort();

describe("action registry", () => {
  it("uses the configured dirty chances for cooking, express cooking, consuming, dispensing, building, installing, uninstalling and healing", () => {
    const state = createGame(seats, DEFAULT_CONFIG, 1);
    const actor = state.players[0]!;
    expect([
      ACTIONS.cook.dirtChance?.(state, actor, { type: "cook", item: "" }),
      ACTIONS.express_cook.dirtChance?.(state, actor, { type: "express_cook", item: "" }),
      ACTIONS.consume.dirtChance?.(state, actor, { type: "consume", item: "" }),
      ACTIONS.dispense.dirtChance?.(state, actor, { type: "dispense", equipment: "" }),
      ACTIONS.build.dirtChance?.(state, actor, { type: "build", item: "" }),
      ACTIONS.install.dirtChance?.(state, actor, { type: "install", item: "" }),
      ACTIONS.uninstall.dirtChance?.(state, actor, { type: "uninstall", equipment: "" }),
      ACTIONS.heal.dirtChance?.(state, actor, { type: "heal", target: "" }),
    ]).toEqual([0.25, 0.05, 0.15, 0.05, 0.25, 0.1, 0.05, 0.05]);
  });

  it("uses configured injury chances for building, dismantling, jettisoning, repairing PILGRED, showering and transferring", () => {
    const state = createGame(seats, DEFAULT_CONFIG, 1);
    const actor = state.players[0]!;
    expect([
      ACTIONS.build.injuryChance?.(state, actor, { type: "build", item: "" }),
      ACTIONS.dismantle.injuryChance?.(state, actor, { type: "dismantle", item: "" }),
      ACTIONS.jettison.injuryChance?.(state, actor, { type: "jettison", item: "" }),
      ACTIONS.repair_pilgred.injuryChance?.(state, actor, { type: "repair_pilgred", equipment: "" }),
      ACTIONS.shower.injuryChance?.(state, actor, { type: "shower", equipment: "" }),
      ACTIONS.take.injuryChance?.(state, actor, { type: "take", item: "" }),
      ACTIONS.drop.injuryChance?.(state, actor, { type: "drop", item: "" }),
    ]).toEqual([0.05, 0.05, 0.02, 0.05, 0.02, 0.01, 0.01]);
  });

  // Pins the full legal set for p0 at the start (Laboratory: a wrench and
  // hydropots on the floor, an iTrackie in hand), so a check that is too loose
  // or too strict shows up here.
  it("offers exactly the legal actions at the start of a game", () => {
    const state = createGame(seats, { ...DEFAULT_CONFIG, startItems: [{ type: "wrench", room: "LABORATORY" }] }, 1);
    const floor = state.items.filter((i) => i.at.kind === "room" && i.at.id === "LABORATORY");
    const mine = state.items.filter((i) => i.at.kind === "player" && i.at.id === "p0");
    const expected: Action[] = [
      ...DEFAULT_CONFIG.rooms.LABORATORY!.map((to): Action => ({ type: "move", to })),
      ...floor.map((i): Action => ({ type: "take", item: i.id })),
      ...mine.map((i): Action => ({ type: "drop", item: i.id })),
      ...mine.map((i): Action => ({ type: "hide", item: i.id })),
      { type: "search" },
      // Anyone can guard (1 AP); stop_guarding only follows once they do.
      { type: "guard" },
      ...seats.map((s): Action => ({ type: "examine", target: { kind: "player", id: s.id } })),
      // Everyone starts in the Laboratory, so p0 can bond with the other three (DTT and STT need a bond first).
      ...seats.filter((s) => s.id !== "p0").map((s): Action => ({ type: "bond", target: s.id })),
      ...seats.filter((s) => s.id !== "p0").map((s): Action => ({ type: "punch", target: s.id })),
      ...CHARACTER_SKILLS.chao.map((skill): Action => ({ type: "pick_skill", skill })), // p0 plays Chao
      ...DEFAULT_CONFIG.equipment.LABORATORY!.map((e): Action => ({ type: "examine", target: { kind: "equipment", id: e.id } })),
      // The Laboratory has one terminal, the research lab.
      { type: "access", equipment: "LABORATORY:RESEARCH_LAB" },
      // Only the researches whose needs the lab meets (RESEARCH_REQUIRES).
      ...RESEARCH_IDS.filter((research) => researchAllowed(state, "LABORATORY", research)).map((research): Action => ({ type: "research", equipment: "LABORATORY:RESEARCH_LAB", research })),
      ...[...mine, ...floor].map((i): Action => ({ type: "examine", target: { kind: "item", id: i.id } })),
    ];
    expect(floor.length).toBeGreaterThan(0);
    expect(sorted(legalActions(state, "p0"))).toEqual(sorted(expected));
  });

  it("offers no moves when broke and no takes when the inventory is full", () => {
    const state = createGame(seats, DEFAULT_CONFIG, 1);
    Object.assign(state.players[0]!, { ap: 0, mp: 0 });
    for (let i = 0; i < 5; i++) state.items.push({ id: `extra-${i}`, type: "super_talky", at: { kind: "player", id: "p0" } });
    const legal = legalActions(state, "p0");
    expect(legal.some((a) => a.type === "move" || a.type === "take")).toBe(false);
    for (const action of [{ type: "move", to: DEFAULT_CONFIG.rooms.LABORATORY![0]! }, { type: "take", item: "item-1" }] as Action[]) {
      expect(applyAction(state, "p0", action).ok).toBe(false);
    }
  });

  it("rejects actions that aren't candidates at all", () => {
    const state = createGame(seats, DEFAULT_CONFIG, 1);
    for (const action of [
      { type: "take", item: "no-such-item" },
      { type: "examine", target: { kind: "player", id: "nobody" } },
      { type: "teleport" },
    ] as Action[]) {
      expect(applyAction(state, "p0", action).ok, JSON.stringify(action)).toBe(false);
    }
  });
});

describe("actions in the view", () => {
  it("offers every legal action as affordable, then the ones only short of points", () => {
    const state = createGame(seats, DEFAULT_CONFIG, 1);
    const v = viewFor(state, "p0");
    const firstBlocked = v.actions.findIndex((o) => !affordable(o));
    expect(v.actions.filter(affordable).map((o) => o.action)).toEqual(legalActions(state, "p0"));
    expect(firstBlocked === -1 || v.actions.slice(firstBlocked).every((o) => !affordable(o))).toBe(true);
  });

  it("marks what you can't pay for with the points you lack", () => {
    const state = createGame(seats, DEFAULT_CONFIG, 1);
    Object.assign(state.players[0]!, { ap: 0, mp: 0 });
    expect(option(state, "p0", { type: "punch" })?.lacks).toEqual(["ap"]);
    expect(offered(state, "p0").some((a) => a.type === "punch")).toBe(false);
  });
});
