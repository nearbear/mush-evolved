// A random game played the way the server plays one, for the replay tests (replay.test.ts, replayView.test.ts) and the
// invariant checks (invariants.test.ts).

import { CHARACTERS } from "../src/characters.ts";
import { DEFAULT_CONFIG, PRESELECTION } from "../src/config.ts";
import { takeChatOutbox } from "../src/chat.ts";
import { applyInput, startGame, type GameSetup, type Input, type RecordedInput } from "../src/replay.ts";
import { nextDue } from "../src/queue.ts";
import { legalActions } from "../src/rules.ts";
import { nextInt, type RngState } from "../src/rng.ts";
import { MAX_SPOT_CELL } from "../src/spot.ts";
import { CHAT_CHANNELS, type GameState, type Seat } from "../src/types.ts";

// Seat 0 is human and the rest bots: End cycle waits on bots only, so with one human and seven bots a cycle still
// needs all eight ready, as before that rule (owner, 2026-11-22).
export const seat = (i: number): Seat => ({ id: `p${i}`, name: `Player ${i}`, isBot: i > 0, character: CHARACTERS[i]!.id });

export const setup: GameSetup = {
  seats: Array.from({ length: 8 }, (_, i) => seat(i)),
  // End cycle on, as on the dev server, so both ways a cycle ends are in the record.
  config: { ...DEFAULT_CONFIG, manualCycles: true },
  seed: 42,
  rulesVersion: "test",
};

/**
 * How hard the long random-game checks in replay.test.ts work (#382). `npm test` and `verify` leave REPLAY_SEEDS unset: one
 * seed per check, and the rebuild and perspective checks are skipped (`slowRun`). `npm run test:slow` sets it to a seed
 * count. A bug these catch usually shows on any seed; more seeds catch rarer paths.
 */
const seedsEnv = process.env.REPLAY_SEEDS;
export const slowRun = seedsEnv !== undefined && seedsEnv !== "";
const seedCount = slowRun ? Number(seedsEnv) : 1;
if (!Number.isInteger(seedCount) || seedCount < 1) throw new Error(`REPLAY_SEEDS must be a positive whole number, not ${seedsEnv}`);
/** The seeds a long check plays: `first` alone in a normal run, `first` and the next ones in a slow run. */
export const seedsFrom = (first: number): number[] => Array.from({ length: seedCount }, (_, i) => first + i);

/** Launched empty in pre-selection, as the matchmaker's ships are; it fills (and picks the Mush) at 8 joins. */
export const preselectionSetup: GameSetup = {
  ...setup,
  seats: [],
  config: { ...setup.config, preselection: { ...PRESELECTION, seats: 8 } },
};

/** A random input of any kind at server time `at`; some will be rejected, as real ones are. */
export function randomInput(state: GameState, rng: RngState, at: number): [Input, RngState] {
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
  if (pick === 8 && mine) return [{ by, type: "toggleCheckbox", channel: mine.channel, seq: mine.seq, line: 1 }, rng];
  if (pick === 9) return [{ by, type: "acknowledgeTransfer" }, rng];
  // A Radio Piracy spoof, when this player has a hack (radioPiracy.ts).
  const hack = state.players.find((p) => p.id === by)!.radioHack;
  if (pick === 12 && hack) return [{ by, type: "chat", channel: CHAT_CHANNELS[0]!, text: "it's me", as: hack.target }, rng];
  // The server reports who is connected; now and then a seat goes inactive at once (a ban).
  if (pick === 10) return [{ type: "seen", players: [by], at }, rng];
  if (pick === 11) {
    [pick, rng] = nextInt(rng, 5);
    if (pick === 0) return [{ type: "inactivate", player: by }, rng];
  }
  // Not "guard": a guardian pins everyone else to the door they came in by, so random play would keep the crew in a few
  // rooms (guard.test.ts covers it, and a guard step isn't special to the replay).
  const actions = legalActions(state, by).filter((a) => a.type !== "guard");
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
export function play(
  steps: number,
  rng: RngState,
  from = setup,
  onStep?: (state: GameState, input: Input, step: number) => void,
): { state: GameState; record: RecordedInput[] } {
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
    // As the server does: sealed chat pages go to storage, not the state.
    takeChatOutbox(state);
    record.push({ at: now, input });
    onStep?.(state, input, i);
  }
  return { state, record };
}
