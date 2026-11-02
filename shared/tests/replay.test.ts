import { isDeepStrictEqual } from "node:util";
import { describe, expect, it } from "vitest";
import { CHARACTERS } from "../src/characters.ts";
import { DEFAULT_CONFIG, PRESELECTION } from "../src/config.ts";
import { applyInput, rebuildGame, replayGame, startGame, type GameSetup, type Input, type RecordedInput } from "../src/replay.ts";
import { nextDue } from "../src/queue.ts";
import { legalActions, viewFor } from "../src/rules.ts";
import { fullViewFor, perspective, seatStarts, type FullView, type SeatStarts } from "../src/fullView.ts";
import { nextInt, type RngState } from "../src/rng.ts";
import { applyDiff, diffView, type ViewDiff } from "../src/viewDiff.ts";
import { HISTORY_VERSION, HistoryError, historyStep, rebuildHistory, type HistoryStep } from "../src/viewHistory.ts";
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

describe("viewDiff", () => {
  const roundTrip = (prev: unknown, next: unknown) => {
    const diff = JSON.parse(JSON.stringify(diffView(prev, next) ?? null)) as ViewDiff | null;
    return applyDiff(prev, diff ?? undefined);
  };

  it("finds no change between equal values, with undefined keys counting as missing", () => {
    expect(diffView({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBeUndefined();
    expect(diffView({ a: 1, b: undefined }, { a: 1 })).toBeUndefined();
  });

  it("stores a growing list as an append", () => {
    const prev = { log: [{ id: 1 }, { id: 2 }] };
    const next = { log: [{ id: 1 }, { id: 2 }, { id: 3 }] };
    expect(diffView(prev, next)).toEqual({ k: "o", c: { log: { k: "a", a: [{ id: 3 }] } } });
    expect(roundTrip(prev, next)).toEqual(next);
  });

  it("stores a trim from the middle (chat's per-channel cap) as a removal, plus the append", () => {
    const prev = [{ c: "a", n: 1 }, { c: "b", n: 2 }, { c: "a", n: 3 }, { c: "b", n: 4 }];
    const next = [{ c: "a", n: 1 }, { c: "a", n: 3 }, { c: "b", n: 4 }, { c: "b", n: 5 }];
    expect(diffView(prev, next)).toEqual({ k: "a", r: [1], a: [{ c: "b", n: 5 }] });
    expect(roundTrip(prev, next)).toEqual(next);
  });

  it("stores a trim from the front, an edit in place and a truncation", () => {
    for (const [prev, next] of [
      [[1, 2, 3, 4, 5], [3, 4, 5, 6]],
      [[{ x: 1 }, { x: 2 }, { x: 3 }], [{ x: 1 }, { x: 9 }, { x: 3 }]],
      [[1, 2, 3, 4], [1, 2]],
      [[1, 2], [3, 4, 5]],
      [[], [1]],
      [[1], []],
    ]) {
      expect(roundTrip(prev, next), JSON.stringify([prev, next])).toEqual(next);
    }
    expect(diffView([1, 2, 3, 4, 5], [3, 4, 5, 6])).toEqual({ k: "a", r: [0, 1], a: [6] });
  });

  it("replaces values whose type changed, and removes keys", () => {
    for (const [prev, next] of [
      [{ a: 1, b: 2 }, { a: 1 }],
      [{ a: [1] }, { a: { 0: 1 } }],
      [{ a: null }, { a: { b: 1 } }],
      [1, "1"],
    ]) {
      expect(roundTrip(prev, next), JSON.stringify([prev, next])).toEqual(next);
    }
  });

  it("never changes the value it applies to", () => {
    const prev = { list: [{ x: 1 }, { x: 2 }], o: { y: 1 } };
    const before = structuredClone(prev);
    applyDiff(prev, diffView(prev, { list: [{ x: 5 }], o: { z: 2 } }));
    expect(prev).toEqual(before);
  });
});

describe("view history", () => {
  it("rebuilds the full view at every step of a random game from its stored steps, through JSON", () => {
    for (const [from, steps, seed] of [[preselectionSetup, 300, 4], [setup, 1200, 1]] as const) {
      let starts: SeatStarts | null = null;
      let prev: FullView | null = null;
      let before = fullViewFor(startGame(from), null);
      const views: FullView[] = [];
      const history: HistoryStep[] = [];
      let i = 0;
      play(steps, seed, from, (s) => {
        if (starts === null && !s.preselection) starts = seatStarts(s);
        const next = fullViewFor(s, starts);
        // A room restart every 100 inputs, and a full copy every 50, as a cycle would.
        const restarted = i % 100 === 37;
        const loaded = before;
        history.push(JSON.parse(JSON.stringify(historyStep(restarted ? null : prev, () => loaded, next, i % 50 === 0))) as HistoryStep);
        views.push(next);
        prev = before = next;
        i++;
      });
      const frames = rebuildHistory(history);
      expect(frames).toHaveLength(views.length);
      frames.forEach(({ view }, n) => {
        if (!isDeepStrictEqual(JSON.parse(JSON.stringify(view)), JSON.parse(JSON.stringify(views[n])))) expect(view, `step ${n}`).toEqual(views[n]);
      });
    }
  }, 30_000);

  it("refuses a history in another format version, or a change with nothing before it", () => {
    const { state } = play(5, 2);
    const full = fullViewFor(state, null);
    expect(() => rebuildHistory([{ v: HISTORY_VERSION + 1, full }])).toThrow(HistoryError);
    expect(() => rebuildHistory([{ diff: { k: "s", v: full } }])).toThrow(HistoryError);
  });
});
