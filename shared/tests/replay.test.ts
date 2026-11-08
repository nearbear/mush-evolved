import { isDeepStrictEqual } from "node:util";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { rebuildGame, replayGame, startGame, type Input } from "../src/replay.ts";
import { swapMinds } from "../src/mind.ts";
import { viewFor } from "../src/rules.ts";
import { fullViewFor, perspective, seatStarts, type FullView, type SeatStarts } from "../src/fullView.ts";
import { applyDiff, diffView, type ViewDiff } from "../src/viewDiff.ts";
import { HISTORY_VERSION, HistoryError, historyStep, readFrame, rebuildHistory, type BuildStamp, type HistoryStep } from "../src/viewHistory.ts";
import { MIN_STATE_VERSION, normalizeFullView, STATE_VERSION } from "../src/normalizeState.ts";
import { ChunkBuilder, chunkHistory, replayIndex, replayKeys } from "../src/replayChunks.ts";
import type { GameState, PlayerView, SeatView } from "../src/types.ts";
import { play, preselectionSetup, setup } from "./randomGame.ts";

/** The build the tests record history as. */
const BUILD: BuildStamp = { stateVersion: STATE_VERSION, rulesVersion: "test" };

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

/** A seat view as the live game sends it: the same, without log ids. */
const live = (v: SeatView): PlayerView => ({ ...v, log: v.log.map(({ id: _id, ...line }) => line), chat: v.chat.map(({ id: _id, ...line }) => line) });

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
          const [rebuilt, real] = [perspective(full, p.mind), viewFor(s, p.id)];
          // The fast check first; expect only to show the difference.
          if (!isDeepStrictEqual(live(rebuilt), real)) expect(live(rebuilt)).toStrictEqual(real);
          // The replay keys lines by id; the live view must never carry one (a gap would show a hidden line).
          if (rebuilt.log.some((e) => typeof e.id !== "number")) expect(rebuilt.log).toEqual([]);
          if (real.log.some((e) => "id" in e)) expect(real.log).toEqual([]);
          // Chat the same way: by channel and seq (#355).
          if (rebuilt.chat.some((m) => typeof m.id !== "number")) expect(rebuilt.chat).toEqual([]);
          if (real.chat.some((m) => "id" in m)) expect(real.chat).toEqual([]);
        }
      });
      expect(state.preselection, "the Mush were chosen").toBe(false);
      cycles.push(state.cycle);
    }
    expect(cycles[1], "the game got past a day").toBeGreaterThan(DEFAULT_CONFIG.cyclesPerDay);
  }, 30_000);

  it("follows the seat (mind) across a Transfer, not the old body", () => {
    const { state } = play(50, 6);
    const starts = seatStarts(state);
    const [a, b] = [state.players[0]!, state.players[1]!];
    swapMinds(state, a, b);
    const full = fullViewFor(state, starts);
    // Seat p0 now plays body p1, and seat p1 plays body p0.
    expect(live(perspective(full, "p0"))).toEqual(viewFor(state, "p1"));
    expect(live(perspective(full, "p1"))).toEqual(viewFor(state, "p0"));
  });

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

  it("throws HistoryError when an older full view's shape is incompatible with viewFor", () => {
    const { state } = play(5, 2);
    const full = fullViewFor(state, seatStarts(state));
    // Simulate an older FullView missing a nested config block that viewFor reads.
    delete (full as { config?: unknown }).config;
    expect(() => perspective(full, "p0")).toThrow(HistoryError);
    // An unknown seat still throws the ordinary error.
    expect(() => perspective(fullViewFor(state, seatStarts(state)), "p99")).toThrow("Unknown player p99");
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
        history.push(JSON.parse(JSON.stringify(historyStep(restarted ? null : prev, () => loaded, next, i % 50 === 0, BUILD))) as HistoryStep);
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

  it("stamps the build on every copy, and each frame carries the stamp of the copy it continues from (#384)", () => {
    const [a, b, c] = [play(5, 2).state, play(10, 2).state, play(15, 2).state].map((s) => fullViewFor(s, null)) as [FullView, FullView, FullView];
    const older: BuildStamp = { stateVersion: STATE_VERSION, rulesVersion: "old" };
    const full = historyStep(null, () => a, a, true, older);
    const change = historyStep(a, () => a, b, false, older);
    const base = historyStep(null, () => b, c, false, BUILD);
    expect(full).toMatchObject({ full: a, build: older });
    expect(change).not.toHaveProperty("build");
    expect(base).toMatchObject({ base: b, build: BUILD });
    expect(rebuildHistory([full, change, base]).map((f) => f.build)).toEqual([older, older, BUILD]);
    // Copies recorded before stamps existed.
    const { build: _f, ...unstampedFull } = full as { v: number; full: FullView; build?: BuildStamp };
    const { build: _b, ...unstampedBase } = base as { v: number; base: FullView; build?: BuildStamp };
    expect(rebuildHistory([unstampedFull, change, unstampedBase]).map((f) => f.build)).toEqual([null, null, null]);
  });

  it("reads a frame in this build's shape, once, without changing it (#384)", () => {
    const view = JSON.parse(JSON.stringify(fullViewFor(play(40, 3).state, null))) as FullView;
    const before = JSON.parse(JSON.stringify(view)) as FullView;
    const read = readFrame({ view, build: BUILD });
    expect(read).toEqual(normalizeFullView(view));
    expect(readFrame({ view, build: BUILD })).toBe(read);
    expect(view).toEqual(before);
    // A frame recorded before stamps is read as the oldest version this build reads.
    const unstamped = JSON.parse(JSON.stringify(view)) as FullView;
    expect(readFrame({ view: unstamped, build: null })).toEqual(read);
    expect(MIN_STATE_VERSION).toBeLessThanOrEqual(STATE_VERSION);
  });

  it("turns a frame this build can't read into a HistoryError: too new, or a shape the normalizers reject (#384)", () => {
    const view = fullViewFor(play(5, 2).state, null);
    expect(() => readFrame({ view, build: { stateVersion: STATE_VERSION + 1, rulesVersion: "next" } })).toThrow(HistoryError);
    const { players: _players, ...broken } = view;
    expect(() => readFrame({ view: broken as FullView, build: BUILD })).toThrow(/FullView|GameState|players/);
    expect(() => readFrame({ view: broken as FullView, build: BUILD })).toThrow(HistoryError);
  });

  it("refuses a history in another format version, or a change with nothing before it", () => {
    const { state } = play(5, 2);
    const full = fullViewFor(state, null);
    expect(() => rebuildHistory([{ v: HISTORY_VERSION + 1, full }])).toThrow(HistoryError);
    expect(() => rebuildHistory([{ diff: { k: "s", v: full } }])).toThrow(HistoryError);
  });
});

