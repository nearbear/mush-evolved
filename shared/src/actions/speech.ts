import { Action, peopleHere } from "./action.ts";
import { logPublic } from "../log.ts";
import { hasSkill } from "../skills.ts";
import type { GameState, PlayerState } from "../types.ts";
import { changeMP, gainMorale } from "../adjustStats.ts";

export type FierySpeechActionData = { type: "fiery_speech" };
export type BoringSpeechActionData = { type: "boring_speech" };

/**
 * The Leader's (`leadership`) Fiery speech (owner, 2026-10-24, eMushpedia): `speech.fiery.ap` (2) AP, and every
 * other living person in the room, Mush included, gets `speech.fiery.morale` (2) morale, up to `maxMorale`. The
 * speaker gains nothing. No daily limit. Public room log.
 */
export class FierySpeechAction extends Action<FierySpeechActionData> {
  constructor() {
    super("fiery_speech");
  }

  override getCost(state: Readonly<GameState>): { ap: number; mp: number } {
    return { ap: state.config.speech.fiery.ap, mp: 0 };
  }

  override getCandidates(_state: Readonly<GameState>, player: Readonly<PlayerState>): FierySpeechActionData[] {
    return hasSkill(player, "leadership") ? [{ type: "fiery_speech" }] : [];
  }

  override validate(_state: Readonly<GameState>, player: Readonly<PlayerState>): string | null {
    return hasSkill(player, "leadership") ? null : "no_skill";
  }

  override apply(state: GameState, player: PlayerState): void {
    for (const o of peopleHere(state, player)) {
      const p = state.players.find((q) => q.id === o.id)!; // peopleHere reads the same state, so it exists
      gainMorale(state, p, state.config.speech.fiery.morale);
    }
    logPublic(state, player.room, "fierySpeech", { name: player.character });
  }
}

/**
 * The Motivator's (`motivator`) Boring speech (owner, 2026-10-24, eMushpedia): `speech.boring.ap` (2) AP, once a day
 * (`PlayerState.boringToday`, cleared at day start), and every other living person in the room, Mush included, gets
 * `speech.boring.mp` (3) MP, up to `movement.mpCap`. The speaker gains nothing. Public room log.
 */
export class BoringSpeechAction extends Action<BoringSpeechActionData> {
  constructor() {
    super("boring_speech");
  }

  override getCost(state: Readonly<GameState>): { ap: number; mp: number } {
    return { ap: state.config.speech.boring.ap, mp: 0 };
  }

  override getCandidates(_state: Readonly<GameState>, player: Readonly<PlayerState>): BoringSpeechActionData[] {
    return hasSkill(player, "motivator") && !player.boringToday ? [{ type: "boring_speech" }] : [];
  }

  override validate(_state: Readonly<GameState>, player: Readonly<PlayerState>): string | null {
    if (!hasSkill(player, "motivator")) return "no_skill";
    return player.boringToday ? "daily_cap" : null;
  }

  override apply(state: GameState, player: PlayerState): void {
    player.boringToday = true;
    for (const o of peopleHere(state, player)) {
      const p = state.players.find((q) => q.id === o.id)!;
      changeMP(state, p, state.config.speech.boring.mp);
    }
    logPublic(state, player.room, "boringSpeech", { name: player.character });
  }
}
