import { Action, IN_PRESELECTION, type ActionTag, type ActionVisibility } from "./action.ts";
import { logCovert } from "../log.ts";
import { offShip } from "../patrol.ts";
import { hasSkill } from "../skills.ts";
import { isRoomTrapped } from "../traps.ts";
import type { GameState, PlayerState } from "../types.ts";

export type TrapRoomActionData = { type: "trap_room" };

/**
 * Trapper, the Mush skill `trapper` (owner, 2026-11-21, #473): for `trapper.cost.ap` (1 AP) and 1 spore, a Mush
 * booby-traps their current room so the next player who interacts with it is contaminated (`traps.ts`). No cooldown;
 * blocked during pre-selection, off-ship, or if the room is already trapped. Covert (revealed only by a camera or
 * Observant) and tagged `spore` (rings working Myco-alarms in the room).
 */
export class TrapRoomAction extends Action<TrapRoomActionData> {
  override visibility: ActionVisibility = "covert";
  override tags: readonly ActionTag[] = ["spore"];

  constructor() {
    super("trap_room");
  }

  override getCost(state: Readonly<GameState>): { ap: number; mp: number } {
    return { ap: state.config.trapper.cost.ap, mp: 0 };
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): TrapRoomActionData[] {
    return this.validate(state, player) === null ? [{ type: "trap_room" }] : [];
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>): string | null {
    if (state.preselection) return IN_PRESELECTION;
    if (player.role !== "mush") return "not_mush";
    if (!hasSkill(player, "trapper")) return "no_skill";
    if (player.spores < 1) return "no_spores";
    if (offShip(player.room)) return "off_ship";
    if (isRoomTrapped(state, player.room)) return "already_trapped";
    return null;
  }

  override apply(state: GameState, player: PlayerState): void {
    player.spores -= 1;
    state.trappedRooms.push(player.room);
    logCovert(state, player.id, "roomTrapped", { name: player.character });
  }
}
