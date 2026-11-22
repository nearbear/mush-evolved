import { Action, isString } from "./action.ts";
import { canTravelToEden } from "../eden.ts";
import { logPublic } from "../log.ts";
import { commandTerminalsHere, isPilgredRepaired } from "../pilgred.ts";
import type { GameState, PlayerState } from "../types.ts";
import { endGame } from "../victory.ts";

export type TravelToEdenActionData = { type: "travel_to_eden"; equipment: string };

/**
 * Take the Daedalus to Eden from the Command terminal (#478; owner, 2026-11-22): 2 AP, once Eden is computed and PILGRED
 * is repaired, with the same access as Return to Sol (the Commander title or a hacked terminal). It ends the game at once
 * as a human win, even with Mush alive (differs from eMush). The client asks for confirmation first; a ship-wide log line
 * tells everyone who did it.
 */
export class TravelToEdenAction extends Action<TravelToEdenActionData> {
  override terminal = true;

  constructor() {
    super("travel_to_eden", { equipment: isString });
  }

  override getCost(state: Readonly<GameState>): { ap: number; mp: number } {
    return { ap: state.config.pilgred.edenCost.ap, mp: 0 };
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): TravelToEdenActionData[] {
    if (!canTravelToEden(state, player)) return [];
    return commandTerminalsHere(state, player).map((terminal): TravelToEdenActionData => ({ type: "travel_to_eden", equipment: terminal.id }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: TravelToEdenActionData): string | null {
    if (!commandTerminalsHere(state, player).some((terminal) => terminal.id === target.equipment)) return "cant_travel_to_eden";
    if (!state.eden.computed) return "eden_not_computed";
    if (!isPilgredRepaired(state)) return "pilgred_broken";
    if (!canTravelToEden(state, player)) return "not_commander";
    return null;
  }

  override apply(state: GameState, player: PlayerState): void {
    logPublic(state, undefined, "returnedToEden", { name: player.character });
    endGame(state, "humans", "eden");
  }
}
