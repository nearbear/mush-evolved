import { Action, type ActionVisibility, isString } from "./action.ts";
import { board, manoeuvre } from "./takeoff.ts";
import { retargetHunters } from "../hunters.ts";
import { sameContainer } from "../items.ts";
import { logSecret } from "../log.ts";
import { commandId, onPlanet, type PatrolShip, shipAboard, shipsInFlight } from "../patrol.ts";
import { projectDone } from "../projects.ts";
import type { GameState, PlayerState } from "../types.ts";

export type LandActionData = { type: "land"; equipment: string };

/**
 * Land a patrol ship or the Pasiphae back in its bay, from its command (owner, 2026-10-24, docs/plans/archive/patrol.md): 2 AP,
 * always works, with the same clean or rough manoeuvre as a takeoff. Whoever flies it can land it. Secret: the line goes
 * in the bay once the pilot is back, so whoever is there (or a camera) sees it. Hunters aiming at the ship turn to the
 * Daedalus (eMush). Whatever lies in the ship's room (collected debris, things dropped aboard) is unloaded into the bay,
 * with a second secret line saying how many items (owner, 2026-10-28); hidden ones stay hidden and aren't counted.
 */
export class LandAction extends Action<LandActionData> {
  override visibility: ActionVisibility = "secret";

  constructor() {
    super("land", { equipment: isString });
  }

  override getCost(state: Readonly<GameState>): { ap: number; mp: number } {
    return { ap: state.config.patrol.land.cost.ap, mp: 0 };
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): LandActionData[] {
    const ship = shipAboard(player);
    return ship && !onPlanet(state, ship) ? [{ type: "land", equipment: commandId(ship) }] : [];
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: LandActionData): string | null {
    const ship = shipAboard(player);
    if (!ship || commandId(ship) !== target.equipment) return "not_flying";
    // On a planet, the ship docks when its expedition ends (owner, 2026-11-09, #359).
    return onPlanet(state, ship) ? "on_planet" : null;
  }

  override injuryChance(state: Readonly<GameState>): number {
    return state.config.patrol.land.injuryChance;
  }

  override apply(state: GameState, player: PlayerState): void {
    const ship = shipAboard(player)!; // checked, so it exists
    dock(state, player, ship);
    manoeuvre(state, player, ship);
  }
}

/**
 * The ship back in its bay with its pilot, without the maneuver: a landing, or the end of a patrol ship's expedition
 * on a planet (expeditions.ts, owner, 2026-11-09, #359). With no pilot (a Magnetic net recall of an empty ship) it docks
 * silently. Mutates a cloned state.
 */
export function dock(state: GameState, player: PlayerState | null, ship: PatrolShip): void {
  if (player) board(state, player, ship.bay);
  const shipState = state.patrolShips[ship.id]!;
  shipState.out = false;
  shipState.onPlanet = null;
  retargetHunters(state, ship, { kind: "ship" });
  if (player) logSecret(state, player.id, "patrolLanded", { name: player.character, room: ship.id });
  const cargo = state.items.filter((item) => sameContainer(item.at, { kind: "room", id: ship.id }));
  for (const item of cargo) item.at = { kind: "room", id: ship.bay };
  const count = cargo.filter((item) => item.hiddenBy === undefined).length;
  if (player && count > 0) logSecret(state, player.id, "patrolUnloaded", { name: player.character, count });
}

/**
 * The Daedalus jumps with Magnetic net done (owner, 2026-11-12): every patrol ship in flight docks in its bay at once
 * instead of being lost, always cleanly (no manoeuvre roll), as in the original. No switch. Seen only as a landing: the
 * usual secret line in the bay, nothing ship-wide. Ships on a planet are Magnetic return's (expeditions.ts). Mutates a
 * cloned state.
 */
export function pullShipsAboard(state: GameState): void {
  if (!projectDone(state, "MAGNETIC_NET")) return;
  for (const ship of shipsInFlight(state)) {
    const [pilot, ...others] = state.players.filter((p) => p.alive && p.room === ship.id);
    dock(state, pilot ?? null, ship);
    for (const p of others) board(state, p, ship.bay);
  }
}
