import { Action, type ActionVisibility } from "./action.ts";
import { pushChat } from "../chat.ts";
import { logPrivate, logPublic } from "../log.ts";
import { isPilgredRepaired, PILGRED_COMPLETE, pilgredGainRange, pilgredTerminalsHere, rollPilgredGain } from "../pilgred.ts";
import type { GameState, PlayerState } from "../types.ts";

export type RepairPilgredActionData = { type: "repair_pilgred"; equipment: string };

/**
 * Take part in repairing PILGRED at its terminal in the engine room (owner, 2026-10-21): 2 AP (free with a PILGRED point,
 * which is spent), 25% chance to get dirty, open to anyone alive, Mush and the dirty included. The gain follows the
 * original's slow formula (pilgred.ts). Repairs are private (owner, 2026-10-21): only the repairer gets a log line, and
 * roommates see no busy bar. Completion is public: a room line plus a crew-wide system message.
 */
export class RepairPilgredAction extends Action<RepairPilgredActionData> {
  override visibility: ActionVisibility = "private";

  constructor() {
    super("repair_pilgred");
  }

  /** PILGRED points (`resources.pilgred`, from the Physicist) make one repair free. */
  private paidWithPoint(player: Readonly<PlayerState>): boolean {
    return player.resources.pilgred > 0;
  }

  override getCost(state: Readonly<GameState>, player: Readonly<PlayerState>): { ap: number; mp: number } {
    return { ap: this.paidWithPoint(player) ? 0 : state.config.pilgred.cost.ap, mp: 0 };
  }

  override dirtChance(state: Readonly<GameState>): number {
    return state.config.pilgred.dirtyChance;
  }

  override injuryChance(state: Readonly<GameState>): number {
    return state.config.pilgred.injuryChance;
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): RepairPilgredActionData[] {
    if (isPilgredRepaired(state)) return [];
    return pilgredTerminalsHere(state, player).map((terminal): RepairPilgredActionData => ({ type: "repair_pilgred", equipment: terminal.id }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: RepairPilgredActionData): string | null {
    if (!pilgredTerminalsHere(state, player).some((terminal) => terminal.id === target.equipment)) return "cant_repair_pilgred";
    if (isPilgredRepaired(state)) return "pilgred_repaired";
    return null;
  }

  override apply(state: GameState, player: PlayerState, _target: RepairPilgredActionData): void {
    if (this.paidWithPoint(player)) player.resources.pilgred -= 1;
    const [gain, rng] = rollPilgredGain(state.rng, pilgredGainRange(state, player));
    state.rng = rng;
    const pilgred = state.pilgred;
    pilgred.progress = Math.min(PILGRED_COMPLETE, pilgred.progress + gain);
    pilgred.streak = pilgred.lastBy === player.id ? pilgred.streak + 1 : 1;
    pilgred.lastBy = player.id;
    if (!isPilgredRepaired(state)) {
      logPrivate(state, player.id, "pilgredRepaired");
      return;
    }
    logPublic(state, player.room, "pilgredDone", { name: player.character });
    pushChat(state, "global", { from: null, isBot: false, text: "", system: { key: "pilgredDoneCrew", params: { name: player.character } } });
  }
}