describe("replay chunks (#336)", () => {
  /** A random game's history as the server records it: a copy at the first input, at each restart and each cycle. */
  function recorded(steps: number, seed: number) {
    let starts: SeatStarts | null = null;
    let prev: FullView | null = null;
    let before = fullViewFor(startGame(setup), null);
    const record: { at: number; history: HistoryStep; cycle: boolean }[] = [];
    let i = 0;
    const { record: inputs } = play(steps, seed, setup, (s) => {
      if (starts === null && !s.preselection) starts = seatStarts(s);
      const next = fullViewFor(s, starts);
      const loaded = before;
      const cycle = i % 60 === 59;
      record.push({ at: 0, history: JSON.parse(JSON.stringify(historyStep(i % 100 === 37 ? null : prev, () => loaded, next, cycle, BUILD))) as HistoryStep, cycle });
      prev = before = next;
      i++;
    });
    inputs.forEach((r, n) => (record[n]!.at = r.at));
    return record;
  }

  it("splits at every full copy, each chunk rebuilds by itself, and together they rebuild the whole history", () => {
    const record = recorded(600, 3);
    const chunks = chunkHistory(record);
    expect(chunks).toHaveLength(1 + record.filter((r) => r.cycle).length);
    expect(chunks.reduce((n, c) => n + c.entries.length, 0)).toBe(record.length);
    const whole = rebuildHistory(record.map((r) => r.history));
    let at = 0;
    for (const chunk of chunks) {
      expect(chunk.info.firstInput).toBe(at);
      expect(chunk.info.inputs).toBe(chunk.entries.length);
      expect(chunk.info.from).toBe(record[at]!.at);
      expect(chunk.info.to).toBe(record[at + chunk.entries.length - 1]!.at);
      const frames = rebuildHistory(JSON.parse(JSON.stringify(chunk.entries.map((e) => e.history))) as HistoryStep[]);
      expect(chunk.info.cycle).toBe((frames[0]!.base ?? frames[0]!.view).cycle);
      frames.forEach((f, n) => expect(f.view, `input ${at + n}`).toEqual(whole[at + n]!.view));
      at += chunk.entries.length;
    }
  }, 15_000);

  it("copies only the time and the history of each input", () => {
    const record = recorded(40, 5).map((r) => ({ ...r, input: { type: "tick", at: r.at }, raw: "secret", chatId: 1 }));
    for (const chunk of chunkHistory(record)) for (const e of chunk.entries) expect(Object.keys(e).sort()).toEqual(["at", "history"]);
  });

  it("refuses a record without history, in another format, or starting with a change", () => {
    const { state } = play(5, 2);
    const full = fullViewFor(state, null);
    expect(() => chunkHistory([{ at: 0 }])).toThrow(HistoryError);
    expect(() => chunkHistory([{ at: 0, history: { v: HISTORY_VERSION + 1, full } }])).toThrow(HistoryError);
    expect(() => new ChunkBuilder().add(0, { at: 0, history: {} })).toThrow(HistoryError);
  });

  it("indexes seats in order without names, and keys depend only on the room", () => {
    const index = replayIndex(
      { roomId: "r1", rulesVersion: "abc", endedAt: 9, starts: { p10: { role: "human", character: "chun" }, p2: { role: "mush", character: "chao" } } },
      [],
    );
    expect(index).toEqual({
      v: HISTORY_VERSION,
      roomId: "r1",
      rulesVersion: "abc",
      stateVersion: STATE_VERSION,
      endedAt: 9,
      seats: [{ seat: "p2", role: "mush", character: "chao" }, { seat: "p10", role: "human", character: "chun" }],
      chunks: [],
    });
    expect(replayKeys.chunk("r1", 3)).toBe("replays/r1/chunk-000003.json.gz");
    expect(replayKeys.index("r1")).toBe("replays/r1/index.json");
  });
});
