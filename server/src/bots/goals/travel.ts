import { DEFAULT_CONFIG, FUEL_CAPSULE_ITEM, PLANET_DIRECTIONS, type Action, type PlanetDirection, type PlayerView, type RoomId } from "@mush2/shared";
import { dutyPriority, holdsTrigger } from "../duties.ts";
import { expeditionsOver } from "../expeditionShare.ts";
import { formatFuelNeed, type FuelMemory } from "../fuelShare.ts";
import { orbitExplored } from "../reportShare.ts";
import { CANCEL_HOLD_LINE, HOLD_JUMP_LINE, JUMP_NOW_LINE, crewAboard, holdStartCycle, isHoldingJump, isJumpDue, jumpNowCycle, parsePlanetShare, type SharedPlanetInfo } from "../planetShare.ts";
import { act, failed, find, goTo, nearest, offered, rawCanAfford, roomsWith, where } from "./blocks.ts";
import type { BotMemory, Goal, GoalDef, GoalStep } from "./types.ts";

const COMMAND = "PILOT_MODULE";
export const CHAMBER = "COMBUSTION_CHAMBER_ACCESS";
export const TANK = "FUEL_TANK";

/**
 * Cycles the Commander waits for someone to answer `Fuel: need <N>` before loading the chamber himself (fuel relay,
 * owner 2026-11-20: an acceptable fallback; 2 is Claude's pick). A jump that is due doesn't wait.
 */
export const FUEL_WAIT_CYCLES = 2;

/** Hold `travel` until at least this many hunters are attacking (#421; 7 was tried in the oxygen plan's Run C, 2026-11-21, and lost). */
export const HOLD_HUNTER_TRIGGER = 5;
/** Maximum days to hold a prepared jump before jumping anyway (#421). */
export const HOLD_MAX_DAYS = 4;
/**
 * Cycles the Commander waits after `"Jump: now"` for the crew to come back aboard before jumping anyway (owner,
 * 2026-11-13): a safety limit. Pilots land with their last AP, so a flight shouldn't outlast it.
 */
export const JUMP_WAIT_CYCLES = 2;

/** Whether the jump can go: the minimap shows the whole living crew aboard, or the wait after `"Jump: now"` is over. */
function clearToJump(view: PlayerView, memory: BotMemory): boolean {
  if (crewAboard(view)) return true;
  const since = jumpNowCycle(view, memory);
  return since !== null && view.cycle - since >= JUMP_WAIT_CYCLES;
}

export interface JumpTarget {
  /** Destination heading, or `null` for an escape jump into empty space on the current heading. */
  direction: PlanetDirection | null;
  distance: number;
}

/** AP to face `direction` the shorter way and travel: what the Commander must have before it sets out (a broken reactor's longer way is found only at the terminal). */
function steerAp(view: PlayerView, direction: PlanetDirection | null, memory?: BotMemory): number {
  const nav = DEFAULT_CONFIG.navigation; // costs at a terminal the bot isn't at come from the public base config
  const heading = view.navigation.heading ?? memory?.heading ?? null;
  const ways = direction === null || heading === null ? null : turnsTo(heading, direction);
  const turns = ways ? Math.min(ways.left, ways.right) : 0;
  return turns * nav.turn.cost.ap + nav.travel.cost.ap;
}

/**
 * Where the ship should go (#417; owner, 2026-11-12): the most recent applicable share written in the bots' format
 * (`planetShare.ts`), whoever wrote it (a human Mush can share a fake one: accepted), whose distance the fuel in the
 * tanks, in the chamber (`chamberFuel`), and in the bot's hands covers. Null while traveling or in orbit.
 */
export function sharedDestination(view: PlayerView, chamberFuel = 0): SharedPlanetInfo | null {
  if (view.navigation.traveling || view.navigation.orbiting) return null;
  const carried = view.inventory.filter((i) => i.type === FUEL_CAPSULE_ITEM).length;
  const reach = view.ship.fuel + carried + chamberFuel;
  const shares = view.sharedPlanets
    .map((entry, i) => ({ entry, i, info: entry.stale ? null : parsePlanetShare(entry.text) }))
    .filter((s): s is typeof s & { info: SharedPlanetInfo } => s.info !== null && s.info.distance <= reach);
  shares.sort((a, b) => b.entry.day - a.entry.day || b.entry.cycleOfDay - a.entry.cycleOfDay || b.i - a.i);
  return shares[0]?.info ?? null;
}

