// Pure game rules: no I/O, no clocks, no Math.random. All randomness goes
// through the seeded RNG stored in the state.
//
// The game loop (createGame, applyAction, cycle advancement) and viewFor, the
// only place hidden information is stripped. Action rules live in actions.ts,
// chat and private channels in chat.ts. Win conditions and voting are open
// decisions: do not add them without confirming the rules first.

import { expirePlans, plansView, strikeSlots } from "./plans.ts";
import { bindPerformAction } from "./actions/summon.ts";
import { applyCheats, makeHuman, shipInvincible, type Cheat, type RoleCheat } from "./cheats.ts";
import { ACTIONS, type ActionDef } from "./actions.ts";
import { ARACK_AROUND, AT_CAPACITY, COOLDOWN, DIRTY, NO_DEBRIS, NO_SPACE, PASIPHAE_INTACT, REACTOR_BROKEN } from "./actions/action.ts";
import { getUp } from "./actions/lie_down.ts";
import { researchNeedsView } from "./actions/research.ts";
import { equipmentHere } from "./equipment.ts";
import { jellyCycle, leakOxygen } from "./breakage.ts";
import { projectDone } from "./projects.ts";
import { fireCycle, ignitePending, isOnFire } from "./fire.ts";
import { incidentsCycle } from "./incidents.ts";
import { initNpc, newNpcState, npcCycle } from "./npcs.ts";
import { newLostAnalysis, rollAtSelection } from "./lostAnalysis.ts";
import { hopelessCycle } from "./morale.ts";
import { relayView } from "./relayView.ts";
import { itemsIn, rechargeMicrowaves, startCharges, visibleItemsIn } from "./items.ts";
import { actionFailed, apGain, mpGain, carePointsGain, channelLimit, computerPointsCap, computerPointsGain, shootPointsGain, cycleChanged, designerPointsGain, engineerPointsGain, gardenPointsGain, dailyMoraleLoss, inventorySlots, movementRules, pilgredPointsGain, satietyLoss } from "./modifiers.ts";
import { contaminationSeenBy, convert } from "./infection.ts";
import { isHungry, publicStatusesOf, statusesOf } from "./statuses.ts";
import { coupCycle } from "./coup.ts";
import { inactivityCycle } from "./inactivity.ts";
import { emptyResources } from "./resources.ts";
import { hasSkill } from "./skills.ts";
import { soil } from "./dirt.ts";
import { rollFloat, shuffle, streamFor } from "./rng.ts";
import { chatChannels, chatMarkKey, chatPageOf, markedText, readChannels } from "./chat.ts";
import { moderateName } from "./moderation.ts";
import { clone, dayOf, fail, findPlayer, type ActionResult } from "./helpers.ts";
import { endGame, winnerOnArrival } from "./victory.ts";

