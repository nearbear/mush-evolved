import { describe, expect, it } from "vitest";
import { CHARACTERS } from "../src/characters.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { fullViewFor, perspective, seatStarts, type FullView, type SeatStarts } from "../src/fullView.ts";
import { swapMinds } from "../src/mind.ts";
import { applyInput, stampEntries, startGame, type GameSetup } from "../src/replay.ts";
import { chunkHistory, type ReplayIndex } from "../src/replayChunks.ts";
import { lineStep, mergeStreams, revealFor, seatsAt, stepMarks, streamsOf, type Mark } from "../src/replayView.ts";
import { historyStep, rebuildHistory, type BuildStamp, type HistoryFrame, type HistoryStep } from "../src/viewHistory.ts";
import { STATE_VERSION } from "../src/normalizeState.ts";
import type { GameState, LogEntry, PlayerView } from "../src/types.ts";
import { play, seat } from "./randomGame.ts";
import { testConfig } from "./support.ts";

/** The build the tests record history as. */
const BUILD: BuildStamp = { stateVersion: STATE_VERSION, rulesVersion: "test" };

/** 16 seats, as the #335 measurement played (2,090 inputs over 14 cycles); this seed plays 1,958 inputs until the ship is destroyed. */
const big: GameSetup = {
  seats: Array.from({ length: 16 }, (_, i) => seat(i)),
  config: { ...DEFAULT_CONFIG, manualCycles: true },
  seed: 335,
  rulesVersion: "test",
};

/** A random game recorded as the server records it, chunked as R2 holds it, with every view and state along the way. */
function recordedGame(steps: number, seed: number, from: GameSetup = big) {
  const { record } = play(steps, seed, from);
  let state = startGame(from);
  let starts: SeatStarts | null = seatStarts(state);
  const launch = fullViewFor(state, starts);
  let prev: FullView | null = null;
  let before = launch;
  const views: FullView[] = [];
  const states: GameState[] = [];
  const history = record.map(({ at, input }, i) => {
    const result = applyInput(state, input);
    if (!result.ok) throw new Error(result.error);
    // Stamped as the server stamps them, so a chunk's first step can tell its own lines without the chunk before.
    state = stampEntries(result.state, at);
    starts ??= seatStarts(state);
    const next = fullViewFor(state, starts);
    // A room restart now and then, as a deploy would cause.
    const loaded = before;
    const step = JSON.parse(JSON.stringify(historyStep(i % 400 === 211 ? null : prev, () => loaded, next, input.type === "cycle", BUILD))) as HistoryStep;
    views.push(next);
    states.push(state);
    prev = before = next;
    return { at, history: step };
  });
  return { launch, views, states, chunks: chunkHistory(history), index: { seats: Object.entries(starts).map(([s, st]) => ({ seat: s, ...st })) } };
}

const game = recordedGame(4000, 2);

/** Every chunk's frames and marks, as the page would load them. */
const loaded = game.chunks.map((chunk, n, all) => {
  const frames = rebuildHistory(chunk.entries.map((e) => e.history));
  return { chunk, frames, before: n === 0 ? undefined : all[n - 1] && rebuildHistory(all[n - 1]!.entries.map((e) => e.history)).at(-1)!.view };
});

