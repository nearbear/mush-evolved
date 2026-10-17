// Pure game rules: no I/O, no clocks, no Math.random. All randomness goes
// through the seeded RNG stored in the state.
//
// The game loop (createGame, applyAction, cycle advancement) and viewFor, the
// only place hidden information is stripped. Action rules live in actions.ts,
// chat and private channels in chat.ts. Win conditions and voting are open
// decisions: do not add them without confirming the rules first.

import { applyCheats, makeHuman, type ActopiCheat, type Cheat, type RoleCheat } from "./cheats.ts";
import { ACTIONS, type ActionCost, type ActionDef } from "./actions.ts";
import { itemsIn } from "./items.ts";
import { actionFailed, apGain, carePointsGain, channelLimit, computerPointsGain, cycleChanged, inventorySlots, movementRules, satietyLoss } from "./modifiers.ts";
import { contaminationSeenBy, convert } from "./infection.ts";
import { isHungry, publicStatusesOf, statusesOf } from "./statuses.ts";
import { emptyResources } from "./resources.ts";
import { nextFloat, shuffle } from "./rng.ts";
import { chatChannels, readChannels } from "./chat.ts";
import { clone, fail, findPlayer, type ActionResult } from "./helpers.ts";
import { damage } from "./death.ts";
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
  UnaffordableAction,
  PlayerId,
  PlayerState,
  PlayerView,
  RoomId,
  Role,
  Seat,
} from "./types.ts";

export type { ActionResult };

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
    ...config.startItems.map((it): Omit<ItemState, "id"> => ({ type: it.type, at: { kind: "room", id: it.room }, ...(it.builds !== undefined && { builds: it.builds }) })),
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
    research: {},
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

/**
 * Actions that fail only on cost (`cant_afford`), with the cost and what falls short. For showing them disabled.
 * Moves are left out: an unaffordable move has no cost to report, and doors aren't action buttons.
 */
