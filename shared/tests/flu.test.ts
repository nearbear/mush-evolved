import { describe, expect, it } from "vitest";
import { addDisease, diseaseStats, spreadByTouch } from "../src/diseases.ts";
import { ITEM_TYPES } from "../src/itemTypes.ts";
import { consumed, cycleChanged, enterRoom, enteredRoom } from "../src/modifiers.ts";
import { createGame } from "../src/rules.ts";
import type { DiseaseStats, GameState, ItemState } from "../src/types.ts";
import { makeSeats, player, testConfig } from "./support.ts";

const config = testConfig();

const game = (): GameState => createGame(makeSeats(4), config, 3);
const human = (s: GameState) => s.players.find((p) => p.role === "human")!;
const mush = (s: GameState) => s.players.find((p) => p.role === "mush")!;

/** A game whose Flu stats are patched. */
function fluGame(patch: Partial<DiseaseStats>): GameState {
  const allDiseaseStats = config.diseases.allDiseaseStats.map((d) => (d.label === "flu_disease" ? { ...d, ...patch } : d));
  return createGame(makeSeats(4), testConfig({ diseases: { allDiseaseStats } }), 3);
}

const item = (type: string, owner: string): ItemState => ({ id: "x", type, at: { kind: "player", id: owner } }) as ItemState;

describe("Flu", () => {
  it("has the owner's numbers", () => {
    expect(diseaseStats(game(), "flu_disease")).toMatchObject({ durationMin: 8, durationMax: 12, spreadByDTT: true, roomSpread: 0.02, cycleSpread: 0.02 });
  });

  it("takes 3 off max health and max morale", () => {
    const s = game();
    const p = human(s);
    const [hp, morale] = [p.maxHp, p.maxMorale];
    addDisease(s, p, "flu_disease");
    expect([p.maxHp, p.maxMorale]).toEqual([hp - 3, morale - 3]);
  });

  it("spreads by STT or DTT", () => {
    const s = game();
    const [a, b] = [player(s, "p0"), player(s, "p1")];
    addDisease(s, a, "flu_disease");
    spreadByTouch(s, a, b);
    expect(b.modifiers).toContain("flu_disease");
  });

  it("spreads on an encounter and to the room at a cycle change", () => {
    const s = fluGame({ roomSpread: 1, cycleSpread: 0 });
    const [sick, met, near, far] = [player(s, "p0"), player(s, "p1"), player(s, "p2"), player(s, "p3")];
    addDisease(s, sick, "flu_disease");
    sick.room = met.room = "FRONT_CORRIDOR";
    near.room = far.room = "BRIDGE";
    enterRoom(s, met);
    expect(met.modifiers).toContain("flu_disease");

    const t = fluGame({ roomSpread: 0, cycleSpread: 1 });
    const [sick2, near2, far2] = [player(t, "p0"), player(t, "p1"), player(t, "p2")];
    addDisease(t, sick2, "flu_disease");
    sick2.room = near2.room = "FRONT_CORRIDOR";
    far2.room = "BRIDGE";
    cycleChanged(t);
    expect(near2.modifiers).toContain("flu_disease");
    expect(far2.modifiers).not.toContain("flu_disease");
  });

  it("over many cycle changes costs MP, health and cleanliness, about a third, a third and 40% of the time", () => {
    const s = fluGame({ cycleSpread: 0 });
    const p = human(s);
    addDisease(s, p, "flu_disease");
    p.diseaseTrackers[0]!.forever = true;
    let mp = 0, hp = 0, dirty = 0;
    const tries = 300;
    for (let i = 0; i < tries; i++) {
      p.mp = 5; p.hp = p.maxHp; p.statuses = p.statuses.filter((st) => st !== "dirty");
      cycleChanged(s);
      if (p.mp < 5) mp++;
      if (p.hp < p.maxHp) hp++;
      if (p.statuses.includes("dirty")) dirty++;
    }
    for (const [n, odds] of [[mp, 0.33], [hp, 0.33], [dirty, 0.4]] as const) {
      expect(n).toBeGreaterThan(tries * (odds - 0.1));
      expect(n).toBeLessThan(tries * (odds + 0.1));
    }
  });

  it("makes its holder vomit after food, not after a drug", () => {
    const s = game();
    const p = human(s);
    for (const o of s.players) if (o !== p) o.room = "BRIDGE";
    p.room = "FRONT_CORRIDOR";
    addDisease(s, p, "flu_disease");
    const drug = Object.entries(ITEM_TYPES).find(([, t]) => t.consume && t.consume.satiety <= 0)![0];
    consumed(s, p, item(drug, p.id));
    expect(s.log.some((e) => e.key === "vomitSelf")).toBe(false);
    consumed(s, p, item("fruit_banana", p.id));
    expect(s.log.some((e) => e.key === "vomitSelf")).toBe(true);
  });

  it("sometimes, not always, makes its holder vomit on entering a room", () => {
    const s = game();
    const p = human(s);
    for (const o of s.players) if (o !== p) o.room = "BRIDGE";
    p.room = "FRONT_CORRIDOR";
    addDisease(s, p, "flu_disease");
    const tries = 400;
    for (let i = 0; i < tries; i++) enteredRoom(s, p);
    const n = s.log.filter((e) => e.key === "vomitSelf").length;
    expect(n).toBeGreaterThan(tries * 0.03);
    expect(n).toBeLessThan(tries * 0.13);
  });

  it("costs a Mush nothing, but they still spread it", () => {
    const s = fluGame({ cycleSpread: 1 });
    const m = mush(s);
    const other = human(s);
    const [hp, morale, health] = [m.maxHp, m.maxMorale, m.hp];
    addDisease(s, m, "flu_disease");
    m.room = other.room = "FRONT_CORRIDOR";
    m.mp = 5;
    for (let i = 0; i < 10; i++) cycleChanged(s);
    expect([m.mp, m.hp, m.maxHp, m.maxMorale]).toEqual([5, health, hp, morale]);
    expect(m.statuses).not.toContain("dirty");
    expect(other.modifiers).toContain("flu_disease");
  });
});
