// #267: why a stat's cap is what it is. Phase 1 checks `capBreakdown` itself; Phase 2 checks that the stored caps
// (`player.maxAp|maxMp|maxHp|maxMorale`, recomputed only by `updateMaxValues`) agree with it after every path that
// changes a cap. Phase 3 checks that `viewFor` sends the breakdown to its own seat.
import { describe, expect, it } from "vitest";
import { addDisease, removeDisease } from "../src/diseases.ts";
import { convert, cure } from "../src/infection.ts";
import { KUBE_OPS } from "../src/kube.ts";
import { capBreakdown, MODIFIERS, type CapStat } from "../src/modifiers.ts";
import { completeProject, loseProject } from "../src/projectEffects.ts";
import { joinShip, selectMush } from "../src/preselection.ts";
import { createGame, setRoleCheat, viewFor } from "../src/rules.ts";
import { isSkill } from "../src/skills.ts";
import type { GameConfig, GameState, PlayerState } from "../src/types.ts";
import { makeSeats, noCharacterModifiers, pickSkill, player, testConfig } from "./support.ts";

const config = noCharacterModifiers(testConfig());
const game = (c: GameConfig = config): GameState => createGame(makeSeats(4), c, 3);
const human = (s: GameState) => s.players.find((p) => p.role === "human")!;
const mush = (s: GameState) => s.players.find((p) => p.role === "mush")!;

const STATS: readonly CapStat[] = ["ap", "mp", "hp", "morale"];
const stored = (p: PlayerState): Record<CapStat, number> => ({ ap: p.maxAp, mp: p.maxMp, hp: p.maxHp, morale: p.maxMorale });
const derived = (s: GameState, p: PlayerState): Record<CapStat, number> => {
  const caps = capBreakdown(s, p);
  return { ap: caps.ap.max, mp: caps.mp.max, hp: caps.hp.max, morale: caps.morale.max };
};
/** The stored caps match the breakdown; `label` names the path in a failure. */
const expectInSync = (s: GameState, p: PlayerState, label: string) => expect(stored(p), label).toEqual(derived(s, p));

describe("capBreakdown", () => {
  it("lists nothing for a healthy human, and each max is the configured base", () => {
    const s = game();
    const caps = capBreakdown(s, human(s));
    expect(caps.ap).toEqual({ base: config.maxAp, max: config.maxAp, sources: [] });
    expect(caps.mp).toEqual({ base: config.movement.mpCap, max: config.movement.mpCap, sources: [] });
    expect(caps.hp).toEqual({ base: config.maxHp, max: config.maxHp, sources: [] });
    expect(caps.morale).toEqual({ base: config.maxMorale, max: config.maxMorale, sources: [] });
  });

  it("shows a cold as −3 max morale", () => {
    const s = game();
    const p = human(s);
    addDisease(s, p, "cold_disease");
    const caps = capBreakdown(s, p);
    expect(caps.morale).toEqual({ base: config.maxMorale, max: config.maxMorale - 3, sources: [{ kind: "modifier", id: "cold_disease", delta: -3 }] });
    expect([caps.ap.sources, caps.mp.sources, caps.hp.sources]).toEqual([[], [], []]);
  });

  it("shows flu on both max HP and max morale", () => {
    const s = game();
    const p = human(s);
    addDisease(s, p, "flu_disease");
    const caps = capBreakdown(s, p);
    expect(caps.hp.sources).toEqual([{ kind: "modifier", id: "flu_disease", delta: -3 }]);
    expect(caps.morale.sources).toEqual([{ kind: "modifier", id: "flu_disease", delta: -3 }]);
  });

  it("shows Lethargy as its real change (+12, not ×2) and the Noise Reducer after it", () => {
    let s = game();
    s = pickSkill(s, "p0", "lethargy");
    completeProject(s, "NOISE_REDUCER");
    const ap = capBreakdown(s, player(s, "p0")).ap;
    const bonus = config.project.noiseReducer.maxAp;
    const doubled = config.maxAp * config.lethargy.maxApMultiplier;
    expect(ap).toEqual({
      base: config.maxAp,
      max: doubled + bonus,
      sources: [
        { kind: "modifier", id: "lethargy", delta: doubled - config.maxAp },
        { kind: "project", id: "NOISE_REDUCER", delta: bonus },
      ],
    });
  });

  it("shows a clamped step's real change, not the modifier's nominal one", () => {
    // Cold takes 3 but never below 1: from a base of 2 it really takes 1.
    const s = game(noCharacterModifiers(testConfig({ maxMorale: 2 })));
    const p = human(s);
    addDisease(s, p, "cold_disease");
    expect(capBreakdown(s, p).morale).toEqual({ base: 2, max: 1, sources: [{ kind: "modifier", id: "cold_disease", delta: -1 }] });
  });

  it("leaves out a Mush's diseases, but not their injuries", () => {
    const s = game();
    const m = mush(s);
    m.modifiers.push("flu_disease", "broken_nose_injury");
    const caps = capBreakdown(s, m);
    expect(caps.hp.sources.map((x) => x.id)).not.toContain("flu_disease");
    expect(caps.morale.sources.map((x) => x.id)).not.toContain("flu_disease");
    expect([...caps.hp.sources, ...caps.morale.sources].map((x) => x.id)).toContain("broken_nose_injury");
  });

  it("agrees with the max the folds give, for every cap modifier at once", () => {
    const s = game();
    const p = human(s);
    for (const id of capModifiers()) if (!isSkill(id)) p.modifiers.push(id);
    const caps = capBreakdown(s, p);
    for (const stat of STATS) {
      const c = caps[stat];
      expect(c.max, stat).toBe(c.base + c.sources.reduce((sum, x) => sum + x.delta, 0));
    }
  });
});

