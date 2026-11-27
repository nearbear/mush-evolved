import { describe, expect, it } from "vitest";
import { addDisease, disorderCalmed } from "../src/diseases.ts";
import { actionSuccessRate, type CostContext } from "../src/modifiers.ts";
import { pyromania_disorder } from "../src/modifiers/pyromania_disorder.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import type { Action, GameState, PlayerState } from "../src/types.ts";
import { costOf, makeSeats, mustApply, nextCycle, noCharacterModifiers, offered, player, testConfig } from "./support.ts";

// Pyromania (owner, 2026-11-27): a disorder in the random pool. -2 max morale, extinguishing x0.5. Each cycle change, a
// 10% roll to be compelled for 4 cycles; while compelled Ignite is offered at 2 AP. Igniting ends it; running out costs
// 6 morale. Either way a hidden 2-cycle grace follows with no roll. Paused while calmed; nothing to a Mush.
const config = noCharacterModifiers(testConfig({ mushCount: 0, maxAp: 99, startAp: 20 }));
const PYRO = "pyromania_disorder";
const ignite: Action = { type: "ignite" };

/** p0 (pyromaniac unless `disorder` is false) and p1 in the refectory. */
function ship(disorder = true): GameState {
  const s = createGame(makeSeats(2), config, 5);
  for (const p of s.players) {
    p.room = "REFECTORY";
    p.ap = 20;
    p.morale = 8;
  }
  if (disorder) addDisease(s, player(s, "p0"), PYRO);
  return s;
}

/** Runs the disorder's cycle hook alone, with the roll forced to `roll` (0 always compels, 1 never). */
function tick(s: GameState, p: PlayerState, roll: number): void {
  const rules = s.config.pyromania;
  (s.config as { pyromania: typeof rules }).pyromania = { ...rules, compelChance: roll === 0 ? 1 : 0 };
  pyromania_disorder.onCycle!(s, p);
  (s.config as { pyromania: typeof rules }).pyromania = rules;
}

const ctx = (state: GameState, actor: PlayerState, type: string): CostContext => ({ state, actor, action: { type } as unknown as Action, tags: [] });

describe("Pyromania disorder", () => {
  it("pins the confirmed numbers", () => {
    expect(config.diseases.allDisorders).toContain(PYRO);
    expect(config.pyromania).toEqual({ maxMoraleLoss: 2, extinguishFactor: 0.5, compelChance: 0.1, compelledCycles: 4, igniteAp: 2, moraleLoss: 6, graceCycles: 2 });
  });

  it("takes maxMoraleLoss off the morale cap and halves extinguishing only", () => {
    const s = ship();
    const p = player(s, "p0");
    expect(p.maxMorale).toBe(config.maxMorale - config.pyromania.maxMoraleLoss);
    expect(actionSuccessRate(0.6, ctx(s, p, "extinguish"))).toBeCloseTo(0.6 * config.pyromania.extinguishFactor);
    expect(actionSuccessRate(0.6, ctx(s, p, "extinguish_manually"))).toBeCloseTo(0.6 * config.pyromania.extinguishFactor);
    expect(actionSuccessRate(0.6, ctx(s, p, "repair"))).toBeCloseTo(0.6);
  });

  it("offers Ignite only while compelled, at igniteAp AP, and tells only the holder", () => {
    const s = ship();
    const p = player(s, "p0");
    expect(offered(s, "p0")).not.toContainEqual(ignite);
    tick(s, p, 0);
    expect(p.compelledCycles).toBe(config.pyromania.compelledCycles);
    expect(offered(s, "p0")).toContainEqual(ignite);
    expect(costOf(s, "p0", ignite)!.ap).toBe(config.pyromania.igniteAp);
    expect(viewFor(s, "p0").log.some((l) => l.key === "pyromaniaCompelled")).toBe(true);
    expect(viewFor(s, "p1").log.some((l) => l.key === "pyromaniaCompelled")).toBe(false);
    expect(JSON.stringify(viewFor(s, "p1"))).not.toContain("compelledCycles");
  });

  it("igniting ends the compulsion, sets the fire, and starts the grace", () => {
    const s = ship();
    tick(s, player(s, "p0"), 0);
    const after = mustApply(s, "p0", ignite);
    const p = player(after, "p0");
    expect(p.ap).toBe(20 - config.pyromania.igniteAp);
    expect(after.pendingFires).toContain("REFECTORY");
    expect(p.compelledCycles).toBeUndefined();
    expect(p.compulsionGrace).toBe(config.pyromania.graceCycles);
    expect(p.morale).toBe(8);
    expect(applyAction(after, "p0", ignite).ok).toBe(false);
  });

  it("running out costs moraleLoss morale after compelledCycles cycle changes, then grace, then rolls again", () => {
    const s = ship();
    const p = player(s, "p0");
    tick(s, p, 0);
    for (let i = 1; i < config.pyromania.compelledCycles; i++) tick(s, p, 1);
    expect(p.compelledCycles).toBe(1);
    expect(p.morale).toBe(8);
    tick(s, p, 1);
    expect(p.compelledCycles).toBeUndefined();
    expect(p.morale).toBe(8 - config.pyromania.moraleLoss);
    expect(p.compulsionGrace).toBe(config.pyromania.graceCycles);
    // No roll during the grace, even a sure one.
    for (let i = 0; i < config.pyromania.graceCycles; i++) tick(s, p, 0);
    expect(p.compelledCycles).toBeUndefined();
    expect(p.compulsionGrace).toBeUndefined();
    tick(s, p, 0);
    expect(p.compelledCycles).toBe(config.pyromania.compelledCycles);
  });

  it("never sends the grace, not even to the holder", () => {
    const s = mustApply(
      (() => {
        const s = ship();
        tick(s, player(s, "p0"), 0);
        return s;
      })(),
      "p0",
      ignite,
    );
    expect(JSON.stringify(viewFor(s, "p0"))).not.toContain("compulsionGrace");
  });

  it("is paused while calmed: no Ignite and no countdown", () => {
    let s = ship();
    tick(s, player(s, "p0"), 0);
    const tracker = player(s, "p0").diseaseTrackers.find((t) => t.name === PYRO)!;
    tracker.disabledFor = 3;
    expect(disorderCalmed(player(s, "p0"), PYRO)).toBe(true);
    expect(offered(s, "p0")).not.toContainEqual(ignite);
    s = nextCycle(s);
    expect(player(s, "p0").compelledCycles).toBe(config.pyromania.compelledCycles);
  });

  it("does nothing to a Mush", () => {
    const s = ship(false);
    const m = player(s, "p0");
    m.role = "mush";
    addDisease(s, m, PYRO);
    m.compelledCycles = 2;
    expect(m.maxMorale).toBe(config.maxMorale);
    expect(offered(s, "p0")).not.toContainEqual(ignite);
    expect(actionSuccessRate(0.6, ctx(s, m, "extinguish"))).toBeCloseTo(0.6);
  });

  it("rolls through the real cycle change with the seeded RNG", () => {
    let s = ship();
    let compelled = false;
    for (let i = 0; i < 80 && !compelled; i++) {
      s = nextCycle(s);
      compelled = player(s, "p0").compelledCycles !== undefined;
    }
    expect(compelled).toBe(true);
  });
});
