import { Action, isString } from "./action.ts";
import { hasSpacesuit, hasUnexplored, needsSpacesuit, orbitedPlanet, runExpedition } from "../expeditions.ts";
import { logPrivate } from "../log.ts";
import { dock } from "./land.ts";
import { CANT_FLY, CHRONIC_VERTIGO, commandId, groundedBy, onPlanet, type PatrolShip, shipAboard } from "../patrol.ts";
import type { GameState, PlayerState } from "../types.ts";

export type LandOnPlanetActionData = { type: "land_on_planet"; equipment: string };

/**
 * A pilot flying a patrol ship (or the Pasiphae) lands it on the orbited planet alone, from its command (owner,
 * 2026-11-09, #359): `expedition.patrol.cost` AP, while the planet has an unexplored sector and no other expedition is
 * under way. An expedition like the Icarus's with the pilot as its whole crew, half as long (expeditions.ts); the ship
 * docks in its bay at the end. The landing line is public in the ship, where only the pilot is.
 */
export class LandOnPlanetAction extends Action<LandOnPlanetActionData> {
  constructor() {
    super("land_on_planet", { equipment: isString });
  }

  override getCost(state: Readonly<GameState>): { ap: number; mp: number } {
    return { ap: state.config.expedition.patrol.cost.ap, mp: 0 };
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): LandOnPlanetActionData[] {
    const ship = shipAboard(player);
    if (!ship) return [];
    const refused = this.refused(state, player, ship);
    // Grounded shows disabled with the reason (owner, 2026-11-22); the other refusals hide it.
    if (refused !== null && refused !== CANT_FLY && refused !== CHRONIC_VERTIGO) return [];
    return [{ type: "land_on_planet", equipment: commandId(ship) }];
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: LandOnPlanetActionData): string | null {
    const ship = shipAboard(player);
    if (!ship || commandId(ship) !== target.equipment) return "not_flying";
    return this.refused(state, player, ship);
  }

  /** Why this pilot can't land their ship on the planet now. */
  private refused(state: Readonly<GameState>, player: Readonly<PlayerState>, ship: Readonly<PatrolShip>): string | null {
    const grounded = groundedBy(player);
    if (grounded !== null) return grounded;
    if (onPlanet(state, ship)) return "on_planet";
    if (state.expedition) return "expedition_away";
    const planet = orbitedPlanet(state);
    if (!planet) return "not_in_orbit";
    if (!hasUnexplored(planet)) return "explored";
    return null;
  }

  /**
   * A pilot without a spacesuit can't set down on a planet with no Oxygen sector (owner, 2026-11-09): no expedition,
   * the AP spent, and the ship heads back to dock in its bay, with a private line saying why. The Icarus checks at
   * boarding and takeoff instead (owner, 2026-11-17).
   */
  override apply(state: GameState, player: PlayerState): void {
    const ship = shipAboard(player)!;
    const planet = orbitedPlanet(state)!;
    if (needsSpacesuit(planet) && !hasSpacesuit(state, player)) {
      logPrivate(state, player.id, "patrolNoSpacesuit", { room: ship.id, planet: planet.name });
      dock(state, player, ship);
      return;
    }
    runExpedition(state, player, ship);
  }
}