export function unaffordableActions(state: GameState, playerId: PlayerId): UnaffordableAction[] {
  const p = findPlayer(state, playerId);
  if (!p || !canAct(state, p)) return [];
  return Object.values(ACTIONS).flatMap((def: ActionDef<Action>) =>
    def.candidates(state, p).flatMap((a): UnaffordableAction[] => {
      if (a.type === "move") return [];
      if (def.check(state, p, a) !== "cant_afford") return [];
      const cost = def.cost(state, p, a);
      const lacks: ("ap" | "mp")[] = [...(p.ap < cost.ap ? (["ap"] as const) : []), ...(p.mp < cost.mp ? (["mp"] as const) : [])];
      return [{ action: a, cost, chance: def.chance?.(state, p, a) ?? 1, lacks }];
    }),
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

/** Switches a player's role at once (development cheat). Like setCheat, the server gates it. */
export function setRoleCheat(state: GameState, playerId: PlayerId, role: RoleCheat): ActionResult {
  if (!findPlayer(state, playerId)) return fail("unknown_player");
  const next = clone(state);
  const p = findPlayer(next, playerId)!;
  if (role === "mush" && p.role === "human") convert(next, p);
  else if (role === "human") makeHuman(p, next.cycle);
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
  cycleChanged(state);
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

/** Day-start care and Computer points: every living player gains what their skills grant (Computer points stop at the cap). Mutates a state the caller already cloned. */
function grantCarePoints(state: GameState): void {
  for (const p of state.players) if (p.alive) {
    p.resources.heal += carePointsGain(state, p);
    p.resources.comp = Math.min(state.config.computer.capPoints, p.resources.comp + computerPointsGain(state, p));
  }
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
  const channels = readChannels(state, you);
  // Without ACTOPI, anyone outside your room is a room-only dot: no identity, so no room on their entry.
  const actopi = you.actopiCheat === "default" ? state.actopi : you.actopiCheat === "on";
  // The dead see nothing that depends on a room (decided 2026-10-16, #45): no
  // room log, items, equipment, or anyone's location or room-only details.
  const present = (room: RoomId) => you.alive && room === you.room;
  const located = (room: RoomId) => you.alive && (actopi || room === you.room);
  // A dead body is a corpse item, not a person in a room: nobody gets a dead player's room.
  const living = others.filter((o) => o.alive);
  return {
    you: { ...you, statuses: [...you.statuses] },
    statuses: statusesOf(state, you),
    // TODO(rules): should Mush see each other's roles? Hidden for now.
    players: others.map((o) => {
      const { id, name, isBot, botKind, character, room, alive, ready } = o;
      const here = o.alive && present(room);
      const contamination = here ? contaminationSeenBy(state, you, o) : undefined;
      return {
        id,
        name,
        isBot,
        ...(botKind && { botKind }),
        character,
        ...(o.alive && located(room) ? { room } : {}),
        alive,
        ready,
        // Public statuses are what you can see on someone standing in your room; nobody else's.
        statuses: here ? publicStatusesOf(state, o) : [],
        // Skills are public, but like statuses only to people who can see the player.
        skills: here ? [...o.skills] : [],
        // Mush see a contaminated human's level, like a status, on people in their room.
        ...(contamination !== undefined ? { contamination } : {}),
      };
    }),
    unidentified: living
      .filter((p) => you.alive && !located(p.room))
      .map((p) => p.room)
      .sort(),
    cycle: state.cycle,
    ...dayOf(state),
    phase: state.phase,
    rooms: state.config.rooms,
    inventory: itemsIn(state, { kind: "player", id: you.id }).map(itemView),
    inventorySlots: inventorySlots(state, you),
    roomItems: you.alive ? itemsIn(state, { kind: "room", id: you.room }).map(itemView) : [],
    roomEquipment: you.alive ? (state.config.equipment[you.room] ?? []).map(equipmentView) : [],
    // The dead keep only ship-wide entries (cycles, days); every room entry, their own private ones included, goes.
    log: state.log.filter((e) =>
      !you.alive ? e.room === undefined && e.visibleTo === "all" : e.visibleTo === "all" ? e.room === undefined || e.room === you.room : e.visibleTo.includes(playerId),
    ),
    chat: state.chat.filter((m) => channels.includes(m.channel)),
    chatChannels: chatChannels(state, you),
    readChannels: channels,
    privateChannels: state.channels.filter((c) => c.members.includes(playerId)).map((c) => ({ ...c, members: [...c.members] })),
    channelLimit: channelLimit(state, you),
    movement: movementRules(state, you),
    bonds: {
      to: [...(state.bonds[playerId] ?? [])],
      from: state.players.filter((o) => state.bonds[o.id]?.includes(playerId)).map((o) => o.id),
    },
    config: { heavyMpPenalty: state.config.heavy.mpPenalty },
    maxAp: state.config.maxAp,
    maxHp: state.config.maxHp,
    maxMorale: state.config.maxMorale,
    research: { ...state.research },
    legalActions: legal,
    legalCosts: legalCosts(state, playerId, legal),
    legalChances: legalChances(state, playerId, legal),
    unaffordable: unaffordableActions(state, playerId),
  };
}

/** What each of `legal` costs you, index-aligned with it. The client displays these and never computes them. */
function legalCosts(state: GameState, playerId: PlayerId, legal: Action[]): ActionCost[] {
  const p = findPlayer(state, playerId);
  if (!p) return [];
  return legal.map((a) => (ACTIONS[a.type] as ActionDef<Action>).cost(state, p, a));
}

/** Each of `legal`'s chance of success (0 to 1), index-aligned with it, so the player knows the odds before acting. */
function legalChances(state: GameState, playerId: PlayerId, legal: Action[]): number[] {
  const p = findPlayer(state, playerId);
  if (!p) return [];
  return legal.map((a) => (ACTIONS[a.type] as ActionDef<Action>).chance?.(state, p, a) ?? 1);
}

function itemView({ id, type, of, builds }: ItemState): ItemView {
  return { id, type, ...(of !== undefined && { of }), ...(builds !== undefined && { builds }) };
}

function equipmentView({ id, type }: Equipment): EquipmentView {
  return { id, type };
}

/** Alive, not done for the cycle, and the game is running. */
function canAct(state: Readonly<GameState>, p: Readonly<PlayerState>): boolean {
  return p.alive && !p.ready && state.phase === "playing";
}