export { dayOf };
import { damage, healDaily, hasMushDied } from "./death.ts";
import { activitySeen, inLogWindow, logPrivate, logPublic, logWindowOf, pruneLog, pushLog, seesLine, startLogSeen } from "./log.ts";
import { recordAction } from "./history.ts";
import { ringMycoAlarms } from "./mycoalarm.ts";
import { planetsOf } from "./planets.ts";
import { canSharePlanets } from "./sharedPlanets.ts";
import { canShareReports } from "./sharedReports.ts";
import { arriveShip, orbitName, orbitPicture } from "./navigation.ts";
import { commandTerminalsHere, isPilgredRepaired } from "./pilgred.ts";
import { biosTerminalsHere, newBios } from "./bios.ts";
import { callNextRebel, commsCycle, commsTerminalView, comTerminalsHere, newComms } from "./comms.ts";
import { botanyCycle, botanyDay, plantView } from "./botany.ts";
import { burnOxygen, shipView, startShip } from "./ship.ts";
import { allTurrets, huntersCycle, newHunters, startHunters, turretCharges, turretsHere } from "./hunters.ts";
import { expeditionReturnAt, lostPlayers, withCrew } from "./expeditions.ts";
import { ICARUS_EQUIPMENT } from "./actions/icarus_takeoff.ts";
import { canScavenge, interfaceId, isLostPlace, newPatrolShips, PATROL_INTERFACE, PATROL_SHIPS, shipAboard } from "./patrol.ts";
import { preselectionCycle } from "./preselection.ts";
import { SUCCESSION, TITLE_IDS, assignTitles, noTitles } from "./titles.ts";
import type {
  Action,
  Equipment,
  EquipmentView,
  DeepReadonly,
  GameConfig,
  GameState,
  DroneState,
  ItemState,
  ItemView,
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
import { changeAP, changeMP } from "./adjustStats.ts";
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

  const starts: Omit<ItemState, "id">[] = [
    ...config.startItems.map((it): Omit<ItemState, "id"> => ({ type: it.type, at: { kind: "room", id: it.room }, ...(it.builds !== undefined && { builds: it.builds }), ...(it.teaches !== undefined && { teaches: it.teaches }), ...(it.plant && { plant: { ...it.plant } }), ...chargesFor(config, it.type) })),
    ...players.flatMap((p) => startInventory(config, p.id)),
  ];
  const items: ItemState[] = starts.map((it, i) => ({ id: `item-${i + 1}`, ...it }));

  const state: GameState = {
    config,
    rng,
    npcs: newNpcState(seed, npcSeed),
    lostAnalysis: newLostAnalysis(seed),
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
    spikedOn: {},
    research: {},
    projects: {},
    relay: { research: {}, projects: {} },
    pilgred: { progress: 0, pool: { tokens: [] } },
    planets: {},
    nextPlanetId: 1,
    sharedPlanets: [],
    nextSharedPlanetId: 1,
    sharedReports: [],
    nextSharedReportId: 1,
    expeditions: [],
    nextExpeditionId: 1,
    expedition: null,
    icarusLost: false,
    hunters: newHunters(),
    turrets: {},
    incidentPoints: 0,
    fires: [],
    pendingFires: [],
    failureStreaks: {},
    patrolShips: newPatrolShips(config),
    space: [],
    navigation: { heading: config.navigation.startHeading, orbit: null, arriving: null, lastTurn: null },
    // Issued with Mush selection, whatever the role (owner, 2026-10-13 and 2026-10-20); in pre-selection, by `selectMush`.
    titles: preselection ? noTitles() : assignTitles(players),
    comms: newComms(config),
    now: 0,
  };
  // Mush selection: the first rebel base calls now (owner, 2026-10-21); in pre-selection, `selectMush` does it.
  if (!preselection) {
    callNextRebel(state);
    rollAtSelection(state);
    startHunters(state);
  }
  // Setup draws on streams of their own, so changing them doesn't move any roll on `state.rng`.
  state.drugs = drawDrugs({ rng: streamFor(seed, "drugs"), config });
  stockMedlab(state, { rng: streamFor(seed, "medlab-stock") });
  for (const item of state.items) initNpc(state, item);
  grantCarePoints(state); // day 1 begins now
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
  };
}

/** What a player carries when they wake up, not yet given ids. */
export function startInventory(config: DeepReadonly<GameConfig>, id: PlayerId): Omit<ItemState, "id">[] {
  return config.startInventory.map((type) => ({ type, at: { kind: "player", id } }));
}

export function legalActions(state: GameState, playerId: PlayerId): Action[] {
  const p = findPlayer(state, playerId);
  if (!p || !canAct(state, p)) return [];
  return Object.values(ACTIONS).flatMap((def: ActionDef<Action>) =>
    def.candidates(state, p).filter((a) => def.check(state, p, a) === null),
  );
}

