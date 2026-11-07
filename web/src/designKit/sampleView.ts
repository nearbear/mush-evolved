// The design kit's PlayerView fixture (docs/plans/design-kit.md). Built from the real rules, never by hand: a
// launched 16-seat ship from `createGame`, a few changes on top, then `viewFor` for one seat. A hand-written view
// would drift every time PlayerView changes; this one cannot, and a type change breaks it at compile time.
//
// Setup goes through the rules where they have a way in (forced roles at creation, `applyAction` for skill picks,
// `produceItem` for items). Where a rule would take many steps to get there (spending exactly n AP, handing over a
// title), the helper edits the state directly, the way the rules tests set up a scenario. No cheats: they are
// test-deployment tooling with their own flags in the view, and the kit doesn't need them.
//
// Dev-only, like the rest of the kit: it never ships.

import {
  applyAction,
  CHARACTERS,
  createGame,
  DEFAULT_CONFIG,
  produceItem,
  viewFor,
  type Action,
  type CharacterId,
  type GameState,
  type PlayerId,
  type PlayerState,
  type PlayerView,
  type Role,
  type Seat,
  type TitleId,
} from "@mush2/shared";

/** The seat the kit looks through. */
export const SAMPLE_SEAT: PlayerId = "p0";

/** A fixed seed, so the ship (who else is Mush, where items lie) is the same on every load. */
const SEED = 7;

/** Sixteen seats, p0..p15, one per character: p0 plays `character`, the rest follow in roster order. */
function sampleSeats(character: CharacterId): Seat[] {
  const roster = [character, ...CHARACTERS.map((c) => c.id).filter((id) => id !== character)];
  return roster.map((id, i) => ({ id: `p${i}`, name: `Sample ${i}`, isBot: false, character: id }));
}

export interface SampleOptions {
  /** The kit seat's role. Forced at creation, as single player forces it; the other Mush seat is drawn by the seed. */
  role?: Role;
  /** The kit seat's character (Jin Su by default). */
  character?: CharacterId;
}

/** A freshly launched ship (day 1, cycle 1, not in pre-selection), 16 seats with 2 Mush. */
export function sampleState({ role = "human", character = "jinsu" }: SampleOptions = {}): GameState {
  return createGame(sampleSeats(character), DEFAULT_CONFIG, SEED, { [SAMPLE_SEAT]: role });
}

function seat(state: GameState, id: PlayerId): PlayerState {
  const p = state.players.find((q) => q.id === id);
  if (!p) throw new Error(`No seat ${id}`);
  return p;
}

/** The state after `id` does `action` through the rules (no queue, no timing). Throws if the rules refuse it. */
export function act(state: GameState, action: Action, id: PlayerId = SAMPLE_SEAT): GameState {
  const result = applyAction(state, id, action);
  if (!result.ok) throw new Error(`Sample action ${action.type} refused: ${result.error}`);
  return result.state;
}

/** `id` picks each skill in turn with `pick_skill`; each must be on their character's list. */
export function pickSkills(state: GameState, skills: readonly string[], id: PlayerId = SAMPLE_SEAT): GameState {
  return skills.reduce((s, skill) => act(s, { type: "pick_skill", skill }, id), state);
}

/** `id` gets a new item of each type: in their inventory while it has room, then on their room's floor. */
export function giveItems(state: GameState, types: readonly string[], id: PlayerId = SAMPLE_SEAT): GameState {
  const next = structuredClone(state);
  for (const type of types) produceItem(next, seat(next, id), type);
  return next;
}

/** `id` has spent `ap` action points and `mp` movement points (never below zero). */
export function spend(state: GameState, { ap = 0, mp = 0 }: { ap?: number; mp?: number }, id: PlayerId = SAMPLE_SEAT): GameState {
  const next = structuredClone(state);
  const p = seat(next, id);
  p.ap = Math.max(0, p.ap - ap);
  p.mp = Math.max(0, p.mp - mp);
  return next;
}

/** `id` holds `title`, whatever the line of succession says. */
export function giveTitle(state: GameState, title: TitleId, id: PlayerId = SAMPLE_SEAT): GameState {
  const next = structuredClone(state);
  next.titles[title] = id;
  return next;
}

/** What `id` sees of `state`: the same filtered view the server sends that seat. */
export function sampleView(state: GameState = sampleState(), id: PlayerId = SAMPLE_SEAT): PlayerView {
  return viewFor(state, id);
}
