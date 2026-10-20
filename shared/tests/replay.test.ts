import { describe, expect, it } from "vitest";
import { CHARACTERS } from "../src/characters.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { applyInput, replayGame, startGame, type GameSetup, type Input } from "../src/replay.ts";
import { nextDue } from "../src/queue.ts";
import { legalActions } from "../src/rules.ts";
import { nextInt, type RngState } from "../src/rng.ts";
import { CHAT_CHANNELS, type GameState } from "../src/types.ts";

const setup: GameSetup = {
  seats: Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, name: `Player ${i}`, isBot: false, character: CHARACTERS[i]!.id })),
  // End cycle on, as on the dev server, so both ways a cycle ends are in the record.
  config: { ...DEFAULT_CONFIG, manualCycles: true },
  seed: 42,
  rulesVersion: "test",
};

/** A random input of any kind at server time `at`; some will be rejected, as real ones are. */
function randomInput(state: GameState, rng: RngState, at: number): [Input, RngState] {
  let pick: number;
  // Settle bars as the server's alarm would, so timed actions actually happen.
  const due = nextDue(state);
  if (due !== null && due <= at) return [{ type: "tick", at }, rng];
  [pick, rng] = nextInt(rng, state.players.length);
  const by = state.players[pick]!.id;
  const channels = state.channels.filter((c) => c.members.includes(by));
  [pick, rng] = nextInt(rng, 10);
  if (pick === 0) return [{ by, type: "chat", channel: CHAT_CHANNELS[0]!, text: `hello ${state.nextChatId}` }, rng];
  if (pick === 1) return [{ by, type: "createChannel", name: `room ${state.nextChannelId}` }, rng];
  if (pick === 2 && channels[0]) {
    [pick, rng] = nextInt(rng, state.players.length);
    return [{ by, type: "invite", channel: channels[0].id, player: state.players[pick]!.id }, rng];
  }
  if (pick === 3 && channels[0]) return [{ by, type: "leaveChannel", channel: channels[0].id }, rng];
  if (pick === 4 && channels[0]) return [{ by, type: "chat", channel: channels[0].id, text: "psst" }, rng];
  const actions = legalActions(state, by);
  // Lean on "ready" so cycles (and days) actually pass; now and then the clock passes a cycle boundary too.
  if (actions.length === 0 || pick === 5) {
    [pick, rng] = nextInt(rng, 20);
    return [pick === 0 ? { type: "cycle" } : { by, type: "action", action: { type: "ready" }, at }, rng];
  }
  if (pick === 6) return [{ by, type: "clearQueue" }, rng];
  [pick, rng] = nextInt(rng, actions.length);
  return [{ by, type: "action", action: actions[pick]!, at }, rng];
}

/** Plays like the server does: keeps the inputs that were accepted. */
function play(steps: number, rng: RngState): { state: GameState; inputs: Input[] } {
  let state = startGame(setup);
  const inputs: Input[] = [];
  let now = 0;
  for (let i = 0; i < steps; i++) {
    let input: Input;
    let wait: number;
    [wait, rng] = nextInt(rng, 400);
    now += wait;
    [input, rng] = randomInput(state, rng, now);
    const result = applyInput(state, input);
    if (!result.ok) continue;
    state = result.state;
    inputs.push(input);
  }
  return { state, inputs };
}

describe("replay", () => {
  it("rebuilds the same game from the setup and the stored inputs", () => {
    for (const seed of [1, 2, 3]) {
      const { state, inputs } = play(2000, seed);
      expect(state.cycle, "the game got past a day").toBeGreaterThan(DEFAULT_CONFIG.cyclesPerDay);
      expect(inputs.some((i) => i.type === "createChannel")).toBe(true);
      expect(inputs.some((i) => i.type === "tick")).toBe(true);
      expect(inputs.some((i) => i.type === "cycle")).toBe(true);
      expect(inputs.some((i) => i.type === "clearQueue")).toBe(true);
      // Through JSON, as the server stores it.
      const stored = JSON.parse(JSON.stringify(inputs)) as Input[];
      expect(replayGame(setup, stored)).toEqual(state);
    }
  });

  it("refuses a record that the rules no longer accept", () => {
    const { inputs } = play(50, 9);
    const tampered: Input[] = [{ by: "p0", type: "action", action: { type: "move", to: "NOWHERE" }, at: 0 }, ...inputs];
    expect(() => replayGame(setup, tampered)).toThrow(/diverged at input 0/);
  });
});
