import { Action, isString } from "./action.ts";
import { analysisSectors } from "../modifiers.ts";
import { logPublic } from "../log.ts";
import { astroTerminalsHere, pickSeekSector, planetsOf } from "../planets.ts";
import type { GameState, PlayerState } from "../types.ts";

export type AnalyzePlanetActionData = { type: "analyze_planet"; equipment: string; planet: string };

/**
 * Analyse one of your own planets at the Astro terminal (owner, 2026-10-19): 2 AP reveals one unknown sector (more with the
 * astrophysician skill), each picked weighted by its tag's `seek`. Living, not-dirty players. The room log names the planet, never the sector; the sector
 * shows up only in your own view. Deep analysis (owner, 2026-10-27, the wiki): on the planet the ship orbits it costs 1 AP
 * and reveals one more sector. That planet stays the finder's own; orbiting makes it public but not its sectors.
 */
export class AnalyzePlanetAction extends Action<AnalyzePlanetActionData> {
  override terminal = true;

  constructor() {
    super("analyze_planet", { equipment: isString, planet: isString });
  }

  override getCost(state: Readonly<GameState>, _player: Readonly<PlayerState>, target: AnalyzePlanetActionData): { ap: number; mp: number } {
    const { cost, orbitCost } = state.config.astro.analyze;
    return { ap: state.navigation.orbit === target.planet ? orbitCost.ap : cost.ap, mp: 0 };
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
    const deep = state.navigation.orbit === planet.id ? state.config.astro.analyze.orbitExtraSectors : 0;
    for (let i = analysisSectors(state, player) + deep; i > 0; i--) {
      const [index, rng] = pickSeekSector(state.rng, planet);
      state.rng = rng;
      if (index === null) break;
      planet.sectors[index]!.known = true;
    }
    logPublic(state, player.room, "analyzedPlanet", { name: player.character, planet: planet.name });
  }
}
