// Pure game rules: no I/O, no clocks, no Math.random. All randomness goes
// through the seeded RNG stored in the state.
//
// SKELETON: movement (AP/MP), cycle advancement, the room log, chat channels,
// and HP/morale values (shown, but nothing changes them yet) exist.
// Infection, voting, win conditions, and the real turn structure are open
// decisions — do not add them without confirming the rules first.

import { ACTIONS, type ActionDef } from "./actions.ts";
import { equipmentName } from "./equipment.ts";
import { ITRACKIE_ITEM, itemName, itemsIn } from "./items.ts";
import { apGain, inventorySlots, movementRules } from "./modifiers.ts";
import { shuffle } from "./rng.ts";
import { CHAT_CHANNELS } from "./types.ts";
import type {
  Action,
  ChatChannel,
  Equipment,
  EquipmentView,
  GameConfig,
  GameState,
  ItemState,
  ItemView,
  PlayerId,
  PlayerState,
  PlayerView,
  Seat,
} from "./types.ts";

/** Longest chat message the rules accept. Moderation trims before this. */
export const MAX_CHAT_LENGTH = 300;
/** Per channel, older chat is dropped so stored state stays bounded. */
export const CHAT_HISTORY = 200;

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
    ap: config.startAp,
    mp: 0,
    hp: config.startHp,
    morale: config.startMorale,
    modifiers: [],
    alive: true,
    ready: false,
  }));

  const starts: Omit<ItemState, "id">[] = [
    ...config.startItems.map((it): Omit<ItemState, "id"> => ({ type: it.type, at: { kind: "room", id: it.room } })),
    ...players.flatMap((p) => config.startInventory.map((type): Omit<ItemState, "id"> => ({ type, at: { kind: "player", id: p.id } }))),
  ];
  const items: ItemState[] = starts.map((it, i) => ({ id: `item-${i + 1}`, ...it }));

  return {
    config,
    rng,
    cycle: 1,
    phase: "playing",
    players,
    items,
    nextItemId: items.length + 1,
    log: [{ cycle: 1, text: "The crew wakes up aboard the ship.", visibleTo: "all" }],
    chat: [],
    nextChatId: 1,
  };
}

export function legalActions(state: GameState, playerId: PlayerId): Action[] {
  const p = findPlayer(state, playerId);
  if (!p || !canAct(state, p)) return [];
  return Object.values(ACTIONS).flatMap((def: ActionDef<Action>) =>
    def.candidates(state, p).filter((a) => def.check(state, p, a) === null),
  );
}

export function applyAction(state: GameState, playerId: PlayerId, action: Action): ActionResult {
  const p = findPlayer(state, playerId);
  const def: ActionDef<Action> | undefined = ACTIONS[action.type];
  if (!p || !canAct(state, p) || !def || def.check(state, p, action) !== null) return { ok: false, error: "Illegal action" };

  const cost = def.cost(state, p, action);
  const next = clone(state);
  const actor = findPlayer(next, playerId)!;
  actor.ap -= cost.ap;
  actor.mp -= cost.mp;
  def.apply(next, actor, action);
  if (next.players.every((pl) => !pl.alive || pl.ready)) advanceCycle(next);
  return { ok: true, state: next };
}

/** Mutates a state that the caller already cloned. */
function advanceCycle(state: GameState): void {
  state.cycle += 1;
  for (const p of state.players) {
    p.ap = Math.min(state.config.maxAp, p.ap + apGain(state, p));
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
    inventory: itemsIn(state, { kind: "player", id: you.id }).map(itemView),
    inventorySlots: inventorySlots(state, you),
    roomItems: itemsIn(state, { kind: "room", id: you.room }).map(itemView),
    roomEquipment: (state.config.equipment[you.room] ?? []).map(equipmentView),
    log: state.log.filter((e) =>
      e.visibleTo === "all" ? e.room === undefined || e.room === you.room : e.visibleTo.includes(playerId),
    ),
    chat: state.chat.filter((m) => chatChannels(state, you).includes(m.channel)),
    chatChannels: chatChannels(state, you),
    movement: movementRules(state, you),
    maxAp: state.config.maxAp,
    maxHp: state.config.maxHp,
    maxMorale: state.config.maxMorale,
    legalActions: legalActions(state, playerId),
  };
}

function itemView({ id, type }: ItemState): ItemView {
  return { id, type, name: itemName(type) };
}

function equipmentView({ id, type }: Equipment): EquipmentView {
  return { id, type, name: equipmentName(type) };
}

// ---- Chat -----------------------------------------------------------------
// Not an Action: free text can't be enumerated in legalActions. Moderation
// (filtering, rate limits) is the server's job before calling this.

/**
 * Channels a player may read and post to. Global chat and every feature thread
 * need an iTrackie in your inventory (confirmed 2026-10-13); drop it and you
 * lose them, pick one up and you see the whole history.
 */
export function chatChannels(state: GameState, player: Readonly<PlayerState>): ChatChannel[] {
  if (state.phase !== "playing" || !player.alive) return [];
  const hasITrackie = itemsIn(state, { kind: "player", id: player.id }).some((i) => i.type === ITRACKIE_ITEM);
  return hasITrackie ? [...CHAT_CHANNELS] : [];
}

export function sendChat(state: GameState, playerId: PlayerId, channel: ChatChannel, text: string): ActionResult {
  const p = findPlayer(state, playerId);
  if (!p) return { ok: false, error: "Unknown player" };
  if (!chatChannels(state, p).includes(channel)) return { ok: false, error: "You can't post there" };
  const body = text.trim();
  if (!body) return { ok: false, error: "Empty message" };
  if (body.length > MAX_CHAT_LENGTH) return { ok: false, error: "Message too long" };

  const next = clone(state);
  next.chat.push({ id: next.nextChatId++, cycle: next.cycle, channel, from: p.id, name: p.name, isBot: p.isBot, text: body });
  // Trim per channel, so a busy global chat can't push the feature threads out.
  if (next.chat.filter((m) => m.channel === channel).length > CHAT_HISTORY) {
    next.chat.splice(next.chat.findIndex((m) => m.channel === channel), 1);
  }
  return { ok: true, state: next };
}

/** GameState is plain JSON by design, so a JSON round-trip is a full deep copy. */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Alive, not done for the cycle, and the game is running. */
function canAct(state: Readonly<GameState>, p: Readonly<PlayerState>): boolean {
  return p.alive && !p.ready && state.phase === "playing";
}

function findPlayer(state: GameState, id: PlayerId): PlayerState | undefined {
  return state.players.find((p) => p.id === id);
}

