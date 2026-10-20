import { Action } from "./action.ts";
import { CAMERA_EQUIPMENT, cameraEquipmentId } from "../equipment.ts";
import { hasCamera, logPublic } from "../log.ts";
import type { GameState, ItemState, PlayerState } from "../types.ts";

export type InstallActionData = { type: "install"; item: string };

/**
 * Install (approved 2026-10-17, #35): turns a camera item you carry into `CAMERA` equipment of the
 * room you are in. `install.cost.ap` AP, no tools, at most one camera per room. Logged publicly.
 * The item is used up; `uninstall` makes a new one. Until installed, a camera is just an item and
 * does not count as a camera in the room (`hasCamera`).
 */
export class InstallAction extends Action<InstallActionData> {
  constructor() {
    super("install");
  }

  override getCost(state: Readonly<GameState>): { ap: number; mp: number } {
    return { ap: state.config.install.cost.ap, mp: 0 };
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): InstallActionData[] {
    if (hasCamera(state, player.room)) return [];
    return carriedCameras(state, player).map((item) => ({ type: "install", item: item.id }));
  }

  override check(state: Readonly<GameState>, player: Readonly<PlayerState>, target: InstallActionData): string | null {
    if (!carriedCameras(state, player).some((i) => i.id === target.item)) return "cant_install";
    if (hasCamera(state, player.room)) return "camera_already_installed";
    return this.canAfford(state, player, target);
  }

  override dirtChance(state: Readonly<GameState>): number {
    return state.config.install.dirtyChance;
  }

  override apply(state: GameState, player: PlayerState, target: InstallActionData): void {
    state.items.splice(state.items.findIndex((i) => i.id === target.item), 1);
    (state.config.equipment[player.room] ??= []).push({ id: cameraEquipmentId(player.room), type: CAMERA_EQUIPMENT });
    logPublic(state, player.room, "cameraInstalled", { name: player.character });
  }
}

function carriedCameras(state: Readonly<GameState>, player: Readonly<PlayerState>): ItemState[] {
  return state.items.filter((i) => i.type === "camera" && i.at.kind === "player" && i.at.id === player.id);
}
