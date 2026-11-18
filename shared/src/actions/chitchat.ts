import { Action, peopleHere, isString, type ActionTag } from "./action.ts";
import { revealHistory } from "../history.ts";
import { logPublic } from "../log.ts";
import { hasSkill } from "../skills.ts";
import type { GameState, PlayerState } from "../types.ts";
import { gainMorale } from "../adjustStats.ts";

export type ChitchatActionData = { type: "chitchat"; target: string };

/**
 * Chitchat with a Confident (`confident`; owner, 2026-10-24; eMushpedia Confident): `chitchat.cost.ap` (1) AP, once a
 * day (`PlayerState.chitchatToday`, cleared at day start, whichever Confident it was), with a living Confident in your
 * room. You gain `chitchat.morale` (2), up to `maxMorale`; the Confident learns your last X actions, X being their
 * morale (history.ts). The chitchat is public room history; what it reveals only the Confident sees, so you can't
 * tell their morale from it.
 */
export class ChitchatAction extends Action<ChitchatActionData> {
  override tags: readonly ActionTag[] = ["talking"];
  constructor() {
    super("chitchat", { target: isString });
  }

  override getCost(state: Readonly<GameState>): { ap: number; mp: number } {
    return { ap: state.config.chitchat.cost.ap, mp: 0 };
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): ChitchatActionData[] {
    if (player.chitchatToday) return [];
    return peopleHere(state, player)
      .filter((o) => hasSkill(o, "confident"))
      .map((o) => ({ type: "chitchat", target: o.id }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: ChitchatActionData): string | null {
    if (player.chitchatToday) return "daily_cap";
    const confidant = peopleHere(state, player).find((o) => o.id === target.target);
    if (!confidant) return "cant_see";
    return hasSkill(confidant, "confident") ? null : "no_skill";
  }

  override apply(state: GameState, player: PlayerState, target: ChitchatActionData): void {
    const confidant = state.players.find((o) => o.id === target.target)!; // checked, so it exists
    player.chitchatToday = true;
    //player.morale = Math.min(player.maxMorale, player.morale + state.config.chitchat.morale);
    gainMorale(state, player, state.config.chitchat.morale);
    logPublic(state, player.room, "chitchatted", { name: player.character, target: confidant.character });
    revealHistory(state, confidant, player, confidant.morale);
  }
}
