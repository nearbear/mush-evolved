import { Action } from "./action.ts";
import { logPrivate } from "../log.ts";
import { sporesPerDay } from "../modifiers.ts";
import { addStatus } from "../statuses.ts";
import type { GameState, PlayerState } from "../types.ts";

export type ExtractSporeActionData = { type: "extract_spore" };

export class ExtractSporeAction extends Action<ExtractSporeActionData> {
  constructor() {
    super("extract_spore");
    this.baseAPCost = 2;
  }

  override getCandidates(): ExtractSporeActionData[] {
    return [{ type: "extract_spore" }];
  }

  override check(state: Readonly<GameState>, player: Readonly<PlayerState>, target: ExtractSporeActionData): string | null {
    if (player.role !== "mush") return "not_mush";
    const last = state.sporeExtractedOn[player.id];
    if (last !== undefined && state.cycle - last < state.config.sporeCooldownCycles) return "cooldown";
    if (state.sporesToday >= sporesPerDay(state, player)) return "daily_cap";
    return this.canAfford(state, player, target);
  }

  override apply(state: GameState, player: PlayerState, target: ExtractSporeActionData): void {
    player.spores += state.config.sporesPerExtraction;
    state.sporesToday += state.config.sporesPerExtraction;
    state.sporeExtractedOn[player.id] = state.cycle;
    addStatus(player, "dirty");
    logPrivate(state, player.id, "sporeExtracted");
  }
}
