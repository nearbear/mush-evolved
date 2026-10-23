import { Action } from "./action.ts";
import { logPrivate, logPublic } from "../log.ts";
import { canSteer, planetAt } from "../navigation.ts";
import { commandTerminalsHere } from "../pilgred.ts";
import type { GameState, PlayerState } from "../types.ts";

export type TravelActionData = { type: "travel"; equipment: string; distance: number };

/**
 * Send the Daedalus `distance` fuel the way it faces, from the Command terminal (owner, 2026-10-22, the wiki): 1 AP,
 * Commander only (Mush included, dirty or not), not while in orbit (leave_orbit.ts first). Any distance from 1 to the
 * farthest a planet can lie. Short of fuel, the AP is spent and nothing happens. Otherwise the fuel is spent, and every
 * planet on the ship except one lying exactly there is lost; that one, if any, puts the ship in its orbit and stays its
 * finder's alone. Everyone aboard learns the ship moved and whether it is in orbit; the finder alone learns which planet.
 */
export class TravelAction extends Action<TravelActionData> {
  constructor() {
    super("travel");
  }

  override getCost(state: Readonly<GameState>): { ap: number; mp: number } {
    return { ap: state.config.navigation.travel.cost.ap, mp: 0 };
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): TravelActionData[] {
    if (!canSteer(state, player) || state.navigation.orbit !== null) return [];
    const distances = Array.from({ length: state.config.astro.distance.max }, (_, i) => i + 1);
    return commandTerminalsHere(state, player).flatMap((terminal) => distances.map((distance): TravelActionData => ({ type: "travel", equipment: terminal.id, distance })));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: TravelActionData): string | null {
    if (!commandTerminalsHere(state, player).some((terminal) => terminal.id === target.equipment)) return "cant_steer";
    if (!canSteer(state, player)) return "not_commander";
    if (state.navigation.orbit !== null) return "in_orbit";
    if (!Number.isInteger(target.distance) || target.distance < 1 || target.distance > state.config.astro.distance.max) return "bad_distance";
    return null;
  }

  override apply(state: GameState, player: PlayerState, target: TravelActionData): void {
    if (state.ship.fuel < target.distance) {
      logPublic(state, player.room, "travelNoFuel", { name: player.character });
      return;
    }
    state.ship.fuel -= target.distance;
    const found = planetAt(state, state.navigation.heading, target.distance);
    for (const owner of Object.keys(state.planets)) {
      state.planets[owner] = owner === found?.[0] ? [found[1]] : [];
    }
    logPublic(state, undefined, "shipTraveled", { name: player.character });
    if (!found) return;
    const [owner, planet] = found;
    state.navigation.orbit = planet.id;
    logPublic(state, undefined, "shipInOrbit");
    logPrivate(state, owner, "orbitingPlanet", { planet: planet.name });
  }
}
