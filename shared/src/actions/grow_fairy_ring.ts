import { Action, type ActionTag, type ActionVisibility } from "./action.ts";
import { fairyRingIn } from "../fairyRings.ts";
import { logSecret } from "../log.ts";
import { offShip } from "../patrol.ts";
import { hasSkill } from "../skills.ts";
import type { GameState, PlayerState } from "../types.ts";

export type GrowFairyRingActionData = { type: "grow_fairy_ring" };

/**
 * Mycelium Spirit (`mycellium_spirit`; owner, 2026-11-25): for `myceliumSpirit.grow` (1 AP and 2 spores), a Mush grows
 * a Fairy Ring in their current room (`fairyRings.ts`), once per mind (`fairyRingUsed`). Refused off the ship or in a
 * room that already has a ring. Secret (roommates or a camera see it) and tagged `spore` (rings Myco-alarms).
 */
export class GrowFairyRingAction extends Action<GrowFairyRingActionData> {
  override visibility: ActionVisibility = "secret";
  override tags: readonly ActionTag[] = ["spore"];

  constructor() {
    super("grow_fairy_ring");
  }

  override getCost(state: Readonly<GameState>): { ap: number; mp: number } {
    return { ap: state.config.myceliumSpirit.grow.ap, mp: 0 };
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): GrowFairyRingActionData[] {
    return player.role === "mush" && hasSkill(player, "mycellium_spirit") && !player.fairyRingUsed ? [{ type: "grow_fairy_ring" }] : [];
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>): string | null {
    if (player.role !== "mush") return "not_mush";
    if (!hasSkill(player, "mycellium_spirit")) return "no_skill";
    if (player.fairyRingUsed) return "already_used";
    if (player.spores < state.config.myceliumSpirit.grow.spores) return "no_spores";
    if (offShip(player.room)) return "off_ship";
    if (fairyRingIn(state, player.room)) return "already_ringed";
    return null;
  }

  override apply(state: GameState, player: PlayerState): void {
    player.spores -= state.config.myceliumSpirit.grow.spores;
    player.fairyRingUsed = true;
    state.fairyRings.push({ room: player.room, owner: player.mind });
    logSecret(state, player.id, "fairyRingGrown", { name: player.character });
  }
}
