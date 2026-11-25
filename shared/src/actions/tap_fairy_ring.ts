import { Action, RING_TAPPED, SPORES_FULL, type ActionTag, type ActionVisibility } from "./action.ts";
import { extractionExtraAp } from "./extract_spore.ts";
import { fairyRingIn } from "../fairyRings.ts";
import { logSecret } from "../log.ts";
import type { GameState, PlayerState } from "../types.ts";

export type TapFairyRingActionData = { type: "tap_fairy_ring" };

/**
 * Drawing a spore from a Fairy Ring (Mycelium Spirit; owner, 2026-11-25). Any Mush in a room with a ring, once per
 * ring per day (`FairyRing.tapped`, cleared at day change): `myceliumSpirit.tap.ap` (1 AP, plus Constipaspore's extra
 * like extraction; Fertile's free pull doesn't apply) for 1 spore. No dirt, not counted in the faction's daily cap,
 * refused at the holding limit. Secret and tagged `spore` (rings Myco-alarms).
 */
export class TapFairyRingAction extends Action<TapFairyRingActionData> {
  override visibility: ActionVisibility = "secret";
  override tags: readonly ActionTag[] = ["spore"];

  constructor() {
    super("tap_fairy_ring");
  }

  override getCost(state: Readonly<GameState>): { ap: number; mp: number } {
    return { ap: state.config.myceliumSpirit.tap.ap + extractionExtraAp(state), mp: 0 };
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): TapFairyRingActionData[] {
    return player.role === "mush" && fairyRingIn(state, player.room) ? [{ type: "tap_fairy_ring" }] : [];
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>): string | null {
    if (player.role !== "mush") return "not_mush";
    const ring = fairyRingIn(state, player.room);
    if (!ring) return "no_fairy_ring";
    if (ring.tapped) return RING_TAPPED;
    if (player.spores + state.config.myceliumSpirit.tap.spores > state.config.spores.max) return SPORES_FULL; // holding limit
    return null;
  }

  override apply(state: GameState, player: PlayerState): void {
    const ring = state.fairyRings.find((r) => r.room === player.room)!;
    ring.tapped = true;
    player.spores += state.config.myceliumSpirit.tap.spores;
    logSecret(state, player.id, "fairyRingTapped", { name: player.character });
  }
}
