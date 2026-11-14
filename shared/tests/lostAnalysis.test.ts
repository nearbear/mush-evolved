import { describe, expect, it } from "vitest";
import { applyXyloph, XYLOPH_DROP_ROOM } from "../src/comms.ts";
import { DEFAULT_CONFIG, PRESELECTION } from "../src/config.ts";
import { killPlayer } from "../src/death.ts";
import { convert, cure } from "../src/infection.ts";
import { DOCUMENT_ITEM, rollAtSelection, rollLostAnalysis } from "../src/lostAnalysis.ts";
import { swapMinds } from "../src/mind.ts";
import { normalizeGame } from "../src/normalizeState.ts";
import { joinShip, preselectionDeadline } from "../src/preselection.ts";
import { streamFor } from "../src/rng.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import type { GameConfig, GameState, ItemState } from "../src/types.ts";
import { clone, makeSeats, must, nextCycle, noHunters, noIncidents, offered, player } from "./support.ts";

const config: GameConfig = noIncidents(noHunters(DEFAULT_CONFIG));
const perMush = DEFAULT_CONFIG.comms.xyloph.lostAnalysisPerMush;
const negatives = (s: GameState) => s.lostAnalysis.rows!.filter((r) => r.negative).map((r) => r.character);
const mushBodies = (s: GameState) => s.players.filter((p) => p.role === "mush").map((p) => p.character);

/** A 16-seat ship launched without pre-selection (2 Mush). */
const ship = (seed = 5) => createGame(makeSeats(16), config, seed);

/** A small pre-selection ship, joined by `n` seats and run to the Mush selection. */
function selected(n: number, seed = 7): GameState {
  const rules = { ...PRESELECTION, seats: n };
  let s = createGame([], { ...config, preselection: rules }, seed);
  for (const seat of makeSeats(n)) s = must(joinShip(s, seat));
  const deadline = preselectionDeadline(s, rules);
  while (s.preselection && s.cycle <= deadline) s = nextCycle(s);
  return s;
}

/** Prints the analysis on the bridge and returns the document. */
function print(s: GameState): ItemState {
  const before = s.items.length;
  applyXyloph(s, "LOST_ANALYSIS");
  const [doc, ...rest] = s.items.slice(before);
  expect(rest).toEqual([]);
  return doc!;
}

