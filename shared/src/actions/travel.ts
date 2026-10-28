import { Action, isString } from "./action.ts";
import { huntersFollow } from "../hunters.ts";
import { logPrivate, logPublic } from "../log.ts";
import { canSteer, planetAt } from "../navigation.ts";
import { commandTerminalsHere } from "../pilgred.ts";
import type { GameState, PlayerState } from "../types.ts";
import { shipMoved } from "../modifiers.ts";

export type TravelActionData = { type: "travel"; equipment: string };

/**
 * Send the Daedalus the way it faces, from the Command terminal (owner, 2026-10-22, the wiki): 1 AP, Commander only
 * (Mush included, dirty or not), not while in orbit (leave_orbit.ts first). It goes as far as the fuel loaded in the
 * combustion chamber, all of which burns (owner, 2026-10-23: the crew loads it by hand, take_fuel.ts; no distance is
 * chosen). With the chamber empty, the AP is spent and nothing happens. Otherwise the fuel is spent, and every
 * planet on the ship except one lying exactly there is lost; that one, if any, puts the ship in its orbit and stays its
 * finder's alone. Half the hunters follow (hunters.ts). Everyone aboard learns the ship moved and whether it is in orbit; the finder alone learns which planet.
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
    if (!canSteer(state, player) || state.navigation.orbit !== null) return [];
    return commandTerminalsHere(state, player).map((terminal): TravelActionData => ({ type: "travel", equipment: terminal.id }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: TravelActionData): string | null {
    if (!commandTerminalsHere(state, player).some((terminal) => terminal.id === target.equipment)) return "cant_steer";
    if (!canSteer(state, player)) return "not_commander";
    if (state.navigation.orbit !== null) return "in_orbit";
    return null;
  }

  override apply(state: GameState, player: PlayerState, target: TravelActionData): void {
    const distance = state.ship.combustion;
    if (distance < 1) {
      logPublic(state, player.room, "travelNoFuel", { name: player.character });
      return;
    }
    state.ship.combustion = 0;
    shipMoved(state);
    huntersFollow(state);
    const found = planetAt(state, state.navigation.heading, distance);
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
