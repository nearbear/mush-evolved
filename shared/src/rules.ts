// Pure game rules: no I/O, no clocks, no Math.random. All randomness goes
// through the seeded RNG stored in the state.
//
// The game loop (createGame, applyAction, cycle advancement) and viewFor, the
// only place hidden information is stripped. Action rules live in actions.ts,
// chat and private channels in chat.ts. Win conditions and voting are open
// decisions: do not add them without confirming the rules first.

import { gravityCycle } from "./gravity.ts";
import { expirePlans, plansView, strikeSlots } from "./plans.ts";
import { bindPerformAction } from "./actions/summon.ts";
import { applyCheats, makeHuman, shipInvincible, type Cheat, type RoleCheat } from "./cheats.ts";
import { ACTIONS, type ActionCost, actionVisibility, type ActionDef } from "./actions.ts";
import { ARACK_AROUND, AT_CAPACITY, BROKEN, COOLDOWN, DIRTY, EXPLORED, ICARUS_LOST, IN_PRESELECTION, NO_DEBRIS, NO_SPACE, PASIPHAE_INTACT, REACTOR_BROKEN, TRAVEL_UNDERWAY } from "./actions/action.ts";
import { getUp } from "./actions/lie_down.ts";
import { ANTISOCIAL } from "./actions/bond.ts";
import { GERMAPHOBE } from "./actions/caress.ts";
import { FEW_FRAGMENTS } from "./actions/compute_eden.ts";
import { LIST_PRINTED, MUSH_NOT_SELECTED } from "./actions/print_list.ts";
import { LISTENED_TODAY, NOT_YOUR_SONG } from "./actions/listen_jukebox.ts";
import { isNimble } from "./actions/nimble.ts";
import { isNinja } from "./actions/ninja.ts";
import { researchNeedsView } from "./actions/research.ts";
import { equipmentHere, JUKEBOX_EQUIPMENT } from "./equipment.ts";
import { songAt } from "./jukebox.ts";
import { jellyCycle, leakOxygen } from "./breakage.ts";
import { spoilFood } from "./spoilage.ts";
import { newProjectDeck } from "./projects.ts";
import { doorsOf } from "./doors.ts";
import { fireCycle, ignitePending, isGardenProtected, isOnFire } from "./fire.ts";
import { alertsFor, brokenDoors, doorsDetected, fireReported } from "./reports.ts";
import { incidentsCycle } from "./incidents.ts";
import { initNpc, newNpcState, npcCycle } from "./npcs.ts";
import { catArrival } from "./schrodinger.ts";
import { CHEAT_ROOM } from "./cheatRoom.ts";
import { teleport, teleportBlocked } from "./kube.ts";
import { newLostAnalysis, rollAtSelection } from "./lostAnalysis.ts";
import { newTheList, recordSelection } from "./theList.ts";
import { hopelessCycle } from "./morale.ts";
import { relayView } from "./relayView.ts";
import { itemsIn, newItemId, rechargeMicrowaves, rechargeScooters, startCharges, visibleItemsIn } from "./items.ts";
import { actionDone, actionFailed, apRefill, capBreakdown, mpGain, carePointsGain, channelLimit, computerPointsCap, computerPointsGain, cookPointsGain, shootPointsGain, cycleChanged, designerPointsGain, engineerPointsGain, gardenPointsGain, dailyMoraleLoss, inventorySlots, movementRules, pilgredPointsGain, satietyLoss } from "./modifiers.ts";
import { contaminationSeenBy, convert } from "./infection.ts";
import { curseStatusesSeenBy, isHungry, publicStatusesOf, statusesOf } from "./statuses.ts";
import { isCurseId, withoutCurses } from "./curses.ts";
import { coupCycle } from "./coup.ts";
import { inactivityCycle } from "./inactivity.ts";
import { emptyResources } from "./resources.ts";
import { hasSkill } from "./skills.ts";
import { soil } from "./dirt.ts";
import { type HasRng, rollFloat, rollInt, rollWeighted, shuffle, streamFor } from "./rng.ts";
import { SHIP_ROOMS } from "./config.ts";
import { chatChannels, chatMarkKey, chatPageOf, heardBy, markedText, readChannels } from "./chat.ts";
import { moderateName } from "./moderation.ts";
import { clone, cloneState, dayOf, fail, findPlayer, type ActionResult } from "./helpers.ts";

export { dayOf };
import { damage, healDaily, hasMushDied } from "./death.ts";
import { activitySeen, endDefacing, inLogWindow, logPrivate, logWindowOf, moveLineFor, pruneLog, seesLine, startLogSeen, withNimbleActor, withNinjaActor } from "./log.ts";
import { recordAction } from "./history.ts";
import { ringMycoAlarms } from "./mycoalarm.ts";
import { triggerRoomTrap, willTriggerRoomTrap } from "./traps.ts";
import { planetsOf } from "./planets.ts";
import { canSharePlanets } from "./sharedPlanets.ts";
import { canSharePlants, sharedPlantsView } from "./sharedPlants.ts";
import { canSharePilgred, sharedPilgredView } from "./sharedPilgred.ts";
import { canShareReports } from "./sharedReports.ts";
import { arriveShip, orbitName, orbitPicture } from "./navigation.ts";
import { commandTerminalsHere, isPilgredRepaired } from "./pilgred.ts";
import { biosTerminalsHere, newBios } from "./bios.ts";
import { callNextRebel, commsCycle, commsTerminalView, comTerminalsHere, newComms } from "./comms.ts";
import { botanyCycle, botanyDay } from "./botany.ts";
import { itemView, seesShield } from "./itemView.ts";
import { burnOxygen, rollOxygenSaved, shipView, startShip } from "./ship.ts";
import { merchantsCycle, merchantsInSpace } from "./merchants.ts";
import { newSignals, signalName } from "./signals.ts";
import { allTurrets, huntersCycle, newHunters, startHunters, turretCharges, turretsHere } from "./hunters.ts";
import { expeditionReturnAt, knockOffIcarus, lostPlayers, maxCrew, nextSectorFor, onExpedition, withCrew } from "./expeditions.ts";
import { ICARUS_EQUIPMENT } from "./actions/icarus_takeoff.ts";
import { canScavenge, CANT_FLY, CHRONIC_VERTIGO, interfaceId, isLostPlace, newPatrolShips, offShip, PATROL_INTERFACE, PATROL_SHIPS, shipAboard } from "./patrol.ts";
import { preselectionCycle } from "./preselection.ts";
import { neronParticipationCycle } from "./projectEffects.ts";
import { SUCCESSION, TITLE_IDS, assignTitles, noLaunchKeys, noTitles } from "./titles.ts";
import { endGame, winnerOnArrival } from "./victory.ts";
import type {
  Action,
  Equipment,
  EquipmentView,
  DeepReadonly,
  GameConfig,
  GameState,
  ItemState,
  ActionOption,
  PlayerId,
  PlayerState,
  PlayerView,
  SeatView,
  ChannelId,
  ChatLine,
  ChatMessage,
  ExpeditionReportView,
  RoomId,
  Role,
  Seat,
} from "./types.ts";
import { drawDrugs, drugEffectsSeenBy, hasDrugDispenser, resetDrugDispenser, stockMedlab } from "./drugs.ts";
import { drawFruits, drawHybrids, fruitEffectsSeenBy } from "./fruits.ts";
import { changeAP, changeMP, updateMaxValues } from "./adjustStats.ts";
import { diseaseTrackerCycleChange } from "./diseases.ts";

export type { ActionResult };

/**
 * `forcedRoles` (tests, and single player's human Mush): a forced Mush is picked before anyone else and a forced human
 * last, so the usual random draw still fills any remaining Mush places. `startCycle` is the cycle of day 1 the ship
 * launches in: cycles follow the UTC clock (#24), so a ship launched at 14:00 GMT starts on cycle 5.
 */
