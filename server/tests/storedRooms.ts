// Stored rooms for the fixture tests (#384, storedRooms.test.ts): a seeded random game (#335,
// shared/tests/randomGame.ts) steered into a moment worth keeping, wrapped in the `StoredRoom` a real GameRoom writes.
// The committed fixtures were made with this and are never refreshed; the tests also run it at test time, so the
// current shape is covered as well as the past ones.

import { applyAction, applyInput, legalActions, newCycle, planetsOf, seatStarts, takeChatOutbox, type Action, type GameState, type PlayerId } from "@mush2/shared";
import { nextInt, type RngState } from "@mush2/shared";
// Test code from another package: the harness the replay tests play with, so the fixtures are games played the same way.
import { play, randomInput } from "../../shared/tests/randomGame.ts";
import type { GameRoom } from "../src/GameRoom.ts";
import { FakeStorage, seats, tokensFor } from "../src/testing/fakes.ts";

/** The moments the fixtures hold: nested objects that are `null` in one are filled in another. */
export const MOMENTS = ["arriving", "orbit", "midAction"] as const;
export type Moment = (typeof MOMENTS)[number];

const must = (r: ReturnType<typeof applyAction>): GameState => {
  if (!r.ok) throw new Error(`Generator step refused: ${r.error}`);
  return r.state;
};

/** Keeps playing random inputs from `state`, as `play` does from a launch, until `until` holds or `steps` run out. */
function playFrom(state: GameState, steps: number, rng: RngState, until: (s: GameState) => boolean = () => false): GameState {
  let now = state.now;
  for (let i = 0; i < steps && !until(state); i++) {
    let wait: number;
    [wait, rng] = nextInt(rng, 400);
    now += wait;
    let input;
    [input, rng] = randomInput(state, rng, now);
    const result = applyInput(state, input);
    if (!result.ok) continue;
    state = result.state;
    takeChatOutbox(state);
  }
  return state;
}

/**
 * The Commander (a living player given the title if it is vacant) is put at the Command terminal with AP to spare,
 * scans until they find a planet, turns the ship to face it, loads exactly the fuel to reach it, and travels: the ship
 * is arriving. Positions, AP and fuel are set by hand; everything else goes through the rules.
 */
function travel(state: GameState): GameState {
  let s = structuredClone(state);
  const alive = s.players.find((p) => p.alive)!;
  const id: PlayerId = s.titles.commander ?? alive.id;
  s.titles.commander = id;
  const ready = (g: GameState) => {
    const c = g.players.find((p) => p.id === id)!;
    Object.assign(c, { room: "COMMAND_CENTER", ap: 30, current: null, queue: [] });
    for (const key of ["spot", "lyingIn", "lyingSince", "enteredFrom"] as const) delete c[key];
    c.statuses = c.statuses.filter((status) => status !== "dirty");
    return g;
  };
  const find = (g: GameState, type: string): Action => {
    const action = legalActions(g, id).find((a) => a.type === type);
    if (!action) throw new Error(`No ${type} for ${id}`);
    return action;
  };
  for (let i = 0; planetsOf(s, id).length === 0; i++) {
    if (i > 50) throw new Error("No planet found");
    s = must(applyAction(ready(s), id, find(ready(s), "scan_planet")));
  }
  const planet = planetsOf(s, id)[0]!;
  while (s.navigation.heading !== planet.direction) s = must(applyAction(ready(s), id, { ...find(ready(s), "turn_ship"), side: "left" } as Action));
  s.ship.combustion = planet.distance;
  return must(applyAction(ready(s), id, find(ready(s), "travel")));
}

const busy = (s: GameState) => s.players.filter((p) => p.current !== null || p.queue.length > 0).length >= 2;

/** The game at `moment`, from a seeded random game of 8. */
export function gameAt(moment: Moment, seed: RngState = 11): GameState {
  const { state } = play(500, seed);
  switch (moment) {
    case "arriving":
      return travel(state);
    case "orbit": {
      const arrived = must(newCycle(travel(state)));
      if (arrived.navigation.orbit === null) throw new Error("Not in orbit");
      // More play in orbit, stopped before anyone leaves it.
      return playFrom(arrived, 200, seed, (s) => s.navigation.orbit === null);
    }
    case "midAction": {
      const s = playFrom(state, 2000, seed, busy);
      if (!busy(s)) throw new Error("Nobody mid-action");
      return s;
    }
  }
}

/**
 * The `StoredRoom` a GameRoom holding `game` writes: a real room is launched with 8 seats and its stored wrapper kept
 * (tokens, input count, ...), with the game swapped in and the flat fields a real ship fills in set (accounts, sessions,
 * language, starts). JSON, as storage gives it back. `Room` is the class the test file imported under its
 * partyserver mock.
 */
export async function storedRoom(Room: typeof GameRoom, game: GameState): Promise<Record<string, any>> {
  const storage = new FakeStorage();
  const room = new Room({ storage } as never, { RULES_VERSION: "fixture" } as never);
  await room.setup(seats(8), tokensFor(8));
  const stored = (await storage.get<Record<string, any>>("game"))!;
  const { config: _config, ...rest } = game;
  const ids = game.players.map((p) => p.id);
  return JSON.parse(
    JSON.stringify({
      ...stored,
      game: rest,
      starts: seatStarts(game),
      accounts: Object.fromEntries(ids.map((id) => [id, `account-${id}`])),
      aboard: Object.fromEntries(ids.filter((id) => game.players.find((p) => p.id === id)!.alive).map((id) => [id, `account-${id}`])),
      tokenSessions: Object.fromEntries(Object.keys(stored.tokens).map((token) => [token, `session-${token}`])),
      rateLimited: { p1: 2 },
      language: "en",
    }),
  );
}
