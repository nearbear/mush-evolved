import { Action, type ActionCost, isString } from "./action.ts";
import { CAMERA_EQUIPMENT } from "../equipment.ts";
import { produceItem } from "../items.ts";
import { logPublic } from "../log.ts";
import type { GameState, PlayerState } from "../types.ts";

export type UninstallActionData = { type: "uninstall"; equipment: string };

/**
 * Uninstall (#35, owner 2026-10-17): takes the room's camera out of the room's equipment and gives
 * you a `camera` item (into the room if you have no space, like `produceItem` everywhere).
 * `uninstall.cost.ap` is a placeholder. Logged publicly.
 */
export class UninstallAction extends Action<UninstallActionData> {
  constructor() {
    super("uninstall", { equipment: isString });
  }

  /** An Engineer point (`resources.eng`) makes one use free (owner, 2026-11-09). */
  override getCost(state: Readonly<GameState>, player: Readonly<PlayerState>): ActionCost {
    return player.resources.eng > 0 ? { ap: 0, mp: 0, paidBy: "eng" } : { ap: state.config.uninstall.cost.ap, mp: 0 };
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): UninstallActionData[] {
    return cameras(state, player).map((e) => ({ type: "uninstall", equipment: e.id }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: UninstallActionData): string | null {
    if (!cameras(state, player).some((e) => e.id === target.equipment)) return "cant_uninstall";
    return null;
  }

  override dirtChance(state: Readonly<GameState>): number {
    return state.config.uninstall.dirtyChance;
  }

   override injuryChance(state: Readonly<GameState>): number {
    return state.config.uninstall.injuryChance;
  }

  override apply(state: GameState, player: PlayerState, target: UninstallActionData): void {
    const list = state.equipment[player.room]!;
    list.splice(list.findIndex((e) => e.id === target.equipment), 1);
    produceItem(state, player, "camera");
    logPublic(state, player.room, "cameraUninstalled", { name: player.character });
  }
}

function cameras(state: Readonly<GameState>, player: Readonly<PlayerState>) {
  return (state.equipment[player.room] ?? []).filter((e) => e.type === CAMERA_EQUIPMENT);
}