/**
 * What jump to prepare (#421): the shared destination if any, otherwise a 1-fuel escape jump on the ship's current
 * heading so the ship can evade hunters even without a discovered planet. Null if out of fuel, traveling, or in orbit.
 */
export function targetJump(view: PlayerView, chamber: number | null): JumpTarget | null {
  if (view.navigation.traveling || view.navigation.orbiting) return null;
  const dest = sharedDestination(view, chamber ?? 0);
  if (dest) return { direction: dest.direction, distance: dest.distance };
  const carried = view.inventory.filter((i) => i.type === FUEL_CAPSULE_ITEM).length;
  const reach = view.ship.fuel + carried + (chamber ?? 0);
  if (reach < 1) return null;
  return { direction: null, distance: 1 };
}

/**
 * Whether a prepared jump should execute now instead of holding (#421). A jump `toPlanet` never holds (oxygen plan
 * Run B, 2026-11-21): it still goes through `"Jump: now"` and the wait for the crew. An escape jump holds for hunters or
 * `HOLD_MAX_DAYS`; low oxygen no longer counts for either (#421's `HOLD_MIN_OXYGEN` applied only to planet jumps after Run D).
 */
export function shouldJumpNow(view: PlayerView, holdStart: number | null, toPlanet: boolean): boolean {
  if (toPlanet) return true;
  if (view.hunters.count >= HOLD_HUNTER_TRIGGER) return true;
  if (holdStart !== null && view.cycle - holdStart >= HOLD_MAX_DAYS * DEFAULT_CONFIG.cyclesPerDay) return true;
  return false;
}

/**
 * Whether the Commander's jump is due as anyone can tell from public information (#421): `"Jump: now"` is up, or a
 * hold is up and its trigger is met (a shared planet to jump to, the hunter count, the hold line's cycle). Pilots check this before taking
 * off: a takeoff is a timed action nobody in another room sees, so waiting for `"Jump: now"` would race the jump.
 */
export function jumpDueByChat(view: PlayerView, memory: BotMemory): boolean {
  if (isJumpDue(view, memory)) return true;
  const since = holdStartCycle(view, memory);
  return since !== null && shouldJumpNow(view, since, sharedDestination(view) !== null);
}

/**
 * The chamber's level from this bot's own latest reading in its log (or remembered in `memory.combustion` across
 * room changes / log pruning), reset to `null` by `shipTraveled` or `leftOrbit` (both change the level).
 */
export function combustionReading(view: PlayerView, memory?: BotMemory): number | null {
  for (let i = view.log.length - 1; i >= 0; i--) {
    const line = view.log[i]!;
    if (line.key === "shipTraveled" || line.key === "leftOrbit") {
      if (memory) memory.combustion = null;
      return null;
    }
    const mine = line.key === "checkedCombustion" || ((line.key === "loadedFuel" || line.key === "unloadedFuel") && line.params?.name === view.you.character);
    if (mine && typeof line.params?.level === "number") {
      if (memory) memory.combustion = line.params.level;
      return line.params.level;
    }
  }
  return memory?.combustion ?? null;
}

/**
 * The chamber's level as the Commander knows it: a helper's report since the standing request (`Fuel: chamber at`,
 * trusted: owner, 2026-11-20), else his own reading (`combustionReading`).
 */
export function chamberLevel(view: PlayerView, memory: BotMemory): number | null {
  const { request, report } = memory.fuel;
  if (request && report && report.seq > request.seq) return report.level;
  return combustionReading(view, memory);
}

/** Whether a request for `level` is up for where the ship is now (`orbit`), and how long ago it went up. */
function askedFor(view: PlayerView, fuel: FuelMemory, level: number): number | null {
  const r = fuel.request;
  return r && r.level === level && r.orbit === view.navigation.orbiting ? view.cycle - r.cycle : null;
}

/** Quarter turns to face `to` from `from`, each way (`PLANET_DIRECTIONS` runs anticlockwise, so left is the next one). */
export function turnsTo(from: PlanetDirection, to: PlanetDirection): { left: number; right: number } {
  const n = PLANET_DIRECTIONS.length;
  const left = (PLANET_DIRECTIONS.indexOf(to) - PLANET_DIRECTIONS.indexOf(from) + n) % n;
  return { left, right: (n - left) % n };
}

