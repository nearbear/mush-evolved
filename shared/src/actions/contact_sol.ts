import { Action, type ActionCost, type ActionVisibility, isString } from "./action.ts";
import { comTerminalsHere, solChance, solFailed } from "../comms.ts";
import { logPrivate } from "../log.ts";
import type { GameState, PlayerState } from "../types.ts";

export type ContactSolActionData = { type: "contact_sol"; equipment: string };

/**
 * Try to establish the link with Sol at the Com center terminal (owner, 2026-10-19 and 2026-10-21): 2 AP, open to anyone
 * alive and not dirty, Mush included, while the link is down. The ship-wide chance starts at 4% and each failure adds 4%
 * (comms.ts; Radio Expert raises it). Private: only the actor gets a log line; the link status itself is in every view.
 */
export class ContactSolAction extends Action<ContactSolActionData> {
  override terminal = true;

  override visibility: ActionVisibility = "private";

  constructor() {
    super("contact_sol", { equipment: isString });
  }

  /** A Computer point (`resources.comp`) makes one use free (owner, 2026-11-09). */
  override getCost(state: Readonly<GameState>, player: Readonly<PlayerState>): ActionCost {
    return player.resources.comp > 0 ? { ap: 0, mp: 0, paidBy: "comp" } : { ap: state.config.comms.sol.cost.ap, mp: 0 };
  }

  override getSuccessChance(state: Readonly<GameState>, player: Readonly<PlayerState>): number {
    return solChance(state, player);
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): ContactSolActionData[] {
    if (state.comms.linked) return [];
    return comTerminalsHere(state, player).map((terminal): ContactSolActionData => ({ type: "contact_sol", equipment: terminal.id }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: ContactSolActionData): string | null {
    if (!comTerminalsHere(state, player).some((terminal) => terminal.id === target.equipment)) return "cant_contact_sol";
    if (state.comms.linked) return "already_linked";
    if (player.statuses.includes("dirty")) return "dirty";
    return null;
  }

  override apply(state: GameState, player: PlayerState, _target: ContactSolActionData): void {
    state.comms.linked = true;
    logPrivate(state, player.id, "solLinked");
  }

  override fail(state: GameState, player: PlayerState, _target: ContactSolActionData): void {
    solFailed(state);
    logPrivate(state, player.id, "solFailed");
  }
}
