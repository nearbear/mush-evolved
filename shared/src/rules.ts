// Pure game rules: no I/O, no clocks, no Math.random. All randomness goes
// through the seeded RNG stored in the state.
//
// SKELETON: movement (AP/MP), cycle advancement, the room log, chat channels,
// and HP/morale values (shown, but nothing changes them yet) exist.
// Infection, voting, win conditions, and the real turn structure are open
// decisions — do not add them without confirming the rules first.

import { applyCheats, type ActopiCheat, type Cheat } from "./cheats.ts";
import { ACTIONS, type ActionCost, type ActionDef } from "./actions.ts";
import { ITRACKIE_ITEM, itemsIn } from "./items.ts";
import { actionFailed, apGain, carePointsGain, channelLimit, inventorySlots, movementRules, satietyLoss } from "./modifiers.ts";
import { contaminationSeenBy } from "./infection.ts";
import { isHungry, publicStatusesOf, statusesOf } from "./statuses.ts";
import { emptyResources } from "./resources.ts";
import { nextFloat, shuffle } from "./rng.ts";
import { pushChat, removeFromChannel } from "./chat.ts";
import { damage } from "./death.ts";
import { CHAT_CHANNELS, MUSH_CHANNEL } from "./types.ts";
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
  Role,
  Seat,
} from "./types.ts";

/** Longest chat message the rules accept. Moderation trims before this. */
export const MAX_CHAT_LENGTH = 300;
/** Longest chat message in lines (moderation enforces it; messages are markdown and may span lines). */
export const MAX_CHAT_LINES = 12;
export { CHAT_HISTORY } from "./chat.ts";

export type ActionResult = { ok: true; state: GameState } | { ok: false; error: string };

/**
 * `forcedRoles` is a testing aid: a forced Mush is picked before anyone else and a forced human
 * last, so the usual random draw still fills any remaining Mush places.
 */
export function createGame(seats: readonly Seat[], config: GameConfig, seed: number, forcedRoles: Readonly<Record<PlayerId, Role>> = {}): GameState {
  if (config.mushCount >= seats.length) throw new Error("mushCount must be less than seat count");
  if (new Set(seats.map((s) => s.id)).size !== seats.length) throw new Error("duplicate seat ids");

  const [shuffled, rng] = shuffle(seats, seed);
  const rank = (s: Seat) => (forcedRoles[s.id] === "mush" ? 0 : forcedRoles[s.id] === "human" ? 2 : 1);
  const mushIds = new Set([...shuffled].sort((a, b) => rank(a) - rank(b)).slice(0, config.mushCount).map((s) => s.id));

  const players: PlayerState[] = seats.map((s) => ({
    ...s,
    role: mushIds.has(s.id) ? "mush" : "human",
    alpha: mushIds.has(s.id),
    room: config.startRoom,
    ap: config.startAp,
    mp: 0,
    hp: config.startHp,
    morale: config.startMorale,
    satiety: 0,
    // Humans start at 0 satiety on cycle 1, so the hunger count starts there too.
    satietyZeroSince: mushIds.has(s.id) ? null : 1,
    statuses: [],
    spores: 0,
    resources: emptyResources(),
    modifiers: [],
    skills: [...config.startSkills],
    alive: true,
    ready: false,
    cheats: [],
    actopiCheat: "default",
  }));

  const starts: Omit<ItemState, "id">[] = [
    ...config.startItems.map((it): Omit<ItemState, "id"> => ({ type: it.type, at: { kind: "room", id: it.room } })),
    ...players.flatMap((p) => config.startInventory.map((type): Omit<ItemState, "id"> => ({ type, at: { kind: "player", id: p.id } }))),
  ];
  const items: ItemState[] = starts.map((it, i) => ({ id: `item-${i + 1}`, ...it }));

  const state: GameState = {
    config,
    rng,
    cycle: 1,
    phase: "playing",
    players,
    items,
    nextItemId: items.length + 1,
    dispensedOn: {},
    log: [{ cycle: 1, key: "crewWakes", visibleTo: "all" }],
    chat: [],
    nextChatId: 1,
    channels: [],
    nextChannelId: 1,
    actopi: true,
    bonds: {},
    sharedOnDay: {},
    contamination: {},
    sporesToday: 0,
    sporeExtractedOn: {},
  };
  grantCarePoints(state); // day 1 begins now
  return state;
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
  if (def.chance && def.chance(state, p, action) < 1) {
    const [roll, rng] = nextFloat(next.rng);
    next.rng = rng;
    if (roll < def.chance(state, p, action)) def.apply(next, actor, action);
    else {
      def.fail?.(next, actor, action);
      actionFailed(next, actor, cost.ap);
    }
  } else {
    def.apply(next, actor, action);
  }
  applyCheats(actor, next.config);
  if (next.players.every((pl) => !pl.alive || pl.ready)) advanceCycle(next);
  return { ok: true, state: next };
}