export function createGame(
  seats: readonly Seat[],
  config: GameConfig,
  seed: number,
  forcedRoles: Readonly<Record<PlayerId, Role>> = {},
  startCycle = 1,
  npcSeed?: number,
): GameState {
  const { preselection } = config;
  if (!preselection && config.mushCount >= seats.length) throw new Error("mushCount must be less than seat count");
  if (!Number.isInteger(startCycle) || startCycle < 1 || startCycle > config.cyclesPerDay) throw new Error("startCycle must be a cycle of day 1");
  if (new Set(seats.map((s) => s.id)).size !== seats.length) throw new Error("duplicate seat ids");

  // In pre-selection nobody is Mush until `selectMush` (preselection.ts).
  const [shuffled, rng] = shuffle(seats, seed);
  const rank = (s: Seat) => (forcedRoles[s.id] === "mush" ? 0 : forcedRoles[s.id] === "human" ? 2 : 1);
  const mushCount = preselection ? 0 : config.mushCount;
  const mushIds = new Set([...shuffled].sort((a, b) => rank(a) - rank(b)).slice(0, mushCount).map((s) => s.id));

  const players: PlayerState[] = seats.map((s) => newPlayer(s, config, startCycle, mushIds.has(s.id) ? "mush" : "human"));

  const startRng = { rng: streamFor(seed, "start-items") };
  const starts: Omit<ItemState, "id">[] = [
    ...resolveStartItems(config.startItems.filter((it) => !it.atSelection), config, startRng),
    ...players.flatMap((p) => [...startInventory(config, p.id), ...catArrival(config, p.character)]),
  ];
  const items: ItemState[] = starts.map((it, i) => ({ id: `item-${i + 1}`, ...it }));

  const state: GameState = {
    config,
    rng,
    npcs: newNpcState(seed, npcSeed),
    lostAnalysis: newLostAnalysis(seed),
    theList: newTheList(seed),
    merchantRng: streamFor(seed, "merchants"),
    jukeboxSeed: streamFor(seed, "jukebox"),
    cycle: startCycle,
    phase: "playing",
    preselection: preselection !== null,
    winner: null,
    ending: null,
    players,
    items,
    nextItemId: items.length + 1,
    equipment: clone(config.equipment),
    dispensedOn: {},
    drugs: {},
    fruits: {},
    hybrids: {},
    drugDispenser: { list: [], used: false },
    log: [{ id: 1, cycle: startCycle, key: "crewWakes", visibleTo: "all" }],
    nextLogId: 2,
    chat: [],
    nextChatId: 1,
    chatSeq: {},
    chatOutbox: { sealed: [], dropped: [] },
    chatMarks: {},
    channels: [],
    nextChannelId: 1,
    plans: [],
    nextPlanId: 1,
    threads: [],
    nextThreadId: 1,
    bios: newBios(),
    bonds: {},
    sharedOnDay: {},
    contamination: {},
    ship: startShip(config),
    sporesToday: 0,
    missionIssuedToday: false,
    spikedOn: {},
    research: {},
    projects: {},
    projectDeck: newProjectDeck(seed),
    lostProjects: [],
    relay: { research: {}, projects: {} },
    pilgred: { progress: 0, pool: { tokens: [] } },
    planets: {},
    nextPlanetId: 1,
    sharedPlanets: [],
    nextSharedPlanetId: 1,
    sharedReports: [],
    nextSharedReportId: 1,
    sharedPlants: null,
    sharedPilgred: null,
    expeditions: [],
    nextExpeditionId: 1,
    expedition: null,
    icarusLost: false,
    hunters: newHunters(),
    signals: newSignals(),
    turrets: {},
    incidentPoints: 0,
    apSpentToday: 0,
    doors: {},
    fires: [],
    ceasefires: {},
    reports: [],
    pendingFires: [],
    trappedRooms: [],
    deloggedRooms: [],
    gravityRestarting: false,
    eden: { computed: false },
    failureStreaks: {},
    patrolShips: newPatrolShips(config),
    space: [],
    navigation: { heading: config.navigation.startHeading, orbit: null, arriving: null, lastTurn: null },
    // Issued with Mush selection, whatever the role (owner, 2026-10-13 and 2026-10-20); in pre-selection, by `selectMush`.
    titles: preselection ? noTitles() : assignTitles(players),
    launchKeys: noLaunchKeys(),
    launched: null,
    comms: newComms(config),
    now: 0,
  };
  // Mush selection: the first rebel base calls now (owner, 2026-10-21); in pre-selection, `selectMush` does it.
  if (!preselection) {
    callNextRebel(state);
    rollAtSelection(state);
    recordSelection(state);
    startHunters(state);
    spawnSelectionItems(state);
  }
  // Setup draws on streams of their own, so changing them doesn't move any roll on `state.rng`.
  state.drugs = drawDrugs({ rng: streamFor(seed, "drugs"), config });
  state.fruits = drawFruits({ rng: streamFor(seed, "fruits"), config });
  state.hybrids = drawHybrids({ rng: streamFor(seed, "grafts") }, config, state.fruits);
  stockMedlab(state, { rng: streamFor(seed, "medlab-stock") });
  for (const item of state.items) initNpc(state, item);
  grantCarePoints(state); // day 1 begins now
  // `newPlayer` stores the configured caps; fold in starting skills and modifiers (#267).
  for (const p of state.players) updateMaxValues(state, p);
  for (const p of state.players) startLogSeen(state, p);
  return state;
}

/** A seat's player as they wake up: at launch, or on joining a ship in pre-selection (`cycle` is the cycle they join in). */
export function newPlayer(s: Seat, config: DeepReadonly<GameConfig>, cycle: number, role: Role): PlayerState {
  return {
    ...s,
    mind: s.id,
    role,
    alpha: role === "mush",
    room: config.startRoom,
    ap: config.startAp,
    maxAp: config.maxAp,
    mp: config.startMp,
    maxMp: config.movement.mpCap,
    hp: config.startHp,
    maxHp: config.maxHp,
    morale: config.startMorale,
    maxMorale: config.maxMorale,
    satiety: 0,
    // Humans start at 0 satiety, so the hunger count starts with the first cycle.
    satietyZeroSince: role === "mush" ? null : cycle,
    statuses: [],
    diseaseTrackers: [],
    spores: 0,
    resources: emptyResources(),
    modifiers: [...(config.characterModifiers[s.character] ?? [])],
    skills: [...config.startSkills],
    mushSkills: [],
    alive: true,
    ready: false,
    current: null,
    queue: [],
    history: [],
    logSeen: 0,
    cheats: [],
    cpuPriorityChangedToday: false,
  };
}

/** What a player carries when they wake up, not yet given ids. */
export function startInventory(config: DeepReadonly<GameConfig>, id: PlayerId): Omit<ItemState, "id">[] {
  return config.startInventory.map((type) => ({ type, at: { kind: "player", id } }));
}

function resolveStartItems(
  entries: readonly GameConfig["startItems"][number][],
  config: DeepReadonly<GameConfig>,
  rng: HasRng,
): Omit<ItemState, "id">[] {
  const daedalusPool = SHIP_ROOMS.map((r) => r.id);
  const storagePool = config.snoop.rooms;
  const drawnBlueprints = new Set<string>();
  return entries.map((it): Omit<ItemState, "id"> => {
    const pool = "room" in it ? null : it.pool === "storage" ? storagePool : daedalusPool;
    const room = pool ? pool[rollInt(rng, pool.length)]! : (it as { room: RoomId }).room;
    const builds = it.buildsWeights
      ? (() => {
          const all = Object.entries(it.buildsWeights);
          const remaining = all.filter(([k]) => !drawnBlueprints.has(k));
          const choices = remaining.length > 0 ? remaining : all;
          return choices[rollWeighted(rng, choices.map(([, w]) => w))]![0];
        })()
      : it.builds;
    if (it.type === "blueprint" && builds !== undefined) drawnBlueprints.add(builds);
    const teaches = it.teachesWeights
      ? (() => {
          const choices = Object.entries(it.teachesWeights);
          return choices[rollWeighted(rng, choices.map(([, w]) => w))]![0];
        })()
      : it.teaches;
    return {
      type: it.type,
      at: { kind: "room", id: room },
      ...(builds !== undefined && { builds }),
      ...(teaches !== undefined && { teaches }),
      ...(it.plant && { plant: { ...it.plant } }),
      ...chargesFor(config, it.type),
    };
  });
}

