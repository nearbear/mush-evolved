import { Action, peopleHere } from "./action.ts";
import { logSecret } from "../log.ts";
import { contaminationCapacity } from "../modifiers.ts";
import type { GameState, PlayerState } from "../types.ts";

export type SpikeActionData = { type: "spike"; target: string };

/**
 * Spiking (confirmed 2026-10-15): a Mush spends 1 AP and 1 spore to raise a
 * living human in their room by 1 contamination (capped at capacity; converting
 * is not built yet). Always succeeds. Secret log: bystanders learn of it, the
 * victim is not told. Contamination stays hidden from everyone.
 */
export class SpikeAction extends Action<SpikeActionData> {
  constructor() {
    super("spike");
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): SpikeActionData[] {
    return player.role === "mush" ? peopleHere(state, player).filter((o) => o.role === "human").map((o) => ({ type: "spike", target: o.id })) : [];
  }

  override check(state: Readonly<GameState>, player: Readonly<PlayerState>, target: SpikeActionData): string | null {
    if (player.role !== "mush") return "not_mush";
    const victim = peopleHere(state, player).find((o) => o.id === target.target);
    if (!victim) return "cant_see";
    if (victim.role !== "human") return "not_human";
    if (player.spores < 1) return "no_spores";
    return this.canAfford(state, player, target);
  }

  override getCost(state: Readonly<GameState>): { ap: number; mp: number } {
    return { ap: state.config.spikeAp, mp: 0 };
  }

  override apply(state: GameState, player: PlayerState, target: SpikeActionData): void {
    const victim = state.players.find((o) => o.id === target.target)!; // checked, so it exists
    player.spores -= 1;
    state.contamination[victim.id] = Math.min(contaminationCapacity(state, victim), (state.contamination[victim.id] ?? 0) + 1);
    logSecret(state, player.id, "spiked", { name: player.name, target: victim.name }, victim.id);
  }
}