describe("Finola's lost analysis (#394)", () => {
  it("marks floor(starting Mush × 2.5) negative", () => {
    expect(perMush).toBe(2.5);
    const s = ship();
    expect(mushBodies(s)).toHaveLength(2);
    expect(negatives(s)).toHaveLength(5);
  });

  it("is rolled at selection in pre-selection: 1 Mush gives 2 marks, and nothing before", () => {
    const rules = { ...PRESELECTION, seats: 4 };
    const before = must(joinShip(createGame([], { ...config, preselection: rules }, 7), makeSeats(1)[0]!));
    expect(before.lostAnalysis.rows).toBeNull();
    const s = selected(4);
    expect(s.preselection).toBe(false);
    expect(mushBodies(s)).toHaveLength(1);
    expect(s.lostAnalysis.rows!.map((r) => r.character)).toEqual(s.players.map((p) => p.character));
    expect(negatives(s)).toHaveLength(2);
  });

  it("lists every character aboard and never marks a starting Mush body, for many seeds", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const s = ship(seed);
      expect(s.lostAnalysis.rows!.map((r) => r.character)).toEqual(s.players.map((p) => p.character));
      for (const c of mushBodies(s)) expect(negatives(s)).not.toContain(c);
      expect(negatives(s)).toHaveLength(5);
    }
  });

  it("is the same for a seed, and comes from its own stream", () => {
    expect(ship(9).lostAnalysis).toEqual(ship(9).lostAnalysis);
    const s = ship(9);
    const aboard = s.players.map((p) => ({ character: p.character, mush: p.role === "mush" }));
    expect(s.lostAnalysis.rows).toEqual(rollLostAnalysis({ rng: streamFor(9, "lost-analysis") }, aboard, perMush));
  });

  it("marks every eligible character when fewer are eligible than the count", () => {
    const rows = rollLostAnalysis({ rng: 1 }, [{ character: "chao", mush: true }, { character: "chun", mush: false }], 2.5);
    expect(rows).toEqual([{ character: "chao", negative: false }, { character: "chun", negative: true }]);
  });

  it("moves no other roll: rolling it changes nothing but its own state", () => {
    const s = ship();
    const a = clone(s);
    const b = clone(s);
    b.lostAnalysis.rows = null;
    rollAtSelection(b);
    expect({ ...b, lostAnalysis: null }).toEqual({ ...a, lostAnalysis: null });
  });

  it("is not changed by later deaths, conversions, cures and Transfers, and follows the bodies", () => {
    const s = ship();
    const rows = clone(s.lostAnalysis.rows);
    const humans = s.players.filter((p) => p.role === "human");
    const mush = s.players.find((p) => p.role === "mush")!;
    convert(s, humans[0]!);
    cure(s, mush);
    swapMinds(s, mush, humans[1]!);
    killPlayer(s, humans[2]!, "beaten");
    expect(s.lostAnalysis.rows).toEqual(rows);
    expect(print(s).document).toEqual({ kind: "lost_analysis", rows });
  });

  it("prints as a document on the bridge floor when drawn", () => {
    const s = ship();
    const doc = print(s);
    expect(doc).toMatchObject({ type: DOCUMENT_ITEM, at: { kind: "room", id: XYLOPH_DROP_ROOM }, document: { kind: "lost_analysis", rows: s.lostAnalysis.rows } });
  });

  it("is in no view until printed; then a reader sees only names and marks", () => {
    const s = ship();
    for (const p of s.players) p.room = XYLOPH_DROP_ROOM;
    const secret = JSON.stringify(s.lostAnalysis.rows);
    for (const p of s.players) expect(JSON.stringify(viewFor(s, p.id))).not.toContain(secret);
    const doc = print(s);
    const seen = viewFor(s, "p0").roomItems.find((i) => i.id === doc.id)!;
    expect(seen.document).toEqual({ kind: "lost_analysis", rows: s.lostAnalysis.rows });
    expect(Object.keys(seen.document!.rows[0]!).sort()).toEqual(["character", "negative"]);
    // Someone elsewhere doesn't see it.
    player(s, "p1").room = "LABORATORY";
    expect(JSON.stringify(viewFor(s, "p1"))).not.toContain(secret);
  });

  it("can be torn up for free, in hand or on the floor, with a public log line", () => {
    const s = ship();
    for (const p of s.players) p.room = XYLOPH_DROP_ROOM;
    const doc = print(s);
    const tear = { type: "tear", item: doc.id } as const;
    expect(offered(s, "p0")).toContainEqual(tear);
    const ap = player(s, "p0").ap;
    const next = must(applyAction(s, "p0", tear));
    expect(next.items.some((i) => i.id === doc.id)).toBe(false);
    expect(player(next, "p0").ap).toBe(ap);
    expect(next.log.at(-1)).toMatchObject({ key: "documentTorn", params: { name: player(s, "p0").character }, room: XYLOPH_DROP_ROOM });
    expect(next.log.at(-1)!.visibleTo).toBe("all");

    // Held works too; out of reach is refused and leaves the state alone.
    s.items.find((i) => i.id === doc.id)!.at = { kind: "player", id: "p0" };
    expect(applyAction(s, "p0", tear).ok).toBe(true);
    const before = JSON.stringify(s);
    expect(applyAction(s, "p1", tear).ok).toBe(false);
    expect(JSON.stringify(s)).toBe(before);
  });

  it("is rolled for a game stored before it existed, once the Mush are chosen", () => {
    const s = ship();
    const { config: _c, lostAnalysis: _l, ...raw } = clone(s);
    const loaded = normalizeGame(raw, {});
    expect(loaded.lostAnalysis.rows!.filter((r) => r.negative)).toHaveLength(5);
    for (const c of mushBodies(s)) expect(loaded.lostAnalysis.rows!.find((r) => r.character === c)!.negative).toBe(false);
    // Stored with it, it loads unchanged.
    const { config: _c2, ...stored } = clone(s);
    expect(normalizeGame(stored, {}).lostAnalysis).toEqual(s.lostAnalysis);
  });
});
