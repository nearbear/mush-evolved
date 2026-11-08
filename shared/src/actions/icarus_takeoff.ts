import { Action, isString } from "./action.ts";
import { canLaunchExpedition, hasUnexplored, orbitedPlanet, runExpedition } from "../expeditions.ts";
import type { GameState, PlayerState } from "../types.ts";

export type IcarusTakeoffActionData = { type: "icarus_takeoff"; equipment: string };

/** The Icarus's equipment type, in the Icarus Bay. */
export const ICARUS_EQUIPMENT = "ICARUS_COMMAND";

/**
 * Take off in the Icarus for an expedition (owner, 2026-10-31, docs/plans/expedition.md): `expedition.cost` AP, paid by
 * the launcher alone, at the Icarus while the ship orbits a planet with an unexplored sector. Pilots only for now
 * (`canLaunchExpedition`). Not while the Icarus is away (phase 2). The crew leaves in the Icarus and comes back after
 * its last step (expeditions.ts): the takeoff line is public in the bay, the report goes to the crew only.
 */
export class IcarusTakeoffAction extends Action<IcarusTakeoffActionData> {
  constructor() {
    super("icarus_takeoff", { equipment: isString });
  }

  override getCost(state: Readonly<GameState>): { ap: number; mp: number } {
    return { ap: state.config.expedition.cost.ap, mp: 0 };
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): IcarusTakeoffActionData[] {
    if (this.refused(state, player) !== null) return [];
    return icarusHere(state, player).map((equipment): IcarusTakeoffActionData => ({ type: "icarus_takeoff", equipment }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: IcarusTakeoffActionData): string | null {
    if (!icarusHere(state, player).includes(target.equipment)) return "no_icarus";
    return this.refused(state, player);
  }

  /** Why this player can't launch now, apart from the Icarus being here. */
  private refused(state: Readonly<GameState>, player: Readonly<PlayerState>): string | null {
    if (!canLaunchExpedition(state, player)) return "cant_fly";
    if (state.expedition) return "icarus_away";
    const planet = orbitedPlanet(state);
    if (!planet) return "not_in_orbit";
    if (!hasUnexplored(planet)) return "explored";
    return null;
  }

  override apply(state: GameState, player: PlayerState): void {
    runExpedition(state, player);
  }
}

/** The Icarus in the player's room, by equipment id: only in the expedition room. */
function icarusHere(state: Readonly<GameState>, player: Readonly<PlayerState>): string[] {
  if (player.room !== state.config.expedition.room) return [];
  return (state.equipment[player.room] ?? []).filter((e) => e.type === ICARUS_EQUIPMENT).map((e) => e.id);
}