/** Spawns `startItems` marked `atSelection` upon Mush selection (`selectMush`, or `createGame` without pre-selection). Mutates a state the caller already cloned. */
export function spawnSelectionItems(state: GameState): void {
  const entries = state.config.startItems.filter((it) => it.atSelection);
  if (entries.length === 0) return;
  // Named stream from `state.rng` so this once-per-game draw doesn't shift later `state.rng` rolls.
  const selectionRng = { rng: streamFor(state.rng, "selection-items") };
  for (const item of resolveStartItems(entries, state.config, selectionRng)) {
    const placed: ItemState = { id: newItemId(state), ...item };
    state.items.push(placed);
    initNpc(state, placed);
  }
}

export function legalActions(state: GameState, playerId: PlayerId): Action[] {
  const p = findPlayer(state, playerId);
  if (!p || !canAct(state, p)) return [];
  return Object.values(ACTIONS).flatMap((def: ActionDef<Action>) =>
    def.candidates(state, p).filter((a) => def.check(state, p, a) === null),
  );
}

const UNAFFORDABLE_REASONS = new Set<string>([
  "cant_afford",
  NO_SPACE,
  COOLDOWN,
  AT_CAPACITY,
  DIRTY,
  NO_DEBRIS,
  PASIPHAE_INTACT,
  REACTOR_BROKEN,
  ARACK_AROUND,
  // Owner, 2026-11-22: Take off, the Icarus launch and Land on planet show disabled for a grounded player (patrol.ts, `groundedBy`).
  CANT_FLY,
  CHRONIC_VERTIGO,
  TRAVEL_UNDERWAY,
]);

/** Board the Icarus and Take off show disabled on a fully explored planet or a lost Icarus (owner, 2026-11-19), not hidden. */
const ICARUS_ACTIONS = new Set<Action["type"]>(["board_icarus", "icarus_takeoff"]);

const isUnaffordableReason = (action: Action, refused: string | null): refused is string =>
  refused !== null &&
  (UNAFFORDABLE_REASONS.has(refused) ||
    (action.type === "hack" && refused === IN_PRESELECTION) ||
    (action.type === "bond" && refused === ANTISOCIAL) ||
    (action.type === "listen_jukebox" && (refused === NOT_YOUR_SONG || refused === LISTENED_TODAY)) ||
    (action.type === "caress" && refused === GERMAPHOBE) ||
    (action.type === "compute_eden" && refused === FEW_FRAGMENTS) ||
    (ICARUS_ACTIONS.has(action.type) && (refused === EXPLORED || refused === ICARUS_LOST)) ||
    (action.type === "print_list" && (refused === MUSH_NOT_SELECTED || refused === LIST_PRINTED || refused === BROKEN)));

/** The player as they know themselves: without their curses, which only their odds would otherwise show. */
const unaware = (p: PlayerState): PlayerState => (p.modifiers.some(isCurseId) ? { ...p, modifiers: withoutCurses(p.modifiers) } : p);

function actionOption(state: GameState, p: PlayerState, def: ActionDef<Action>, a: Action, lacks: ActionOption["lacks"]): ActionOption {
  return {
    action: a,
    cost: def.cost(state, p, a),
    chance: def.chance(state, p, a),
    // Shown as if uncursed: the odds would give your own curse away (curses.ts).
    dirt: def.dirtChanceMods(state, unaware(p), a),
    injury: def.injuryChanceMods(state, unaware(p), a),
    tags: [...def.tagsFor(state, a)],
    lacks,
  };
}

function unaffordableOption(state: GameState, p: PlayerState, def: ActionDef<Action>, a: Action, refused: string): ActionOption {
  const option = actionOption(state, p, def, a, []);
  const { cost } = option;
  option.lacks = [
    ...(refused === IN_PRESELECTION ? (["preselection"] as const) : []),
    ...(refused === NO_DEBRIS ? (["debris"] as const) : []),
    ...(refused === PASIPHAE_INTACT ? (["pasiphae"] as const) : []),
    ...(refused === REACTOR_BROKEN ? (["reactor"] as const) : []),
    ...(refused === ARACK_AROUND ? (["arack"] as const) : []),
    ...(refused === EXPLORED ? (["explored"] as const) : []),
    ...(refused === ICARUS_LOST ? (["icarusLost"] as const) : []),
    ...(refused === CHRONIC_VERTIGO ? (["vertigo"] as const) : []),
    ...(refused === CANT_FLY ? (["grounded"] as const) : []),
    ...(refused === MUSH_NOT_SELECTED ? (["mushNotSelected"] as const) : []),
    ...(refused === LIST_PRINTED ? (["listPrinted"] as const) : []),
    ...(refused === BROKEN ? (["broken"] as const) : []),
    ...(refused === ANTISOCIAL ? (["antisocial"] as const) : []),
    ...(refused === GERMAPHOBE ? (["germaphobe"] as const) : []),
    ...(refused === NOT_YOUR_SONG ? (["notYourSong"] as const) : []),
    ...(refused === LISTENED_TODAY ? (["listenedToday"] as const) : []),
    ...(refused === FEW_FRAGMENTS ? (["fragments"] as const) : []),
    ...(refused === TRAVEL_UNDERWAY ? (["travelUnderway"] as const) : []),
    ...(refused === DIRTY ? (["clean"] as const) : []),
    ...(refused === NO_SPACE ? (["space"] as const) : []),
    ...(refused === COOLDOWN ? (["cooldown"] as const) : []),
    ...(refused === AT_CAPACITY ? (["capacity"] as const) : []),
    ...(p.ap < cost.ap ? (["ap"] as const) : []),
    ...(p.mp < cost.mp ? (["mp"] as const) : []),
  ];
  if (refused === COOLDOWN) option.cooldown = def.cooldownLeft(state, p, a);
  return option;
}

/**
 * Actions that fail only on cost (`cant_afford`), on room in the inventory (`NO_SPACE`), on a cooldown (`COOLDOWN`), on a shared limit (`AT_CAPACITY`), on being dirty (`DIRTY`) or, for Collect scrap, on no debris (`NO_DEBRIS`) or the Pasiphae still existing (`PASIPHAE_INTACT`), or for Travel and turns on a broken reactor (`REACTOR_BROKEN`), or for Travel and Leave orbit on an Arack around (`ARACK_AROUND`), or for Print THE List before selection, after the print or on a broken tabulator, with the cost and what falls
 * short. For showing them disabled.
 * Moves are left out: an unaffordable move has no cost to report, and doors aren't action buttons.
 */
export function unaffordableActions(state: GameState, playerId: PlayerId): ActionOption[] {
  const p = findPlayer(state, playerId);
  if (!p || !canAct(state, p)) return [];
  return Object.values(ACTIONS).flatMap((def: ActionDef<Action>) =>
    def.candidates(state, p).flatMap((a): ActionOption[] => {
      if (a.type === "move") return [];
      const refused = def.check(state, p, a);
      return isUnaffordableReason(a, refused) ? [unaffordableOption(state, p, def, a, refused)] : [];
    }),
  );
}

/** Both legal and unaffordable action options in a single pass over `ACTIONS`, keeping legal options before unaffordable ones. */
function viewActionOptions(state: GameState, p: PlayerState): ActionOption[] {
  if (!canAct(state, p)) return [];
  const legal: ActionOption[] = [];
  const unaffordable: ActionOption[] = [];
  for (const def of Object.values(ACTIONS) as ActionDef<Action>[]) {
    for (const a of def.candidates(state, p)) {
      const refused = def.check(state, p, a);
      if (refused === null) {
        legal.push(actionOption(state, p, def, a, []));
      } else if (a.type !== "move" && isUnaffordableReason(a, refused)) {
        unaffordable.push(unaffordableOption(state, p, def, a, refused));
      }
    }
  }
  return [...legal, ...unaffordable];
}

