import { Action, peopleHere, type ActionVisibility, isString } from "./action.ts";
import { logPrivate } from "../log.ts";
import { contaminate } from "../infection.ts";
import type { GameState, PlayerState } from "../types.ts";
import { gainMorale } from "../adjustStats.ts";
import { spreadByTouch } from "../diseases.ts";
import { dayOf } from "../helpers.ts";
import { rollFloat } from "../rng.ts";
import { addStatus } from "../statuses.ts";

export type ShareActionData = { type: "dtt" | "stt"; target: string };

export class ShareAction<T extends "dtt" | "stt" = "dtt" | "stt"> extends Action<{ type: T; target: string }> {
  override visibility: ActionVisibility = "private";

  constructor(type: T) {
    super(type, { target: isString });
  }

  override getCost(state: Readonly<GameState>): { ap: number; mp: number } {
    return { ap: state.config.share.cost.ap, mp: 0 };
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): { type: T; target: string }[] {
    return peopleHere(state, player).map((other) => ({ type: this.type as T, target: other.id }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: { type: T; target: string }): string | null {
    if (!peopleHere(state, player).some((other) => other.id === target.target)) return "cant_see";
    if (!state.bonds[player.id]?.includes(target.target) || !state.bonds[target.target]?.includes(player.id)) return "not_bonded";
    const { day } = dayOf(state);
    if (state.sharedOnDay[player.id] === day || state.sharedOnDay[target.target] === day) return "cooldown";
    return null;
  }

  override apply(state: GameState, player: PlayerState, target: { type: T; target: string }): void {
    const other = state.players.find((o) => o.id === target.target)!;
    const { day } = dayOf(state);
    for (const who of [player, other]) {
      gainMorale(state, who, state.config.share.effect.morale);
      state.sharedOnDay[who.id] = day;
    }
    const human = player.role === "human" ? player : other;
    const contaminating = this.type === "dtt" && player.role !== other.role;
    const label = this.type.toUpperCase();
    logPrivate(state, player.id, "shareDid", { label, name: other.character });
    logPrivate(state, other.id, "shareDidToYou", { label, name: player.character });
    if (contaminating) contaminate(state, human);
    // Owner, 2026-11-21: on DTT, each living non-pregnant partner rolls independently for pregnancy (everyone eligible).
    if (this.type === "dtt") {
      const { chance, mushExtraSpore } = state.config.share.pregnancy;
      for (const [who, partner] of [
        [player, other],
        [other, player],
      ] as const) {
        if (!who.alive || who.statuses.includes("pregnant")) continue;
        if (rollFloat(state) < chance) {
          addStatus(who, "pregnant");
          logPrivate(state, who.id, "becamePregnant");
          logPrivate(state, partner.id, "partnerBecamePregnant", { name: who.character });
          if (who.role === "human" && partner.role === "mush" && mushExtraSpore > 0) {
            contaminate(state, who, mushExtraSpore);
          }
        }
      }
    }
    spreadByTouch(state, player, other);
  }
}
