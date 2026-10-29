import { Action, isString } from "./action.ts";
import { logPublic } from "../log.ts";
import { canSteer, isTraveling, isTurnSide, TURN_SIDES, turned, type TurnSide } from "../navigation.ts";
import { commandTerminalsHere } from "../pilgred.ts";
import type { GameState, PlayerState } from "../types.ts";

export type TurnShipActionData = { type: "turn_ship"; equipment: string; side: TurnSide };

/**
 * Turn the Daedalus a quarter left or right at the Command terminal (owner, 2026-10-22, the wiki): 1 AP, Commander only
 * (Mush included, dirty or not), in orbit too. No fuel. The room log says who turned it and which way it now faces;
 * everyone aboard sees that it turned, and which side (`navigation.lastTurn`, owner, 2026-10-29: the stars turn).
 */
export class TurnShipAction extends Action<TurnShipActionData> {
  override terminal = true;

  constructor() {
    super("turn_ship", { equipment: isString, side: isTurnSide });
  }

  override getCost(state: Readonly<GameState>): { ap: number; mp: number } {
    return { ap: state.config.navigation.turn.cost.ap, mp: 0 };
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): TurnShipActionData[] {
    if (!canSteer(state, player) || isTraveling(state)) return [];
    return commandTerminalsHere(state, player).flatMap((terminal) => TURN_SIDES.map((side): TurnShipActionData => ({ type: "turn_ship", equipment: terminal.id, side })));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: TurnShipActionData): string | null {
    if (!commandTerminalsHere(state, player).some((terminal) => terminal.id === target.equipment)) return "cant_steer";
    if (!canSteer(state, player)) return "not_commander";
    if (isTraveling(state)) return "traveling";
    return null;
  }

  override apply(state: GameState, player: PlayerState, target: TurnShipActionData): void {
    state.navigation.heading = turned(state.navigation.heading, target.side);
    state.navigation.lastTurn = { n: (state.navigation.lastTurn?.n ?? 0) + 1, side: target.side };
    logPublic(state, player.room, "turnedShip", { name: player.character, direction: state.navigation.heading });
  }
}