/**
 * The AP an action adds to the crew's day (`apSpentToday`, #241): its AP price, or for one paid with a skill point, the
 * AP it would have cost without one (owner, 2026-11-22, the wiki's rule; eMush counts only real AP).
 */
function apCounted(state: Readonly<GameState>, actor: Readonly<PlayerState>, def: ActionDef<Action>, action: Action, cost: ActionCost): number {
  if (!cost.paidBy) return Math.round(cost.ap);
  const unpaid = { ...actor, resources: { ...actor.resources, [cost.paidBy]: 0 } };
  return Math.round(def.cost(state, unpaid, action).ap);
}

/** Does an action at once, skipping the queue and its timing (queue.ts is how players act; this is its last step). */
export function applyAction(state: GameState, playerId: PlayerId, action: Action): ActionResult {
  const p = findPlayer(state, playerId);
  const next = cloneState(state);
  if (p && canAct(state, p) && performAction(next, findPlayer(next, playerId)!, action)) return { ok: true, state: next };
  return { ok: false, error: "illegal_action" };
}

/**
 * Checks an action against the state as it is now, then pays for it, rolls its odds, and applies it. False (and
 * nothing changed) if it isn't legal. Being ready doesn't stop it: an action queued before End cycle still happens
 * (owner, 2026-10-17). Mutates a state the caller already cloned.
 */
export function performAction(next: GameState, actor: PlayerState, action: Action): boolean {
  const def: ActionDef<Action> | undefined = ACTIONS[action.type];
  if (!actor.alive || next.phase !== "playing" || !def || def.check(next, actor, action) !== null) return false;
  const cost = def.cost(next, actor, action);
  // Odds are read before the cost is paid, as the button showed them.
  const chance = def.chance(next, actor, action);
  const dirtyChance = def.dirtChanceMods(next, actor, action);
  const injuryChance = def.injuryChanceMods(next, actor, action);
  if (def.timed && action.type !== "lie_down") getUp(actor);
  next.apSpentToday += apCounted(next, actor, def, action, cost);
  actor.ap -= cost.ap;
  actor.mp -= cost.mp;
  if (cost.paidBy) actor.resources[cost.paidBy] -= 1;
  const room = actor.room;
  // Checked before `run()` so actions like `take` still see the item was on the room's shelf/floor (#473).
  const triggersTrap = willTriggerRoomTrap(next, actor, action);
  const run = () => {
    if (chance < 1) {
      const succeeded = rollFloat(next) < chance;
      def.recordOutcome(next, actor, succeeded);
      if (succeeded) def.apply(next, actor, action, cost);
      else {
        def.fail(next, actor, action);
        actionFailed(next, actor, cost.ap);
      }
    } else {
      def.recordOutcome(next, actor, true);
      def.apply(next, actor, action, cost);
    }
  };
  withNinjaActor(isNinja(actor) ? actor.id : null, () => withNimbleActor(isNimble(actor) ? actor.id : null, run));
  if (triggersTrap && actor.alive) triggerRoomTrap(next, actor, room);
  knockOffTarget(next, def, action);
  // After apply, so an action that reveals your own history (Chitchat) doesn't show itself.
  if (def.recorded) recordAction(next, actor, action.type);
  if (dirtyChance > 0) {
    if (rollFloat(next) < dirtyChance && !actor.statuses.includes("dirty")) soil(next, actor);
  }
  if (injuryChance > 0) {
    if (rollFloat(next) < injuryChance) {
      if (itemsIn(next, { kind: "player", id: actor.id }).some((i) => i.type === "protection_gloves")){
        logPrivate(next, actor.id, "glovesBlockedInjury", { name: actor.character });
      }
      else{
      logPrivate(next, actor.id, "randomInjury", { name: actor.character });
      damage(next, actor, 2, "injury");
      def.onInjury(next, actor, action);
      }
    }
  }
  // After the action's own log lines; rings on a failure too (owner, 2026-10-18).
  if (def.tags.includes("spore")) ringMycoAlarms(next, room);
  // After the action and its dirt and injury rolls (Open Air Brain kills here).
  if (actor.alive) actionDone(next, actor);
  // A research, project or PILGRED this finished strikes out its task slots (plans.ts).
  strikeSlots(next);
  applyCheats(next, actor);
  if (cycleEndsByReady(next)) advanceCycle(next);
  return true;
}

/**
 * End cycle waits on bots only (owner, 2026-11-22): the cycle ends once a living human is ready and every living bot
 * is, whether or not the other humans are. With no living human, once every living bot is ready.
 */
export function cycleEndsByReady(state: Readonly<GameState>): boolean {
  const living = state.players.filter((p) => p.alive);
  return living.every((p) => !p.isBot || p.ready) && (living.some((p) => !p.isBot && p.ready) || living.every((p) => p.isBot));
}

/**
 * An aggressive action the room sees (public), aimed at someone aboard the docked Icarus, puts them off it whether it
 * succeeded or not, as being punched gets you out of bed (owner, 2026-11-21, #469). Covert and private ones don't: the
 * victim leaving the Icarus would give them away.
 */
function knockOffTarget(next: GameState, def: ActionDef<Action>, action: Action): void {
  if (def.visibility !== "public" || !def.tagsFor(next, action).includes("aggressive")) return;
  const target = (action as { target?: unknown }).target;
  const victim = typeof target === "string" ? next.players.find((p) => p.id === target) : undefined;
  if (victim?.boardedIcarus) knockOffIcarus(next, victim);
}

// The summons walk performs live moves through performAction (actions/summon.ts can't import it: an import cycle).
bindPerformAction(performAction);

/**
 * Switches a development cheat on or off for a player and tops up the stat at once. The server decides whether
 * cheats are allowed at all; the rules only apply them.
 */
export function setCheat(state: GameState, playerId: PlayerId, cheat: Cheat, on: boolean): ActionResult {
  if (!findPlayer(state, playerId)) return fail("unknown_player");
  const next = cloneState(state);
  const p = findPlayer(next, playerId)!;
  p.cheats = p.cheats.filter((c) => c !== cheat);
  if (on) p.cheats.push(cheat);
  applyCheats(next, p);
  return { ok: true, state: next };
}

/** Switches a player's role at once (development cheat). Like setCheat, the server gates it. */
export function setRoleCheat(state: GameState, playerId: PlayerId, role: RoleCheat): ActionResult {
  if (!findPlayer(state, playerId)) return fail("unknown_player");
  const next = cloneState(state);
  const p = findPlayer(next, playerId)!;
  if (role === "mush" && p.role === "human") convert(next, p);
  else if (role === "human") makeHuman(p, next.cycle);
  updateMaxValues(next, p); // a role change changes which diseases the cap folds count (#267)
  applyCheats(next, p);
  return { ok: true, state: next };
}

/**
 * Takes the player to the cheat room (#170, development cheat, gated by the server like setCheat). Not a move: no door,
 * no cost, no log line, so the room they leave sees them vanish in place. Out of bed first; refused while pushing or
 * being pushed (that would need a push to end, which logs), and from off the ship. Mutates nothing it was given.
 */
export function cheatRoomCheat(state: GameState, playerId: PlayerId): ActionResult {
  const p = findPlayer(state, playerId);
  if (!p) return fail("unknown_player");
  if (state.phase !== "playing") return fail("game_over");
  if (!state.config.cheatRoom) return fail("no_cheat_room");
  if (!p.alive) return fail("dead");
  if (p.room === CHEAT_ROOM) return fail("already_there");
  if (offShip(p.room) || onExpedition(state, p)) return fail("off_ship");
  const blocked = teleportBlocked(state, p);
  if (blocked) return fail(blocked);
  const next = cloneState(state);
  teleport(next, findPlayer(next, playerId)!, CHEAT_ROOM);
  return { ok: true, state: next };
}

