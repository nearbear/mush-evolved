import { Action, EXPLORED, ICARUS_LOST, isString } from "./action.ts";
import { endPushToLeave } from "./accommodate.ts";
import { ICARUS_EQUIPMENT } from "./icarus_takeoff.ts";
import { boardRefusal } from "../expeditions.ts";
import { logPublic } from "../log.ts";
import type { GameState, PlayerState } from "../types.ts";

export type BoardIcarusActionData = { type: "board_icarus"; equipment: string };

/**
 * Board the docked Icarus from its bay (owner, 2026-11-17, docs/plans/expedition-boarding.md): free, at the Icarus,
 * while the ship orbits a planet with an unexplored sector and there is room aboard, with a working spacesuit unless the
 * planet has an Oxygen sector (`boardRefusal`). Whoever is aboard at takeoff is the crew (actions/icarus_takeoff.ts).
 * Boarded players stay in the bay (`boardedIcarus`, #469), where they can still be reached, until takeoff moves the crew
 * into the craft. The line is public in the bay. A push the player is part of ends. On a fully
 * explored planet or once the Icarus is lost it shows disabled with the reason (owner, 2026-11-19), not hidden.
 */
export class BoardIcarusAction extends Action<BoardIcarusActionData> {
  constructor() {
    super("board_icarus", { equipment: isString });
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): BoardIcarusActionData[] {
    const refused = boardRefusal(state, player);
    if (refused !== null && refused !== EXPLORED && refused !== ICARUS_LOST) return [];
    return icarusHere(state, player).map((equipment): BoardIcarusActionData => ({ type: "board_icarus", equipment }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: BoardIcarusActionData): string | null {
    if (!icarusHere(state, player).includes(target.equipment)) return "no_icarus";
    return boardRefusal(state, player);
  }

  override apply(state: GameState, player: PlayerState): void {
    endPushToLeave(state, player);
    logPublic(state, player.room, "icarusBoarded", { name: player.character });
    player.boardedIcarus = true;
  }
}

/** The Icarus in the player's room, by equipment id: only in the Icarus Bay. */
export function icarusHere(state: Readonly<GameState>, player: Readonly<PlayerState>): string[] {
  if (player.room !== state.config.expedition.room) return [];
  return (state.equipment[player.room] ?? []).filter((e) => e.type === ICARUS_EQUIPMENT).map((e) => e.id);
}
