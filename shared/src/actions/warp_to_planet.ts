import { Action, isString } from "./action.ts";
import { astroTerminalsHere, planetsOf } from "../planets.ts";
import type { GameState, PlayerState } from "../types.ts";
import { arriveShip } from "../navigation.ts";
import { jump } from "./travel.ts";

export type WarpToPlanetActionData = { type: "warp_to_planet"; equipment: string; planet: string };

/**
 * Development cheat (`easyTravel`, cheats.ts), not a game rule: from the Astro terminal, put the ship in orbit around
 * one of your planets at once. Free, untimed, needs no fuel, title or heading: the ship turns to face the planet and
 * jumps as a travel does (`jump`, travel.ts), so the other planets are lost and half the hunters follow. Not while in
 * orbit (leave first, as for a travel). The server refuses it unless cheats are allowed.
 */
export class WarpToPlanetAction extends Action<WarpToPlanetActionData> {
  override terminal = true;
  override timed = false;
  override recorded = false;

  constructor() {
    super("warp_to_planet", { equipment: isString, planet: isString });
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): WarpToPlanetActionData[] {
    if (!canWarp(state, player)) return [];
    return astroTerminalsHere(state, player.room).flatMap((terminal) =>
      planetsOf(state, player.id).map((planet): WarpToPlanetActionData => ({ type: "warp_to_planet", equipment: terminal.id, planet: planet.id })),
    );
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: WarpToPlanetActionData): string | null {
    if (!canWarp(state, player)) return "illegal_action";
    if (!astroTerminalsHere(state, player.room).some((terminal) => terminal.id === target.equipment)) return "cant_warp";
    return planetsOf(state, player.id).some((planet) => planet.id === target.planet) ? null : "no_such_planet";
  }

  override apply(state: GameState, player: PlayerState, target: WarpToPlanetActionData): void {
    const planet = planetsOf(state, player.id).find((p) => p.id === target.planet)!;
    state.navigation.heading = planet.direction;
    jump(state, player, planet.distance);
    arriveShip(state); // the cheat skips the cycle in transit
  }
}

function canWarp(state: Readonly<GameState>, player: Readonly<PlayerState>): boolean {
  return player.cheats.includes("easyTravel") && !player.isBot && state.navigation.orbit === null && state.navigation.arriving === null;
}
