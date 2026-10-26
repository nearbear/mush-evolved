import { Action, isString } from "./action.ts";
import { astroTerminalsHere, planetsOf } from "../planets.ts";
import type { GameState, PlayerState } from "../types.ts";

export type DeletePlanetActionData = { type: "delete_planet"; equipment: string; planet: string };

/** Delete one of your own planets at once, only at the Astro terminal (owner, 2026-10-19; terminal-only 2026-10-25). Free and silent: no log line. */
export class DeletePlanetAction extends Action<DeletePlanetActionData> {
  override visibility = "private" as const;
  override timed = false;

  constructor() {
    super("delete_planet", { equipment: isString, planet: isString });
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): DeletePlanetActionData[] {
    return astroTerminalsHere(state, player.room).flatMap((terminal) =>
      planetsOf(state, player.id).flatMap((planet): DeletePlanetActionData[] =>
        planet.id === state.navigation.orbit ? [] : [{ type: "delete_planet", equipment: terminal.id, planet: planet.id }],
      ),
    );
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: DeletePlanetActionData): string | null {
    if (!astroTerminalsHere(state, player.room).some((terminal) => terminal.id === target.equipment)) return "cant_delete";
    if (!planetsOf(state, player.id).some((planet) => planet.id === target.planet)) return "no_such_planet";
    // The planet the ship orbits stays until the ship leaves it (Claude's default, 2026-10-22).
    return state.navigation.orbit === target.planet ? "orbiting" : null;
  }

  override apply(state: GameState, player: PlayerState, target: DeletePlanetActionData): void {
    state.planets[player.id] = planetsOf(state, player.id).filter((planet) => planet.id !== target.planet);
  }
}