/**
 * When the current hold started: the earlier of the hold line read in chat (`BotMemory.jump`, kept after the line
 * scrolls out, #427) and the bot's own memory of starting it.
 */
function effectiveHoldStart(view: PlayerView, memory: BotMemory): number | null {
  const chat = holdStartCycle(view, memory);
  if (chat === null) return memory.holdSince;
  return memory.holdSince === null ? chat : Math.min(chat, memory.holdSince);
}

function isPrepared(view: PlayerView, memory: BotMemory, chamber: number | null, target: JumpTarget): boolean {
  if (chamber !== target.distance) return false;
  if (target.direction === null) return true;
  return (view.navigation.heading ?? memory.heading) === target.direction;
}

/**
 * The Commander's travel (`BOT_DUTIES`; owner, 2026-11-12, #417 & #421): prepares a jump in advance (checks the
 * combustion chamber, loads the fuel, turns the ship, and walks to the bridge), then announces `"Jump: hold"` in global
 * chat. A jump to a shared planet goes as soon as it is prepared (oxygen plan Run B); an escape jump holds `travel` until
 * at least `HOLD_HUNTER_TRIGGER` (5) hunters attack or `HOLD_MAX_DAYS` (4) days elapse (oxygen doesn't count: Run D). Then it flees: it jumps at once if the minimap shows the whole living crew
 * aboard, else it posts `"Jump: now"` (pilots land and stay docked) and jumps once they are, or after `JUMP_WAIT_CYCLES` (2) anyway. Uses `sharedDestination` if available, else a 1-fuel escape jump on the current
 * heading, and cancels the hold (`"Jump: off"`) after jumping or giving up. A human Commander means no travel or escape jumps.
 */
export const travel: GoalDef = {
  id: "travel",
  get priority() {
    return dutyPriority("destination");
  },
  options(view, memory) {
    if (!holdsTrigger(view, "destination")) return [];
    if (view.navigation.heading !== null) memory.heading = view.navigation.heading;

    const firstBridge = roomsWith(view, [COMMAND])[0] ?? view.you.room;
    if (memory.cancelHold || memory.justJumped || memory.failedReason !== null) {
      return [travelGoal(view, memory, firstBridge, { direction: null, distance: 1 })];
    }
    if (view.navigation.traveling || view.navigation.orbiting) {
      if (isHoldingJump(view, memory) && view.chatChannels.includes("global")) {
        return [travelGoal(view, memory, firstBridge, { direction: null, distance: 1 })];
      }
      memory.holdSince = null;
      // On arriving in orbit, ask for the fuel to leave, so the chamber is filled while the planet is explored.
      const leaveFuel = DEFAULT_CONFIG.navigation.leaveOrbit.fuel;
      if (view.navigation.orbiting && view.chatChannels.includes("global") && memory.fuel.request?.orbit !== true && (chamberLevel(view, memory) ?? 0) < leaveFuel && view.ship.fuel >= leaveFuel) {
        return [fuelRequestGoal(leaveFuel)];
      }
      if (!readyToLeaveOrbit(view, memory)) return [];
      const chamber = chamberLevel(view, memory) ?? 0;
      const carried = view.inventory.filter((i) => i.type === FUEL_CAPSULE_ITEM).length;
      if (view.ship.fuel + carried + chamber < DEFAULT_CONFIG.navigation.leaveOrbit.fuel) return [];
      const ap = DEFAULT_CONFIG.navigation.leaveOrbit.cost.ap;
      const bridge = roomsWith(view, [COMMAND]).find((r) => !memory.ended.has(`leaveOrbit:${r}`) && rawCanAfford(view, r, ap, 0));
      return bridge ? [leaveOrbitGoal(view, bridge)] : [];
    }

    const chamber = chamberLevel(view, memory);
    const target = targetJump(view, chamber);
    if (!target) {
      if (isHoldingJump(view, memory) && view.chatChannels.includes("global")) {
        return [travelGoal(view, memory, firstBridge, { direction: null, distance: 1 })];
      }
      memory.holdSince = null;
      return [];
    }

    const prepared = isPrepared(view, memory, chamber, target);
    const holdStart = effectiveHoldStart(view, memory);
    // Holding: nothing to do until the trigger.
    const due = isJumpDue(view, memory) || shouldJumpNow(view, holdStart, target.direction !== null);
    if (prepared && holdStart !== null && !due) {
      return [];
    }
    // Due, announced, and someone is still out on the minimap: nothing to do until they are back aboard.
    if (prepared && isJumpDue(view, memory) && !clearToJump(view, memory)) return [];

    const apNeeded = prepared ? DEFAULT_CONFIG.navigation.travel.cost.ap : steerAp(view, target.direction, memory);
    const bridge = roomsWith(view, [COMMAND]).find((r) => !memory.ended.has(`travel:${r}`) && rawCanAfford(view, r, apNeeded, 0));
    if (!bridge) return [];
    return [travelGoal(view, memory, bridge, target)];
  },
};