/**
 * Switches a development cheat on or off for a player and tops up the stat at once. The server decides whether
 * cheats are allowed at all; the rules only apply them.
 */
export function setCheat(state: GameState, playerId: PlayerId, cheat: Cheat, on: boolean): ActionResult {
  if (!findPlayer(state, playerId)) return fail("unknown_player");
  const next = clone(state);
  const p = findPlayer(next, playerId)!;
  p.cheats = p.cheats.filter((c) => c !== cheat);
  if (on) p.cheats.push(cheat);
  applyCheats(p, next.config);
  return { ok: true, state: next };
}

/** Sets how ACTOPI looks to one player (development cheat). Like setCheat, the server gates it. */
export function setActopiCheat(state: GameState, playerId: PlayerId, mode: ActopiCheat): ActionResult {
  if (!findPlayer(state, playerId)) return fail("unknown_player");
  const next = clone(state);
  findPlayer(next, playerId)!.actopiCheat = mode;
  return { ok: true, state: next };
}

/** Mutates a state that the caller already cloned. */
function advanceCycle(state: GameState): void {
  state.cycle += 1;
  for (const p of state.players) {
    p.ap = Math.min(state.config.maxAp, p.ap + apGain(state, p));
    p.ready = false;
  }
  const { cyclesPerDay, moralePerDay } = state.config;
  const newDay = (state.cycle - 1) % cyclesPerDay === 0;
  if (newDay) {
    state.sporesToday = 0;
    for (const p of state.players) if (p.alive) p.morale = Math.max(0, p.morale - moralePerDay);
    grantCarePoints(state);
  }
  for (const p of state.players) {
    if (!p.alive || p.role !== "human") continue;
    if (p.satiety > 0) {
      p.satiety = Math.max(0, p.satiety - satietyLoss(state, p));
      if (p.satiety === 0) p.satietyZeroSince = state.cycle;
    }
    if (isHungry(state, p)) damage(state, p, state.config.hunger.hpPerCycle);
  }
  for (const p of state.players) applyCheats(p, state.config);
  const { day } = dayOf(state);
  state.log.push({
    cycle: state.cycle,
    key: newDay ? "dayBegins" : "cycleBegins",
    params: newDay ? { day } : { cycle: state.cycle },
    visibleTo: "all",
  });
}

/** Day-start care points: every living player gains what their skills grant. Mutates a state the caller already cloned. */
function grantCarePoints(state: GameState): void {
  for (const p of state.players) if (p.alive) p.resources.heal += carePointsGain(state, p);
}

/** Day and cycle-within-day (both 1-based) for the state's global cycle counter. */
export function dayOf(state: Pick<GameState, "cycle" | "config">): { day: number; cycleOfDay: number } {
  const n = state.config.cyclesPerDay;
  return { day: Math.floor((state.cycle - 1) / n) + 1, cycleOfDay: ((state.cycle - 1) % n) + 1 };
}

/**
 * The only way game data leaves the server. Everything hidden (other players'
 * roles, private log entries, RNG state) must be stripped here.
 */
export function viewFor(state: GameState, playerId: PlayerId): PlayerView {
  const you = findPlayer(state, playerId);
  if (!you) throw new Error(`Unknown player ${playerId}`);
  const others = state.players.filter((p) => p.id !== playerId);
  const legal = legalActions(state, playerId);
  // Without ACTOPI, anyone outside your room is a room-only dot: no identity, so no room on their entry.
  const actopi = you.actopiCheat === "default" ? state.actopi : you.actopiCheat === "on";
  const located = (room: RoomId) => actopi || room === you.room;
  return {
    you: { ...you, statuses: [...you.statuses] },
    statuses: statusesOf(state, you),
    // TODO(rules): should Mush see each other's roles? Hidden for now.
    players: others.map((o) => {
      const { id, name, isBot, botKind, character, room, alive, ready } = o;
      const contamination = room === you.room ? contaminationSeenBy(state, you, o) : undefined;
      return {
        id,
        name,
        isBot,
        ...(botKind && { botKind }),
        character,
        ...(located(room) ? { room } : {}),
        alive,
        ready,
        // Public statuses are what you can see on someone standing in your room; nobody else's.
        statuses: room === you.room ? publicStatusesOf(state, o) : [],
        // Skills are public, but like statuses only to people who can see the player.
        skills: room === you.room ? [...o.skills] : [],
        // Mush see a contaminated human's level, like a status, on people in their room.
        ...(contamination !== undefined ? { contamination } : {}),
      };
    }),
    unidentified: others
      .filter((p) => !located(p.room))
      .map((p) => p.room)
      .sort(),
    cycle: state.cycle,
    ...dayOf(state),
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
    bonds: {
      to: [...(state.bonds[playerId] ?? [])],
      from: state.players.filter((o) => state.bonds[o.id]?.includes(playerId)).map((o) => o.id),
    },
    maxAp: state.config.maxAp,
    maxHp: state.config.maxHp,
    maxMorale: state.config.maxMorale,
    legalActions: legal,
    legalCosts: legalCosts(state, playerId, legal),
  };
}