/**
 * The server's clock passed a cycle boundary (00:00, 03:00, … GMT) at server time `at`: the cycle ends for everyone,
 * ready or not. Without `at` (tests) the inactivity check is skipped.
 */
export function newCycle(state: GameState, at?: number): ActionResult {
  if (state.phase !== "playing") return fail("game_over");
  const next = cloneState(state);
  advanceCycle(next, at);
  return { ok: true, state: next };
}

function chargesFor(config: DeepReadonly<GameConfig>, type: string): { charges?: number } {
  const charges = startCharges(config, type);
  return charges === undefined ? {} : { charges };
}

/**
 * Mutates a state that the caller already cloned. `at` is the clock cycle's server time; a cycle ended by everyone
 * being ready (single player) has none, and no inactivity check: whoever ended it was there.
 */
function advanceCycle(state: GameState, at?: number): void {
  // Intergalactic travel under way (#480, owner 2026-11-22): the game ends at the cycle change with no processing at all.
  if (state.launched !== null) {
    const winner = state.launched.destination === "eden" ? "humans" : winnerOnArrival(state);
    endGame(state, winner, state.launched.destination);
    return;
  }
  // The ending cycle's Hopeless humans die first, so anyone this cycle change takes to 0 gets a full cycle (morale.ts).
  hopelessCycle(state);
  state.cycle += 1;
  endDefacing(state);
  pruneLog(state);
  for (const p of state.players) {
    changeAP(state, p, apRefill(state, p));
    changeMP(state, p, mpGain(state, p));
    p.ready = false;
  }
  if (at !== undefined) {
    inactivityCycle(state, at);
    if (state.phase !== "playing") return;
  }
  coupCycle(state);
  for (const [room, left] of Object.entries(state.ceasefires)) {
    if (left <= 1) delete state.ceasefires[room];
    else state.ceasefires[room] = left - 1;
  }
  diseaseTrackerCycleChange(state);
  cycleChanged(state);
  // A repaired Gravity Simulator is back, before incidents, so this cycle change's tremors have gravity.
  gravityCycle(state);
  const oxygenSaved = rollOxygenSaved(state);
  burnOxygen(state, oxygenSaved);
  commsCycle(state);
  botanyCycle(state);
  rechargeScooters(state);
  const { cyclesPerDay } = state.config;
  const newDay = (state.cycle - 1) % cyclesPerDay === 0;
  if (state.config.drugDispenser.resetCycles.includes(((state.cycle - 1) % cyclesPerDay) + 1) && hasDrugDispenser(state)) resetDrugDispenser(state);
  if (newDay) {
    state.sporesToday = 0;
    state.missionIssuedToday = false;
    for (const p of state.players) {
      delete p.boringToday;
      delete p.fertileToday;
      delete p.doormanToday;
      delete p.chitchatToday;
      delete p.interrogatedToday;
      delete p.delogToday;
      delete p.snoopedToday;
      delete p.mycoscannedToday;
      p.cpuPriorityChangedToday = false;
    }
    const loss = shipInvincible(state) ? 0 : dailyMoraleLoss(state);
    for (const p of state.players) if (p.alive) p.morale = Math.max(0, p.morale - loss);
    for (const p of state.players) healDaily(state, p);
    grantCarePoints(state);
    rechargeMicrowaves(state);
    botanyDay(state);
    spoilFood(state);
    expirePlans(state);
  }
  for (const p of state.players) {
    if (!p.alive) continue;
    if (p.satiety > 0) {
      p.satiety = Math.max(0, p.satiety - satietyLoss(state, p));
      // Mush never count toward hunger.
      if (p.satiety === 0 && p.role === "human") p.satietyZeroSince = state.cycle;
    }
    if (isHungry(state, p)) damage(state, p, state.config.hunger.hpPerCycle, "starvation");
  }
  for (const p of state.players) applyCheats(state, p);
  const { day } = dayOf(state);
  arriveShip(state);
  huntersCycle(state, day);
  merchantsCycle(state);
  // A fire acts in the cycle it starts.
  neronParticipationCycle(state);
  ignitePending(state);
  const gardenProtected = isGardenProtected(state);
  incidentsCycle(state, day);
  fireCycle(state, gardenProtected);
  leakOxygen(state, oxygenSaved);
  jellyCycle(state);
  npcCycle(state);
  preselectionCycle(state);
  strikeSlots(state);
  // After hunters and incidents, so a new day's first cycle change still weighs the whole day before (#241, as eMush).
  if (newDay) state.apSpentToday = 0;
}

/** Day-start care, Computer and PILGRED points: every living player gains what their skills grant (Computer and PILGRED points stop at their caps). Mutates a state the caller already cloned. */
function grantCarePoints(state: GameState): void {
  for (const p of state.players) if (p.alive) {
    p.resources.heal += carePointsGain(state, p);
    p.resources.comp = Math.min(computerPointsCap(state, p), p.resources.comp + computerPointsGain(state, p));
    p.resources.shoot = Math.min(state.config.gunman.capPoints, p.resources.shoot + shootPointsGain(state, p));
    p.resources.core = Math.min(state.config.designer.capPoints, p.resources.core + designerPointsGain(state, p));
    p.resources.eng = Math.min(state.config.engineer.capPoints, p.resources.eng + engineerPointsGain(state, p));
    p.resources.pilgred = Math.min(state.config.pilgred.capPoints, p.resources.pilgred + pilgredPointsGain(state, p));
    p.resources.garden = Math.min(state.config.botany.capPoints, p.resources.garden + gardenPointsGain(state, p));
    p.resources.cook = Math.min(state.config.cook.capPoints, p.resources.cook + cookPointsGain(state, p));
  }
}

/**
 * A chat message as a view carries it: field by field, so a name stored by an older build never goes out, with its
 * ticks from `marks` (`GameState.chatMarks`) drawn into the text (`markedText`).
 */
export function messageView({ id, seq, cycle, at, channel, from, isBot, text, system }: Readonly<ChatMessage>, marks: Readonly<GameState["chatMarks"]>): ChatMessage {
  const key = chatMarkKey(channel, seq);
  const shown = markedText(text, Object.hasOwn(marks, key) ? marks[key] : undefined);
  return { id, seq, cycle, ...(at !== undefined && { at }), channel, from, isBot, text: shown, ...(system && { system }) };
}

/**
 * Where page `page` of `channel` is for a player asking for it (#355): in the state (the open page or the tail), in
 * storage, or null when they may not have it: a channel they can't read now (`readChannels`: left, no iTrackie, dead,
 * a human asking for the Mush channel) or a page not begun. One null for every refusal, so asking says nothing about a
 * channel you can't read. The server reads storage only after this says "stored".
 */
export function chatPageSource(state: Readonly<GameState>, playerId: PlayerId, channel: ChannelId, page: number): "state" | "stored" | null {
  const you = findPlayer(state, playerId);
  const count = state.chatSeq[channel] ?? 0;
  if (!you || count === 0 || !Number.isSafeInteger(page) || page < 0 || !readChannels(state, you).includes(channel)) return null;
  const last = chatPageOf(count - 1);
  return page > last ? null : page >= last - 1 ? "state" : "stored";
}

/**
 * Page `page` of `channel` as `playerId` may read it (#355), projected like a live view's chat (`messageView`, ticks
 * drawn in, no `id`), or null for every refusal (`chatPageSource`). `stored` is the page as the server stored it, read
 * only for a "stored" page; the access check runs again here, so a read that waited on storage can't outlast it.
 */
