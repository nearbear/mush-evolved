import { Action, IN_PRESELECTION, type ActionVisibility } from "./action.ts";
import { logSecret } from "../log.ts";
import { sporesPerDay } from "../modifiers.ts";
import { hasSkill } from "../skills.ts";
import { addStatus } from "../statuses.ts";
import type { GameState, PlayerState } from "../types.ts";

export type ExtractSporeActionData = { type: "extract_spore" };

/** Fertile's daily extraction is still unspent: free of AP and exempt from the cooldown (owner, 2026-10-27). */
function freeExtraction(player: Readonly<PlayerState>): boolean {
  return hasSkill(player, "fertile") && !player.fertileToday;
}

export class ExtractSporeAction extends Action<ExtractSporeActionData> {
  override visibility: ActionVisibility = "secret";

  constructor() {
    super("extract_spore");
  }

  override getCost(state: Readonly<GameState>, player: Readonly<PlayerState>): { ap: number; mp: number } {
    if (freeExtraction(player)) return { ap: 0, mp: 0 };
    return { ap: state.config.spores.cost.ap, mp: 0 };
  }

  override getCandidates(): ExtractSporeActionData[] {
    return [{ type: "extract_spore" }];
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: ExtractSporeActionData): string | null {
    if (state.preselection) return IN_PRESELECTION;
    if (player.role !== "mush") return "not_mush";
    const last = state.sporeExtractedOn[player.id];
    if (!freeExtraction(player) && last !== undefined && state.cycle - last < state.config.spores.cooldownCycles) return "cooldown";
    if (state.sporesToday >= sporesPerDay(state, player)) return "daily_cap";
    return null;
  }

  override apply(state: GameState, player: PlayerState, target: ExtractSporeActionData): void {
    if (freeExtraction(player)) player.fertileToday = true;
    player.spores += state.config.spores.effect.spores;
    state.sporesToday += state.config.spores.effect.spores;
    state.sporeExtractedOn[player.id] = state.cycle;
    addStatus(player, "dirty");
    logSecret(state, player.id, "sporeExtracted", { name: player.character });
  }
}
