import { Action, type ActionVisibility } from "./action.ts";
import { endPushToLeave } from "./accommodate.ts";
import { damage } from "../death.ts";
import { destroyShip } from "../hunters.ts";
import { logPrivate, logSecret } from "../log.ts";
import { cleanManoeuvreChance } from "../modifiers.ts";
import { canFly, dockedHere, interfaceId, PATROL_SHIPS, type PatrolShip } from "../patrol.ts";
import { roll, rollFloat } from "../rng.ts";
import type { GameState, PlayerState, RoomId } from "../types.ts";

export type TakeoffActionData = { type: "takeoff"; equipment: string };

/**
 * Take off in a docked patrol ship or the Pasiphae from its interface in the bay (owner, 2026-10-24, docs/patrol-plan.md):
 * 2 AP, always works, and moves the pilot alone into the ship's room. Pilots only for now. Secret: the line goes in the
 * bay before the pilot leaves, so whoever is there (or a camera) sees it. A push the pilot is part of ends.
 */
export class TakeoffAction extends Action<TakeoffActionData> {
  override visibility: ActionVisibility = "secret";

  constructor() {
    super("takeoff");
  }

  override getCost(state: Readonly<GameState>): { ap: number; mp: number } {
    return { ap: state.config.patrol.takeoff.cost.ap, mp: 0 };
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): TakeoffActionData[] {
    if (!canFly(player)) return [];
    return dockedHere(state, player).map((ship): TakeoffActionData => ({ type: "takeoff", equipment: interfaceId(ship) }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: TakeoffActionData): string | null {
    if (!canFly(player)) return "cant_fly";
    if (!dockedHere(state, player).some((ship) => interfaceId(ship) === target.equipment)) return "no_ship";
    return null;
  }

  override apply(state: GameState, player: PlayerState, target: TakeoffActionData): void {
    const ship = PATROL_SHIPS.find((s) => interfaceId(s) === target.equipment)!; // checked, so it exists
    endPushToLeave(state, player);
    logSecret(state, player.id, "patrolTakeoff", { name: player.character, room: ship.id });
    state.patrolShips[ship.id]!.out = true;
    board(player, ship.id);
    manoeuvre(state, player, ship);
  }
}

/** Into the ship's room (takeoff) or back to the bay (landing). Nobody stands at a door: a ship has none. */
export function board(player: PlayerState, room: RoomId): void {
  player.room = room;
  delete player.spot;
}

/**
 * A takeoff or landing: clean at `cleanManoeuvreChance` (eMush: 20%; a Pilot always), otherwise rough. Rough costs the
 * hull 2 to 4 straight through the shield, the ship 1 armor, and the pilot 0 to 2 hp, told only to the pilot (owner,
 * 2026-10-24); the crew sees the hull counter. Never rough yet, since only Pilots fly. Mutates a cloned state.
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
  damage(state, pilot, hp);
  if (state.ship.hull === 0) destroyShip(state);
}
