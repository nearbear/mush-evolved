import { Action, EXPLORED, ICARUS_LOST } from "./action.ts";
import { canLaunchExpedition, hasSpacesuit, hasUnexplored, icarusDocked, needsSpacesuit, orbitedPlanet, runExpedition } from "../expeditions.ts";
import { canFly } from "../patrol.ts";
import type { GameState, PlayerState } from "../types.ts";

export type IcarusTakeoffActionData = { type: "icarus_takeoff" };

/** The Icarus's equipment type, in the Icarus Bay. */
export const ICARUS_EQUIPMENT = "ICARUS_COMMAND";

/**
 * Take off in the Icarus for an expedition (owner, 2026-10-31, docs/plans/expedition.md): `expedition.cost` AP, paid by
 * the launcher alone, from inside the docked Icarus (owner, 2026-11-17: the crew boards first, actions/board_icarus.ts)
 * while the ship orbits a planet with an unexplored sector. Gated by NERON's piloting crew lock unless the launcher is
 * a Pilot or has `freeHacking` (`canLaunchExpedition`, owner 2026-11-21), with a working spacesuit on a planet with no
 * Oxygen sector. Not while another expedition is away. The crew is whoever is aboard (expeditions.ts): the takeoff line
 * is public in the bay, the report goes to the crew only. Never again once the Icarus is lost (`strandExpedition`). On
 * a fully explored planet or once the Icarus is lost it shows disabled with the reason (owner, 2026-11-19), not hidden.
 */
export class IcarusTakeoffAction extends Action<IcarusTakeoffActionData> {
  constructor() {
    super("icarus_takeoff");
  }

  override getCost(state: Readonly<GameState>): { ap: number; mp: number } {
    return { ap: state.config.expedition.cost.ap, mp: 0 };
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): IcarusTakeoffActionData[] {
    const refused = this.validate(state, player);
    return refused === null || refused === EXPLORED || refused === ICARUS_LOST ? [{ type: "icarus_takeoff" }] : [];
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>): string | null {
    // Aboard the docked Icarus (#469): boarded, in the bay. Its other refusals (away, lost) come below.
    if (!player.alive || !player.boardedIcarus || player.room !== state.config.expedition.room) return "not_in_icarus";
    if (!canLaunchExpedition(state, player)) return canFly(player) ? "crew_lock" : "cant_fly";
    if (state.icarusLost) return ICARUS_LOST;
    if (state.expedition) return state.expedition.ship === null ? "icarus_away" : "expedition_away";
    if (!icarusDocked(state)) return "icarus_away";
    const planet = orbitedPlanet(state);
    if (!planet) return "not_in_orbit";
    if (!hasUnexplored(planet)) return EXPLORED;
    if (needsSpacesuit(planet) && !hasSpacesuit(state, player)) return "no_spacesuit";
    return null;
  }

  override apply(state: GameState, player: PlayerState): void {
    runExpedition(state, player);
  }
}
