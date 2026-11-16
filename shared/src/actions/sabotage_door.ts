import { Action, type ActionVisibility, isString } from "./action.ts";
import { breakDoor, doorOtherRoom, doorsOf } from "../doors.ts";
import { logCovert } from "../log.ts";
import { hasSkill } from "../skills.ts";
import type { DoorId, GameState, PlayerState } from "../types.ts";

export type SabotageDoorActionData = { type: "sabotage_door"; door: DoorId };

/**
 * Doorman's door sabotage (#330, owner, 2026-11-14): a Mush with `doorman` breaks a working door of their room,
 * always succeeding. First use each day is free (`PlayerState.doormanToday`, cleared at day start); later ones cost
 * `config.doorman.cost.ap` (2 AP). Covert.
 */
export class SabotageDoorAction extends Action<SabotageDoorActionData> {
  override visibility: ActionVisibility = "covert";

  constructor() {
    super("sabotage_door", { door: isString });
  }

  override getCost(state: Readonly<GameState>, player: Readonly<PlayerState>): { ap: number; mp: number } {
    return player.doormanToday ? { ap: state.config.doorman.cost.ap, mp: 0 } : { ap: 0, mp: 0 };
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): SabotageDoorActionData[] {
    if (player.role !== "mush" || !hasSkill(player, "doorman")) return [];
    return doorsOf(state, player.room)
      .filter((d) => !d.broken)
      .map((d) => ({ type: "sabotage_door", door: d.id }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: SabotageDoorActionData): string | null {
    if (player.role !== "mush") return "not_mush";
    if (!hasSkill(player, "doorman")) return "no_skill";
    const door = doorsOf(state, player.room).find((d) => d.id === target.door);
    if (!door || door.broken) return "cant_sabotage";
    return null;
  }

  override apply(state: GameState, player: PlayerState, target: SabotageDoorActionData): void {
    if (!player.doormanToday) player.doormanToday = true;
    breakDoor(state, target.door);
    logCovert(state, player.id, "doorSabotaged", { name: player.character, room: doorOtherRoom(target.door, player.room)! });
  }
}