/**
 * Actions that fail only on cost (`cant_afford`), on room in the inventory (`NO_SPACE`), on a cooldown (`COOLDOWN`), on a shared limit (`AT_CAPACITY`), on being dirty (`DIRTY`) or, for Collect scrap, on no debris (`NO_DEBRIS`) or the Pasiphae still existing (`PASIPHAE_INTACT`), or for Travel and turns on a broken reactor (`REACTOR_BROKEN`), or for Travel and Leave orbit on an Arack around (`ARACK_AROUND`), with the cost and what falls
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
      if (refused !== "cant_afford" && refused !== NO_SPACE && refused !== COOLDOWN && refused !== AT_CAPACITY && refused !== DIRTY && refused !== NO_DEBRIS && refused !== PASIPHAE_INTACT && refused !== REACTOR_BROKEN && refused !== ARACK_AROUND) return [];
      const cost = def.cost(state, p, a);
      const lacks: ActionOption["lacks"] = [...(refused === NO_DEBRIS ? (["debris"] as const) : []), ...(refused === PASIPHAE_INTACT ? (["pasiphae"] as const) : []), ...(refused === REACTOR_BROKEN ? (["reactor"] as const) : []), ...(refused === ARACK_AROUND ? (["arack"] as const) : []), ...(refused === DIRTY ? (["clean"] as const) : []), ...(refused === NO_SPACE ? (["space"] as const) : []), ...(refused === COOLDOWN ? (["cooldown"] as const) : []), ...(refused === AT_CAPACITY ? (["capacity"] as const) : []), ...(p.ap < cost.ap ? (["ap"] as const) : []), ...(p.mp < cost.mp ? (["mp"] as const) : [])];
      const option: ActionOption = { action: a, cost, chance: def.chance(state, p, a), dirt: def.dirtChanceMods(state, p, a), injury: def.injuryChanceMods(state, p, a), tags: [...def.tagsFor(state, a)], lacks };
      if (refused === COOLDOWN) option.cooldown = def.cooldownLeft(state, p, a);
      return [option];
    }),
  );
}

/** Does an action at once, skipping the queue and its timing (queue.ts is how players act; this is its last step). */
export function applyAction(state: GameState, playerId: PlayerId, action: Action): ActionResult {
  const p = findPlayer(state, playerId);
  const next = clone(state);
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
  actor.ap -= cost.ap;
  actor.mp -= cost.mp;
  if (cost.paidBy) actor.resources[cost.paidBy] -= 1;
  const room = actor.room;
  if (chance < 1) {
    const succeeded = rollFloat(next) < chance;
    def.recordOutcome(next, actor, succeeded);
    if (succeeded) def.apply(next, actor, action);
    else {
      def.fail(next, actor, action);
      actionFailed(next, actor, cost.ap);
    }
  } else {
    def.recordOutcome(next, actor, true);
    def.apply(next, actor, action);
  }
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
      }
    }
  }
  // After the action's own log lines; rings on a failure too (owner, 2026-10-18).
  if (def.tags.includes("spore")) ringMycoAlarms(next, room);
  // A research, project or PILGRED this finished strikes out its task slots (plans.ts).
  strikeSlots(next);
  applyCheats(next, actor);
  if (next.players.every((pl) => !pl.alive || pl.ready)) advanceCycle(next);
  return true;
}

// The summons walk performs live moves through performAction (actions/summon.ts can't import it: an import cycle).
bindPerformAction(performAction);

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
  applyCheats(next, p);
  return { ok: true, state: next };
}

/** Switches a player's role at once (development cheat). Like setCheat, the server gates it. */
export function setRoleCheat(state: GameState, playerId: PlayerId, role: RoleCheat): ActionResult {
  if (!findPlayer(state, playerId)) return fail("unknown_player");
  const next = clone(state);
  const p = findPlayer(next, playerId)!;
  if (role === "mush" && p.role === "human") convert(next, p);
  else if (role === "human") makeHuman(p, next.cycle);
  applyCheats(next, p);
  return { ok: true, state: next };
}