function travelGoal(view: PlayerView, _memory: BotMemory, bridge: RoomId, initialTarget: JumpTarget): Goal {
  /** Tanks found offering no capsule (broken) in this run of the goal. */
  const dryTanks = new Set<RoomId>();
  const label =
    initialTarget.direction === null
      ? `Prepare an escape jump (1 fuel) from the Command terminal ${where(view, bridge)}` // i18n-ignore: model prompt text, not player-visible
      : `Fill the combustion chamber and steer the ship ${initialTarget.direction}, ${initialTarget.distance} fuel, to the shared destination from the Command terminal ${where(view, bridge)}`; // i18n-ignore: model prompt text, not player-visible

  return {
    id: "travel",
    key: `travel:${bridge}`,
    label,
    step(v, memory) {
      if (v.navigation.heading !== null) memory.heading = v.navigation.heading;

      if (memory.cancelHold) {
        memory.cancelHold = false;
        if (isHoldingJump(v, memory) && v.chatChannels.includes("global")) {
          return { kind: "social", message: { type: "chat", channel: "global", text: CANCEL_HOLD_LINE } };
        }
      }
      if (memory.justJumped) {
        memory.justJumped = false;
        return { kind: "done" };
      }
      if (memory.failedReason !== null) {
        const reason = memory.failedReason;
        memory.failedReason = null;
        return failed(reason);
      }

      const failWithCancel = (reason: string): GoalStep => {
        memory.holdSince = null;
        if (isHoldingJump(v, memory) && v.chatChannels.includes("global")) {
          memory.failedReason = reason;
          return { kind: "social", message: { type: "chat", channel: "global", text: CANCEL_HOLD_LINE } };
        }
        return failed(reason);
      };

      const finishWithCancel = (): GoalStep => {
        memory.holdSince = null;
        if (isHoldingJump(v, memory) && v.chatChannels.includes("global")) {
          memory.justJumped = true;
          return { kind: "social", message: { type: "chat", channel: "global", text: CANCEL_HOLD_LINE } };
        }
        return { kind: "done" };
      };

      if (v.navigation.traveling || v.navigation.orbiting) {
        memory.combustion = null;
        return finishWithCancel();
      }

      const level = chamberLevel(v, memory);
      const target = targetJump(v, level);
      if (!target) return finishWithCancel();

      // The hold goes up as preparing starts, so a line is always up before a jump and pilots can tell from it when
      // the jump is due (`jumpDueByChat`): a takeoff already under way when `"Jump: now"` is posted can't be seen.
      if (!isHoldingJump(v, memory) && v.chatChannels.includes("global")) {
        memory.holdSince ??= v.cycle;
        return { kind: "social", message: { type: "chat", channel: "global", text: HOLD_JUMP_LINE } };
      }

      // The fuel relay (owner, 2026-11-20): ask for the chamber in global chat and let a helper fill it; load it
      // himself only after `FUEL_WAIT_CYCLES` without a report, when the jump is due, or without global chat.
      const fueled = level === target.distance;
      if (!fueled) {
        const asked = askedFor(v, memory.fuel, target.distance);
        if (asked === null && v.chatChannels.includes("global")) {
          return { kind: "social", message: { type: "chat", channel: "global", text: formatFuelNeed(target.distance) } };
        }
        // Only the hold's triggers cut the wait short: a planet jump is due once prepared (Run B), but not urgent.
        const due = isJumpDue(v, memory) || shouldJumpNow(v, effectiveHoldStart(v, memory), false);
        const waiting = asked !== null && asked < FUEL_WAIT_CYCLES && !due;
        if (!waiting) {
          if (level === null) {
            return pauseIfOutOfPoints(v, atChamber(v, () => find(v, "check_combustion")), failWithCancel);
          }
          const carried = v.inventory.filter((i) => i.type === FUEL_CAPSULE_ITEM).length;
          const need = target.distance - level;
          if (need > 0) {
            return pauseIfOutOfPoints(v, fuel(v, need, carried, dryTanks), failWithCancel);
          }
          return pauseIfOutOfPoints(v, atChamber(v, () => find(v, "unload_fuel")), failWithCancel);
        }
      }

      const walk = goTo(v, bridge);
      if (walk) return pauseIfOutOfPoints(v, walk, failWithCancel);

      const heading = v.navigation.heading;
      if (heading === null) return failWithCancel("cant_steer");
      memory.heading = heading;

      if (target.direction !== null && heading !== target.direction) {
        const ways = turnsTo(heading, target.direction);
        const turnOptions = offered(v, "turn_ship")
          .filter((o) => o.lacks.length === 0)
          .sort((a, b) => ways[a.action.side] - ways[b.action.side]);
        const turn = turnOptions[0];
        if (!turn) {
          if (lacksOnlyPoints(v, "turn_ship")) return { kind: "done" };
          return failWithCancel("cant_steer");
        }
        return act(turn.action);
      }
      // On the bridge and facing the way, waiting for a helper's fuel report.
      if (!fueled) return { kind: "done" };

      const holdStart = effectiveHoldStart(v, memory);
      if (!isJumpDue(v, memory) && !shouldJumpNow(v, holdStart, target.direction !== null)) {
        memory.holdSince ??= v.cycle;
        if (!isHoldingJump(v, memory) && v.chatChannels.includes("global")) {
          return { kind: "social", message: { type: "chat", channel: "global", text: HOLD_JUMP_LINE } };
        }
        return { kind: "done", again: true };
      }

      // The decision to flee (owner, 2026-11-13): once announced it stands. The jump waits until the minimap shows
      // every living crewmate aboard, so nobody out in a patrol ship is left behind, or `JUMP_WAIT_CYCLES` have passed.
      // `"Jump: now"` always goes up first, so pilots hear of the jump before it (even with everyone aboard).
      memory.holdSince ??= v.cycle;
      if (!isJumpDue(v, memory) && v.chatChannels.includes("global")) {
        return { kind: "social", message: { type: "chat", channel: "global", text: JUMP_NOW_LINE } };
      }
      if (!clearToJump(v, memory)) return { kind: "done", again: true };

      const go = find(v, "travel");
      if (!go) {
        // Out of AP (travel may then not be offered at all): wait for the next cycle with the hold still up.
        if (lacksOnlyPoints(v, "travel") || v.you.ap < DEFAULT_CONFIG.navigation.travel.cost.ap) return { kind: "done" };
        return failWithCancel("cant_steer");
      }
      memory.combustion = null;
      memory.holdSince = null;
      memory.cancelHold = isHoldingJump(v, memory) && v.chatChannels.includes("global");
      memory.justJumped = true;
      return act(go);
    },
  };
}

