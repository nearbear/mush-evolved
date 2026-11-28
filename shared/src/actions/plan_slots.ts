// Claiming, withdrawing, ticking Done and cancelling in a channel's plan (plans.ts, docs/plans/on-call.md): untimed,
// free registry actions like `ready` (owner, 2026-10-30), so `view.actions` lists them and bots use them like any action.
// Not things your character does: no log line, not in the action history.

import { Action, isIndex, isString } from "./action.ts";
import { chatChannels } from "../chat.ts";
import { findPlan, finishPlan } from "../plans.ts";
import type { GameState, Plan, PlanSlot, PlayerState } from "../types.ts";

export type ClaimSlotActionData = { type: "claim_slot"; plan: string; slot: number };
export type WithdrawSlotActionData = { type: "withdraw_slot"; plan: string; slot: number };
export type MarkDoneActionData = { type: "mark_done"; plan: string; slot: number };
export type CancelPlanActionData = { type: "cancel_plan"; plan: string };

type SlotTarget = { plan: string; slot: number };

/** The free, untimed, unrecorded base of the plan actions. */
export abstract class PlanAction<T extends { type: string }> extends Action<T> {
  override instant = true;
  override recorded = false;
  override visibility = "private" as const;
}

/** A member who can post in the plan's channel (`chatChannels`: alive, with an iTrackie), as acting on a plan is posting in it. */
const isMember = (state: Readonly<GameState>, player: Readonly<PlayerState>, plan: Readonly<Plan>): boolean => chatChannels(state, player).includes(plan.channel);

/** Every slot of the plans in `player`'s channels, for candidates to filter. */
function slotsOf(state: Readonly<GameState>, player: Readonly<PlayerState>): SlotTarget[] {
  return state.plans.filter((plan) => isMember(state, player, plan)).flatMap((plan) => plan.slots.map((_, slot) => ({ plan: plan.id, slot })));
}

/** The plan and slot an action names, if `player` is a member of its channel. */
function lookup(state: Readonly<GameState>, player: Readonly<PlayerState>, target: SlotTarget): { plan: Plan; slot: PlanSlot } | null {
  const plan = findPlan(state, target.plan);
  const slot = plan?.slots[target.slot];
  return plan && slot && isMember(state, player, plan) ? { plan, slot } : null;
}

const struck = (slot: PlanSlot): boolean => slot.kind === "task" && slot.struck !== undefined;

/**
 * Only living members claim, an unclaimed slot not reserved for someone else (owner, 2026-10-30). At most one on-call
 * slot each, and none for the author, who walks there themselves; nobody claims an STT or Comfort aimed at themselves.
 */
export function claimRefusal(state: Readonly<GameState>, player: Readonly<PlayerState>, target: SlotTarget): string | null {
  const found = lookup(state, player, target);
  if (!found) return "slot_not_found";
  const { plan, slot } = found;
  if (plan.status !== "open") return "plan_not_open";
  if (slot.holder !== null) return "slot_taken";
  if (struck(slot)) return "slot_struck";
  if (slot.reservedFor !== undefined && slot.reservedFor !== player.id) return "slot_reserved";
  if (slot.kind === "onCall") {
    if (plan.author === player.id) return "slot_author";
    if (plan.slots.some((s) => s.kind === "onCall" && s.holder === player.id)) return "slot_one_on_call";
  } else if ((slot.task.type === "stt" || slot.task.type === "comfort") && slot.task.target === player.id) return "slot_own_target";
  return null;
}

export class ClaimSlotAction extends PlanAction<ClaimSlotActionData> {
  constructor() {
    super("claim_slot", { plan: isString, slot: isIndex });
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): ClaimSlotActionData[] {
    return slotsOf(state, player)
      .filter((t) => claimRefusal(state, player, t) === null)
      .map((t) => ({ type: "claim_slot", ...t }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: ClaimSlotActionData): string | null {
    return claimRefusal(state, player, target);
  }

  override apply(state: GameState, player: PlayerState, target: ClaimSlotActionData): void {
    findPlan(state, target.plan)!.slots[target.slot]!.holder = player.id;
  }
}

/** Your own slot in an open plan, unless it was struck out. */
function withdrawRefusal(state: Readonly<GameState>, player: Readonly<PlayerState>, target: SlotTarget): string | null {
  const found = lookup(state, player, target);
  if (!found || found.slot.holder !== player.id) return "slot_not_yours";
  if (found.plan.status !== "open") return "plan_not_open";
  return struck(found.slot) ? "slot_struck" : null;
}

export class WithdrawSlotAction extends PlanAction<WithdrawSlotActionData> {
  constructor() {
    super("withdraw_slot", { plan: isString, slot: isIndex });
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): WithdrawSlotActionData[] {
    return slotsOf(state, player)
      .filter((t) => withdrawRefusal(state, player, t) === null)
      .map((t) => ({ type: "withdraw_slot", ...t }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: WithdrawSlotActionData): string | null {
    return withdrawRefusal(state, player, target);
  }

  override apply(state: GameState, player: PlayerState, target: WithdrawSlotActionData): void {
    findPlan(state, target.plan)!.slots[target.slot]!.holder = null;
  }
}

/** Your own task, not yet ticked or struck, in an open or called plan. Unverified: it's your word (owner, 2026-10-30). */
function doneRefusal(state: Readonly<GameState>, player: Readonly<PlayerState>, target: SlotTarget): string | null {
  const found = lookup(state, player, target);
  if (!found || found.slot.kind !== "task" || found.slot.holder !== player.id) return "slot_not_yours";
  if (found.plan.status !== "open" && found.plan.status !== "called") return "plan_not_open";
  if (found.slot.struck) return "slot_struck";
  return found.slot.done ? "slot_done" : null;
}

export class MarkDoneAction extends PlanAction<MarkDoneActionData> {
  constructor() {
    super("mark_done", { plan: isString, slot: isIndex });
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): MarkDoneActionData[] {
    return slotsOf(state, player)
      .filter((t) => doneRefusal(state, player, t) === null)
      .map((t) => ({ type: "mark_done", ...t }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: MarkDoneActionData): string | null {
    return doneRefusal(state, player, target);
  }

  override apply(state: GameState, player: PlayerState, target: MarkDoneActionData): void {
    const slot = findPlan(state, target.plan)!.slots[target.slot]!;
    if (slot.kind === "task") slot.done = true;
  }
}

/** The author's own open plan. Nothing to release: nothing is locked. */
export function authorRefusal(state: Readonly<GameState>, player: Readonly<PlayerState>, planId: string): string | null {
  const plan = findPlan(state, planId);
  if (!plan || plan.author !== player.id || !isMember(state, player, plan)) return "plan_forbidden";
  return plan.status === "open" ? null : "plan_not_open";
}

export class CancelPlanAction extends PlanAction<CancelPlanActionData> {
  constructor() {
    super("cancel_plan", { plan: isString });
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): CancelPlanActionData[] {
    return state.plans.filter((p) => authorRefusal(state, player, p.id) === null).map((p) => ({ type: "cancel_plan", plan: p.id }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: CancelPlanActionData): string | null {
    return authorRefusal(state, player, target.plan);
  }

  override apply(state: GameState, _player: PlayerState, target: CancelPlanActionData): void {
    finishPlan(state, findPlan(state, target.plan)!, "cancelled");
  }
}

