// Incident points (owner, 2026-10-25, #184 and #185-#190; eMushpedia "Embûches"). At each cycle change the ship's
// pool (`GameState.incidentPoints`, never sent to anyone) grows by the day's budget, scaled by the activity overload
// (difficulty.ts, #241); then, with chance pool ÷ `rollPoints`, incidents are bought one after another, each picked
// by weight among those the pool can afford that have a valid target, until none is left. Unspent points carry over.
// Pre-selection earns and spends nothing (owner, 2026-11-21: incident points start accumulating only after Mush
// selection). Incidents hit humans and Mush alike.

import { noGravity } from "./gravity.ts";
import { gainMorale } from "./adjustStats.ts";
import { breakEquipment, breakItem, workingBreakable } from "./breakage.ts";
import { damage } from "./death.ts";
import { scaleByActivity } from "./difficulty.ts";
import { addDisease } from "./diseases.ts";
import { allDoors, breakDoor } from "./doors.ts";
import { pushChat } from "./chat.ts";
import { daedalusRooms, isOnFire, startFire } from "./fire.ts";
import { ITEM_TYPES, isWorking, itemsIn } from "./items.ts";
import { logPrivate, logPublic } from "./log.ts";
import { projectDone } from "./projects.ts";
import { roll, rollFloat, rollInt, rollWeighted } from "./rng.ts";
import type { DeepReadonly, Equipment, GameConfig, GameState, ItemState, PlayerId, PlayerState, RoomId } from "./types.ts";

/** The built incidents. */
export const INCIDENT_IDS = [
  "tremor",
  "stuck_door",
  "fire",
  "panic_attack",
  "oxygen_leak",
  "electrical_overload",
  "metal_plate",
  "fuel_leak",
  "equipment_breakdown",
  "disease",
] as const;
export type IncidentId = (typeof INCIDENT_IDS)[number];

/** Who already had a once-per-cycle incident during this cycle change's spending. */
interface Spending {
  panicked: Set<PlayerId>;
  plated: Set<PlayerId>;
  sickened: Set<PlayerId>;
}

interface Incident {
  /** Whether it has a valid target right now. */
  possible: (state: Readonly<GameState>, spending: Spending) => boolean;
  /** Picks a target with the seeded RNG and applies the effect. Called only when `possible`. */
  apply: (state: GameState, spending: Spending) => void;
}

const pick = <T>(state: GameState, list: readonly T[]): T => list[rollInt(state, list.length)]!;

const aboard = (state: Readonly<GameState>): PlayerState[] => {
  const rooms = new Set(daedalusRooms(state));
  return state.players.filter((p) => p.alive && rooms.has(p.room));
};

const occupiedRooms = (state: Readonly<GameState>): RoomId[] => daedalusRooms(state).filter((room) => state.players.some((p) => p.alive && p.room === room));

const workingOf = (state: Readonly<GameState>, type?: string): Equipment[] =>
  daedalusRooms(state).flatMap((room) => workingBreakable(state, room).filter((e) => e.jelly === undefined && (type === undefined || e.type === type)));

/** Working items without green jelly of types with `canBreakOnCycleChange`, on the Daedalus floor or carried by someone living aboard. */
const breakableItems = (state: Readonly<GameState>): ItemState[] => {
  const rooms = new Set(daedalusRooms(state));
  const holders = new Set(aboard(state).map((p) => p.id));
  return state.items.filter((i) => {
    const type = ITEM_TYPES[i.type];
    if (!type?.canBreak || !type.canBreakOnCycleChange || !isWorking(i) || i.jelly !== undefined) return false;
    return i.at.kind === "room" ? rooms.has(i.at.id) : holders.has(i.at.id);
  });
};

