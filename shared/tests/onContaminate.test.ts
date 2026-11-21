import { afterAll, afterEach, describe, expect, it } from "vitest";
import { contaminate } from "../src/infection.ts";
import { MODIFIERS } from "../src/modifiers.ts";
import { createGame } from "../src/rules.ts";
import { makeSeats, testConfig } from "./support.ts";

const config = testConfig();

describe("onContaminate", () => {
  const calls: { id: string; amount: number; role: string }[] = [];
  MODIFIERS.test_on_contaminate = { onContaminate: (_next, player, amount) => void calls.push({ id: player.id, amount, role: player.role }) };
  afterEach(() => void (calls.length = 0));
  afterAll(() => void delete MODIFIERS.test_on_contaminate);

  it("runs at the end of contaminate, after the rise or the conversion", () => {
    const state = createGame(makeSeats(4), config, 3);
    const human = state.players.find((p) => p.role === "human" && !p.modifiers.includes("immunity"))!;
    human.modifiers.push("test_on_contaminate");
    contaminate(state, human, 1);
    expect(calls).toEqual([{ id: human.id, amount: 1, role: "human" }]);
    contaminate(state, human, 99);
    expect(calls[1]).toEqual({ id: human.id, amount: 99, role: "mush" });
  });

  it("does not run when the contamination is refused", () => {
    const state = createGame(makeSeats(4), config, 3);
    const mush = state.players.find((p) => p.role === "mush")!;
    mush.modifiers.push("test_on_contaminate");
    contaminate(state, mush, 1);
    expect(calls).toEqual([]);
  });
});
