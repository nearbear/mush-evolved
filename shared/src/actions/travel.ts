import { Action, ARACK_AROUND, isString, REACTOR_BROKEN } from "./action.ts";
import { endRebelCalls } from "../comms.ts";
import { merchantsLeave } from "../merchants.ts";
import { arackAround, huntersFollow, loseShipsInFlight } from "../hunters.ts";
import { pullShipsAboard } from "./land.ts";
import { strandExpedition } from "../expeditions.ts";
import { logPublic } from "../log.ts";
import { canSteer, canTravel, isTraveling, planetAt } from "../navigation.ts";
import { commandTerminalsHere } from "../pilgred.ts";
import type { GameState, PlayerState, Planet } from "../types.ts";
import { shipMoved } from "../modifiers.ts";
import { markSharedPlanetsStale } from "../sharedPlanets.ts";

export type TravelActionData = { type: "travel"; equipment: string };

/**
 * Send the Daedalus the way it faces, from the Command terminal (owner, 2026-10-22, the wiki): 1 AP, Commander only
 * (Mush included, dirty or not), not while in orbit (leave_orbit.ts first), nor while the Emergency reactor is broken (owner, 2026-11-08; shown disabled with the reason, owner, 2026-11-12). It goes as far as the fuel loaded in the
 * combustion chamber, all of which burns (owner, 2026-10-23: the crew loads it by hand, take_fuel.ts; no distance is
 * chosen). With the chamber empty, the AP is spent and nothing happens. Otherwise the fuel is spent, and every
 * planet on the ship except one lying exactly there is lost; that one, if any, puts the ship in its orbit and stays its
 * finder's alone. Half the hunters follow (hunters.ts). All of that happens at once, but the ship takes until the next
 * cycle change to arrive (owner, 2026-10-29, `navigation.arriving`): only then is it in orbit (`arriveShip`, navigation.ts),
 * and nothing can be steered, scanned or launched meanwhile. Everyone aboard learns the ship moved; at the arrival, whether it is in orbit, and the finder alone which planet.
 */
export class TravelAction extends Action<TravelActionData> {
  override terminal = true;

  constructor() {
    super("travel", { equipment: isString });
  }

  override getCost(state: Readonly<GameState>): { ap: number; mp: number } {
    return { ap: state.config.navigation.travel.cost.ap, mp: 0 };
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): TravelActionData[] {
    if (!canSteer(state, player) || state.navigation.orbit !== null || isTraveling(state)) return [];
    return commandTerminalsHere(state, player).map((terminal): TravelActionData => ({ type: "travel", equipment: terminal.id }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: TravelActionData): string | null {
    if (!commandTerminalsHere(state, player).some((terminal) => terminal.id === target.equipment)) return "cant_steer";
    if (!canSteer(state, player)) return "not_commander";
    if (state.navigation.orbit !== null) return "in_orbit";
    if (isTraveling(state)) return "traveling";
    if (!canTravel(state)) return REACTOR_BROKEN;
    // Owner, 2026-11-12 (#388; eMush): an Arack around stops the jump, no AP spent.
    if (arackAround(state)) return ARACK_AROUND;
    return null;
  }

  override apply(state: GameState, player: PlayerState, target: TravelActionData): void {
    const distance = state.ship.combustion;
    if (distance < 1) {
      logPublic(state, player.room, "travelNoFuel", { name: player.character });
      return;
    }
    state.ship.combustion = 0;
    jump(state, player, distance);
  }
}

/**
 * The ship goes `distance` the way it faces, with everything a jump does (above) but the fuel: the warp cheat
 * (warp_to_planet.ts) jumps the same way. Returns the planet it is heading for, if any; the ship arrives at the next cycle change.
 */
export function jump(state: GameState, player: Readonly<PlayerState>, distance: number): Planet | null {
  shipMoved(state);
  huntersFollow(state);
  endRebelCalls(state);
  merchantsLeave(state);
  const found = planetAt(state, state.navigation.heading, distance);
  for (const owner of Object.keys(state.planets)) {
    state.planets[owner] = owner === found?.[0] ? [found[1]] : [];
  }
  // The lost planets' entries no longer apply; the destination's stays, as the planet stays in play (owner, 2026-10-31).
  markSharedPlanetsStale(state, found ? found[1].id : null);
  logPublic(state, undefined, "shipTraveled", { name: player.character });
  pullShipsAboard(state);
  loseShipsInFlight(state);
  strandExpedition(state);
  state.navigation.orbit = null;
  state.navigation.arriving = { planet: found ? found[1].id : null };
  return found ? found[1] : null;
}
