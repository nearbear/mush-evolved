import { Action, isString } from "./action.ts";
import { logPublic } from "../log.ts";
import { canReturnToSol, commandTerminalsHere, isPilgredRepaired } from "../pilgred.ts";
import type { GameState, PlayerState } from "../types.ts";
import { endGame, winnerOnArrival } from "../victory.ts";

export type ReturnToSolActionData = { type: "return_to_sol"; equipment: string };

/**
 * Take the Daedalus home to Sol from the Command terminal (owner, 2026-10-21): 2 AP, only once PILGRED is repaired and
 * only for the Commander, Mush included. It ends the game at once with the decided win conditions (victory.ts). The
 * client asks for confirmation first. A ship-wide log line tells everyone who did it.
 */
export class ReturnToSolAction extends Action<ReturnToSolActionData> {
  constructor() {
    super("return_to_sol", { equipment: isString });
  }

  override getCost(state: Readonly<GameState>): { ap: number; mp: number } {
    return { ap: state.config.pilgred.returnCost.ap, mp: 0 };
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): ReturnToSolActionData[] {
    if (!canReturnToSol(state, player)) return [];
    return commandTerminalsHere(state, player).map((terminal): ReturnToSolActionData => ({ type: "return_to_sol", equipment: terminal.id }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: ReturnToSolActionData): string | null {
    if (!commandTerminalsHere(state, player).some((terminal) => terminal.id === target.equipment)) return "cant_return_to_sol";
    if (!isPilgredRepaired(state)) return "pilgred_broken";
    if (!canReturnToSol(state, player)) return "not_commander";
    return null;
  }

  override apply(state: GameState, player: PlayerState, _target: ReturnToSolActionData): void {
    const winner = winnerOnArrival(state);
    logPublic(state, undefined, "returnedToSol", { name: player.character });
    endGame(state, winner, "sol");
  }
}
