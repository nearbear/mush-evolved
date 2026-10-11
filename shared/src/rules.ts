// Pure game rules: no I/O, no clocks, no Math.random. All randomness goes
// through the seeded RNG stored in the state.
//
// SKELETON: only movement, action points, and cycle advancement exist.
// Infection, voting, win conditions, and the real turn structure are open
// decisions — do not add them without confirming the rules first.

import { shuffle } from "./rng.ts";
import type { Action, GameConfig, GameState, PlayerId, PlayerState, PlayerView, Seat } from "./types.ts";

export type ActionResult = { ok: true; state: GameState } | { ok: false; error: string };

export function createGame(seats: readonly Seat[], config: GameConfig, seed: number): GameState {
  if (config.mushCount >= seats.length) throw new Error("mushCount must be less than seat count");
  if (new Set(seats.map((s) => s.id)).size !== seats.length) throw new Error("duplicate seat ids");

  const [shuffled, rng] = shuffle(seats, seed);
  const mushIds = new Set(shuffled.slice(0, config.mushCount).map((s) => s.id));

  const players: PlayerState[] = seats.map((s) => ({
    ...s,
    role: mushIds.has(s.id) ? "mush" : "human",
    room: config.startRoom,
    ap: config.apPerCycle,
    alive: true,
    ready: false,
  }));

  return {
    config,
    rng,
    cycle: 1,
    phase: "playing",
    players,
    log: [{ cycle: 1, text: "The crew wakes up aboard the ship.", visibleTo: "all" }],
  };
}

export function legalActions(state: GameState, playerId: PlayerId): Action[] {
  const p = findPlayer(state, playerId);
  if (!p || !p.alive || p.ready || state.phase !== "playing") return [];
  const actions: Action[] = [{ type: "ready" }];
  if (p.ap >= state.config.moveCost) {
    for (const to of state.config.rooms[p.room] ?? []) actions.push({ type: "move", to });
  }
  return actions;
}

export function applyAction(state: GameState, playerId: PlayerId, action: Action): ActionResult {
  const legal = legalActions(state, playerId);
  if (!legal.some((a) => sameAction(a, action))) return { ok: false, error: "Illegal action" };

  const next = clone(state);
  const p = findPlayer(next, playerId)!;

  switch (action.type) {
    case "move": {
      p.ap -= next.config.moveCost;
      p.room = action.to;
      // TODO(rules): who can see movement? Public for now.
      next.log.push({ cycle: next.cycle, text: `${p.name} moved to ${action.to}.`, visibleTo: "all" });
      break;
    }
    case "ready": {
      p.ready = true;
      break;
    }
  }

  if (next.players.every((pl) => !pl.alive || pl.ready)) advanceCycle(next);
  return { ok: true, state: next };
}

/** Mutates a state that the caller already cloned. */
function advanceCycle(state: GameState): void {
  state.cycle += 1;
  for (const p of state.players) {
    p.ap = state.config.apPerCycle;
    p.ready = false;
  }
  state.log.push({ cycle: state.cycle, text: `Cycle ${state.cycle} begins.`, visibleTo: "all" });
}

/**
 * The only way game data leaves the server. Everything hidden (other players'
 * roles, private log entries, RNG state) must be stripped here.
 */
export function viewFor(state: GameState, playerId: PlayerId): PlayerView {
  const you = findPlayer(state, playerId);
  if (!you) throw new Error(`Unknown player ${playerId}`);
  return {
    you: { ...you },
    // TODO(rules): should Mush see each other's roles? Hidden for now.
    players: state.players
      .filter((p) => p.id !== playerId)
      .map(({ id, name, isBot, character, room, alive, ready }) => ({ id, name, isBot, character, room, alive, ready })),
    cycle: state.cycle,
    phase: state.phase,
    rooms: state.config.rooms,
    log: state.log.filter((e) => e.visibleTo === "all" || e.visibleTo.includes(playerId)),
    legalActions: legalActions(state, playerId),
  };
}

/** GameState is plain JSON by design, so a JSON round-trip is a full deep copy. */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function findPlayer(state: GameState, id: PlayerId): PlayerState | undefined {
  return state.players.find((p) => p.id === id);
}

function sameAction(a: Action, b: Action): boolean {
  if (a.type !== b.type) return false;
  return a.type !== "move" || a.to === (b as typeof a).to;
}
