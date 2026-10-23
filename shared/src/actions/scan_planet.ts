import { Action } from "./action.ts";
import { logPrivate, logPublic } from "../log.ts";
import { astroTerminalsHere, freePositions, generatePlanet, pickPosition, planetsOf, sizeRangeOn } from "../planets.ts";
import type { GameState, PlayerState } from "../types.ts";

export type ScanPlanetActionData = { type: "scan_planet"; equipment: string };

/**
 * Scan for a planet at the Astro terminal (owner, 2026-10-19, docs/astro-plan.md): 3 AP, 50% success, and each failed scan
 * in a row multiplies the player's next chance by 1.25 until a success resets it. A found planet is the scanner's alone
 * (`GameState.planets`), at most 2 each, at a direction and distance no other planet on the ship holds, sized by the day
 * (owner, 2026-10-22; planets.ts), and never while the ship is in orbit. Living, not-dirty players, Mush included. The room log says only that someone scanned,
 * success or not; the scanner learns the result and the planet's name privately.
 */
export class ScanPlanetAction extends Action<ScanPlanetActionData> {
  constructor() {
    super("scan_planet");
  }

  override getCost(state: Readonly<GameState>): { ap: number; mp: number } {
    return { ap: state.config.astro.scan.cost.ap, mp: 0 };
  }

  override getSuccessChance(state: Readonly<GameState>, player: Readonly<PlayerState>): number {
    const { chance, failureMultiplier } = state.config.astro.scan;
    return Math.min(1, chance * failureMultiplier ** (state.scanFailures[player.id] ?? 0));
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): ScanPlanetActionData[] {
    return astroTerminalsHere(state, player.room).map((terminal) => ({ type: "scan_planet", equipment: terminal.id }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: ScanPlanetActionData): string | null {
    if (!astroTerminalsHere(state, player.room).some((terminal) => terminal.id === target.equipment)) return "cant_scan";
    if (planetsOf(state, player.id).length >= state.config.astro.maxPlanets) return "too_many_planets";
    if (freePositions(state).length === 0) return "no_free_position";
    // Not while in orbit (owner, 2026-10-22, the wiki): leave it first.
    if (state.navigation.orbit !== null) return "in_orbit";
    if (player.statuses.includes("dirty")) return "dirty";
    return null;
  }

  override apply(state: GameState, player: PlayerState, target: ScanPlanetActionData): void {
    const [position, rng] = pickPosition(state.rng, freePositions(state), state.config.astro.distance);
    // The day, as in rules.ts's dayOf (not imported: rules.ts imports the actions).
    const day = Math.floor((state.cycle - 1) / state.config.cyclesPerDay) + 1;
    const [planet, next] = generatePlanet(rng, `planet-${state.nextPlanetId++}`, position!, sizeRangeOn(state.config.astro, day));
    state.rng = next;
    state.planets[player.id] = [...planetsOf(state, player.id), planet];
    delete state.scanFailures[player.id];
    logPublic(state, player.room, "scannedPlanets", { name: player.character });
    logPrivate(state, player.id, "planetFound", { planet: planet.name });
  }

  override fail(state: GameState, player: PlayerState, target: ScanPlanetActionData): void {
    state.scanFailures[player.id] = (state.scanFailures[player.id] ?? 0) + 1;
    logPublic(state, player.room, "scannedPlanets", { name: player.character });
    logPrivate(state, player.id, "planetNotFound");
  }
}
