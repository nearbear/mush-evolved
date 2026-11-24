import { Action, IN_PRESELECTION, type ActionVisibility } from "./action.ts";
import { changeAP } from "../adjustStats.ts";
import { logPrivate, logSecret } from "../log.ts";
import { becameDirty } from "../modifiers.ts";
import { hasSkill } from "../skills.ts";
import { addStatus } from "../statuses.ts";
import type { GameState, PlayerState } from "../types.ts";

export type MassMoulderingActionData = { type: "mass_mouldering" };

/**
 * Mass Mushification, the Mush skill `massggedon` (owner, 2026-11-14; matched to eMush 2026-11-23): once per game
 * (follows the mind), `massMouldering.cost.ap` (2 AP) and `massMouldering.spores` (2 spores), drains
 * `massMouldering.apDrain` (2 AP) from every living human and makes every living player (humans and Mush, including
 * the actor) dirty, bypassing apron and Stickler. Secret action (witnessed by roommates or a camera, does not trigger
 * myco-alarms); every other living player receives a private `soiledByMassMouldering` log line.
 */
export class MassMoulderingAction extends Action<MassMoulderingActionData> {
  override visibility: ActionVisibility = "secret";

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
    if (player.spores < state.config.massMouldering.spores) return "no_spores";
    return null;
  }

  override apply(state: GameState, player: PlayerState): void {
    player.spores -= state.config.massMouldering.spores;
    player.massMoulderingUsed = true;
    logSecret(state, player.id, "massMouldering", { name: player.character });
    for (const p of state.players) {
      if (!p.alive) continue;
      if (p.role === "human") changeAP(state, p, -state.config.massMouldering.apDrain);
      const wasDirty = p.statuses.includes("dirty");
      addStatus(p, "dirty");
      if (p.id !== player.id) logPrivate(state, p.id, "soiledByMassMouldering");
      if (!wasDirty) becameDirty(state, p);
    }
  }
}
