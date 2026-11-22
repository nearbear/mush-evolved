// The design kit's PlayerView fixture (docs/plans/archive/design-kit.md). Built from the real rules, never by hand: a
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
  createChannel,
  createGame,
  createThread,
  DEFAULT_CONFIG,
  HUNTER_TYPES,
  ITEM_TYPES,
  endGame,
  killPlayer,
  PRESELECTION,
  queueAction,
  sharePlanet,
  sendChat,
  produceItem,
  viewFor,
  type Action,
  type ActionResult,
  type ChannelId,
  type CharacterId,
  type Ending,
  type GameState,
  type Planet,
  type PlanetTag,
  type PlayerId,
  type PlayerState,
  type PlayerView,
  type PrivateChannelId,
  type Role,
  type Seat,
  type TitleId,
  type Winner,
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
  /** A ship still in pre-selection (`PRESELECTION`): nobody is Mush yet, so `role` is ignored. */
  preselection?: boolean;
}

/** A freshly launched ship (day 1, cycle 1, not in pre-selection unless asked), 16 seats with 2 Mush. */
export function sampleState({ role = "human", character = "jinsu", preselection = false }: SampleOptions = {}): GameState {
  if (preselection) return createGame(sampleSeats(character), { ...DEFAULT_CONFIG, preselection: PRESELECTION }, SEED);
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

/** `id` asks for each action in turn through the queue: the first starts, the rest wait behind it (timed actions). */
export function queue(state: GameState, actions: readonly Action[], id: PlayerId = SAMPLE_SEAT): GameState {
  return actions.reduce((s, action) => must(queueAction(s, id, action, s.now ?? 0), `queued ${action.type}`), state);
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

/** `id` stands in `room` (a direct move: no path, no MP). */
export function moveTo(state: GameState, room: string, id: PlayerId = SAMPLE_SEAT): GameState {
  const next = structuredClone(state);
  seat(next, id).room = room;
  return next;
}

/** `id` stands in the room with the first equipment of `type` (a terminal, say). Throws if the ship has none. */
export function moveToEquipment(state: GameState, type: string, id: PlayerId = SAMPLE_SEAT): GameState {
  const room = Object.keys(state.equipment).find((r) => state.equipment[r]?.some((e) => e.type === type));
  if (!room) throw new Error(`No ${type} on the ship`);
  return moveTo(state, room, id);
}

/** `id` has found `planet` at the Astro terminal (a direct edit, as the planet tests do). */
export function givePlanet(state: GameState, planet: Planet, id: PlayerId = SAMPLE_SEAT): GameState {
  const next = structuredClone(state);
  (next.planets[id] ??= []).push(planet);
  return next;
}

function must(result: ActionResult, what: string): GameState {
  if (!result.ok) throw new Error(`Sample ${what} refused: ${result.error}`);
  return result.state;
}

/** `id` posts `text` on `channel` through the chat rules (an iTrackie is needed for anything but the Mush channel). */
export function say(state: GameState, channel: ChannelId, text: string, id: PlayerId = SAMPLE_SEAT): GameState {
  return must(sendChat(state, id, channel, text), "chat");
}

/** `id` starts a thread under global chat, from global message `from` or on its own. */
export function thread(state: GameState, name: string, from?: number, id: PlayerId = SAMPLE_SEAT): GameState {
  return must(createThread(state, id, name, from), "thread");
}

/** `id` opens a private channel named `name` and invites `members` (the chat rules; refused invites are skipped). */
export function channel(state: GameState, name: string, members: readonly PlayerId[], id: PlayerId = SAMPLE_SEAT): GameState {
  return must(createChannel(state, id, name, members), "channel");
}

/** The id of the newest private channel. */
export function lastChannel(state: GameState): PrivateChannelId {
  const c = state.channels.at(-1);
  if (!c) throw new Error("No private channel");
  return c.id;
}

/**
 * Every item and piece of equipment of `types` on the ship is broken: only the flag, as `breakItem`/`breakEquipment`
 * leave it on a type that can break (no NERON line, no side effects). Throws on a type that can't break.
 */
export function breakAll(state: GameState, types: readonly string[]): GameState {
  const next = structuredClone(state);
  for (const type of types) {
    if (!ITEM_TYPES[type]?.canBreak && next.config.repair.chance[type] === undefined) throw new Error(`${type} can't break`);
  }
  for (const item of next.items) if (types.includes(item.type)) item.broken = true;
  for (const list of Object.values(next.equipment)) for (const e of list ?? []) if (types.includes(e.type)) e.broken = true;
  return next;
}

/**
 * `n` hunters attack the ship with their kind's aim, some a hit or two down so the hp differ (as the hunter tests add
 * them; no wave roll). Plain hunters, unless `mixed`, which takes the kinds in turn so every sprite shows.
 */
export function addHunters(state: GameState, n: number, mixed = false): GameState {
  const next = structuredClone(state);
  for (let i = 0; i < n; i++) {
    const type = mixed ? HUNTER_TYPES[i % HUNTER_TYPES.length]! : "hunter";
    const { hp, hitChance, countdown } = next.config.hunters.types[type];
    next.hunters.list.push({ id: `hunter-${next.hunters.nextId++}`, type, hp: Math.max(1, hp - (i % 3)), hitChance, target: null, countdown });
  }
  return next;
}

/** `id` dies (the rules' own `killPlayer`, on a copy). */
export function kill(state: GameState, id: PlayerId = SAMPLE_SEAT): GameState {
  const next = structuredClone(state);
  killPlayer(next, seat(next, id), "injury");
  return next;
}

/** A Mush took `id`'s body with Transfer, leaving them `taker`'s character to play (only the flag; no swap). */
export function bodyTaken(state: GameState, taker: CharacterId, id: PlayerId = SAMPLE_SEAT): GameState {
  const next = structuredClone(state);
  seat(next, id).bodyTakenBy = taker;
  return next;
}

/** `id` shares one of their planets in the Astrophysics feature (they must stand at an Astro terminal). */
export function share(state: GameState, planet: string, sectors: (PlanetTag | null)[], text: string, id: PlayerId = SAMPLE_SEAT): GameState {
  return must(sharePlanet(state, id, planet, sectors, text), "planet share");
}

/** The game is over: `winner` won by `ending` (the rules' own `endGame`, on a copy). */
export function ended(state: GameState, winner: Winner, ending: Ending): GameState {
  const next = structuredClone(state);
  endGame(next, winner, ending);
  return next;
}

/** What `id` sees of `state`: the same filtered view the server sends that seat. */
export function sampleView(state: GameState = sampleState(), id: PlayerId = SAMPLE_SEAT): PlayerView {
  return viewFor(state, id);
}
