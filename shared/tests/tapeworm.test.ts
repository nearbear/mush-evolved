import { describe, expect, it } from "vitest";
import { addDisease, diseaseStats } from "../src/diseases.ts";
import { consumed, consumedByMush, mealApGain, satietyLoss } from "../src/modifiers.ts";
import { createGame } from "../src/rules.ts";
import { isHungry } from "../src/statuses.ts";
import { makeSeats, testConfig } from "./support.ts";

const config = testConfig();

const setup = () => {
  const state = createGame(makeSeats(4), config, 3);
  const human = state.players.find((p) => p.role === "human")!;
  const mush = state.players.find((p) => p.role === "mush")!;
  return { state, human, mush };
};
const food = (owner: string) => ({ id: "x", type: "cooked_ration", at: { kind: "player", id: owner } }) as const;

describe("Tapeworm", () => {
  it("lasts 20 to 32 cycles", () => {
    const { state, human } = setup();
    expect(diseaseStats(state, "tapeworm_disease")).toMatchObject({ durationMin: 20, durationMax: 32 });
    addDisease(state, human, "tapeworm_disease");
    const duration = human.diseaseTrackers.find((t) => t.name === "tapeworm_disease")!.duration;
    expect(duration).toBeGreaterThanOrEqual(20);
    expect(duration).toBeLessThanOrEqual(32);
  });

  it("takes 2 more satiety a cycle and halves a meal's AP, rounded down", () => {
    const { state, human } = setup();
    const [loss, ap] = [satietyLoss(state, human), mealApGain(state, human, 5)];
    addDisease(state, human, "tapeworm_disease");
    expect(satietyLoss(state, human)).toBe(loss + 2);
    expect(ap).toBe(5);
    expect(mealApGain(state, human, 5)).toBe(2);
  });

  it("makes a human hungry 8 cycles after satiety reaches 0", () => {
    const { state, human } = setup();
    Object.assign(human, { satiety: 0, satietyZeroSince: state.cycle });
    state.cycle += 8;
    expect(isHungry(state, human)).toBe(false);
    addDisease(state, human, "tapeworm_disease");
    expect(isHungry(state, human)).toBe(true);
    state.cycle -= 1;
    expect(isHungry(state, human)).toBe(false);
  });

  it("grumbles publicly after food, for a human and a Mush, without touching a Mush's numbers", () => {
    const { state, human, mush } = setup();
    for (const p of [human, mush]) addDisease(state, p, "tapeworm_disease");
    consumed(state, human, food(human.id));
    expect(state.log.filter((e) => e.key === "rumble")).toHaveLength(1);
    expect(satietyLoss(state, mush)).toBe(state.config.hunger.satietyPerCycle);
    expect(mealApGain(state, mush, 5)).toBe(5);
    consumedByMush(state, mush, food(mush.id));
    // A Mush has no special logs without bacterial_contact.
    expect(state.log.filter((e) => e.key === "rumble")).toHaveLength(1);
  });
});
