import { CAMERA_EQUIPMENT, cameraEquipmentId } from "../src/equipment.ts";
import type { GameState } from "../src/types.ts";

/** Puts an installed camera in `room`. Clones the config first: `createGame` shares it with `DEFAULT_CONFIG`. */
export function installCameraIn(state: GameState, room: string): void {
  state.config = structuredClone(state.config);
  (state.equipment[room] ??= []).push({ id: cameraEquipmentId(room), type: CAMERA_EQUIPMENT });
}
