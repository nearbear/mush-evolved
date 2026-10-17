import { Action } from "./action.ts";
import { hasCamera, logPublic } from "../log.ts";
import type { GameState, ItemState, PlayerState } from "../types.ts";

export type InstallActionData = { type: "install"; item: string };

/**
 * Install (collaborator's proposal, approved 2026-10-17, #35): puts a camera you carry into the
 * room you are in, where it stays as a room item (so `hasCamera` sees it). `install.cost.ap` AP,
 * no tools, at most one camera per room. Logged publicly.
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

  override apply(state: GameState, player: PlayerState, target: InstallActionData): void {
    const camera = state.items.find((i) => i.id === target.item)!; // checked, so it exists
    camera.at = { kind: "room", id: player.room };
    logPublic(state, player.room, "cameraInstalled", { name: player.name });
  }
}

function carriedCameras(state: Readonly<GameState>, player: Readonly<PlayerState>): ItemState[] {
  return state.items.filter((i) => i.type === "camera" && i.at.kind === "player" && i.at.id === player.id);
}