/** One working piece of equipment, picked at random, never one with green jelly on it (owner, 2026-11-07: it breaks on its own timer, and being passed over cancels nothing, another is picked); with no `type` (a general breakdown) an eligible item may be picked instead. */
const breakOne = (type?: string): Incident => {
  const equipment = (state: Readonly<GameState>) => workingOf(state, type);
  const items = (state: Readonly<GameState>) => (type === undefined ? breakableItems(state) : []);
  return {
    possible: (state) => equipment(state).length + items(state).length > 0,
    apply: (state) => {
      const pool = [...equipment(state).map((e) => ({ e })), ...items(state).map((i) => ({ i }))];
      const target = pick(state, pool);
      // Reinforce (owner, 2026-11-07): shielding points out of 100 are the chance it holds. The roll is only made for shielded targets.
      const shield = "i" in target ? target.i.shield : target.e.shield;
      if (shield && rollFloat(state) < shield / 100) return;
      if ("i" in target) breakItem(state, target.i, true);
      else breakEquipment(state, target.e);
    },
  };
};

/** The incident's diseases this player doesn't have yet. */
const catchable = (state: Readonly<GameState>, p: Readonly<PlayerState>): string[] =>
  state.config.diseases.incidentDiseases.filter((d) => !p.modifiers.includes(d));

/** Anyone living aboard, Mush included (they carry it without suffering it), once per cycle each, who can still catch one. */
const sickenable = (state: Readonly<GameState>, sickened: ReadonlySet<PlayerId>): PlayerState[] =>
  aboard(state).filter((p) => !sickened.has(p.id) && catchable(state, p).length > 0);

const workingDoors = (state: Readonly<GameState>) => allDoors(state.config.rooms).filter((id) => !state.doors[id]?.broken);

const INCIDENTS: Record<IncidentId, Incident> = {
  // One room with crew; everyone there loses their own 1-3 HP roll (owner, 2026-11-01).
  tremor: {
    possible: (state) => occupiedRooms(state).length > 0,
    apply: (state) => {
      const room = pick(state, occupiedRooms(state));
      // Without gravity (broken or restarting), objects fly instead of the crew falling (owner, 2026-11-22).
      logPublic(state, room, noGravity(state) ? "tremorNoGravity" : "tremor");
      for (const p of state.players.filter((o) => o.alive && o.room === room)) damage(state, p, roll(state, state.config.incidents.tremor.damage), "injury");
    },
  },
  // One working door aboard breaks silently (owner, 2026-11-14, #330).
  stuck_door: {
    possible: (state) => workingDoors(state).length > 0,
    apply: (state) => {
      breakDoor(state, pick(state, workingDoors(state)));
    },
  },
  fire: {
    possible: (state) => daedalusRooms(state).some((room) => !isOnFire(state, room)),
    apply: (state) => startFire(state, pick(state, daedalusRooms(state).filter((room) => !isOnFire(state, room)))),
  },
  // Anyone living, Mush included (#190), once per cycle each.
  panic_attack: {
    possible: (state, { panicked }) => state.players.some((p) => p.alive && !panicked.has(p.id)),
    apply: (state, { panicked }) => {
      const victim = pick(state, state.players.filter((p) => p.alive && !panicked.has(p.id)));
      panicked.add(victim.id);
      logPrivate(state, victim.id, "panicAttack");
      gainMorale(state, victim, -state.config.incidents.panicAttack.morale);
    },
  },
  oxygen_leak: breakOne("OXYGEN_TANK"),
  fuel_leak: breakOne("FUEL_TANK"),
  equipment_breakdown: breakOne(),
  // A room with breakable equipment still working (owner, 2026-11-01): all of it breaks, and those present lose HP.
  electrical_overload: {
    possible: (state) => daedalusRooms(state).some((room) => workingBreakable(state, room).length > 0),
    apply: (state) => {
      const room = pick(state, daedalusRooms(state).filter((r) => workingBreakable(state, r).length > 0));
      logPublic(state, room, "electricalOverload");
      for (const equipment of workingBreakable(state, room)) breakEquipment(state, equipment);
      // Owner, 2026-11-11 (#411): it also breaks the items of a type that says so (drones) lying on the floor, not carried
      // ones. NERON announces each, as it does the equipment.
      for (const item of itemsIn(state, { kind: "room", id: room }).filter((i) => isWorking(i) && ITEM_TYPES[i.type]?.breaksInOverload)) breakItem(state, item, true);
      for (const p of state.players.filter((o) => o.alive && o.room === room)) damage(state, p, state.config.incidents.electricalOverload.damage, "electrocuted");
    },
  },
  // One person aboard, once per cycle each.
  metal_plate: {
    possible: (state, { plated }) => aboard(state).some((p) => !plated.has(p.id)),
    apply: (state, { plated }) => {
      const victim = pick(state, aboard(state).filter((p) => !plated.has(p.id)));
      plated.add(victim.id);
      logPublic(state, victim.room, "metalPlate", { name: victim.character });
      damage(state, victim, roll(state, state.config.incidents.metalPlate.damage), "metal_plate");
    },
  },
  // Owner, 2026-11-14: one person aboard, Mush included, once per cycle each, catches a random disease from
  // `config.diseases.incidentDiseases` they don't have yet, told privately.
  disease: {
    possible: (state, { sickened }) => sickenable(state, sickened).length > 0,
    apply: (state, { sickened }) => {
      const victim = pick(state, sickenable(state, sickened));
      sickened.add(victim.id);
      addDisease(state, victim, pick(state, catchable(state, victim)));
      logPrivate(state, victim.id, "incidentDisease");
    },
  },
};

