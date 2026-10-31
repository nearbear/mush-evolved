import { describe, expect, it } from "vitest";
import { assayDue, contaminate, contaminationCandidates, researchProgress, runAssay } from "../src/assay.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import type { RelayProgressConfig, ResearchPool, Sample } from "../src/relay.ts";
import { RESEARCH_COMPLETE } from "../src/research.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import type { Action, GameConfig, GameState, PlayerId } from "../src/types.ts";
import { clone, makeSeats, mustApply, offered, setProgress, stockLab } from "./support.ts";

const LAB = "LABORATORY:RESEARCH_LAB";
const research = (id = "STEROIDS"): Action => ({ type: "research", equipment: LAB, research: id });
const spoil = (id = "STEROIDS"): Action => ({ type: "spoil_research", equipment: LAB, research: id });
const contam = (id = "STEROIDS"): Action => ({ type: "contaminate", equipment: LAB, research: id });
const R = DEFAULT_CONFIG.research;
const MARKS = R.assayMarks;

/** Four players in the lab; `spoilChance` overrides the noise so a test can rule it in or out. */
function game(spoilChance = R.spoilChance, seed = 7, assayMarks = MARKS): GameState {
  const config: GameConfig = { ...DEFAULT_CONFIG, research: { ...R, spoilChance, assayMarks } };
  const s = createGame(makeSeats(4, "others"), config, seed);
  for (const p of s.players) {
    p.room = "LABORATORY";
    p.role = "human";
  }
  return s;
}

/** Applies `action` for `id` with AP to spare and no dirt, so a test can chain contributions. */
function act(s: GameState, id: PlayerId, action: Action): GameState {
  const p = s.players.find((pl) => pl.id === id)!;
  p.ap = 12;
  p.statuses = p.statuses.filter((st) => st !== "dirty");
  return mustApply(s, id, action);
}

const pool = (s: GameState, id = "STEROIDS") => s.relay.research[id]!;
const keys = (s: GameState, id: PlayerId) => viewFor(s, id).log.map((e) => e.key);
const sample = (by: PlayerId, contaminatedBy?: PlayerId): Sample => ({ by, base: 6, roll: 0, ...(contaminatedBy && { contaminatedBy }) });

