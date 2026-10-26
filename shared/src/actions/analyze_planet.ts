import { Action, isString } from "./action.ts";
import { logPublic } from "../log.ts";
import { astroTerminalsHere, pickSeekSector, planetsOf } from "../planets.ts";
import type { GameState, PlayerState } from "../types.ts";

export type AnalyzePlanetActionData = { type: "analyze_planet"; equipment: string; planet: string };

/**
 * Analyse one of your own planets at the Astro terminal (owner, 2026-10-19): 2 AP reveals one unknown sector, picked
 * weighted by its tag's `seek`. Living, not-dirty players. The room log names the planet, never the sector; the sector
 * shows up only in your own view.
 */
export class AnalyzePlanetAction extends Action<AnalyzePlanetActionData> {
  override terminal = true;

  constructor() {
    super("analyze_planet", { equipment: isString, planet: isString });
  }

  override getCost(state: Readonly<GameState>): { ap: number; mp: number } {
    return { ap: state.config.astro.analyze.cost.ap, mp: 0 };
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): AnalyzePlanetActionData[] {
    return astroTerminalsHere(state, player.room).flatMap((terminal) =>
      planetsOf(state, player.id).map((planet): AnalyzePlanetActionData => ({ type: "analyze_planet", equipment: terminal.id, planet: planet.id })),
    );
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: AnalyzePlanetActionData): string | null {
    if (!astroTerminalsHere(state, player.room).some((terminal) => terminal.id === target.equipment)) return "cant_analyze";
    const planet = planetsOf(state, player.id).find((p) => p.id === target.planet);
    if (!planet) return "no_such_planet";
    if (planet.sectors.every((sector) => sector.known)) return "planet_analyzed";
    if (player.statuses.includes("dirty")) return "dirty";
    return null;
  }

  override apply(state: GameState, player: PlayerState, target: AnalyzePlanetActionData): void {
    const planet = planetsOf(state, player.id).find((p) => p.id === target.planet)!;
    const [index, rng] = pickSeekSector(state.rng, planet);
    state.rng = rng;
    if (index !== null) planet.sectors[index]!.known = true;
    logPublic(state, player.room, "analyzedPlanet", { name: player.character, planet: planet.name });
  }
}