/**
 * Whether the Commander leaves orbit now (#417; owner, 2026-11-12: "leaves orbit once every sector is explored"): in
 * orbit, every sector of the planet explored by the shared reports it has read (`orbitExplored`), no expedition under
 * way and nobody out in a patrol ship or the Icarus (`crewAboard`): leaving strands an expedition and loses ships in flight.
 * Crew lost on the planet are left behind (owner, 2026-11-15): with every sector explored no expedition would find them.
 * Also once a bot in the bay said no expedition can launch (`expeditionsOver`, owner 2026-11-19): every sector explored
 * or the Icarus lost, which covers a report that never comes (its explorer died, or a sector was added mid-orbit).
 */
export function readyToLeaveOrbit(view: PlayerView, memory: BotMemory): boolean {
  return view.navigation.orbiting && view.expedition === null && (orbitExplored(view, memory) === true || expeditionsOver(view, memory)) && crewAboard(view);
}

/**
 * Leaving orbit (#417): checks the combustion chamber, loads `navigation.leaveOrbit.fuel` from the tanks if short (extra
 * loaded fuel stays: leaving burns only that much), walks to the bridge and leaves. The ship then travels into empty
 * space, and `travel` takes over from there with the next shared planet.
 */
function leaveOrbitGoal(view: PlayerView, bridge: RoomId): Goal {
  const dryTanks = new Set<RoomId>();
  return {
    id: "travel",
    key: `leaveOrbit:${bridge}`,
    label: `Leave orbit from the Command terminal ${where(view, bridge)}: every sector of the planet is explored`, // i18n-ignore: model prompt text, not player-visible
    step(v, memory) {
      if (!readyToLeaveOrbit(v, memory)) return { kind: "done" };
      const leaveFuel = DEFAULT_CONFIG.navigation.leaveOrbit.fuel;
      const level = chamberLevel(v, memory);
      // The fuel relay (owner, 2026-11-20): the request went up on arrival (`fuelRequestGoal`); load it himself only
      // after `FUEL_WAIT_CYCLES` without a report, or without global chat.
      const fueled = level !== null && level >= leaveFuel;
      if (!fueled) {
        const asked = askedFor(v, memory.fuel, leaveFuel);
        if (asked === null && v.chatChannels.includes("global")) {
          return { kind: "social", message: { type: "chat", channel: "global", text: formatFuelNeed(leaveFuel) } };
        }
        if (asked === null || asked >= FUEL_WAIT_CYCLES) {
          if (level === null) return pauseIfOutOfPoints(v, atChamber(v, () => find(v, "check_combustion")), failed);
          const carried = v.inventory.filter((i) => i.type === FUEL_CAPSULE_ITEM).length;
          return pauseIfOutOfPoints(v, fuel(v, leaveFuel - level, carried, dryTanks), failed);
        }
      }
      const walk = goTo(v, bridge);
      if (walk) return pauseIfOutOfPoints(v, walk, failed);
      if (!fueled) return { kind: "done" }; // on the bridge, waiting for a helper's report
      const leave = find(v, "leave_orbit");
      if (!leave) {
        if (lacksOnlyPoints(v, "leave_orbit")) return { kind: "done" };
        return failed("cant_steer");
      }
      memory.combustion = null;
      return act(leave);
    },
  };
}