describe("research assays", () => {
  it("pins the owner's first guesses: quarter marks, 5% noise, Contaminate at 1 AP", () => {
    expect([MARKS, R.spoilChance, R.contaminate.cost.ap]).toEqual([[25, 50, 75, 100], 0.05, 1]);
  });

  it("keeps samples pending until the striped total reaches the next mark, then verifies them all", () => {
    let s = game(0);
    const order: PlayerId[] = ["p0", "p1", "p2", "p3"];
    let n = 0;
    while ((s.research.STEROIDS ?? 0) === 0) {
      const before = researchProgress(pool(s) ?? { tokens: [], pending: [] }, R.progress, RESEARCH_COMPLETE);
      expect(before.verified + before.pending).toBeLessThan(MARKS[0]!);
      s = act(s, order[n++ % 4]!, research());
    }
    expect(s.research.STEROIDS).toBeGreaterThanOrEqual(MARKS[0]!);
    expect(pool(s).pending).toEqual([]);
    expect(pool(s).tokens).toHaveLength(n);
    const line = viewFor(s, "p0").log.find((e) => e.key === "assayPassed");
    expect(line?.params).toMatchObject({ research: "STEROIDS", count: n });
  });

  it("removes a spoiled sample as if never made, separator effect included (the worked example)", () => {
    const config: RelayProgressConfig = { rate: 6, mod: 10, skillBoost: 0, relayPenalty: 2 };
    const p: ResearchPool = { tokens: [], pending: [sample("chun"), sample("chun"), sample("chun"), sample("paola", "x")] };
    expect(researchProgress(p, config, 100)).toEqual({ verified: 0, pending: 22 });
    const s = game(0);
    const result = runAssay(s, p, 0);
    expect(result).toEqual({ tested: [["chun", 3], ["paola", 1]], spoiled: [["paola", 1]] });
    expect(researchProgress(p, config, 100)).toEqual({ verified: 12, pending: 0 });
    expect(p.tokens.every((t) => !("contaminatedBy" in t))).toBe(true);
  });

  it("spoils every uncontaminated sample at the noise chance, from the seeded RNG", () => {
    const all = (chance: number, seed: number) => {
      const s = game(chance);
      s.rng = seed;
      const p: ResearchPool = { tokens: [], pending: Array.from({ length: 200 }, (_, i) => sample(`p${i % 4}`)) };
      return { spoiled: runAssay(s, p, chance).spoiled.reduce((a, [, c]) => a + c, 0), rng: s.rng };
    };
    expect(all(0, 1).spoiled).toBe(0);
    expect(all(1, 1).spoiled).toBe(200);
    const some = all(R.spoilChance, 1);
    expect(some.spoiled).toBeGreaterThan(0);
    expect(some.spoiled).toBeLessThan(40);
    expect(all(R.spoilChance, 1)).toEqual(some);
  });

  it("assays again at the same mark when spoils leave it short", () => {
    let s = game(0);
    s.players[0]!.role = "mush";
    // p0's own spoil carries it past the first mark: the assay removes it and leaves the research short.
    setProgress(s, { research: "STEROIDS" }, MARKS[0]! - 2);
    pool(s).pending = pool(s).tokens.splice(0);
    s.research.STEROIDS = 0;
    s = act(s, "p0", spoil());
    expect(keys(s, "p1")).toContain("assaySpoiled");
    expect(pool(s).pending).toEqual([]);
    const verified = s.research.STEROIDS!;
    expect(verified).toBe(MARKS[0]! - 2);
    expect(assayDue(pool(s), R.progress, MARKS, RESEARCH_COMPLETE)).toBe(false);
    s = act(s, "p1", research());
    expect(s.research.STEROIDS).toBeGreaterThanOrEqual(MARKS[0]!);
    expect(keys(s, "p1").filter((k) => k === "assayPassed")).toHaveLength(1);
  });

  it("completes only at the 100% assay that leaves it at 100, and never lets verified progress fall", () => {
    let s = game(0);
    s.players[0]!.role = "mush";
    stockLab(s, "LABORATORY", "MYCO_ALARM");
    setProgress(s, { research: "MYCO_ALARM" }, RESEARCH_COMPLETE - 1);
    // Not past 75 yet, so the seed token counts as verified at 99: the next sample triggers the 100% assay.
    s = act(s, "p0", spoil("MYCO_ALARM"));
    expect(s.research.MYCO_ALARM).toBe(RESEARCH_COMPLETE - 1);
    expect(keys(s, "p1")).not.toContain("researchCompleted");
    expect(s.items.filter((i) => i.type === "myco_alarm")).toHaveLength(0);
    s = act(s, "p1", research("MYCO_ALARM"));
    expect(s.research.MYCO_ALARM).toBe(RESEARCH_COMPLETE);
    expect(keys(s, "p1")).toContain("researchCompleted");
    expect(viewFor(s, "p1").log.find((e) => e.key === "researchCompleted")?.params).toEqual({ research: "MYCO_ALARM" });
  });

  it("never lets verified progress fall over random contributions, spoils and contaminations", () => {
    for (let seed = 1; seed <= 20; seed++) {
      let s = game(0.3, seed);
      s.players[0]!.role = "mush";
      s.players[0]!.mushSkills = ["sapper"];
      let last = 0;
      for (let step = 0; step < 40 && (s.research.STEROIDS ?? 0) < RESEARCH_COMPLETE; step++) {
        const who = `p${step % 4}`;
        const a = who === "p0" ? [spoil(), contam(), research()][step % 3]! : research();
        const r = applyAction(Object.assign(s, { players: s.players.map((p) => ({ ...p, ap: 12, statuses: [] })) }), who, a);
        if (r.ok) s = r.state;
        expect(s.research.STEROIDS ?? 0).toBeGreaterThanOrEqual(last);
        last = s.research.STEROIDS ?? 0;
      }
    }
  });

  it("writes the same assay line for noise and for contamination", () => {
    // The line is built only from what runAssay returns, which is the same whatever spoiled the sample.
    const viaContamination = runAssay(game(0), { tokens: [], pending: [sample("p1", "p0"), sample("p2")] }, 0);
    const noisy = game(1);
    const viaNoise = runAssay(noisy, { tokens: [], pending: [sample("p1"), sample("p2")] }, 0.5);
    // Find a seed where noise spoils p1's sample only.
    for (let seed = 0; JSON.stringify(viaNoise) !== JSON.stringify(viaContamination); seed++) {
      noisy.rng = seed;
      Object.assign(viaNoise, runAssay(noisy, { tokens: [], pending: [sample("p1"), sample("p2")] }, 0.5));
    }
    expect(viaNoise).toEqual(viaContamination);
    // And the line names everyone tested and whose spoiled, by character.
    let s = game(1);
    setProgress(s, { research: "STEROIDS" }, MARKS[0]! - 1);
    s = act(s, "p1", research());
    const who = s.players[1]!.character;
    expect(viewFor(s, "p2").log.find((e) => e.key.startsWith("assay"))?.params).toEqual({ research: "STEROIDS", count: 1, tested: `${who}:1`, spoiled: 1, spoiledBy: `${who}:1` });
  });

  it("shows the assay line only in the lab", () => {
    let s = game(0);
    s.players[3]!.room = "REFECTORY";
    setProgress(s, { research: "STEROIDS" }, MARKS[0]! - 1);
    s = act(s, "p1", research());
    expect(keys(s, "p2")).toContain("assayPassed");
    expect(keys(s, "p3")).not.toContain("assayPassed");
  });
});

