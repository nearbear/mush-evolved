import { isDeepStrictEqual } from "node:util";
import { describe, expect, it } from "vitest";
import { CHARACTERS } from "../src/characters.ts";
import { DEFAULT_CONFIG, PRESELECTION } from "../src/config.ts";
import { applyInput, rebuildGame, replayGame, startGame, type GameSetup, type Input, type RecordedInput } from "../src/replay.ts";
import { nextDue } from "../src/queue.ts";
import { legalActions, viewFor } from "../src/rules.ts";
import { fullViewFor, perspective, seatStarts, type FullView, type SeatStarts } from "../src/fullView.ts";
import { nextInt, type RngState } from "../src/rng.ts";
import { MAX_SPOT_CELL } from "../src/spot.ts";
import { CHAT_CHANNELS, type GameState, type Seat } from "../src/types.ts";

const seat = (i: number): Seat => ({ id: `p${i}`, name: `Player ${i}`, isBot: false, character: CHARACTERS[i]!.id });

const setup: GameSetup = {
  seats: Array.from({ length: 8 }, (_, i) => seat(i)),
  // End cycle on, as on the dev server, so both ways a cycle ends are in the record.
  config: { ...DEFAULT_CONFIG, manualCycles: true },
  seed: 42,
  rulesVersion: "test",
};

/** Launched empty in pre-selection, as the matchmaker's ships are; it fills (and picks the Mush) at 8 joins. */
const preselectionSetup: GameSetup = {
  ...setup,
  seats: [],
  config: { ...setup.config, preselection: { ...PRESELECTION, seats: 8 } },
};

/** A random input of any kind at server time `at`; some will be rejected, as real ones are. */
function randomInput(state: GameState, rng: RngState, at: number): [Input, RngState] {
  let pick: number;
  // Board the ship now and then while it takes crew (always while it's empty).
  if (state.preselection && state.players.length < 8) {
    [pick, rng] = nextInt(rng, 5);
    if (pick === 0 || state.players.length === 0) return [{ type: "join", seat: seat(state.players.length) }, rng];
  }
  // Settle bars as the server's alarm would, so timed actions actually happen.
  const due = nextDue(state);
  if (due !== null && due <= at) return [{ type: "tick", at }, rng];
  [pick, rng] = nextInt(rng, state.players.length);
  const by = state.players[pick]!.id;
  const channels = state.channels.filter((c) => c.members.includes(by));
  [pick, rng] = nextInt(rng, 13);
  if (pick === 0) return [{ by, type: "chat", channel: CHAT_CHANNELS[0]!, text: `hello ${state.nextChatId}\n- [ ] fix it` }, rng];
  if (pick === 1) return [{ by, type: "createChannel", name: `room ${state.nextChannelId}` }, rng];
  if (pick === 2 && channels[0]) {
    [pick, rng] = nextInt(rng, state.players.length);
    return [{ by, type: "invite", channel: channels[0].id, player: state.players[pick]!.id }, rng];
  }
  if (pick === 3 && channels[0]) return [{ by, type: "leaveChannel", channel: channels[0].id }, rng];
  if (pick === 4 && channels[0]) return [{ by, type: "chat", channel: channels[0].id, text: "psst" }, rng];
  if (pick === 7) {
    let x: number, y: number;
    [x, rng] = nextInt(rng, 2 * MAX_SPOT_CELL + 1);
    [y, rng] = nextInt(rng, 2 * MAX_SPOT_CELL + 1);
    return [{ by, type: "walk", x: x - MAX_SPOT_CELL, y: y - MAX_SPOT_CELL, sitting: x % 2 === 0 }, rng];
  }
  const mine = state.chat.findLast((m) => m.from === by);
  if (pick === 8 && mine) return [{ by, type: "toggleCheckbox", message: mine.id, line: 1 }, rng];
  if (pick === 9) return [{ by, type: "acknowledgeTransfer" }, rng];
  // The server reports who is connected; now and then a seat goes inactive at once (a ban).
  if (pick === 10) return [{ type: "seen", players: [by], at }, rng];
  if (pick === 11) {
    [pick, rng] = nextInt(rng, 5);
    if (pick === 0) return [{ type: "inactivate", player: by }, rng];
  }
  const actions = legalActions(state, by);
  // Lean on "ready" so cycles (and days) actually pass; now and then the clock passes a cycle boundary too.
  if (actions.length === 0 || pick === 5) {
    [pick, rng] = nextInt(rng, 20);
    return [pick === 0 ? { type: "cycle", at } : { by, type: "action", action: { type: "ready" }, at }, rng];
  }
  if (pick === 6) return [{ by, type: "clearQueue" }, rng];
  [pick, rng] = nextInt(rng, actions.length);
  return [{ by, type: "action", action: actions[pick]!, at }, rng];
}

/** Plays like the server does: keeps the inputs that were accepted, each with its server time. */
function play(steps: number, rng: RngState, from = setup, onStep?: (state: GameState) => void): { state: GameState; record: RecordedInput[] } {
  let state = startGame(from);
  const record: RecordedInput[] = [];
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
    record.push({ at: now, input });
    onStep?.(state);
  }
  return { state, record };
}

