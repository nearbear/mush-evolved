import { Action, peopleHere, type ActionVisibility, isString } from "./action.ts";
import { logPrivate } from "../log.ts";
import type { GameState, PlayerState } from "../types.ts";

export type BondActionData = { type: "bond"; target: string };

export class BondAction extends Action<BondActionData> {
  override visibility: ActionVisibility = "private";

  constructor() {
    super("bond", { target: isString });
  }

  override getCost(state: Readonly<GameState>): { ap: number; mp: number } {
    return { ap: state.config.bond.cost.ap, mp: 0 };
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): BondActionData[] {
    return peopleHere(state, player).map((other) => ({ type: "bond", target: other.id }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: BondActionData): string | null {
    if (!peopleHere(state, player).some((other) => other.id === target.target)) return "cant_see";
    if (state.bonds[player.id]?.includes(target.target)) return "already_bonded";
    return null;
  }

  override apply(state: GameState, player: PlayerState, target: BondActionData): void {
    (state.bonds[player.id] ??= []).push(target.target);
    logPrivate(state, player.id, "bonded", { name: state.players.find((other) => other.id === target.target)!.character });
  }
}
