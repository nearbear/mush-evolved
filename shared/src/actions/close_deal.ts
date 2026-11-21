import { Action, type ActionCost, type ActionVisibility, isIndex, isString } from "./action.ts";
import { comTerminalsHere } from "../comms.ts";
import { logPrivate } from "../log.ts";
import { closeDeal, dealBlock, dealProjectCount, merchantsInOrbit, validProjectPick } from "../merchants.ts";
import { tradableProjects } from "../projectEffects.ts";
import type { ProjectId } from "../projects.ts";
import { findSignal, signalOption } from "../signals.ts";
import { hasTitleAccess } from "../titles.ts";
import type { GameState, PlayerState } from "../types.ts";

/** `projects`: the finished projects the officer gives, for a deal that takes some (TECHNO_REWRITE); absent otherwise. */
export type CloseDealActionData = { type: "close_deal"; equipment: string; signal: string; deal: number; projects?: string[] };

/** At most this many project ids are read from a client: more than any deal asks for. */
const MAX_PICK = 8;

const isProjectPick = (value: unknown): value is string[] | undefined =>
  value === undefined || (Array.isArray(value) && value.length <= MAX_PICK && value.every(isString));

/**
 * Close a merchant's deal at the Com center terminal (owner, 2026-11-15, #143): 2 AP, for whoever has access to the
 * Comms Officer title, once the merchant was contacted (signals.ts: the `offers` step). The ship pays (merchants.ts,
 * `closeDeal`), the goods appear on the Front Storage floor, and the conversation closes as `deal`. A deal the ship
 * can't pay for is refused here and shown blocked in the Signals tab (`comms.terminal.signals`). Private (owner,
 * 2026-11-16).
 */
export class CloseDealAction extends Action<CloseDealActionData> {
  override terminal = true;

  override visibility: ActionVisibility = "private";

  constructor() {
    super("close_deal", { equipment: isString, signal: isString, deal: isIndex, projects: isProjectPick });
  }

  /** As the base, but leaves `projects` out when the client sent none. */
  override parse(raw: Readonly<Record<string, unknown>>): CloseDealActionData | null {
    const action = super.parse(raw);
    if (!action) return null;
    if (action.projects === undefined) delete action.projects;
    else action.projects = [...action.projects];
    return action;
  }

  override getCost(state: Readonly<GameState>): ActionCost {
    return { ap: state.config.merchants.deal.cost.ap, mp: 0 };
  }

  /**
   * Every deal of every contacted merchant, at each terminal here; `validate` refuses the blocked ones. A deal that
   * takes projects is offered with the first ones a merchant can take, and the officer may pick others.
   */
  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): CloseDealActionData[] {
    if (!hasTitleAccess(state, player, "comms_officer")) return [];
    const open = merchantsInOrbit(state).filter((s) => signalOption(s, "deal"));
    return comTerminalsHere(state, player).flatMap((terminal) =>
      open.flatMap((s) =>
        s.merchant!.deals.map((d, deal): CloseDealActionData => {
          const count = dealProjectCount(d);
          return { type: "close_deal", equipment: terminal.id, signal: s.id, deal, ...(count > 0 && { projects: tradableProjects(state).slice(0, count) }) };
        }),
      ),
    );
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: CloseDealActionData): string | null {
    if (!comTerminalsHere(state, player).some((terminal) => terminal.id === target.equipment)) return "cant_use_comms";
    if (!hasTitleAccess(state, player, "comms_officer")) return "not_comms_officer";
    const signal = findSignal(state, target.signal);
    const deal = signal?.merchant?.deals[target.deal];
    if (!signal || !deal || !signalOption(signal, "deal")) return "no_merchant";
    if (dealBlock(state, player, deal) !== null) return "cant_pay";
    if (!validProjectPick(state, deal, target.projects ?? [])) return "bad_projects";
    return null;
  }

  override apply(state: GameState, player: PlayerState, target: CloseDealActionData): void {
    const kind = findSignal(state, target.signal)!.merchant!.kind;
    const traded = closeDeal(state, player, target.signal, target.deal, (target.projects ?? []) as ProjectId[]);
    logPrivate(state, player.id, "merchantDealClosed", { kind, traded: traded.length });
  }
}