/** Every registered modifier with a cap hook. */
function capModifiers(): string[] {
  return Object.entries(MODIFIERS)
    .filter(([, m]) => m.maxAp || m.maxMp || m.maxHp || m.maxMorale)
    .map(([id]) => id);
}

describe("stored caps match capBreakdown", () => {
  it("has the cap modifiers the issue counts", () => {
    expect(capModifiers().length).toBeGreaterThanOrEqual(30);
  });

  it.each(capModifiers().filter((id) => !isSkill(id)))("after adding and removing %s", (id) => {
    const s = game();
    const p = human(s);
    addDisease(s, p, id);
    expect(p.modifiers, "added").toContain(id);
    expectInSync(s, p, `with ${id}`);
    removeDisease(s, p, id);
    expectInSync(s, p, `after removing ${id}`);
  });

  it.each(capModifiers().filter((id) => isSkill(id)))("after picking %s", (id) => {
    const s = pickSkill(game(), "p0", id);
    expectInSync(s, player(s, "p0"), `with ${id}`);
  });

  it("with a skill in the starting skills (Lethargy at game start), at launch and on joining in pre-selection", () => {
    const s = game({ ...config, startSkills: ["lethargy"] });
    for (const p of s.players) expectInSync(s, p, p.id);
    const pre = noCharacterModifiers(testConfig({ startSkills: ["lethargy"], preselection: { seats: 8, endsOn: { day: 1, cycle: 2 }, mushCount: 1, twoMushAbove: 8, minPlayers: 1 } }));
    const joined = joinShip(createGame(makeSeats(1), pre, 3), makeSeats(2)[1]!);
    if (!joined.ok) throw new Error(joined.error);
    for (const p of joined.state.players) expectInSync(joined.state, p, p.id);
  });

  it("for every character's starting modifiers", () => {
    const s = createGame(makeSeats(16), testConfig(), 3);
    for (const p of s.players) expectInSync(s, p, p.character);
  });

  it("after completing and losing the Noise Reducer, with and without Lethargy", () => {
    const s = pickSkill(game(), "p1", "lethargy");
    completeProject(s, "NOISE_REDUCER");
    for (const p of s.players) expectInSync(s, p, `${p.id} done`);
    loseProject(s, "NOISE_REDUCER");
    for (const p of s.players) expectInSync(s, p, `${p.id} lost`);
  });

  it("after the cure cheat", () => {
    const s = game();
    const p = human(s);
    addDisease(s, p, "flu_disease");
    addDisease(s, p, "broken_leg_injury");
    KUBE_OPS.cure.apply(s, p);
    expectInSync(s, p, "cured");
  });

  // A role change changes which diseases the folds count, so every role change recomputes the caps (owner, 2026-11-22).
  it("after a sick human turns Mush", () => {
    const s = game();
    const p = human(s);
    addDisease(s, p, "flu_disease");
    convert(s, p);
    expectInSync(s, p, "converted");
  });

  it("after a sick human is chosen Mush at the end of pre-selection", () => {
    const c = noCharacterModifiers(testConfig({ preselection: { seats: 4, endsOn: { day: 1, cycle: 2 }, mushCount: 4, twoMushAbove: 8, minPlayers: 1 } }));
    const s = game(c);
    expect(s.preselection).toBe(true);
    for (const p of s.players) addDisease(s, p, "flu_disease");
    selectMush(s);
    for (const p of s.players.filter((x) => x.role === "mush")) expectInSync(s, p, p.id);
  });

  it("after a sick Mush is cured by the serum", () => {
    const s = game();
    const m = mush(s);
    m.modifiers.push("flu_disease");
    cure(s, m);
    expect(m.role).toBe("human");
    expectInSync(s, m, "serum");
  });

  it("after the role cheat turns a sick Mush human", () => {
    const s = game();
    const m = mush(s);
    m.modifiers.push("flu_disease");
    const next = setRoleCheat(s, m.id, "human");
    if (!next.ok) throw new Error(next.error);
    expectInSync(next.state, player(next.state, m.id), "role cheat");
  });
});

describe("PlayerView.caps", () => {
  it("is your own breakdown, beside the stored caps, and nobody else's", () => {
    const s = game();
    const p = human(s);
    addDisease(s, p, "cold_disease");
    const other = s.players.find((o) => o.id !== p.id)!;
    const view = viewFor(s, p.id);
    expect(view.caps).toEqual(capBreakdown(s, p));
    expect(view.caps.morale.sources).toEqual([{ kind: "modifier", id: "cold_disease", delta: -3 }]);
    expect({ ap: view.maxAp, mp: view.maxMp, hp: view.maxHp, morale: view.maxMorale }).toEqual(stored(p));
    // Another seat gets its own breakdown, which says nothing of your cold.
    expect(viewFor(s, other.id).caps).toEqual(capBreakdown(s, other));
    expect(JSON.stringify(viewFor(s, other.id).caps)).not.toContain("cold_disease");
  });
});
