import { Action, peopleHere, type ActionTag, type ActionVisibility } from "./action.ts";
import { logCovert } from "../log.ts";
import { contaminate } from "../infection.ts";
import type { GameState, PlayerState } from "../types.ts";

export type SpikeActionData = { type: "spike"; target: string };

/**
 * Spiking (confirmed 2026-10-15): a Mush spends 1 AP and 1 spore to raise a
 * living human in their room by 1 contamination (reaching capacity converts
 * them, see `infection.ts`). Always succeeds. Covert (decided 2026-10-17): only a
 * camera in the room reveals it, to everyone including the victim; bystanders and the
 * victim are not told otherwise. Contamination stays hidden from everyone. Aggressive (owner, 2026-10-18).
 */
export class SpikeAction extends Action<SpikeActionData> {
  override visibility: ActionVisibility = "covert";
  override tags: readonly ActionTag[] = ["spore", "aggressive"];

  constructor() {
    super("spike");
  }

  override getCost(state: Readonly<GameState>): { ap: number; mp: number } {
    return { ap: state.config.spike.cost.ap, mp: 0 };
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

  override apply(state: GameState, player: PlayerState, target: SpikeActionData): void {
    const victim = state.players.find((o) => o.id === target.target)!; // checked, so it exists
    player.spores -= 1;
    logCovert(state, player.id, "spiked", { name: player.character, target: victim.character });
    contaminate(state, victim);
  }
}
