// Channel plans and on-call summons (docs/plans/on-call.md). A plan belongs to a private channel: a room, a purpose and
// slots that members claim. Plain JSON, stored in `GameState.plans`; members see their channels' plans
// (`PlayerView.plans`).

import type { PlayerId, RoomId } from "../types.ts";
import type { PrivateChannelId } from "./chat.ts";

export type PlanId = `plan-${number}`;

/** What the plan is for: a label from a fixed list, shown on the card (owner, 2026-10-30). No free text. */
export const PLAN_PURPOSES = ["expedition", "meal", "healing", "speech", "sharing", "work", "other"] as const;
export type PlanPurpose = (typeof PLAN_PURPOSES)[number];

/** A promise a holder keeps live; never executed by the game (owner, 2026-10-30). */
export type PlanTask =
  | { type: "research"; research: string }
  | { type: "project"; project: string }
  | { type: "repair_pilgred" }
  | { type: "heal"; target: PlayerId }
  | { type: "comfort"; target: PlayerId }
  | { type: "stt"; target: PlayerId }
  | { type: "fiery_speech" }
  | { type: "boring_speech" }
  | { type: "bring"; itemType: string };

export type PlanTaskType = PlanTask["type"];

/**
 * Why a task slot is struck out: its target died, or what it promised was finished by anyone while the plan was open
 * (owner, 2026-10-30 and 2026-10-31). A struck slot can't be claimed, withdrawn or ticked; its holder stays on it.
 */
export type SlotStrike = "target_died" | "already_done";

/** What became of an on-call slot when the author pressed Go. Why a holder stopped is only in their own log. */
export type SlotOutcome = "arrived" | "stopped" | "unclaimed";

export type PlanSlot =
  | { kind: "onCall"; holder: PlayerId | null; reservedFor?: PlayerId; outcome?: SlotOutcome }
  | { kind: "task"; task: PlanTask; holder: PlayerId | null; reservedFor?: PlayerId; done: boolean; struck?: SlotStrike };

export type PlanStatus = "open" | "called" | "cancelled" | "expired";

export interface Plan {
  id: PlanId;
  channel: PrivateChannelId;
  /** The channel's creator when it was posted. */
  author: PlayerId;
  /** Where on-call holders are walked to. Never a patrol craft. */
  room: RoomId;
  purpose: PlanPurpose;
  slots: PlanSlot[];
  status: PlanStatus;
  /** Day it was posted; it expires at the end of day `postedDay + config.plans.expiryDays` if still open. */
  postedDay: number;
}

/** A slot as the author drafts it: who holds it is decided by claims. */
export type DraftSlot = { kind: "onCall"; reservedFor?: PlayerId } | { kind: "task"; task: PlanTask; reservedFor?: PlayerId };

/** What `postPlan` takes (the server's `postPlan` message, once it exists). */
export interface PlanDraft {
  channel: PrivateChannelId;
  room: RoomId;
  purpose: PlanPurpose;
  slots: DraftSlot[];
}