/** What each of `legal` costs you, index-aligned with it. The client displays these and never computes them. */
function legalCosts(state: GameState, playerId: PlayerId, legal: Action[]): ActionCost[] {
  const p = findPlayer(state, playerId);
  if (!p) return [];
  return legal.map((a) => (ACTIONS[a.type] as ActionDef<Action>).cost(state, p, a));
}

function itemView({ id, type }: ItemState): ItemView {
  return { id, type };
}

function equipmentView({ id, type }: Equipment): EquipmentView {
  return { id, type };
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
  // The Mush channel is a link between the Mush, not a device: no iTrackie needed (decided 2026-10-16).
  const mush: ChannelId[] = player.role === "mush" ? [MUSH_CHANNEL] : [];
  const hasITrackie = itemsIn(state, { kind: "player", id: player.id }).some((i) => i.type === ITRACKIE_ITEM);
  if (!hasITrackie) return mush;
  return [...CHAT_CHANNELS, ...mush, ...state.channels.filter((c) => c.members.includes(player.id)).map((c) => c.id)];
}

export function sendChat(state: GameState, playerId: PlayerId, channel: ChannelId, text: string): ActionResult {
  const p = findPlayer(state, playerId);
  if (!p) return { ok: false, error: "Unknown player" };
  if (!chatChannels(state, p).includes(channel)) return { ok: false, error: "You can't post there" };
  const body = text.trim();
  if (!body) return { ok: false, error: "Empty message" };
  if (body.length > MAX_CHAT_LENGTH) return { ok: false, error: "Message too long" };

  const next = clone(state);
  pushChat(next, channel, { from: p.id, name: p.name, isBot: p.isBot, text: body });
  return { ok: true, state: next };
}

/** A markdown task-list line: optional quote marks and indent, a list marker, then `[ ]` or `[x]`. */
const TASK_LINE = /^(\s*(?:>\s*)*(?:[-*+]|\d{1,9}[.)])\s+\[)([ xX])(\])/;

/** Whether line `line` (0-based) of `text` is a task-list item outside a fenced code block. */
export function isTaskLine(text: string, line: number): boolean {
  let fence: string | null = null;
  const lines = text.split("\n");
  for (let i = 0; i <= line && i < lines.length; i++) {
    const marker = /^\s*(`{3,}|~{3,})/.exec(lines[i]!)?.[1];
    if (marker) fence = fence === null ? marker[0]! : lines[i]!.trimStart().startsWith(fence) ? null : fence;
    else if (i === line) return fence === null && TASK_LINE.test(lines[i]!);
  }
  return false;
}

/**
 * Tick or untick a markdown checkbox in a message. Only the author may, and
 * only while they can still read the channel. The text itself changes (so
 * replays and late joiners agree), and `line` is the 0-based line of the item.
 */
export function toggleCheckbox(state: GameState, playerId: PlayerId, messageId: number, line: number): ActionResult {
  const p = findPlayer(state, playerId);
  if (!p) return fail("unknown_player");
  const message = state.chat.find((m) => m.id === messageId);
  if (!message || !chatChannels(state, p).includes(message.channel)) return fail("message_not_found");
  if (message.from !== p.id) return fail("message_not_yours");
  if (!Number.isInteger(line) || !isTaskLine(message.text, line)) return fail("checkbox_not_found");

  const next = clone(state);
  const target = next.chat.find((m) => m.id === messageId)!;
  const lines = target.text.split("\n");
  lines[line] = lines[line]!.replace(TASK_LINE, (_, head: string, mark: string, tail: string) => `${head}${mark === " " ? "x" : " "}${tail}`);
  target.text = lines.join("\n");
  return { ok: true, state: next };
}

// ---- Private channels ------------------------------------------------------
// Membership is the only access control (confirmed 2026-10-13): anyone in a
// channel may invite anyone, from any room, and new members see the history.
// Reading and posting still need an iTrackie (chatChannels). Joining is
// immediate, with no accept step. Dying takes you out of every channel (death.ts). Errors are codes, not sentences (i18n rule 4).

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
  removeFromChannel(next, channelId, playerId);
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

