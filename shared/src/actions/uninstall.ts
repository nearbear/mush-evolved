import { Action } from "./action.ts";
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
    super("uninstall");
  }

  override getCost(state: Readonly<GameState>): { ap: number; mp: number } {
    return { ap: state.config.uninstall.cost.ap, mp: 0 };
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): UninstallActionData[] {
    return cameras(state, player).map((e) => ({ type: "uninstall", equipment: e.id }));
  }

  override check(state: Readonly<GameState>, player: Readonly<PlayerState>, target: UninstallActionData): string | null {
    if (!cameras(state, player).some((e) => e.id === target.equipment)) return "cant_uninstall";
    return this.canAfford(state, player, target);
  }

  override apply(state: GameState, player: PlayerState, target: UninstallActionData): void {
    const list = state.config.equipment[player.room]!;
    list.splice(list.findIndex((e) => e.id === target.equipment), 1);
    produceItem(state, player, "camera");
    logPublic(state, player.room, "cameraUninstalled", { name: player.name });
  }
}

function cameras(state: Readonly<GameState>, player: Readonly<PlayerState>) {
  return (state.config.equipment[player.room] ?? []).filter((e) => e.type === CAMERA_EQUIPMENT);
}
