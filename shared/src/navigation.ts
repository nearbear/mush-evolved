// Steering the Daedalus from the Command terminal (owner, 2026-10-22, the wiki's Terminal de Commandement): the ship faces
// one of the planets' four directions, the Commander turns it and sends it some distance that way, and arriving where a
// known planet lies puts it in orbit. `GameState.navigation`; the actions are actions/turn_ship.ts, travel.ts and
// leave_orbit.ts.
import { logPrivate, logPublic } from "./log.ts";
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

/**
 * The orbited planet's name, public to everyone once the ship is in orbit (owner, 2026-10-31), or null out of orbit.
 * `orbit` is set only at the arrival (`arriveShip`), so the destination's name isn't sent while the ship travels. Only
 * the name: its sectors and its finder stay private. (A shared entry for the destination stays applicable when the
 * others go stale, which shows the crew that entry and who shared it: accepted, sharedPlanets.ts.)
 */
export function orbitName(state: Readonly<GameState>): string | null {
  const id = state.navigation.orbit;
  return (id === null ? undefined : Object.values(state.planets).flat().find((p) => p.id === id))?.name ?? null;
}

/** Whether the ship is between one place and the next (owner, 2026-10-29): the Command terminal, scanning and patrol takeoff wait for the arrival. */
export const isTraveling = (state: Readonly<GameState>): boolean => state.navigation.arriving !== null;

/**
 * End a jump in progress (owner, 2026-10-29), at the cycle change: the ship arrives, in the orbit of the planet it was
 * heading for, if any. Everyone learns of an orbit; its finder alone learns which planet. Does nothing when not traveling.
 */
export function arriveShip(state: GameState): void {
  const arriving = state.navigation.arriving;
  if (!arriving) return;
  state.navigation.arriving = null;
  if (arriving.planet === null) return;
  const owner = Object.keys(state.planets).find((id) => state.planets[id]!.some((p) => p.id === arriving.planet));
  const planet = owner === undefined ? undefined : state.planets[owner]!.find((p) => p.id === arriving.planet);
  if (owner === undefined || !planet) return;
  state.navigation.orbit = planet.id;
  logPublic(state, undefined, "shipInOrbit");
  logPrivate(state, owner, "orbitingPlanet", { planet: planet.name });
}
