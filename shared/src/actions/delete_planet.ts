import { Action } from "./action.ts";
import { planetsOf } from "../planets.ts";
import type { GameState, PlayerState } from "../types.ts";

export type DeletePlanetActionData = { type: "delete_planet"; planet: string };

// TODO restrict this action to the astro terminal
/** Delete one of your own planets, anytime and at once (owner, 2026-10-19). Free and silent: no log line. */
export class DeletePlanetAction extends Action<DeletePlanetActionData> {
  override visibility = "private" as const;
  override timed = false;

  constructor() {
    super("delete_planet");
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): DeletePlanetActionData[] {
    return planetsOf(state, player.id).map((planet) => ({ type: "delete_planet", planet: planet.id }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: DeletePlanetActionData): string | null {
    return planetsOf(state, player.id).some((planet) => planet.id === target.planet) ? null : "no_such_planet";
  }

  override apply(state: GameState, player: PlayerState, target: DeletePlanetActionData): void {
    state.planets[player.id] = planetsOf(state, player.id).filter((planet) => planet.id !== target.planet);
  }
}