describe("own spoil", () => {
  it("is offered only to Mush, beside Participate", () => {
    const s = game();
    s.players[0]!.role = "mush";
    expect(offered(s, "p0")).toContainEqual(spoil());
    expect(offered(s, "p1")).not.toContainEqual(spoil());
    expect(offered(s, "p1")).toContainEqual(research());
    s.players[1]!.ap = 12;
    expect(applyAction(s, "p1", spoil()).ok).toBe(false);
  });

  it("looks exactly like an honest contribution to everyone else until the assay, except in its own history", () => {
    const base = game();
    base.players[0]!.role = "mush";
    base.players[0]!.ap = 12;
    const honest = mustApply(clone(base), "p0", research());
    const spoiled = mustApply(clone(base), "p0", spoil());
    for (const id of ["p1", "p2", "p3"]) expect(viewFor(spoiled, id)).toEqual(viewFor(honest, id));
    expect(honest.players[0]!.history.at(-1)).toBe("research");
    expect(spoiled.players[0]!.history.at(-1)).toBe("spoil_research");
    expect(spoiled.players[0]!.ap).toBe(honest.players[0]!.ap);
    expect(pool(spoiled).pending[0]!.contaminatedBy).toBe("p0");
  });
});

describe("Saboteur's Contaminate", () => {
  /** A Saboteur in p0's seat; only a 100% mark unless `marks` says otherwise, so samples stay pending. */
  function sapper(marks = [RESEARCH_COMPLETE]) {
    const s = game(0, 7, marks);
    s.players[0]!.role = "mush";
    s.players[0]!.mushSkills = ["sapper"];
    return s;
  }

  it("is offered to a Saboteur only, when someone else has a pending sample", () => {
    let s = sapper();
    expect(offered(s, "p0")).not.toContainEqual(contam());
    s = act(s, "p0", research());
    expect(offered(s, "p0")).not.toContainEqual(contam());
    s = act(s, "p1", research());
    expect(offered(s, "p0")).toContainEqual(contam());
    expect(offered(s, "p1")).not.toContainEqual(contam());
    s.players[0]!.ap = 12;
    const before = s.players[0]!.ap;
    s = mustApply(s, "p0", contam());
    expect(s.players[0]!.ap).toBe(before - R.contaminate.cost.ap);
  });

  it("hits a sample of the contributor with the fewest samples, never its own, another Mush's included", () => {
    let s = sapper();
    s.players[2]!.role = "mush";
    s = act(s, "p1", research());
    s = act(s, "p1", research());
    s = act(s, "p2", research());
    s = act(s, "p0", research());
    s = act(s, "p0", contam());
    expect(pool(s).pending.map((x) => x.contaminatedBy)).toEqual([undefined, undefined, "p0", undefined]);
    // The next least is p1, then nothing is left but its own.
    s = act(s, "p0", contam());
    expect(pool(s).pending.filter((x) => x.contaminatedBy === "p0").map((x) => x.by)).toEqual(["p1", "p2"]);
    s = act(s, "p0", contam());
    expect(pool(s).pending.filter((x) => x.contaminatedBy === "p0").map((x) => x.by)).toEqual(["p1", "p1", "p2"]);
  });

  it("counts verified samples too, and breaks a tie with the seeded RNG", () => {
    const p: ResearchPool = { tokens: [sample("p1"), sample("p1")], pending: [sample("p1"), sample("p2"), sample("p3")] };
    expect(contaminationCandidates(p, "p0").map((x) => x.by)).toEqual(["p2", "p3"]);
    const hit = (seed: number) => {
      const s = game(0);
      s.rng = seed;
      const q = structuredClone(p);
      contaminate(s, q, "p0");
      return q.pending.findIndex((x) => x.contaminatedBy === "p0");
    };
    const picks = new Set(Array.from({ length: 30 }, (_, i) => hit(i)));
    expect(picks).toEqual(new Set([1, 2]));
    expect(hit(5)).toBe(hit(5));
  });

  it("changes nothing anyone else sees before the assay", () => {
    let s = sapper();
    s = act(s, "p1", research());
    s.players[0]!.ap = 12;
    const after = mustApply(clone(s), "p0", contam());
    for (const id of ["p1", "p2", "p3"]) expect(viewFor(after, id)).toEqual(viewFor(s, id));
    expect(pool(after).pending[0]!.contaminatedBy).toBe("p0");
  });

  it("stays offered and does nothing when every other pending sample is already contaminated, so it never reveals an own spoil", () => {
    let s = sapper();
    s.players[1]!.role = "mush";
    s = act(s, "p1", spoil());
    expect(offered(s, "p0")).toContainEqual(contam());
    const after = act(clone(s), "p0", contam());
    expect(pool(after).pending).toEqual(pool(s).pending);
    expect(viewFor(after, "p0").log.at(-1)?.key).toBe("contaminated");
  });

  it("makes the contaminated sample spoil at the assay", () => {
    let s = sapper(MARKS);
    // Low enough that p1's sample can't reach the mark even with the best roll (relay.ts gives rolls to slots).
    setProgress(s, { research: "STEROIDS" }, MARKS[0]! - 14);
    s = act(s, "p1", research());
    s = act(s, "p0", contam());
    s = act(s, "p2", research());
    s = act(s, "p2", research());
    const line = viewFor(s, "p3").log.find((e) => e.key.startsWith("assay"));
    expect(line?.key).toBe("assaySpoiled");
    expect(line?.params?.spoiledBy).toBe(`${s.players[1]!.character}:1`);
  });
});
