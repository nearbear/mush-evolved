import { Action, isString } from "./action.ts";
import { gainMorale } from "../adjustStats.ts";
import { equipmentHere, JUKEBOX_EQUIPMENT } from "../equipment.ts";
import { dayOf } from "../helpers.ts";
import { songAt } from "../jukebox.ts";
import { logPublic } from "../log.ts";
import type { GameState, PlayerState } from "../types.ts";

export type ListenJukeboxActionData = { type: "listen_jukebox"; equipment: string };

/** The `validate` code for Listen while someone else's song plays: shown disabled with the reason (`unaffordableActions`). */
export const NOT_YOUR_SONG = "not_your_song";
/** The `validate` code for Listen once today's morale is spent: shown disabled with the reason (`unaffordableActions`). */
export const LISTENED_TODAY = "listened_today";

/**
 * Listen to the jukebox (BEAT_BOX project; owner, 2026-11-22): `jukebox.cost.ap` (0) AP, always succeeds, at a working
 * jukebox in your room, only while your own song plays (`songAt`). Gives +`jukebox.morale` (3) at most once a day
 * (`PlayerState.jukeboxDay`). Mush can listen too. Public: the room's log names who listens and to which song. It
 * replaces eMush's morale for being in the room when your song plays at the cycle change.
 */
export class ListenJukeboxAction extends Action<ListenJukeboxActionData> {
  constructor() {
    super("listen_jukebox", { equipment: isString });
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): ListenJukeboxActionData[] {
    return equipmentHere(state, player, JUKEBOX_EQUIPMENT).map((e) => ({ type: "listen_jukebox", equipment: e.id }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: ListenJukeboxActionData): string | null {
    if (!equipmentHere(state, player, JUKEBOX_EQUIPMENT).some((e) => e.id === target.equipment)) return "cant_listen_jukebox";
    if (songAt(state)?.id !== player.id) return NOT_YOUR_SONG;
    return player.jukeboxDay === dayOf(state).day ? LISTENED_TODAY : null;
  }

  override getCost(state: Readonly<GameState>): { ap: number; mp: number } {
    return { ap: state.config.jukebox.cost.ap, mp: 0 };
  }

  override apply(state: GameState, player: PlayerState): void {
    player.jukeboxDay = dayOf(state).day;
    gainMorale(state, player, state.config.jukebox.morale);
    logPublic(state, player.room, "listenedJukebox", { name: player.character, song: player.character });
  }
}
