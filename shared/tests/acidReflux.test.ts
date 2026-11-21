import { describe, expect, it } from "vitest";
import { addDisease, diseaseStats } from "../src/diseases.ts";
import { consumed, consumedByMush } from "../src/modifiers.ts";
import { STEROIDS_ITEM } from "../src/items.ts";
import { createGame } from "../src/rules.ts";
import { makeSeats, testConfig } from "./support.ts";

const config = testConfig();

const setup = () => {
  const state = createGame(makeSeats(4), config, 3);
  const human = state.players.find((p) => p.role === "human")!;
  const mush = state.players.find((p) => p.role === "mush")!;
  for (const p of [human, mush]) {
    addDisease(state, p, "acid_reflux_disease");
    Object.assign(p, { ap: 5, morale: 5, hp: 10 });
  }
  return { state, human, mush };
};
const food = (owner: string) => ({ id: "x", type: "cooked_ration", at: { kind: "player", id: owner } }) as const;

describe("Acid Reflux", () => {
  it("lasts 12 to 20 cycles", () => {
    const { state, human } = setup();
    expect(diseaseStats(state, "acid_reflux_disease")).toMatchObject({ durationMin: 12, durationMax: 20 });
    const duration = human.diseaseTrackers.find((t) => t.name === "acid_reflux_disease")!.duration;
    expect(duration).toBeGreaterThanOrEqual(12);
    expect(duration).toBeLessThanOrEqual(20);
  });

  it("after eating food, costs a human 1 AP, 2 morale, 2 health and makes them vomit", () => {
    const { state, human } = setup();
    consumed(state, human, food(human.id));
    expect([human.ap, human.morale, human.hp]).toEqual([4, 3, 8]);
    expect(state.log.some((e) => e.key === "vomitSelf" || e.key === "vomitOther")).toBe(true);
  });

  it("does nothing for a drug (no satiety)", () => {
    const { state, human } = setup();
    consumed(state, human, { id: "d", type: STEROIDS_ITEM, at: { kind: "player", id: human.id } });
    expect([human.ap, human.morale, human.hp]).toEqual([5, 5, 10]);
  });

  it("costs a Mush no stats", () => {
    const { state, mush } = setup();
    consumedByMush(state, mush, food(mush.id));
    expect([mush.ap, mush.morale, mush.hp]).toEqual([5, 5, 10]);
  });
});