export function chatPageView(state: Readonly<GameState>, playerId: PlayerId, channel: ChannelId, page: number, stored?: readonly ChatMessage[]): ChatLine[] | null {
  const source = chatPageSource(state, playerId, channel, page);
  const messages = source === "state" ? state.chat : source === "stored" ? stored : undefined;
  const you = findPlayer(state, playerId);
  if (!messages || !you) return null;
  return messages.filter((m) => m.channel === channel && chatPageOf(m.seq) === page && heardBy(you, m)).map((m) => {
    const { id: _id, ...line } = messageView(m, state.chatMarks);
    return line;
  });
}

/** Your unheard messages in the channels you read now (`PlayerView.chatUnheard`), or nothing when there are none. */
function unheardView(you: Readonly<PlayerState>, channels: readonly ChannelId[]): Pick<PlayerView, "chatUnheard"> {
  const entries = channels.flatMap((c) => {
    const ranges = you.unheard?.[c];
    return ranges && ranges.length > 0 ? [[c, ranges.map(([a, b]) => [a, b])]] : [];
  });
  return entries.length > 0 ? { chatUnheard: Object.fromEntries(entries) } : {};
}

/** Every thread, as a view carries it (for readers of global chat). */
export function threadsView(state: Readonly<Pick<GameState, "threads">>): PlayerView["threads"] {
  return state.threads.map(({ id, name, from, createdBy, cycle }) => ({ id, name, ...(from !== undefined && { from }), createdBy, cycle }));
}

/** Every shared report, as a view carries it (for readers of the Expeditions feature). Never `report`: which report an entry came from stays its members'. */
export function sharedReportsView(state: Readonly<Pick<GameState, "sharedReports">>): PlayerView["sharedReports"] {
  return state.sharedReports.map(({ id, text, by, day, cycleOfDay }) => ({ id, text, by, day, cycleOfDay }));
}

/** Every shared planet, as a view carries it (for readers of the Astrophysics feature). Never `planet`: which planet an entry came from stays its finder's. */
export function sharedPlanetsView(state: Readonly<Pick<GameState, "sharedPlanets">>): PlayerView["sharedPlanets"] {
  return state.sharedPlanets.map(({ id, name, sectors, text, by, day, cycleOfDay, stale }) => ({ id, name, sectors: [...sectors], text, by, day, cycleOfDay, stale }));
}

/**
 * The only way game data leaves the server. Everything hidden (other players'
 * roles, private log entries, RNG state) must be stripped here. It is
 * `seatViewFor` without log ids (`PlayerView.log` says why).
 */
export function viewFor(state: GameState, playerId: PlayerId): PlayerView {
  const view = seatViewFor(state, playerId);
  return { ...view, log: view.log.map(({ id: _id, ...line }) => line), chat: view.chat.map(({ id: _id, ...line }) => line) };
}

/**
 * `viewFor` with each log line's id, for the replay (`perspective`). Never send one to a live player: Biome forbids it
 * in `server/src`.
 */
