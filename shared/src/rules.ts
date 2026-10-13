// Pure game rules: no I/O, no clocks, no Math.random. All randomness goes
// through the seeded RNG stored in the state.
//
// SKELETON: movement (AP/MP), cycle advancement, the room log, chat channels,
// and HP/morale values (shown, but nothing changes them yet) exist.
// Infection, voting, win conditions, and the real turn structure are open
// decisions — do not add them without confirming the rules first.

import { SHIP_ROOMS } from "./config.ts";
import { equipmentName } from "./equipment.ts";
import { canTransfer, ITRACKIE_ITEM, itemName, itemsIn } from "./items.ts";
import { apGain, inventorySlots, moveCost, movementRules } from "./modifiers.ts";
import { shuffle } from "./rng.ts";
import { CHAT_CHANNELS } from "./types.ts";
import type {
  Action,
  ChatChannel,
  Container,
  Equipment,
  EquipmentView,
  GameConfig,
  GameState,
  ItemState,
  ItemView,
  LogEntry,
  PlayerId,
  PlayerState,
  PlayerView,
  RoomId,
  Seat,
  Target,
} from "./types.ts";

/** Longest chat message the rules accept. Moderation trims before this. */
export const MAX_CHAT_LENGTH = 300;
/** Per channel, older chat is dropped so stored state stays bounded. */
export const CHAT_HISTORY = 200;

const ROOM_LABELS = new Map(SHIP_ROOMS.map((r) => [r.id, r.label]));

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
  if (!p || !p.alive || p.ready || state.phase !== "playing") return [];
  const actions: Action[] = [{ type: "ready" }];
  if (moveCost(movementRules(state, p), p)) {
    for (const to of state.config.rooms[p.room] ?? []) actions.push({ type: "move", to });
  }
  // Taking and dropping are free (confirmed 2026-10-11).
  const self: Container = { kind: "player", id: p.id };
  const here: Container = { kind: "room", id: p.room };
  for (const item of state.items) {
    if (canTransfer(state, p, item, self)) actions.push({ type: "take", item: item.id });
    else if (canTransfer(state, p, item, here)) actions.push({ type: "drop", item: item.id });
  }
  // Examining is free and private (confirmed 2026-10-11).
  for (const target of visibleTargets(state, p)) actions.push({ type: "examine", target });
  return actions;
}

/** Everything a player can see and so interact with: people and equipment in their room, their items and the room's. */
export function visibleTargets(state: Readonly<GameState>, player: Readonly<PlayerState>): Target[] {
  return [
    ...state.players.filter((o) => o.room === player.room).map((o): Target => ({ kind: "player", id: o.id })),
    ...(state.config.equipment[player.room] ?? []).map((e): Target => ({ kind: "equipment", id: e.id })),
    ...itemsIn(state, { kind: "player", id: player.id }).map((i): Target => ({ kind: "item", id: i.id })),
    ...itemsIn(state, { kind: "room", id: player.room }).map((i): Target => ({ kind: "item", id: i.id })),
  ];
}

/** How a target is named in log text. Only called for targets the player can see. */
function targetName(state: Readonly<GameState>, viewer: Readonly<PlayerState>, target: Target): string {
  switch (target.kind) {
    case "player":
      return target.id === viewer.id ? "yourself" : (findPlayer(state, target.id)?.name ?? target.id);
    case "equipment": {
      const e = state.config.equipment[viewer.room]?.find((eq) => eq.id === target.id);
      return `the ${equipmentName(e?.type ?? target.id)}`;
    }
    case "item": {
      const i = state.items.find((it) => it.id === target.id);
      return `the ${itemName(i?.type ?? target.id)}`;
    }
  }
}

export function applyAction(state: GameState, playerId: PlayerId, action: Action): ActionResult {
  const legal = legalActions(state, playerId);
  if (!legal.some((a) => sameAction(a, action))) return { ok: false, error: "Illegal action" };

  const next = clone(state);
  const p = findPlayer(next, playerId)!;

  switch (action.type) {
    case "move": {
      const cost = moveCost(movementRules(next, p), p)!; // legal, so affordable
      const from = p.room;
      p.ap -= cost.ap;
      p.mp = cost.mpAfter;
      p.room = action.to;
      logPublic(next, from, `${p.name} left for ${roomName(action.to)}.`);
      logPublic(next, action.to, `${p.name} entered from ${roomName(from)}.`);
      break;
    }
    case "take":
    case "drop": {
      const index = next.items.findIndex((i) => i.id === action.item); // legal, so it exists
      const [item] = next.items.splice(index, 1) as [ItemState];
      item.at = action.type === "take" ? { kind: "player", id: p.id } : { kind: "room", id: p.room };
      next.items.push(item); // newest arrivals list last in every container
      const verb = action.type === "take" ? "picked up" : "dropped";
      logPublic(next, p.room, `${p.name} ${verb} the ${itemName(item.type)}.`);
      break;
    }
    case "examine": {
      logPrivate(next, p.id, `You examine ${targetName(next, p, action.target)}.`);
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

// ---- Room log -------------------------------------------------------------
// Three kinds of entry (rules from 2026-10-11; secret handling will change):
//   public:  part of the room's history; anyone in the room sees it, then or later.
//   private: only the actor ever sees it.
//   secret:  becomes room history only if someone else was there to witness it;
//            otherwise only the actor sees it.

/** Mutates a state that the caller already cloned. */
export function logPublic(state: GameState, room: RoomId | undefined, text: string): void {
  state.log.push({ cycle: state.cycle, text, ...(room !== undefined && { room }), visibleTo: "all" });
}

/** Mutates a state that the caller already cloned. */
export function logPrivate(state: GameState, actor: PlayerId, text: string): void {
  const p = findPlayer(state, actor);
  state.log.push({ cycle: state.cycle, text, ...(p && { room: p.room }), visibleTo: [actor] });
}

/** Mutates a state that the caller already cloned. */
export function logSecret(state: GameState, actor: PlayerId, text: string): void {
  const p = findPlayer(state, actor);
  if (!p) return;
  const witnessed = state.players.some((o) => o.id !== actor && o.alive && o.room === p.room);
  const entry: LogEntry = { cycle: state.cycle, text, room: p.room, visibleTo: witnessed ? "all" : [actor] };
  state.log.push(entry);
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

/** Display name for a room in log text; falls back to the id. */
function roomName(room: RoomId): string {
  return ROOM_LABELS.get(room) ?? room;
}

function findPlayer(state: GameState, id: PlayerId): PlayerState | undefined {
  return state.players.find((p) => p.id === id);
}

function sameAction(a: Action, b: Action): boolean {
  switch (a.type) {
    case "move":
      return b.type === "move" && a.to === b.to;
    case "take":
    case "drop":
      return b.type === a.type && a.item === b.item;
    case "examine":
      return b.type === "examine" && a.target.kind === b.target.kind && a.target.id === b.target.id;
    case "ready":
      return b.type === "ready";
  }
}
