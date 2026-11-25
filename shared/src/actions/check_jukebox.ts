import { Action, isString, type ActionVisibility } from "./action.ts";
import { equipmentHere, JUKEBOX_EQUIPMENT } from "../equipment.ts";
import { songAt } from "../jukebox.ts";
import { logPrivate } from "../log.ts";
import type { GameState, PlayerState } from "../types.ts";

export type CheckJukeboxActionData = { type: "check_jukebox"; equipment: string };

/**
 * Check the jukebox's playlist (BEAT_BOX project; owner, 2026-11-22, kept from eMush): free, always succeeds, at a
 * working jukebox in your room. Private: a log line with the songs of the next 3 cycles (`songAt` offsets 1 to 3).
 */
export class CheckJukeboxAction extends Action<CheckJukeboxActionData> {
  override visibility: ActionVisibility = "private";

  constructor() {
    super("check_jukebox", { equipment: isString });
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): CheckJukeboxActionData[] {
    return equipmentHere(state, player, JUKEBOX_EQUIPMENT).map((e) => ({ type: "check_jukebox", equipment: e.id }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: CheckJukeboxActionData): string | null {
    return equipmentHere(state, player, JUKEBOX_EQUIPMENT).some((e) => e.id === target.equipment) ? null : "cant_check_jukebox";
  }

  override injuryChance(state: Readonly<GameState>): number {
    return state.config.jukebox.checkInjuryChance;
  }

  override apply(state: GameState, player: PlayerState): void {
    // The actor is alive, so each of the next cycles has a song.
    const [song1, song2, song3] = [1, 2, 3].map((offset) => songAt(state, offset)!.character);
    logPrivate(state, player.id, "jukeboxPlaylist", { song1: song1!, song2: song2!, song3: song3! });
  }
}