describe("replay", () => {
  it("rebuilds the same game from the setup and the stored inputs", () => {
    for (const seed of [1, 2, 3]) {
      const { state, record } = play(2000, seed);
      const inputs = record.map((r) => r.input);
      expect(state.cycle, "the game got past a day").toBeGreaterThan(DEFAULT_CONFIG.cyclesPerDay);
      // Every input type the rules take, but cheats (cheats.test.ts), pre-selection's join (below), createThread and sharePlanet (not
      // generated) and acknowledgeTransfer (generated, but random play rarely transfers a body for it to accept).
      for (const type of ["chat", "createChannel", "invite", "leaveChannel", "tick", "cycle", "clearQueue", "walk", "toggleCheckbox", "action", "seen", "inactivate"]) {
        expect(inputs.some((i) => i.type === type), type).toBe(true);
      }
      // Through JSON, as the server stores it.
      const stored = JSON.parse(JSON.stringify(inputs)) as Input[];
      expect(replayGame(setup, stored)).toEqual(state);
    }
  }, 15_000);

  it("rebuilds a ship launched empty in pre-selection, through every join and the Mush pick", () => {
    const { state, record } = play(1500, 4, preselectionSetup);
    expect(record.filter((r) => r.input.type === "join")).toHaveLength(8);
    expect(state.preselection, "the ship filled and picked its Mush").toBeFalsy();
    expect(replayGame(preselectionSetup, JSON.parse(JSON.stringify(record.map((r) => r.input))) as Input[])).toEqual(state);
  });

  it("refuses a record that the rules no longer accept", () => {
    const inputs = play(50, 9).record.map((r) => r.input);
    const tampered: Input[] = [{ by: "p0", type: "action", action: { type: "move", to: "NOWHERE" }, at: 0 }, ...inputs];
    expect(() => replayGame(setup, tampered)).toThrow(/diverged at input 0/);
  });
});

describe("rebuildGame", () => {
  it("stamps log and chat entries with their input's server time, as the server does", () => {
    const { record } = play(300, 5);
    const launched = { ...setup, launchedAt: 1234 };
    const rebuilt = rebuildGame(launched, record);
    expect(rebuilt.log[0]!.at).toBe(1234);
    const firstChat = record.find((r) => r.input.type === "chat")!;
    expect(rebuilt.chat[0]!.at).toBe(firstChat.at);
    expect([...rebuilt.log, ...rebuilt.chat].every((e) => e.at !== undefined)).toBe(true);
    // The same game otherwise.
    const unstamped = JSON.parse(JSON.stringify(replayGame(launched, record.map((r) => r.input)))) as GameState;
    const strip = (s: GameState) => JSON.parse(JSON.stringify(s, (k, v) => (k === "at" && typeof v === "number" ? undefined : v))) as GameState;
    expect(strip(rebuilt)).toEqual(strip(unstamped));
  });
});

describe("perspective", () => {
  it("gives every seat its own view at every step of a random game, from the full view", () => {
    // Pre-selection, its joins and the Mush pick, then a game past its first day.
    const cycles: number[] = [];
    for (const [from, steps, seed] of [[preselectionSetup, 300, 4], [setup, 1200, 1]] as const) {
      let starts: SeatStarts | null = null;
      const { state } = play(steps, seed, from, (s) => {
        // As the server notes them: the moment the Mush are chosen.
        if (starts === null && !s.preselection) starts = seatStarts(s);
        // Through JSON, as history is stored.
        const full = JSON.parse(JSON.stringify(fullViewFor(s, starts))) as FullView;
        for (const p of s.players) {
          const [rebuilt, real] = [perspective(full, p.id), viewFor(s, p.id)];
          // The fast check first; expect only to show the difference.
          if (!isDeepStrictEqual(rebuilt, real)) expect(rebuilt).toStrictEqual(real);
        }
      });
      expect(state.preselection, "the Mush were chosen").toBe(false);
      cycles.push(state.cycle);
    }
    expect(cycles[1], "the game got past a day").toBeGreaterThan(DEFAULT_CONFIG.cyclesPerDay);
  }, 30_000);

  it("holds everything but the RNG, in a copy", () => {
    const { state } = play(300, 7);
    const full = fullViewFor(state, seatStarts(state));
    expect("rng" in full).toBe(false);
    expect(full.players.map((p) => p.role)).toEqual(state.players.map((p) => p.role));
    expect(full.starts?.[state.players[0]!.mind]).toEqual({ role: state.players[0]!.role, character: state.players[0]!.character });
    full.players[0]!.hp = -99;
    expect(state.players[0]!.hp).not.toBe(-99);
  });

  it("is null on starts before the Mush are chosen", () => {
    const { state } = play(3, 8, preselectionSetup);
    expect(state.preselection).toBe(true);
    expect(fullViewFor(state, null).starts).toBeNull();
  });
});
