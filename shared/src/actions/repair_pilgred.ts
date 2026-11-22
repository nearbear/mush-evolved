import { Action, type ActionCost, type ActionVisibility, isString } from "./action.ts";
import { pushChat } from "../chat.ts";
import { logPrivate, logPublic } from "../log.ts";
import { contribute } from "../relay.ts";
import { isPilgredRepaired, PILGRED_COMPLETE, PILGRED_SKILLS, pilgredTerminalsHere } from "../pilgred.ts";
import type { GameState, PlayerState } from "../types.ts";
import { rubellaBlocks } from "../diseases.ts";

export type RepairPilgredActionData = { type: "repair_pilgred"; equipment: string };

/**
 * Take part in repairing PILGRED at its terminal in the engine room (owner, 2026-10-21): 2 AP (free with a PILGRED point,
 * which is spent), 25% chance to get dirty, open to anyone alive, Mush and the dirty included. The gain follows the
 * original's slow formula (pilgred.ts). Repairs are private (owner, 2026-10-21): only the repairer gets a log line, and
 * roommates see no busy bar. Completion is public: a room line plus a crew-wide system message.
 */
export class RepairPilgredAction extends Action<RepairPilgredActionData> {
  override terminal = true;

  override visibility: ActionVisibility = "private";

  constructor() {
    super("repair_pilgred", { equipment: isString });
  }

  /** PILGRED points (`resources.pilgred`, from the Physicist) make one repair free. */
  override getCost(state: Readonly<GameState>, player: Readonly<PlayerState>): ActionCost {
    return player.resources.pilgred > 0 ? { ap: 0, mp: 0, paidBy: "pilgred" } : { ap: state.config.pilgred.cost.ap, mp: 0 };
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
    if (rubellaBlocks(player)) return "cant_repair";
    if (!pilgredTerminalsHere(state, player).some((terminal) => terminal.id === target.equipment)) return "cant_repair_pilgred";
    if (isPilgredRepaired(state)) return "pilgred_repaired";
    return null;
  }

  override apply(state: GameState, player: PlayerState, _target: RepairPilgredActionData): void {
    // PILGRED is never boosted by BIOS CPU priority (bonus = 0).
    state.pilgred.progress = contribute(state, state.pilgred.pool, state.config.pilgred.progress, player, PILGRED_SKILLS, PILGRED_COMPLETE, 0);
    if (!isPilgredRepaired(state)) {
      logPrivate(state, player.id, "pilgredRepaired");
      return;
    }
    logPublic(state, player.room, "pilgredDone", { name: player.character });
    pushChat(state, "global", { from: null, isBot: false, text: "", system: { key: "pilgredDoneCrew", params: { name: player.character } } });
  }
}
