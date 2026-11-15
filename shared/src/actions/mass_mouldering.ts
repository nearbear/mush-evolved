import { Action, IN_PRESELECTION, type ActionTag, type ActionVisibility } from "./action.ts";
import { soil } from "../dirt.ts";
import { logPrivate } from "../log.ts";
import { hasSkill } from "../skills.ts";
import type { GameState, PlayerState } from "../types.ts";

export type MassMoulderingActionData = { type: "mass_mouldering" };

/**
 * Mass Mouldering, the Mush skill `massggedon` (owner, 2026-11-14): once per game (follows the mind),
 * 2 AP (`massMouldering.cost.ap`) and 0 spores, makes every living player on the ship (including the actor)
 * dirty via `soil()` (so apron and Stickler still block it). The original 2 AP drain is omitted.
 * Private action with the `spore` tag (triggers myco-alarms): the actor gets a private log line and each
 * affected player gets `soil()`'s private log line.
 */
export class MassMoulderingAction extends Action<MassMoulderingActionData> {
  override visibility: ActionVisibility = "private";
  override tags: readonly ActionTag[] = ["spore"];

  constructor() {
    super("mass_mouldering");
  }

  override getCost(state: Readonly<GameState>): { ap: number; mp: number } {
    return { ap: state.config.massMouldering.cost.ap, mp: 0 };
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): MassMoulderingActionData[] {
    return this.validate(state, player) === null ? [{ type: "mass_mouldering" }] : [];
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>): string | null {
    if (state.preselection) return IN_PRESELECTION;
    if (player.role !== "mush") return "not_mush";
    if (!hasSkill(player, "massggedon")) return "no_skill";
    if (player.massMoulderingUsed) return "already_used";
    return null;
  }

  override apply(state: GameState, player: PlayerState): void {
    player.massMoulderingUsed = true;
    logPrivate(state, player.id, "massMouldering");
    for (const p of state.players) {
      if (p.alive) soil(state, p);
    }
  }
}
