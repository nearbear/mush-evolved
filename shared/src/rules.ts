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
import { apGain, channelLimit, inventorySlots, movementRules } from "./modifiers.ts";
import { shuffle } from "./rng.ts";
import { CHAT_CHANNELS } from "./types.ts";
import type {
  Action,
  ChannelId,
  PrivateChannel,
  PrivateChannelId,
  Equipment,
  EquipmentView,
  GameConfig,
  GameState,
  ItemState,
  ItemView,
  PlayerId,
  PlayerState,
  PlayerView,
  RoomId,
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
    dispensedOn: {},
    log: [{ cycle: 1, text: "The crew wakes up aboard the ship.", visibleTo: "all" }],
    chat: [],
    nextChatId: 1,
    channels: [],
    nextChannelId: 1,
    actopi: true,
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
  const others = state.players.filter((p) => p.id !== playerId);
  // Without ACTOPI, anyone outside your room is a room-only dot: no identity, so no room on their entry.
  const located = (room: RoomId) => state.actopi || room === you.room;
  return {
    you: { ...you },
    // TODO(rules): should Mush see each other's roles? Hidden for now.
    players: others.map(({ id, name, isBot, character, room, alive, ready }) => ({
      id,
      name,
      isBot,
      character,
      ...(located(room) ? { room } : {}),
      alive,
      ready,
    })),
    unidentified: others
      .filter((p) => !located(p.room))
      .map((p) => p.room)
      .sort(),
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
    privateChannels: state.channels.filter((c) => c.members.includes(playerId)).map((c) => ({ ...c, members: [...c.members] })),
    channelLimit: channelLimit(state, you),
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
export function chatChannels(state: GameState, player: Readonly<PlayerState>): ChannelId[] {
  if (state.phase !== "playing" || !player.alive) return [];
  const hasITrackie = itemsIn(state, { kind: "player", id: player.id }).some((i) => i.type === ITRACKIE_ITEM);
  if (!hasITrackie) return [];
  return [...CHAT_CHANNELS, ...state.channels.filter((c) => c.members.includes(player.id)).map((c) => c.id)];
}

export function sendChat(state: GameState, playerId: PlayerId, channel: ChannelId, text: string): ActionResult {
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

// ---- Private channels ------------------------------------------------------
// Membership is the only access control (confirmed 2026-10-13): anyone in a
// channel may invite anyone, from any room, and new members see the history.
// Reading and posting still need an iTrackie (chatChannels). Joining is
// immediate, with no accept step. Dead members stay listed but can't read or
// post; spectating is a to-do (docs/rules-design.md). Errors are codes, not sentences (i18n rule 4).

export const MAX_CHANNEL_NAME_LENGTH = 24;

/** An error code for the client to turn into text. */
const fail = (code: string): ActionResult => ({ ok: false, error: code });

function channelCount(state: GameState, playerId: PlayerId): number {
  return state.channels.filter((c) => c.members.includes(playerId)).length;
}

export function createChannel(state: GameState, playerId: PlayerId, rawName: string): ActionResult {
  const p = findPlayer(state, playerId);
  if (!p || !p.alive || state.phase !== "playing") return fail("channel_forbidden");
  const name = rawName.trim();
  if (!name || name.length > MAX_CHANNEL_NAME_LENGTH) return fail("channel_name_invalid");
  if (channelCount(state, playerId) >= channelLimit(state, p)) return fail("channel_limit_reached");

  const next = clone(state);
  const id: PrivateChannelId = `pc-${next.nextChannelId++}`;
  next.channels.push({ id, name, members: [playerId], createdBy: playerId });
  return { ok: true, state: next };
}

/**
 * Any member can invite any living player. Every failure on the invitee's side
 * gets the same error, so a refusal can't tell the inviter how many channels
 * someone is in.
 */
export function inviteToChannel(state: GameState, playerId: PlayerId, channelId: PrivateChannelId, inviteeId: PlayerId): ActionResult {
  const p = findPlayer(state, playerId);
  const channel = state.channels.find((c) => c.id === channelId);
  if (!p || !p.alive || state.phase !== "playing" || !channel?.members.includes(playerId)) return fail("channel_forbidden");
  const invitee = findPlayer(state, inviteeId);
  if (!invitee || !invitee.alive || channel.members.includes(inviteeId) || channelCount(state, inviteeId) >= channelLimit(state, invitee)) {
    return fail("channel_invite_refused");
  }
  const next = clone(state);
  next.channels.find((c) => c.id === channelId)!.members.push(inviteeId);
  return { ok: true, state: next };
}

/** The last member to leave deletes the channel and its messages. */
export function leaveChannel(state: GameState, playerId: PlayerId, channelId: PrivateChannelId): ActionResult {
  const channel = state.channels.find((c) => c.id === channelId);
  if (!findPlayer(state, playerId) || !channel?.members.includes(playerId)) return fail("channel_forbidden");
  const next = clone(state);
  const mine = next.channels.find((c) => c.id === channelId)!;
  mine.members = mine.members.filter((m) => m !== playerId);
  if (mine.members.length === 0) {
    next.channels = next.channels.filter((c) => c.id !== channelId);
    next.chat = next.chat.filter((m) => m.channel !== channelId);
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