export function seatViewFor(state: GameState, playerId: PlayerId): SeatView {
  const you = findPlayer(state, playerId);
  if (!you) throw new Error(`Unknown player ${playerId}`);
  const others = state.players.filter((p) => p.id !== playerId);
  const channels = readChannels(state, you);
  // Without ACTOPI, anyone outside your room is a room-only dot: no identity, so no room on their entry.
  const actopi = state.bios.actopi;
  // The dead see nothing that depends on a room (decided 2026-10-16, #45): no
  // room log, items, equipment, or anyone's location or room-only details.
  const present = (room: RoomId) => you.alive && room === you.room;
  const located = (room: RoomId) => you.alive && (actopi || room === you.room);
  // A dead body is a corpse item, not a person in a room: nobody gets a dead player's room.
  const living = others.filter((o) => o.alive);
  const logWindow = logWindowOf(state, you);
  // At a turret or flying a ship: sees what is in space to shoot at.
  const gunner = you.alive && (turretsHere(state, you).length > 0 || shipAboard(you) !== undefined);
  const tracker = hasSkill(you, "hunt");
  const protectingOf = (id: PlayerId) => state.players.find((p) => p.alive && p.protectedBy === id)?.id;
  const yourProtecting = protectingOf(you.id);
  // Nobody's account name goes out while the game runs, not even your own: people are known by character.
  // Who cursed you is never sent, even to you; nor which seat plays you, whether you used Transfer, or your action
  // history (only Interrogate and Chitchat reveal it, history.ts), nor Lethargy's count (`lyingSince`; only its AP shows).
  const {
    name: _name,
    outcastBy: _outcastBy,
    mind: _mind,
    transferUsed: _transferUsed,
    epigeneticsUsed: _epigeneticsUsed,
    massMoulderingUsed: _massMoulderingUsed,
    history: _history,
    lastSeenAt: _lastSeenAt,
    inactivity: _inactivity,
    lyingSince: _lyingSince,
    enteredFrom: _enteredFrom,
    treatDiseaseUntil: _treatDiseaseUntil,
    energizeUntil: _energizeUntil,
    perceptionUntil: _perceptionUntil,
    pendingDiseases: _pendingDiseases,
    unheard: _unheard,
    ...yours
  } = you;
  const orbitShared = channels.includes("astrophysics") && state.navigation.orbit !== null ? state.sharedPlanets.find((e) => e.planet === state.navigation.orbit)?.id : undefined;
  return {
    you: {
      ...yours,
      ...(yourProtecting !== undefined ? { protecting: yourProtecting } : {}),
      // Your own curses are never sent, in any form (curses.ts).
      modifiers: withoutCurses(you.modifiers),
      diseaseTrackers: you.diseaseTrackers.filter((t) => !isCurseId(t.name)).map((t) => ({ ...t })),
      statuses: withoutCurses(you.statuses),
      mushSkills: [...you.mushSkills],
      current: you.current && { action: you.current.action, since: you.current.since, until: you.current.until },
      queue: you.queue.map((q) => q.action),
    },
    statuses: withoutCurses(statusesOf(state, you)),
    drugEffects: drugEffectsSeenBy(state, you),
    fruitEffects: fruitEffectsSeenBy(state, you),
    players: others.map((o) => {
      const { id, isBot, botKind, character, room, alive, ready } = o;
      const here = o.alive && present(room);
      const contamination = here ? contaminationSeenBy(state, you, o) : undefined;
      return {
        id,
        isBot,
        ...(botKind && { botKind }),
        character,
        ...(o.alive && located(room) ? { room } : {}),
        alive,
        ready,
        // Public statuses are what you can see on someone standing in your room; nobody else's.
        // A Mush also sees their curses there (owner, 2026-11-22).
        statuses: here ? [...publicStatusesOf(state, o), ...curseStatusesSeenBy(you, o)] : [],
        // Skills are public, but like statuses only to people who can see the player.
        skills: here ? [...o.skills] : [],
        ...(here && o.bookSkill !== undefined ? { bookSkill: o.bookSkill } : {}),
        // Who is in bed, and which bed, is visible to the room (owner, 2026-10-18).
        ...(here && o.lyingIn ? { lying: o.lyingIn } : {}),
        // Who is aboard the docked Icarus is visible to the bay (#469).
        ...(here && o.boardedIcarus ? { boarded: true as const } : {}),
        // Where they stand, and whether they sit, is visible to the room (owner, 2026-10-20). Standing at the door they
        // came in by would say where they came from: only a Tracker sees that spot (owner, 2026-11-21, `moveLineFor`).
        ...(here && o.spot && state.config.sharedSpots && (o.spot.kind !== "door" || tracker) ? { spot: { ...o.spot } } : {}),
        // Who pushes whose wheelchair is public to the room (owner, 2026-10-19).
        ...(here && o.pushedBy !== undefined ? { pushedBy: o.pushedBy } : {}),
        // Who protects whom (Bodyguard) is public to the room (owner, 2026-11-14).
        ...(here && o.protectedBy !== undefined ? { protectedBy: o.protectedBy } : {}),
        ...(here && protectingOf(o.id) !== undefined ? { protecting: protectingOf(o.id) } : {}),
        // Mush see a contaminated human's level, like a status, on people in their room.
        ...(contamination !== undefined ? { contamination } : {}),
        // Mush know who the other Mush are, living or dead (owner, 2026-11-21); humans never learn it from the view.
        ...(you.role === "mush" && o.role === "mush" ? { mush: true as const } : {}),
        // A busy bar, never the action: only when its log entry could reach you, and never on a ninja, whose lines
        // say "Someone" (owner, 2026-11-22): the bar ending as the line appears would name them.
        ...(here && o.current && !isNinja(o) && activitySeen(state, room, actionVisibility(o.current.action.type, o), o)
          ? { busy: { since: o.current.since, until: o.current.until } }
          : {}),
      };
    }),
    unidentified: living
      // The lost are left out: their place names them (`LOST:<id>`), and `lost` already says who and where.
      .filter((p) => you.alive && !located(p.room) && !isLostPlace(p.room))
      .map((p) => p.room)
      .sort(),
    cycle: state.cycle,
    ...dayOf(state),
    phase: state.phase,
    preselection: state.preselection,
    winner: state.winner,
    ending: state.ending,
    // Names and roles are hidden while the game runs; the end screen shows everyone's (#191).
    crew:
      state.phase === "ended"
        ? state.players.map(({ id, name, isBot, botKind, character, role, alive }) => ({ id, name: moderateName(name), isBot, ...(botKind && { botKind }), character, role, alive }))
        : null,
    rooms: state.config.rooms,
    inventory: itemsIn(state, { kind: "player", id: you.id }).map((item) => itemView(item, you)),
    inventorySlots: inventorySlots(state, you),
    roomItems: you.alive ? visibleItemsIn(state, { kind: "room", id: you.room }, you).map((item) => itemView(item, you)) : [],
    roomEquipment: you.alive ? (state.equipment[you.room] ?? []).map((e) => equipmentView(state, e, you)) : [],
    // Your room's doors (#330): a door's state reaches only the living on either side of it.
    doors: you.alive ? doorsOf(state, you.room) : [],
    roomOnFire: you.alive && isOnFire(state, you.room),
    roomCeasefire: you.alive ? (state.ceasefires[you.room] ?? null) : null,
    // Reported fires, by players or Fire detectors (#444); an unreported fire's room reaches nobody.
    burningRooms: you.alive ? state.fires.filter((room) => fireReported(state, room)) : [],
    // Broken doors aboard, only once Defective piston sensors is complete (#330).
    brokenDoors: you.alive && doorsDetected(state) ? brokenDoors(state) : [],
    // Rooms booby-trapped with a spore (#473): living Mush only; humans and the dead never see them.
    trappedRooms: you.alive && you.role === "mush" ? [...state.trappedRooms] : [],
    alerts: you.alive ? alertsFor(state) : { fires: 0, broken: 0, reports: [], gravity: null },
    // `seesLine` (log.ts) says which lines are yours; room lines, private ones included, only within your window (#365).
    // A private line names only you in the view: no one learns who else saw it (`leaked` marks a secret line others saw).
    // `kind` and `leaked` go with every line you see (#366). A crew move's direction only with Tracker (`moveLineFor`).
    log: state.log
      .filter((e) => seesLine(e, you) && inLogWindow(state, e, logWindow))
      .map((e) => moveLineFor(e.visibleTo === "all" ? e : { ...e, visibleTo: [you.id] }, you)),
    logSeen: you.logSeen,
    chat: state.chat.filter((m) => channels.includes(m.channel) && heardBy(you, m)).map((m) => messageView(m, state.chatMarks)),
    chatCounts: Object.fromEntries(channels.flatMap((c) => (state.chatSeq[c] ? [[c, state.chatSeq[c]]] : []))),
    ...unheardView(you, channels),
    chatChannels: chatChannels(state, you),
    readChannels: channels,
    privateChannels: state.channels.filter((c) => c.members.includes(playerId)).map((c) => ({ ...c, members: [...c.members] })),
    plans: plansView(state, channels),
    threads: channels.includes("global") ? threadsView(state) : [],
    sharedPlanets: channels.includes("astrophysics") ? sharedPlanetsView(state) : [],
    sharedReports: channels.includes("expeditions") ? sharedReportsView(state) : [],
    sharedPlants: channels.includes("botany") ? sharedPlantsView(state) : null,
    sharedPilgred: channels.includes("pilgred") ? sharedPilgredView(state) : null,
    channelLimit: channelLimit(state, you),
    movement: movementRules(state, you),
    bonds: {
      to: [...(state.bonds[playerId] ?? [])],
      from: state.players.filter((o) => state.bonds[o.id]?.includes(playerId)).map((o) => o.id),
    },
    config: { heavyMpPenalty: state.config.heavy.mpPenalty, actionQueueCap: state.config.action.queueCap, sharedSpots: state.config.sharedSpots, setupId: state.config.setupId, returnToSolAp: state.config.pilgred.returnCost.ap, edenAp: state.config.pilgred.edenCost.ap, turnAp: state.config.navigation.turn.cost.ap, travelAp: state.config.navigation.travel.cost.ap, leaveOrbitAp: state.config.navigation.leaveOrbit.cost.ap, xylophAp: state.config.comms.xyloph.cost.ap, merchantDealAp: state.config.merchants.deal.cost.ap, missionApGranted: state.config.commanderMission.apGranted,
      researchAp: state.config.research.cost.ap, projectAp: state.config.project.cost.ap, pilgredAp: state.config.pilgred.cost.ap,
      hullRepairAp: state.config.hullRepair.cost.ap, turretAp: state.config.turrets.cost.ap,
      takeoffAp: state.config.patrol.takeoff.cost.ap, landAp: state.config.patrol.land.cost.ap, patrolShotAp: state.config.patrol.shot.cost.ap, showerAp: state.config.shower.cost.ap, lieDownAp: state.config.lieDown.cost.ap,
      waterAp: state.config.botany.water.cost.ap, sowAp: state.config.botany.sow.cost.ap, cookAp: state.config.cook.cost.ap,
      scanAp: state.config.astro.scan.cost.ap, astrophysicistScanDiscount: state.config.astrophysicist.scanApDiscount,
      analyzeAp: state.config.astro.analyze.cost.ap, orbitAnalyzeAp: state.config.astro.analyze.orbitCost.ap,
      contactSolAp: state.config.comms.sol.cost.ap, rebelAp: state.config.comms.rebel.cost.ap, neronAp: state.config.comms.neron.cost.ap,
      gardenRoom: state.config.botany.gardenRoom, cyclesPerDay: state.config.cyclesPerDay,
      seats: state.config.preselection?.seats ?? state.players.length },
    maxAp: you.maxAp,
    maxMp: you.maxMp,
    maxHp: you.maxHp,
    maxMorale: you.maxMorale,
    caps: capBreakdown(state, you),
    // While the BIOS has the shield off, it shows as 0 (Claude's default, 2026-10-24); its points are kept.
    ship: shipView(state),
    // How many, to everyone; each hunter's hp and every turret's charges, to the living in a turret room (owner, 2026-10-24);
    // the hunters' hp also to a living pilot in flight (owner, 2026-10-28).
    hunters: {
      count: state.hunters.list.length,
      // Each hunter's kind and an asteroid's countdown along with its hp (owner, 2026-11-12, #388).
      list: gunner ? state.hunters.list.map(({ id, type, hp, countdown }) => ({ id, type, hp, countdown })) : null,
      // The merchants in space, as targets, to the same viewers (owner, 2026-11-21): kind, name and hp. Their kind is
      // public already (NERON announces each arrival); nothing of their hail or deals.
      merchants: gunner ? merchantsInSpace(state).map((m) => ({ id: m.id, kind: m.merchant!.kind, name: signalName(m), hp: m.merchant!.hp })) : null,
      turrets: you.alive && turretsHere(state, you).length > 0 ? Object.fromEntries(allTurrets(state).map((t) => [t.id, turretCharges(state, t.id)])) : null,
    },
    ...relayView(state, you),
    researchNeeds: you.alive && equipmentHere(state, you, "RESEARCH_LAB").length > 0 ? researchNeedsView(state, you.room) : null,
    pilgredRepaired: isPilgredRepaired(state),
    edenComputed: state.eden.computed,
    humanTankFull: hasMushDied(state),
    comms: { linked: state.comms.linked, terminal: you.alive && comTerminalsHere(state, you).length > 0 ? commsTerminalView(state, you) : null },
    bios: you.alive && biosTerminalsHere(state, you).length > 0 ? { ...state.bios } : null,
    cpuPriority: you.alive ? state.bios.cpu_priority : null,
    // Only the crew sees a report (owner, 2026-10-31), and only while alive, like their private log lines.
    expeditions: you.alive
      ? state.expeditions
          .filter((r) => r.members.includes(you.id))
          .map(({ members: _members, lostAt, ...report }): ExpeditionReportView => {
            const shared = state.sharedReports.find((s) => s.report === report.id)?.id;
            // A member who got lost sees the report up to that line (owner, 2026-11-08, #357), and no more of it.
            const cut = lostAt?.[you.id];
            const events = cut === undefined ? report.events : report.events.slice(0, cut);
            const away = state.expedition?.report === report.id && cut === undefined;
            return { ...clone({ ...report, events }), ...(away && { away: true as const }), ...(shared && { shared }) };
          })
      : [],
    expedition: expeditionView(state, you, channels.includes("astrophysics")),
    icarusSeats: maxCrew(state),
    // Who is lost, and where: a public alert (owner, 2026-11-08, #357; phase 2 accepted it).
    lost: lostPlayers(state).map((p) => ({ name: p.character, planet: orbitName(state) ?? "" })),
    // Your own planets only, and only the tags an analysis revealed (owner, 2026-10-19).
    maxPlanets: state.config.astro.maxPlanets,
    canSharePlanets: canSharePlanets(state, you),
    canShareReports: canShareReports(state, you),
    canSharePlants: canSharePlants(state, you),
    canSharePilgred: canSharePilgred(state, you),
    planets: planetsOf(state, playerId).map((p) => ({
      id: p.id,
      name: p.name,
      direction: p.direction,
      distance: p.distance,
      sectors: p.sectors.map((s) => (s.known ? s.tag : null)),
      ...(p.id === state.navigation.orbit && { orbited: true as const }),
    })),
    patrolShip: patrolShipView(state, you),
    navigation: {
      orbiting: state.navigation.orbit !== null,
      traveling: state.navigation.arriving !== null,
      orbitPicture: orbitPicture(state),
      orbitName: orbitName(state),
      ...(orbitShared !== undefined && { orbitShared }),
      heading: you.alive && commandTerminalsHere(state, you).length > 0 ? state.navigation.heading : null,
      lastTurn: state.navigation.lastTurn,
    },
    titles: TITLE_IDS.map((id) => {
      const holder = state.players.find((p) => p.id === state.titles[id]);
      return {
        id,
        holder: holder?.character ?? null,
        line: SUCCESSION[id].flatMap((c) => state.players.filter((p) => p.character === c).map((p) => p.character)),
      };
    }),
    launchKeys: you.alive && commandTerminalsHere(state, you).length > 0 ? { ...state.launchKeys } : null,
    launched: state.launched ? { ...state.launched } : null,
    actions: viewActionOptions(state, you),
  };
}