/** Posts `Fuel: need <level>` once (fuel relay, owner 2026-11-20): the Commander's request on arriving in orbit. */
function fuelRequestGoal(level: number): Goal {
  return {
    id: "travel",
    key: `fuelRequest:${level}`,
    label: `Ask in global chat for ${level} fuel in the combustion chamber`, // i18n-ignore: model prompt text, not player-visible
    step(v, memory) {
      if (memory.fuel.request?.orbit === v.navigation.orbiting && memory.fuel.request.level === level) return { kind: "done" };
      if (!v.chatChannels.includes("global")) return { kind: "done" };
      return { kind: "social", message: { type: "chat", channel: "global", text: formatFuelNeed(level) } };
    },
  };
}

const lacksOnlyPoints = (view: PlayerView, type: Action["type"]): boolean =>
  offered(view, type).some((o) => o.lacks.length > 0 && o.lacks.every((l) => l === "ap" || l === "mp"));

export function pauseIfOutOfPoints(view: PlayerView, step: GoalStep, onFail: (reason: string) => GoalStep): GoalStep {
  if (step.kind !== "failed") return step;
  if (step.reason === "cant_move" && lacksOnlyPoints(view, "move")) return { kind: "done" };
  return onFail(step.reason);
}

/** Walks to the combustion chamber, then takes the action `pick` finds there. */
export function atChamber(view: PlayerView, pick: () => ReturnType<typeof find>): GoalStep {
  const room = nearest(view, roomsWith(view, [CHAMBER]))[0];
  if (!room) return failed("no_chamber");
  const walk = goTo(view, room);
  if (walk) return walk;
  const action = pick();
  return action ? act(action) : failed("cant_fuel");
}

/**
 * One step toward loading `need` more capsules: take them from the nearest tank while the hands hold more, then load
 * what is carried. Capsules already carried are loaded first. A tank offering none (broken) is noted in `dry` and the
 * next one tried.
 */
export function fuel(view: PlayerView, need: number, carried: number, dry: Set<RoomId>): GoalStep {
  if (carried < need) {
    const here = view.you.room;
    if (roomsWith(view, [TANK]).includes(here)) {
      const take = find(view, "take_fuel");
      if (take) return act(take);
      // Hands full: load what is carried. None offered at all: this tank is out of order.
      if (offered(view, "take_fuel").length === 0) dry.add(here);
    }
    const tank = nearest(view, roomsWith(view, [TANK]).filter((r) => !dry.has(r)))[0];
    if (carried === 0 && tank !== undefined) return goTo(view, tank) ?? failed("no_path");
  }
  if (carried === 0) return failed("no_fuel");
  return atChamber(view, () => find(view, "load_fuel"));
}
