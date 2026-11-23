import { Action, isString, TRAVEL_UNDERWAY } from "./action.ts";
import { launchShip } from "../launch.ts";
import { canReturnToSol, commandTerminalsHere, isPilgredRepaired } from "../pilgred.ts";
import { allLaunchKeysIn } from "../titles.ts";
import type { GameState, PlayerState } from "../types.ts";

export type ReturnToSolActionData = { type: "return_to_sol"; equipment: string };

/**
 * Take the Daedalus home to Sol from the Command terminal (owner, 2026-10-21; #480, 2026-11-22): 2 AP, once PILGRED
 * is repaired and all three launch keys are in, for the Commander (or a hacked terminal / `freeHacking`), Mush included.
 * Starts the final cycle (`state.launched`); the game ends at the next cycle change with `winnerOnArrival`. The client
 * asks for confirmation first. A ship-wide NERON line tells everyone who did it.
 */
export class ReturnToSolAction extends Action<ReturnToSolActionData> {
  override terminal = true;

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
    if (state.launched !== null) return TRAVEL_UNDERWAY;
    if (!isPilgredRepaired(state)) return "pilgred_broken";
    if (!allLaunchKeysIn(state)) return "launch_keys_missing";
    if (!canReturnToSol(state, player)) return "not_commander";
    return null;
  }

  override apply(state: GameState, player: PlayerState, _target: ReturnToSolActionData): void {
    launchShip(state, player, "sol");
  }
}
