import { describe, expect, it } from "vitest";
import { addDisease } from "../src/diseases.ts";
import { cycleChanged, enteredRoom, showered } from "../src/modifiers.ts";
import { createGame } from "../src/rules.ts";
import { makeSeats, testConfig } from "./support.ts";

const config = testConfig();

describe("Skin inflammation", () => {
  it("costs a human 6 health when showering, and a Mush nothing", () => {
    const state = createGame(makeSeats(4), config, 5);
    const human = state.players.find((p) => p.role === "human")!;
    const mush = state.players.find((p) => p.role === "mush")!;
    for (const p of [human, mush]) addDisease(state, p, "skin_inflammation_disease");
    const [hp, mushHp] = [human.hp, mush.hp];
    showered(state, human);
    showered(state, mush);
    expect(human.hp).toBe(hp - 6);
    expect(mush.hp).toBe(mushHp);
  });

  it("scratches now and then on entering a room, and gets dirty now and then at a cycle change", () => {
    const state = createGame(makeSeats(4), config, 5);
    const human = state.players.find((p) => p.role === "human")!;
    addDisease(state, human, "skin_inflammation_disease");
    for (let i = 0; i < 200; i++) enteredRoom(state, human);
    expect(state.log.some((e) => e.key === "scratches")).toBe(true);
    for (let i = 0; i < 100 && !human.statuses.includes("dirty"); i++) cycleChanged(state);
    expect(human.statuses).toContain("dirty");
  });
});
