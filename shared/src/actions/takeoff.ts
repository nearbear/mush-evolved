import { Action, type ActionVisibility, isString, TRAVEL_UNDERWAY } from "./action.ts";
import { endPushToLeave } from "./accommodate.ts";
import { damage } from "../death.ts";
import { destroyPatrolShip, destroyShip } from "../hunters.ts";
import { logPrivate, logSecret } from "../log.ts";
import { isTraveling } from "../navigation.ts";
import { cleanManoeuvreChance } from "../modifiers.ts";
import { canFly, canTakeoff, dockedHere, groundedBy, interfaceId, PATROL_SHIPS, type PatrolShip } from "../patrol.ts";
import { roll, rollFloat } from "../rng.ts";
import { setRoom } from "../spot.ts";
import type { GameState, PlayerState, RoomId } from "../types.ts";

export type TakeoffActionData = { type: "takeoff"; equipment: string };

/**
 * Take off in a docked patrol ship or the Pasiphae from its interface in the bay (owner, 2026-10-24, docs/plans/archive/patrol.md):
 * 2 AP, always works, and moves the pilot alone into the ship's room. Gated by NERON's piloting crew lock unless the
 * actor is a Pilot or has `freeHacking` (owner, 2026-11-21). Secret: the line goes in the bay before the pilot leaves,
 * so whoever is there (or a camera) sees it. A push the pilot is part of ends.
 */
export class TakeoffAction extends Action<TakeoffActionData> {
  override visibility: ActionVisibility = "secret";

  constructor() {
    super("takeoff", { equipment: isString });
  }

  override getCost(state: Readonly<GameState>): { ap: number; mp: number } {
    return { ap: state.config.patrol.takeoff.cost.ap, mp: 0 };
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): TakeoffActionData[] {
    // Grounded (Chronic Vertigo, an illness) shows disabled with the reason (owner, 2026-11-22); the crew lock still hides it.
    if ((!canTakeoff(state, player) && canFly(player)) || isTraveling(state)) return [];
    return dockedHere(state, player).map((ship): TakeoffActionData => ({ type: "takeoff", equipment: interfaceId(ship) }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: TakeoffActionData): string | null {
    if (!canTakeoff(state, player)) return groundedBy(player) ?? "crew_lock";
    if (state.launched !== null) return TRAVEL_UNDERWAY;
    if (isTraveling(state)) return "traveling";
    if (!dockedHere(state, player).some((ship) => interfaceId(ship) === target.equipment)) return "no_ship";
    return null;
  }

  override injuryChance(state: Readonly<GameState>): number {
    return state.config.patrol.takeoff.injuryChance;
  }

  override apply(state: GameState, player: PlayerState, target: TakeoffActionData): void {
    const ship = PATROL_SHIPS.find((s) => interfaceId(s) === target.equipment)!; // checked, so it exists
    endPushToLeave(state, player);
    logSecret(state, player.id, "patrolTakeoff", { name: player.character, room: ship.id });
    state.patrolShips[ship.id]!.out = true;
    board(state, player, ship.id);
    manoeuvre(state, player, ship);
  }
}

/** Into the ship's room (takeoff) or back to the bay (landing). Nobody stands at a door: a ship has none. */
export function board(state: GameState, player: PlayerState, room: RoomId): void {
  setRoom(state, player, room);
  delete player.spot;
  delete player.enteredFrom;
}

/**
 * A takeoff or landing: clean at `cleanManoeuvreChance` (eMush: 20%; a Pilot always), otherwise rough. Rough costs the
 * hull 2 to 4 straight through the shield, the ship 1 armor (destroying it at 0: owner, 2026-11-15), and the pilot 0 to 2
 * hp, told only to the pilot (owner, 2026-10-24); the crew sees the hull counter. Mutates a cloned state.
 */
export function manoeuvre(state: GameState, pilot: PlayerState, ship: PatrolShip): void {
  const chance = cleanManoeuvreChance(state, pilot);
  if (chance >= 1) return;
  if (rollFloat(state) < chance) return;
  const rough = state.config.patrol.rough;
  const hull = roll(state, rough.hull);
  const hp = roll(state, rough.hp);
  const shipState = state.patrolShips[ship.id]!;
  shipState.armor = Math.max(0, shipState.armor - rough.armor);
  state.ship.hull = Math.max(0, state.ship.hull - hull);
  logPrivate(state, pilot.id, "patrolRough", { hull, armor: rough.armor, hp });
  damage(state, pilot, hp, "patrol_ship_explosion");
  if (shipState.armor === 0) destroyPatrolShip(state, ship, "patrolDestroyed");
  if (state.ship.hull === 0) destroyShip(state);
}