describe("stepMarks", () => {
  it("marks exactly the steps that add a line or a message or start a cycle, over a recorded 16-seat game", () => {
    expect(game.views.length, "about the measured game's size").toBeGreaterThan(1500);
    expect(game.views.at(-1)!.cycle - game.launch.cycle, "cycles passed").toBeGreaterThan(8);
    const marks: Mark[] = loaded.flatMap(({ chunk, frames, before }) => stepMarks(frames, chunk.info.firstInput, before));
    const byStep = new Map(marks.map((m) => [m.step, m]));
    expect(byStep.size, "one mark per step at most").toBe(marks.length);
    let empty = 0;
    game.views.forEach((view, n) => {
      // The oracle: id sets, not the highest id. A restart's base is the view before the input.
      const frame = loaded.flatMap((l) => l.frames)[n]!;
      const prev = frame.base ?? (n === 0 ? game.launch : game.views[n - 1]!);
      const ids = (v: FullView, k: "log" | "chat") => new Set(v[k].map((e) => e.id));
      const added = (k: "log" | "chat") => [...ids(view, k)].some((id) => !ids(prev, k).has(id));
      const event = added("log") || added("chat") || view.cycle > prev.cycle;
      if (!event) empty++;
      expect(byStep.has(n), `step ${n}`).toBe(event);
    });
    expect(empty, "some steps change nothing visible").toBeGreaterThan(100);
    const kinds = new Set(marks.map((m) => m.kind));
    for (const k of ["cycle", "chat", "other"] as const) expect(kinds, k).toContain(k);
    // A whole recorded game: about 6.6s under full-suite load, past Vitest's 5s default; about three times that since
    // every AP and MP change logs a line (2026-11-27), as this game runs the default config.
  }, 45_000);

  it("marks a chunk's first step as its cycle, with or without the chunk before", () => {
    for (const { chunk, frames, before } of loaded.slice(1)) {
      const [withBefore, without] = [stepMarks(frames, chunk.info.firstInput, before), stepMarks(frames, chunk.info.firstInput, undefined, chunk.info.from)];
      expect(without).toEqual(withBefore);
      expect(without[0]?.step).toBe(chunk.info.firstInput);
    }
  });

  const base = game.views[50]!;
  const entry = (id: number, key: string): LogEntry => ({ id, cycle: base.cycle, key, visibleTo: "all" });
  const withLog = (log: LogEntry[]): FullView => ({ ...base, log });

  it("compares ids, not lengths: a trim that drops lines in the step that adds one", () => {
    const a = withLog([entry(1, "a"), entry(2, "b"), entry(3, "c")]);
    const trimmedAndAdded = withLog([entry(3, "c"), entry(4, "died")]);
    const trimmedOnly = withLog([entry(3, "c")]);
    expect(stepMarks([{ view: a }, { view: trimmedAndAdded }], 10)).toContainEqual({ step: 11, kind: "death" });
    expect(stepMarks([{ view: a }, { view: trimmedOnly }], 10).some((m) => m.step === 11)).toBe(false);
    // Same length as before, one line more: still a mark.
    expect(stepMarks([{ view: a }, { view: withLog([entry(2, "b"), entry(3, "c"), entry(4, "fireExtinguished")]) }], 0)).toContainEqual({ step: 1, kind: "fire" });
  });

  it("without the chunk before, tells a first step's lines by their server stamp: a death at the cycle change carries the old cycle", () => {
    const old = { ...entry(1, "a"), at: 100 };
    const died = { ...entry(2, "died"), cycle: base.cycle - 1, at: 200 };
    const frames = [{ view: withLog([old, died]) }];
    expect(stepMarks(frames, 5, undefined, 200)).toEqual([{ step: 5, kind: "death" }]);
    // No stamp to go by (an older game): only lines of its own cycle count.
    expect(stepMarks(frames, 5)).toEqual([{ step: 5, kind: "cycle" }]);
  });

  it("marks a fire starting or going out, not each cycle it burns", () => {
    const a = withLog([entry(1, "a")]);
    expect(stepMarks([{ view: a }, { view: withLog([entry(1, "a"), entry(2, "ignited")]) }], 0)).toContainEqual({ step: 1, kind: "fire" });
    expect(stepMarks([{ view: a }, { view: withLog([entry(1, "a"), entry(2, "fireBurns")]) }], 0)).toContainEqual({ step: 1, kind: "other" });
  });

  it("never marks a room restart's base, only the input's own change", () => {
    const a = withLog([entry(1, "a")]);
    const loadedLater = withLog([entry(1, "a"), entry(2, "converted")]);
    const frames: HistoryFrame[] = [{ view: a }, { base: loadedLater, view: loadedLater }, { view: withLog([...loadedLater.log, entry(3, "x")]) }];
    expect(stepMarks(frames, 0).filter((m) => m.step > 0)).toEqual([{ step: 2, kind: "other" }]);
  });
});

