// Steering the Daedalus from the Command terminal (owner, 2026-10-22, the wiki's Terminal de Commandement): the ship faces
// one of the planets' four directions, the Commander turns it and sends it some distance that way, and arriving where a
// known planet lies puts it in orbit. `GameState.navigation`; the actions are actions/turn_ship.ts, travel.ts and
// leave_orbit.ts.
import { PLANET_DIRECTIONS, planetPicture, type PlanetDirection } from "./planets.ts";
import { hasTitleAccess } from "./titles.ts";
import type { GameState, Planet, PlayerId, PlayerState } from "./types.ts";

export type TurnSide = "left" | "right";
export const TURN_SIDES: readonly TurnSide[] = ["left", "right"];
export const isTurnSide = (value: unknown): value is TurnSide => TURN_SIDES.some((side) => side === value);

/** The heading after a quarter turn. `PLANET_DIRECTIONS` runs north, west, south, east: anticlockwise, so left is the next one. */
export function turned(heading: PlanetDirection, side: TurnSide): PlanetDirection {
  const i = PLANET_DIRECTIONS.indexOf(heading);
  const n = PLANET_DIRECTIONS.length;
  return PLANET_DIRECTIONS[(i + (side === "left" ? 1 : n - 1)) % n]!;
}

/** Whether this player may steer: the Commander (Mush included), or whoever `hasTitleAccess` lets through. */
export const canSteer = (state: Readonly<GameState>, player: Readonly<PlayerState>): boolean => hasTitleAccess(state, player, "commander");

/** The planet at this position, whoever found it. */
export function planetAt(state: Readonly<GameState>, direction: PlanetDirection, distance: number): [owner: PlayerId, planet: Planet] | null {
  for (const [owner, planets] of Object.entries(state.planets)) {
    const planet = planets.find((p) => p.direction === direction && p.distance === distance);
    if (planet) return [owner, planet];
  }
  return null;
}

/** The picture of the planet the ship orbits (public, cosmetic: `planetPicture`), or null out of orbit. */
export function orbitPicture(state: Readonly<GameState>): number | null {
  const id = state.navigation.orbit;
  const planet = id === null ? undefined : Object.values(state.planets).flat().find((p) => p.id === id);
  return planet ? planetPicture(planet) : null;
}
