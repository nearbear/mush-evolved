import { Action, IN_PRESELECTION, type ActionVisibility } from "./action.ts";
import { changeAP } from "../adjustStats.ts";
import { heal } from "../death.ts";
import { logSecret } from "../log.ts";
import { hasSkill } from "../skills.ts";
import type { GameState, PlayerState } from "../types.ts";

export type ConsumeSporeActionData = { type: "consume_spore" };

/**
 * Phagocytosis, the Mush skill `phagocytosis` (owner, 2026-11-04; eMushpedia): for 1 spore (and no AP) the Mush heals
 * `consumeSpore.effect.hp` and gains `consumeSpore.effect.ap` AP, capped at their maxima. Secret, with the same log
 * line as `consume`. Not `spore`-tagged: spore removal does not ring myco-alarms.
 */
export class ConsumeSporeAction extends Action<ConsumeSporeActionData> {
  override visibility: ActionVisibility = "secret";

  constructor() {
    super("consume_spore");
  }

  override getCost(state: Readonly<GameState>): { ap: number; mp: number } {
    return { ap: state.config.consumeSpore.cost.ap, mp: 0 };
  }

  override getCandidates(_state: Readonly<GameState>, player: Readonly<PlayerState>): ConsumeSporeActionData[] {
    return player.role === "mush" && hasSkill(player, "phagocytosis") && player.spores >= 1 ? [{ type: "consume_spore" }] : [];
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>): string | null {
    if (state.preselection) return IN_PRESELECTION;
    if (player.role !== "mush") return "not_mush";
    if (!hasSkill(player, "phagocytosis")) return "no_skill";
    if (player.spores < 1) return "no_spores";
    return null;
  }

  override apply(state: GameState, player: PlayerState): void {
    player.spores -= 1;
    heal(state, player, state.config.consumeSpore.effect.hp);
    changeAP(state, player, state.config.consumeSpore.effect.ap);
    logSecret(state, player.id, "consumed", { name: player.character });
  }
}