/**
 * Four seats with no hunters or incidents, so the ship lives on, and a log window of 1 cycle (2 with Tracker), so a short
 * game outlives it: pruning works the same at any window, and the default 16 cycles took a 4000-step game (7s).
 */
const quiet: GameSetup = {
  ...big,
  seats: big.seats.slice(0, 4),
  config: testConfig({ manualCycles: true, logWindow: { cycles: 1, tracker: 2 } }),
};

describe("pruned log lines (#365)", () => {
  it("are all still in the replay's streams after the rules dropped them from the state", () => {
    const short = recordedGame(1000, 3, quiet);
    const final = short.states.at(-1)!;
    const written = final.nextLogId - 1;
    // Not vacuous: the game outlived even Tracker's window, so pruning dropped lines.
    expect(final.cycle).toBeGreaterThan(final.config.logWindow.tracker + 1);
    expect(final.log.length).toBeLessThan(written);
    let streams = streamsOf(short.launch);
    for (const chunk of short.chunks) for (const { view } of rebuildHistory(chunk.entries.map((e) => e.history))) streams = mergeStreams(streams, view);
    expect(streams.log.map((e) => e.id)).toEqual(Array.from({ length: written }, (_, i) => i + 1));
  });
});

describe("lineStep", () => {
  it("finds the step that first holds a line or a message, across chunks", () => {
    const end = game.views.at(-1)!;
    const picks = [...end.log.filter((_, i) => i % 97 === 5), ...end.chat.slice(0, 5)];
    expect(picks.length).toBeGreaterThan(5);
    for (const e of picks) {
      const kind = "key" in e ? "log" : "chat";
      const found = loaded.map(({ chunk, frames }) => lineStep(frames, kind, e.id, chunk.info.firstInput)).find((s) => s !== null);
      const holds = (v: FullView) => (v[kind] as { id: number }[]).some((x) => x.id === e.id);
      const first = game.views.findIndex(holds);
      expect(found, `${kind} ${e.id}`).toBe(holds(game.launch) ? -1 : first);
    }
  });

  it("is one before the chunk for a line the launch state already holds, and null for one never written", () => {
    const { chunk, frames } = loaded[0]!;
    expect(lineStep(frames, "log", game.launch.log[0]!.id, chunk.info.firstInput)).toBe(-1);
    expect(lineStep(frames, "log", 1e9, chunk.info.firstInput)).toBeNull();
  });
});