/**
 * Returns the ship to Sol now (development cheat, gated by the server like setCheat): the game ends as Return to Sol
 * ends it (actions/return_to_sol.ts), with the decided winner, without PILGRED or the Commander. A quick way to a
 * finished game in dev, for its listing and replay (`docs/process/commands.md`).
 */
export function solCheat(state: GameState, playerId: PlayerId): ActionResult {
  const p = findPlayer(state, playerId);
  if (!p) return fail("unknown_player");
  if (state.phase !== "playing") return fail("game_over");
  const next = clone(state);
  logPublic(next, undefined, "returnedToSol", { name: p.character });
  endGame(next, winnerOnArrival(next), "sol");
  return { ok: true, state: next };
}

/**
 * The server's clock passed a cycle boundary (00:00, 03:00, … GMT) at server time `at`: the cycle ends for everyone,
 * ready or not. Without `at` (tests) the inactivity check is skipped.
 */
export function newCycle(state: GameState, at?: number): ActionResult {
  if (state.phase !== "playing") return fail("game_over");
  const next = clone(state);
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
  // The ending cycle's Hopeless humans die first, so anyone this cycle change takes to 0 gets a full cycle (morale.ts).
  hopelessCycle(state);
  state.cycle += 1;
  pruneLog(state);
  for (const p of state.players) {
    changeAP(state, p, apGain(state, p));
    changeMP(state, p, mpGain(state, p));
    p.ready = false;
  }
  if (at !== undefined) inactivityCycle(state, at);
  coupCycle(state);
  diseaseTrackerCycleChange(state);
  cycleChanged(state);
  burnOxygen(state);
  commsCycle(state);
  botanyCycle(state);
  const { cyclesPerDay } = state.config;
  const newDay = (state.cycle - 1) % cyclesPerDay === 0;
  if (state.config.drugDispenser.resetCycles.includes(((state.cycle - 1) % cyclesPerDay) + 1) && hasDrugDispenser(state)) resetDrugDispenser(state);
  if (newDay) {
    state.sporesToday = 0;
    for (const p of state.players) {
      delete p.boringToday;
      delete p.fertileToday;
      delete p.chitchatToday;
      delete p.interrogatedToday;
      delete p.snoopedToday;
      delete p.mycoscannedToday;
    }
    const loss = shipInvincible(state) ? 0 : dailyMoraleLoss(state);
    for (const p of state.players) if (p.alive) p.morale = Math.max(0, p.morale - loss);
    for (const p of state.players) healDaily(state, p);
    grantCarePoints(state);
    rechargeMicrowaves(state);
    botanyDay(state);
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
  pushLog(state, { key: newDay ? "dayBegins" : "cycleBegins", params: newDay ? { day } : { cycle: state.cycle }, visibleTo: "all" });
  // After the cycle's opening line, so incident and fire lines follow it. A fire acts in the cycle it starts.
  ignitePending(state);
  incidentsCycle(state, day);
  fireCycle(state);
  leakOxygen(state);
  jellyCycle(state);
  npcCycle(state);
  preselectionCycle(state);
  strikeSlots(state);
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
  if (!messages) return null;
  return messages.filter((m) => m.channel === channel && chatPageOf(m.seq) === page).map((m) => {
    const { id: _id, ...line } = messageView(m, state.chatMarks);
    return line;
  });
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
  return state.sharedPlanets.map(({ id, text, by, day, cycleOfDay, stale }) => ({ id, text, by, day, cycleOfDay, stale }));
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
  const legal = legalActions(state, playerId);
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
  // Nobody's account name goes out while the game runs, not even your own: people are known by character.
  // Who cursed you is never sent, even to you; nor which seat plays you, whether you used Transfer, or your action
  // history (only Interrogate and Chitchat reveal it, history.ts), nor Lethargy's count (`lyingSince`; only its AP shows).
  const {
    name: _name,
    outcastBy: _outcastBy,
    mind: _mind,
    transferUsed: _transferUsed,
    epigeneticsUsed: _epigeneticsUsed,
    history: _history,
    lastSeenAt: _lastSeenAt,
    inactivity: _inactivity,
    lyingSince: _lyingSince,
    enteredFrom: _enteredFrom,
    ...yours
  } = you;
  return {
    you: {
      ...yours,
      statuses: [...you.statuses],
      mushSkills: [...you.mushSkills],
      current: you.current && { action: you.current.action, since: you.current.since, until: you.current.until },
      queue: you.queue.map((q) => q.action),
    },
    statuses: statusesOf(state, you),
    drugEffects: drugEffectsSeenBy(state, you),
    // TODO(rules): should Mush see each other's roles? Hidden for now.
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
        statuses: here ? publicStatusesOf(state, o) : [],
        // Skills are public, but like statuses only to people who can see the player.
        skills: here ? [...o.skills] : [],
        ...(here && o.bookSkill !== undefined ? { bookSkill: o.bookSkill } : {}),
        // Who is in bed, and which bed, is visible to the room (owner, 2026-10-18).
        ...(here && o.lyingIn ? { lying: o.lyingIn } : {}),
        // Where they stand, and whether they sit, is visible to the room (owner, 2026-10-20).
        ...(here && o.spot && state.config.sharedSpots ? { spot: { ...o.spot } } : {}),
        // Who pushes whose wheelchair is public to the room (owner, 2026-10-19).
        ...(here && o.pushedBy !== undefined ? { pushedBy: o.pushedBy } : {}),
        // Mush see a contaminated human's level, like a status, on people in their room.
        ...(contamination !== undefined ? { contamination } : {}),
        // A busy bar, never the action: only when its log entry could reach you.
        ...(here && o.current && activitySeen(state, room, ACTIONS[o.current.action.type].visibility, o)
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
    roomOnFire: you.alive && isOnFire(state, you.room),
    burningRooms: you.alive && projectDone(state, "FIRE_SENSOR") ? [...state.fires] : [],
    // `seesLine` (log.ts) says which lines are yours; room lines, private ones included, only within your window (#365).
    // A private line names only you in the view: no one learns who else saw it (`leaked` marks a secret line others saw).
    // `kind` and `leaked` go with every line you see (#366).
    log: state.log
      .filter((e) => seesLine(e, you) && inLogWindow(state, e, logWindow))
      .map((e) => (e.visibleTo === "all" ? e : { ...e, visibleTo: [you.id] })),
    logSeen: you.logSeen,
    chat: state.chat.filter((m) => channels.includes(m.channel)).map((m) => messageView(m, state.chatMarks)),
    chatCounts: Object.fromEntries(channels.flatMap((c) => (state.chatSeq[c] ? [[c, state.chatSeq[c]]] : []))),
    chatChannels: chatChannels(state, you),
    readChannels: channels,
    privateChannels: state.channels.filter((c) => c.members.includes(playerId)).map((c) => ({ ...c, members: [...c.members] })),
    plans: plansView(state, channels),
    threads: channels.includes("global") ? threadsView(state) : [],
    sharedPlanets: channels.includes("astrophysics") ? sharedPlanetsView(state) : [],
    sharedReports: channels.includes("expeditions") ? sharedReportsView(state) : [],
    channelLimit: channelLimit(state, you),
    movement: movementRules(state, you),
    bonds: {
      to: [...(state.bonds[playerId] ?? [])],
      from: state.players.filter((o) => state.bonds[o.id]?.includes(playerId)).map((o) => o.id),
    },
    config: { heavyMpPenalty: state.config.heavy.mpPenalty, actionQueueCap: state.config.action.queueCap, sharedSpots: state.config.sharedSpots, setupId: state.config.setupId, returnToSolAp: state.config.pilgred.returnCost.ap, edenAp: state.config.pilgred.edenCost.ap, xylophAp: state.config.comms.xyloph.cost.ap,
      researchAp: state.config.research.cost.ap, projectAp: state.config.project.cost.ap, pilgredAp: state.config.pilgred.cost.ap,
      hullRepairAp: state.config.hullRepair.cost.ap, turretAp: state.config.turrets.cost.ap,
      takeoffAp: state.config.patrol.takeoff.cost.ap, landAp: state.config.patrol.land.cost.ap, patrolShotAp: state.config.patrol.shot.cost.ap, showerAp: state.config.shower.cost.ap, lieDownAp: state.config.lieDown.cost.ap,
      waterAp: state.config.botany.water.cost.ap, sowAp: state.config.botany.sow.cost.ap, cookAp: state.config.cook.cost.ap,
      scanAp: state.config.astro.scan.cost.ap, astrophysicistScanDiscount: state.config.astrophysicist.scanApDiscount,
      analyzeAp: state.config.astro.analyze.cost.ap, orbitAnalyzeAp: state.config.astro.analyze.orbitCost.ap,
      contactSolAp: state.config.comms.sol.cost.ap, rebelAp: state.config.comms.rebel.cost.ap, neronAp: state.config.comms.neron.cost.ap,
      gardenRoom: state.config.botany.gardenRoom },
    maxAp: you.maxAp,
    maxMp: you.maxMp,
    maxHp: you.maxHp,
    maxMorale: you.maxMorale,
    // While the BIOS has the shield off, it shows as 0 (Claude's default, 2026-10-24); its points are kept.
    ship: shipView(state),
    // How many, to everyone; each hunter's hp and every turret's charges, to the living in a turret room (owner, 2026-10-24);
    // the hunters' hp also to a living pilot in flight (owner, 2026-10-28).
    hunters: {
      count: state.hunters.list.length,
      // Each hunter's kind and an asteroid's countdown along with its hp (owner, 2026-11-12, #388).
      list: you.alive && (turretsHere(state, you).length > 0 || shipAboard(you)) ? state.hunters.list.map(({ id, type, hp, countdown }) => ({ id, type, hp, countdown })) : null,
      turrets: you.alive && turretsHere(state, you).length > 0 ? Object.fromEntries(allTurrets(state).map((t) => [t.id, turretCharges(state, t.id)])) : null,
    },
    ...relayView(state, you),
    researchNeeds: you.alive && equipmentHere(state, you, "RESEARCH_LAB").length > 0 ? researchNeedsView(state, you.room) : null,
    pilgredRepaired: isPilgredRepaired(state),
    humanTankFull: hasMushDied(state),
    comms: { linked: state.comms.linked, terminal: you.alive && comTerminalsHere(state, you).length > 0 ? commsTerminalView(state) : null },
    bios: you.alive && biosTerminalsHere(state, you).length > 0 ? { ...state.bios } : null,
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
    expedition: expeditionView(state, you),
    // Who is lost, and where: a public alert (owner, 2026-11-08, #357; phase 2 accepted it).
    lost: lostPlayers(state).map((p) => ({ name: p.character, planet: orbitName(state) ?? "" })),
    // Your own planets only, and only the tags an analysis revealed (owner, 2026-10-19).
    maxPlanets: state.config.astro.maxPlanets,
    canSharePlanets: canSharePlanets(state, you),
    canShareReports: canShareReports(state, you),
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
    actions: [...legalOptions(state, you, legal), ...unaffordableActions(state, playerId)],
  };
}

/** `legal` with what each costs you and its odds. The client displays these and never computes them. */
function legalOptions(state: GameState, p: PlayerState, legal: Action[]): ActionOption[] {
  return legal.map((a) => {
    const def = ACTIONS[a.type] as ActionDef<Action>;
    return { action: a, cost: def.cost(state, p, a), chance: def.chance(state, p, a), dirt: def.dirtChanceMods(state, p, a), injury: def.injuryChanceMods(state, p, a), tags: [...def.tagsFor(state, a)], lacks: [] };
  });
}

/** Whether you can do an offered action now, rather than lacking the points for it. */
export const affordable = (option: Readonly<ActionOption>): boolean => option.lacks.length === 0;

/** The actions a view lets you do right now: its affordable options. */
export const legalIn = (view: Pick<PlayerView, "actions">): Action[] => view.actions.filter(affordable).map((o) => o.action);

/** Shielding (actions/reinforce.ts) is seen by living Engineers and Mush only. */
const seesShield = (viewer: Readonly<PlayerState>): boolean => viewer.alive && (viewer.role === "mush" || hasSkill(viewer, "engineer"));

/** An item as `viewer` sees it; a plant's sickness only for the Botanist role (`plantView`). */
function itemView({ id, type, of, builds, charges, teaches, plant, spores, hiddenBy, broken, jelly, shield, drone, document }: ItemState, viewer: Readonly<PlayerState>): ItemView {
  return { id, type, ...(broken && { broken }), ...(jelly !== undefined && viewer.role === "mush" && viewer.alive && { jelly }), ...(shield !== undefined && seesShield(viewer) && { shield }), ...(hiddenBy === viewer.id && { hidden: true as const }), ...(spores && viewer.role === "mush" && viewer.alive && { spores }), ...(of !== undefined && { of }), ...(builds !== undefined && { builds }), ...(charges !== undefined && { charges }), ...(teaches !== undefined && { teaches }), ...(plant && { plant: plantView(plant, viewer) }), ...(drone && { drone: droneView(drone) }), ...(document && { document: { kind: document.kind, rows: document.rows.map((r) => ({ ...r })) } }) };
}

/** A drone's public part (#411): name, serial and upgrades; its failure counts never leave the server. */
const droneView = ({ name, serial, upgrades }: Readonly<DroneState>): NonNullable<ItemView["drone"]> => ({ name, serial, upgrades: [...upgrades] });

function equipmentView(state: GameState, { id, type, broken, jelly, shield }: Equipment, viewer: Readonly<PlayerState>): EquipmentView {
  // Out and destroyed are known in the bay, where the ship is missing (owner, 2026-10-24); a docked ship's armor too,
  // so Renovate being offered tells nothing new (owner, 2026-10-28).
  const ship = type === PATROL_INTERFACE ? PATROL_SHIPS.find((s) => interfaceId(s) === id) : undefined;
  const shipState = ship && state.patrolShips[ship.id];
  const docked = shipState && !shipState.out && { armor: shipState.armor, maxArmor: state.config.patrol.armor[ship.kind] };
  // The Icarus is missing from its bay while away or once lost (owner, 2026-11-07); both are public anyway.
  const out = shipState?.out || (type === ICARUS_EQUIPMENT && ((state.expedition !== null && state.expedition.ship === null) || state.icarusLost));
  return { id, type, ...(broken && { broken }), ...(jelly !== undefined && viewer.role === "mush" && viewer.alive && { jelly }), ...(shield !== undefined && seesShield(viewer) && { shield }), ...(out && { out: true as const }), ...(shipState?.destroyed && { destroyed: true as const }), ...docked };
}

/**
 * The expedition under way, to everyone (owner, 2026-11-07): who is out, the planet, when they are back; the report's
 * id only to a living member, who already has the report.
 */
function expeditionView(state: GameState, you: PlayerState): PlayerView["expedition"] {
  const away = state.expedition;
  if (!away) return null;
  const report = state.expeditions.find((r) => r.id === away.report)!;
  return {
    crew: [...report.crew],
    planet: report.planet,
    returnAt: expeditionReturnAt(state)!,
    // The patrol ship that landed (owner, 2026-11-09, #359): public, as its bay shows it out and the crew is named.
    ...(report.ship !== undefined && { ship: report.ship }),
    ...(withCrew(state, you) && report.members.includes(you.id) && { report: report.id }),
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

