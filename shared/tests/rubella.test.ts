import { describe, expect, it } from "vitest";
import { ACTIONS } from "../src/actions.ts";
import { addDisease, diseaseStats } from "../src/diseases.ts";
import { apGain, apRefill, cycleChanged, enterRoom, enteredRoom } from "../src/modifiers.ts";
import { createGame } from "../src/rules.ts";
import type { Action, DiseaseStats, GameState, PlayerState } from "../src/types.ts";
import { makeSeats, option, player, testConfig } from "./support.ts";

const config = testConfig();

const game = (seed = 3): GameState => createGame(makeSeats(4), config, seed);
const human = (s: GameState) => s.players.find((p) => p.role === "human")!;
const mush = (s: GameState) => s.players.find((p) => p.role === "mush")!;

/** A game whose Rubella stats are patched (the config is frozen, so it is built from a patched copy). */
function rubellaGame(patch: Partial<DiseaseStats>): GameState {
  const allDiseaseStats = config.diseases.allDiseaseStats.map((d) => (d.label === "rubella_disease" ? { ...d, ...patch } : d));
  return createGame(makeSeats(4), { ...config, diseases: { ...config.diseases, allDiseaseStats } }, 3);
}

/** One sample of each blocked action and the refusal Rubella gives it; the targets don't matter, Rubella is checked first. */
const BLOCKED: [Action, string][] = [
  [{ type: "cook", item: "x" } as Action, "cant_cook"],
  [{ type: "express_cook", item: "x" } as Action, "cant_cook"],
  [{ type: "repair", equipment: "x" } as Action, "cant_repair"],
  [{ type: "repair_hull", item: "x" } as Action, "cant_repair"],
  [{ type: "repair_pilgred", equipment: "x" } as Action, "cant_repair"],
  [{ type: "renovate", equipment: "x" } as Action, "cant_repair"],
];
const refusal = (s: GameState, p: PlayerState, a: Action) =>
  (ACTIONS[a.type] as unknown as { validate: (s: GameState, p: PlayerState, a: Action) => string | null }).validate(s, p, a);

describe("Rubella", () => {
  it("has the owner's numbers", () => {
    expect(diseaseStats(game(), "rubella_disease")).toMatchObject({ durationMin: 12, durationMax: 20, roomSpread: 0.02, cycleSpread: 0.02 });
    expect(diseaseStats(game(), "rubella_disease")?.spreadByDTT).toBeFalsy();
  });

  it("takes 3 off max health and max morale", () => {
    const s = game();
    const p = human(s);
    const [hp, morale] = [p.maxHp, p.maxMorale];
    addDisease(s, p, "rubella_disease");
    expect([p.maxHp, p.maxMorale]).toEqual([hp - 3, morale - 3]);
  });

  it("spreads on an encounter and to the room at a cycle change", () => {
    const s = rubellaGame({ roomSpread: 1, cycleSpread: 0 });
    const [sick, met] = [player(s, "p0"), player(s, "p1")];
    addDisease(s, sick, "rubella_disease");
    sick.room = met.room = "FRONT_CORRIDOR";
    enterRoom(s, met);
    expect(met.modifiers).toContain("rubella_disease");

    const t = rubellaGame({ roomSpread: 0, cycleSpread: 1 });
    const [sick2, near, far] = [player(t, "p0"), player(t, "p1"), player(t, "p2")];
    addDisease(t, sick2, "rubella_disease");
    sick2.room = near.room = "FRONT_CORRIDOR";
    far.room = "BRIDGE";
    cycleChanged(t);
    expect(near.modifiers).toContain("rubella_disease");
    expect(far.modifiers).not.toContain("rubella_disease");
  });

  it("costs 1 MP at about half the cycle changes", () => {
    const s = rubellaGame({ cycleSpread: 0 });
    const p = human(s);
    addDisease(s, p, "rubella_disease");
    p.diseaseTrackers[0]!.forever = true;
    let lost = 0;
    const tries = 300;
    for (let i = 0; i < tries; i++) {
      p.mp = 5;
      cycleChanged(s);
      if (p.mp < 5) lost++;
    }
    expect(lost).toBeGreaterThan(tries * 0.4);
    expect(lost).toBeLessThan(tries * 0.6);
  });

  it("makes its holder scratch on entering a room, about 16% of the time", () => {
    const s = game();
    const p = human(s);
    addDisease(s, p, "rubella_disease");
    const tries = 400;
    for (let i = 0; i < tries; i++) enteredRoom(s, p);
    const n = s.log.filter((e) => e.key === "scratches").length;
    expect(n).toBeGreaterThan(tries * 0.08);
    expect(n).toBeLessThan(tries * 0.24);
  });

  it("lying down, about 30% of refills give no bed AP", () => {
    let rested = 0;
    const runs = 1000;
    for (let seed = 0; seed < runs; seed++) {
      const s = game(seed);
      const p = human(s);
      p.modifiers = p.modifiers.filter((m) => m !== "hyperactive"); // Chao's bed gives nothing anyway
      addDisease(s, p, "rubella_disease");
      const awake = apGain(s, p);
      p.modifiers.push("lying_down");
      const gain = apRefill(s, p);
      expect([awake, awake + 1]).toContain(gain);
      if (gain > awake) rested++;
    }
    expect(rested / runs).toBeGreaterThan(0.62);
    expect(rested / runs).toBeLessThan(0.78);
  });

  it("keeps a human from cooking and repairing, in all six actions", () => {
    const s = game();
    const p = human(s);
    addDisease(s, p, "rubella_disease");
    for (const [action, code] of BLOCKED) expect([action.type, refusal(s, p, action)]).toEqual([action.type, code]);
  });

  it("takes away a repair the human could do without it, and leaves it to a Mush who has it", () => {
    const s = game();
    const [p, m] = [human(s), mush(s)];
    m.room = p.room;
    s.equipment[p.room] ??= [];
    s.equipment[p.room]!.push({ id: `${p.room}:SHOWER`, type: "SHOWER", broken: true });
    const repair: Action = { type: "repair", equipment: `${p.room}:SHOWER` };
    expect(refusal(s, p, repair)).toBeNull();
    addDisease(s, p, "rubella_disease");
    addDisease(s, m, "rubella_disease");
    expect(refusal(s, p, repair)).toBe("cant_repair");
    expect(refusal(s, m, repair)).toBeNull();
    expect(option(s, p.id, repair)).toBeUndefined();
  });

  it("costs a Mush nothing", () => {
    const s = rubellaGame({ cycleSpread: 0 });
    const m = mush(s);
    const [hp, morale] = [m.maxHp, m.maxMorale];
    addDisease(s, m, "rubella_disease");
    m.mp = 5;
    for (let i = 0; i < 10; i++) cycleChanged(s);
    expect([m.mp, m.maxHp, m.maxMorale]).toEqual([5, hp, morale]);
    m.modifiers.push("lying_down");
    expect(apRefill(s, m)).toBe(apGain(s, m));
  });
});
