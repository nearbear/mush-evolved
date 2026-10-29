import { Action, type ActionVisibility, isString } from "./action.ts";
import { board, manoeuvre } from "./takeoff.ts";
import { retargetHunters } from "../hunters.ts";
import { sameContainer } from "../items.ts";
import { logSecret } from "../log.ts";
import { commandId, shipAboard } from "../patrol.ts";
import type { GameState, PlayerState } from "../types.ts";

export type LandActionData = { type: "land"; equipment: string };

/**
 * Land a patrol ship or the Pasiphae back in its bay, from its command (owner, 2026-10-24, docs/patrol-plan.md): 2 AP,
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

  override getCandidates(_state: Readonly<GameState>, player: Readonly<PlayerState>): LandActionData[] {
    const ship = shipAboard(player);
    return ship ? [{ type: "land", equipment: commandId(ship) }] : [];
  }

  override validate(_state: Readonly<GameState>, player: Readonly<PlayerState>, target: LandActionData): string | null {
    const ship = shipAboard(player);
    return ship && commandId(ship) === target.equipment ? null : "not_flying";
  }

  override injuryChance(state: Readonly<GameState>): number {
    return state.config.patrol.land.injuryChance;
  }

  override apply(state: GameState, player: PlayerState): void {
    const ship = shipAboard(player)!; // checked, so it exists
    board(player, ship.bay);
    state.patrolShips[ship.id]!.out = false;
    retargetHunters(state, ship, { kind: "ship" });
    logSecret(state, player.id, "patrolLanded", { name: player.character, room: ship.id });
    const cargo = state.items.filter((item) => sameContainer(item.at, { kind: "room", id: ship.id }));
    for (const item of cargo) item.at = { kind: "room", id: ship.bay };
    const count = cargo.filter((item) => item.hiddenBy === undefined).length;
    if (count > 0) logSecret(state, player.id, "patrolUnloaded", { name: player.character, count });
    manoeuvre(state, player, ship);
  }
}