describe("revealFor", () => {
  // Late in the game, with crew alive in several rooms.
  const full = game.views.findLast((v) => new Set(v.players.filter((p) => p.alive).map((p) => p.room)).size > 2)!;
  const seats = full.players.map((p) => p.mind);
  /** The view without what all-seeing replaces. */
  const rest = ({ log: _l, chat: _c, readChannels: _r, privateChannels: _p, plans: _pl, threads: _t, sharedPlanets: _s, ...v }: PlayerView) => v;

  it("is the seat's own view plus lines and messages only", () => {
    for (const s of seats) {
      const own = perspective(full, s);
      const { view } = revealFor(full, s);
      expect(rest(view)).toEqual(rest(own));
      const ids = new Set(view.log.map((e) => e.id));
      for (const e of own.log) expect(ids.has(e.id), `${s} keeps line ${e.id}`).toBe(true);
      const msgs = new Set(view.chat.map((m) => m.id));
      for (const m of own.chat) expect(msgs.has(m.id)).toBe(true);
      expect(view.chat.map((m) => m.id)).toEqual(full.chat.map((m) => m.id));
    }
  });

  it("adds every hidden line of the followed room and the seat's own, never another room's", () => {
    const follow = full.players.find((p) => p.alive)!;
    const other = full.players.find((p) => p.alive && p.room !== follow.room)!;
    const someone = full.players.find((p) => p.id !== follow.id)!;
    let id = full.nextLogId;
    const line = (over: Partial<LogEntry>): LogEntry => ({ id: id++, cycle: full.cycle, key: "test", visibleTo: "all", ...over });
    const hereSecret = line({ room: follow.room, visibleTo: [someone.id] });
    const elsewherePublic = line({ room: other.room });
    const elsewhereHidden = line({ room: other.room, visibleTo: [other.id] });
    const ownElsewhere = line({ room: other.room, visibleTo: [follow.id] });
    const withLines = { ...full, log: [...full.log, hereSecret, elsewherePublic, elsewhereHidden, ownElsewhere] };
    const { view, reveal } = revealFor(withLines, follow.mind);
    const ids = new Set(view.log.map((e) => e.id));
    expect(ids.has(hereSecret.id)).toBe(true);
    expect(ids.has(ownElsewhere.id)).toBe(true);
    expect(ids.has(elsewherePublic.id)).toBe(false);
    expect(ids.has(elsewhereHidden.id)).toBe(false);
    expect(reveal.seenBy.log[hereSecret.id]).toEqual([someone.id]);
    expect(reveal.seenBy.log).not.toHaveProperty(String(elsewhereHidden.id));
  });

  it("shows every line the streams hold for the room, after the full view dropped them", () => {
    const follow = full.players.find((p) => p.alive)!;
    const earlier = full.log.filter((e) => e.room === follow.room);
    const dropped = { ...full, log: full.log.filter((e) => !earlier.includes(e)) };
    const streams = mergeStreams(streamsOf(full), dropped);
    const ids = new Set(revealFor(dropped, follow.mind, streams).view.log.map((e) => e.id));
    for (const e of earlier) expect(ids.has(e.id)).toBe(true);
    expect(new Set(revealFor(dropped, follow.mind).view.log.map((e) => e.id)).has(earlier[0]!.id)).toBe(false);
  });

  it("reveals each body's role, private stats, inventory and contamination", () => {
    const { reveal } = revealFor(full, seats[0]!);
    expect(Object.keys(reveal.seats).sort()).toEqual(full.players.map((p) => p.id).sort());
    for (const p of full.players) {
      const r = reveal.seats[p.id]!;
      expect(r.seat).toBe(p.mind);
      expect(r.you.role).toBe(p.role);
      expect(r.you.hp).toBe(p.hp);
      expect(r.contamination).toBe(full.contamination[p.id] ?? 0);
      expect(r.inventory).toEqual(perspective(full, p.mind).inventory);
    }
    const mush = full.players.filter((p) => p.role === "mush").map((p) => p.id);
    for (const m of full.chat.filter((c) => c.channel === "mush")) expect(reveal.seenBy.chat[m.id]).toEqual(mush);
    for (const m of full.chat.filter((c) => c.channel === "global")) expect(reveal.seenBy.chat).not.toHaveProperty(String(m.id));
  });
});

describe("seatsAt", () => {
  it("follows a seat across a Transfer between two frames", () => {
    const state = game.states[100]!;
    const index: Pick<ReplayIndex, "seats"> = game.index;
    const before = seatsAt(fullViewFor(state, null), index);
    expect(before.every((s) => !s.moved && s.body === s.seat && s.character === s.start)).toBe(true);
    const after = structuredClone(state);
    const [a, b] = [after.players[0]!, after.players[1]!];
    swapMinds(after, a, b);
    const seats = seatsAt(fullViewFor(after, null), index);
    expect(seats.map((s) => s.seat)).toEqual(index.seats.map((s) => s.seat));
    expect(seats[0]).toEqual({ seat: "p0", body: "p1", character: CHARACTERS[1]!.id, start: CHARACTERS[0]!.id, moved: true });
    expect(seats[1]).toEqual({ seat: "p1", body: "p0", character: CHARACTERS[0]!.id, start: CHARACTERS[1]!.id, moved: true });
    expect(seats.slice(2).every((s) => !s.moved)).toBe(true);
  });

  it("leaves out a seat still to board", () => {
    const state = game.states[0]!;
    const fewer = { ...fullViewFor(state, null), players: state.players.slice(0, 3) };
    expect(seatsAt(fewer, game.index).map((s) => s.seat)).toEqual(["p0", "p1", "p2"]);
  });
});