/** Whether you can do an offered action now, rather than lacking the points for it. */
export const affordable = (option: Readonly<ActionOption>): boolean => option.lacks.length === 0;

/** The actions a view lets you do right now: its affordable options. */
export const legalIn = (view: Pick<PlayerView, "actions">): Action[] => view.actions.filter(affordable).map((o) => o.action);

function equipmentView(state: GameState, { id, type, broken, jelly, shield }: Equipment, viewer: Readonly<PlayerState>): EquipmentView {
  // Out and destroyed are known in the bay, where the ship is missing (owner, 2026-10-24); a docked ship's armor too,
  // so Renovate being offered tells nothing new (owner, 2026-10-28).
  const ship = type === PATROL_INTERFACE ? PATROL_SHIPS.find((s) => interfaceId(s) === id) : undefined;
  const shipState = ship && state.patrolShips[ship.id];
  const docked = shipState && !shipState.out && !shipState.destroyed && { armor: shipState.armor, maxArmor: state.config.patrol.armor[ship.kind] };
  // The Icarus is missing from its bay while away or once lost (owner, 2026-11-07); both are public anyway.
  const out = shipState?.out || (type === ICARUS_EQUIPMENT && ((state.expedition !== null && state.expedition.ship === null) || state.icarusLost));
  // The song playing this cycle, to anyone in the jukebox's room (they hear it); a broken jukebox plays nothing.
  const song = type === JUKEBOX_EQUIPMENT && !broken ? songAt(state)?.character : undefined;
  return { id, type, ...(broken && { broken }), ...(song !== undefined && { song }), ...(jelly !== undefined && viewer.role === "mush" && viewer.alive && { jelly }), ...(shield !== undefined && seesShield(viewer) && { shield }), ...(out && { out: true as const }), ...(shipState?.destroyed && { destroyed: true as const }), ...docked };
}

/**
 * The expedition under way, to everyone (owner, 2026-11-07): who is out, the planet, when they are back; the report's
 * id only to a living member, who already has the report.
 */
function expeditionView(state: GameState, you: PlayerState, readsAstrophysics: boolean): PlayerView["expedition"] {
  const away = state.expedition;
  if (!away) return null;
  const report = state.expeditions.find((r) => r.id === away.report)!;
  // The Astrophysics entry shared from the planet being explored, to whoever reads that feature (owner, 2026-11-19):
  // the link stays on the server, so the entries never carry a planet id.
  const shared = readsAstrophysics ? state.sharedPlanets.find((e) => e.planet === away.planet)?.id : undefined;
  // The next sector, to a U-turn or Traitor holder still with the crew (owner, 2026-11-17).
  const next = nextSectorFor(state, you);
  const member = withCrew(state, you) && report.members.includes(you.id);
  // Each member's exact HP as of the latest step (`away.hp`), to a member still with the crew, for those still with it
  // (owner, 2026-11-19): a lost member's screen shows them alone, and the crew no longer sees theirs.
  const hp = member
    ? report.members
        .map((id) => state.players.find((p) => p.id === id)!)
        .filter((p) => withCrew(state, p) && away.hp[p.id] !== undefined)
        .map((p) => ({ name: p.character, hp: away.hp[p.id]! }))
    : undefined;
  return {
    crew: [...report.crew],
    planet: report.planet,
    returnAt: expeditionReturnAt(state)!,
    // Public, as the timer already reveals both (docs/plans/archive/expedition-ui.md).
    steps: away.sectors.length,
    nextAt: away.nextAt,
    // The patrol ship that landed (owner, 2026-11-09, #359): public, as its bay shows it out and the crew is named.
    ...(report.ship !== undefined && { ship: report.ship }),
    ...(member && { report: report.id }),
    ...(next !== undefined && { next }),
    ...(hp && { hp }),
    ...(shared !== undefined && { shared }),
  };
}

/** Your own ship's armor and charges, and how much debris is out there (only if it may collect), while you fly it. */
function patrolShipView(state: GameState, you: PlayerState): PlayerView["patrolShip"] {
  const ship = you.alive ? shipAboard(you) : undefined;
  if (!ship) return null;
  const { armor, charges } = state.patrolShips[ship.id]!;
  return { id: ship.id, armor, maxArmor: state.config.patrol.armor[ship.kind], charges: ship.kind === "pasiphae" ? null : charges, debris: canScavenge(state, ship) ? state.space.length : null };
}

/** Alive, not done for the cycle, and the game is running. */
export function canAct(state: Readonly<GameState>, p: Readonly<PlayerState>): boolean {
  return p.alive && !p.ready && state.phase === "playing";
}