/**
 * Points the pool gains at a cycle change on `day` (1-based): +1 on day 1, +2 on day 2, +1 from day 3; from day 5
 * another 1 + (day - 5); from day 10 another 2 + the day-5 addition + (day - 10). It dips from day 2 to day 3 (the
 * wiki's numbers), then never falls.
 */
export function incidentPointsForDay(config: DeepReadonly<GameConfig>, day: number): number {
  const { base, tier1, tier2 } = config.incidents.budget;
  const first = base[Math.min(Math.max(day, 1), base.length) - 1] ?? 0;
  const second = day >= tier1.fromDay ? tier1.bonus + (day - tier1.fromDay) : 0;
  const third = day >= tier2.fromDay ? tier2.bonus + second + (day - tier2.fromDay) : 0;
  return first + second + third;
}

/**
 * At each cycle change, `day` being the new cycle's: the pool grows, then maybe incidents are bought. Mutates a state
 * the caller already cloned.
 */
export function incidentsCycle(state: GameState, day: number): void {
  if (state.phase !== "playing" || state.preselection) return;
  state.incidentPoints += scaleByActivity(incidentPointsForDay(state.config, day), state);
  if (state.incidentPoints <= 0 || rollFloat(state) >= state.incidentPoints / state.config.incidents.rollPoints) return;
  // Bric-a-brac (owner, 2026-11-08): one roll per cycle change, made only once incidents are due; if it succeeds they are bought as usual but none happens.
  const prevented = projectDone(state, "BRIC_BROC") && rollFloat(state) < state.config.project.bricBroc.preventChance;
  const spending: Spending = { panicked: new Set(), plated: new Set(), sickened: new Set() };
  const { catalog } = state.config.incidents;
  let announced = false;
  while (state.phase === "playing") {
    const menu = INCIDENT_IDS.filter((id) => catalog[id].weight > 0 && catalog[id].cost > 0 && catalog[id].cost <= state.incidentPoints && INCIDENTS[id].possible(state, spending));
    if (menu.length === 0) return;
    const id = menu[rollWeighted(state, menu.map((m) => catalog[m].weight))]!;
    state.incidentPoints -= catalog[id].cost;
    if (!prevented) INCIDENTS[id].apply(state, spending);
    else if (!announced) {
      announced = true;
      pushChat(state, "global", { from: null, isBot: false, text: "", system: { key: "bricBrocPrevented" } });
    }
  }
}
