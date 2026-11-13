import { Action, isString } from "./action.ts";
import { endRebelCalls } from "../comms.ts";
import { huntersFollow, loseShipsInFlight } from "../hunters.ts";
import { pullShipsAboard } from "./land.ts";
import { strandExpedition } from "../expeditions.ts";
import { logPublic } from "../log.ts";
import { canSteer } from "../navigation.ts";
import { commandTerminalsHere } from "../pilgred.ts";
import type { GameState, PlayerState } from "../types.ts";
import { shipMoved } from "../modifiers.ts";
import { markSharedPlanetsStale } from "../sharedPlanets.ts";

export type LeaveOrbitActionData = { type: "leave_orbit"; equipment: string };

/**
 * Leave the orbited planet from the Command terminal (owner, 2026-10-22, the wiki; it takes Travel's place while in orbit):
 * 1 AP and `navigation.leaveOrbit.fuel` fuel from the combustion chamber (owner, 2026-10-23), Commander only (Mush included, dirty or not). Short of loaded fuel, the AP is
 * spent and the ship stays. The `easyTravel` cheat (cheats.ts) makes leaving cost no fuel. Otherwise the planet is lost, scanning works again, and half the hunters follow (hunters.ts), and every open rebel call is lost (comms.ts). The ship then travels until the next cycle change and arrives in empty space (owner, 2026-10-29). Everyone aboard learns of it.
 */
export class LeaveOrbitAction extends Action<LeaveOrbitActionData> {
  override terminal = true;

  constructor() {
    super("leave_orbit", { equipment: isString });
  }

  override getCost(state: Readonly<GameState>): { ap: number; mp: number } {
    return { ap: state.config.navigation.leaveOrbit.cost.ap, mp: 0 };
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): LeaveOrbitActionData[] {
    if (!canSteer(state, player) || state.navigation.orbit === null) return [];
    return commandTerminalsHere(state, player).map((terminal): LeaveOrbitActionData => ({ type: "leave_orbit", equipment: terminal.id }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: LeaveOrbitActionData): string | null {
    if (!commandTerminalsHere(state, player).some((terminal) => terminal.id === target.equipment)) return "cant_steer";
    if (!canSteer(state, player)) return "not_commander";
    if (state.navigation.orbit === null) return "not_in_orbit";
    return null;
  }

  override apply(state: GameState, player: PlayerState, _target: LeaveOrbitActionData): void {
    const fuel = player.cheats.includes("easyTravel") ? 0 : state.config.navigation.leaveOrbit.fuel;
    if (state.ship.combustion < fuel) {
      logPublic(state, player.room, "leaveOrbitNoFuel", { name: player.character });
      return;
    }
    state.ship.combustion -= fuel;
    shipMoved(state);
    huntersFollow(state);
    endRebelCalls(state);
    const orbit = state.navigation.orbit;
    for (const owner of Object.keys(state.planets)) state.planets[owner] = state.planets[owner]!.filter((p) => p.id !== orbit);
    // Every shared planet's entry no longer applies, the planet just left included (owner, 2026-10-31).
    markSharedPlanetsStale(state);
    state.navigation.orbit = null;
    state.navigation.arriving = { planet: null };
    logPublic(state, undefined, "leftOrbit", { name: player.character });
    pullShipsAboard(state);
    loseShipsInFlight(state);
  strandExpedition(state);
  }
}
