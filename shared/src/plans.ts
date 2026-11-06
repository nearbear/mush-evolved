// ---- Channel plans ---------------------------------------------------------
// A private channel's shared to-do list (docs/plans/on-call.md, owner 2026-10-30 and 2026-10-31): a room, a purpose and
// slots members claim. On-call slots let the author, once in the room, summon the holders there (actions/summon.ts);
// task slots are promises kept live, never executed. One open plan per channel, posted only by its creator.
//
// Posting is a chat-like input (`postPlan`), since a draft can't be enumerated; claiming, withdrawing, ticking Done,
// cancelling and summoning are 0-AP registry actions (actions/plan_slots.ts, actions/summon.ts). The hooks below keep
// plans in step with deaths, channel exits, completions and the day tick. Nothing here locks AP or MP.

import { chatChannels, privateChannelId } from "./chat.ts";
import { clone, dayOf, fail, findPlayer, isRecord, type ActionResult } from "./helpers.ts";
import { ITEM_TYPES } from "./items.ts";
import { isPilgredRepaired } from "./pilgred.ts";
import { PROJECT_COMPLETE, PROJECT_IDS } from "./projects.ts";
import { RESEARCH_COMPLETE, RESEARCH_IDS } from "./research.ts";
import { PLAN_PURPOSES } from "./types/plan.ts";
import type { ChannelId, DraftSlot, GameState, Plan, PlanDraft, PlanSlot, PlanStatus, PlanTask, PlayerId, PrivateChannel, PrivateChannelId } from "./types.ts";

/** The channel's open plan, if any. */
export const openPlan = (state: Readonly<GameState>, channel: PrivateChannelId): Plan | undefined =>
  state.plans.find((p) => p.channel === channel && p.status === "open");

export const findPlan = (state: Readonly<GameState>, id: string): Plan | undefined => state.plans.find((p) => p.id === id);

/** A task slot's target, for the tasks aimed at a person. */
export const taskTarget = (task: PlanTask): PlayerId | undefined => ("target" in task ? task.target : undefined);

const isLivingMember = (state: Readonly<GameState>, channel: Readonly<PrivateChannel>, id: PlayerId): boolean =>
  channel.members.includes(id) && !!findPlayer(state, id)?.alive;

/** Whether what a task promises is already finished, from public data only (completions are announced). */
function taskFinished(state: Readonly<GameState>, task: PlanTask): boolean {
  if (task.type === "research") return (state.research[task.research] ?? 0) >= RESEARCH_COMPLETE;
  if (task.type === "project") return (state.projects[task.project] ?? 0) >= PROJECT_COMPLETE;
  if (task.type === "repair_pilgred") return isPilgredRepaired(state);
  return false;
}

/** Why a drafted task can't be posted, from static or public data only; null if it can. */
function taskRefusal(state: Readonly<GameState>, task: PlanTask): string | null {
  switch (task.type) {
    case "research":
      return (RESEARCH_IDS as readonly string[]).includes(task.research) && !taskFinished(state, task) ? null : "plan_task_invalid";
    case "project":
      return (PROJECT_IDS as readonly string[]).includes(task.project) && !taskFinished(state, task) ? null : "plan_task_invalid";
    case "repair_pilgred":
      return taskFinished(state, task) ? "plan_task_invalid" : null;
    case "heal":
    case "comfort":
    case "stt":
      return findPlayer(state, task.target)?.alive ? null : "plan_task_invalid";
    case "bring":
      return Object.hasOwn(ITEM_TYPES, task.itemType) ? null : "plan_task_invalid";
    case "fiery_speech":
    case "boring_speech":
      return null;
    default:
      return "plan_task_invalid";
  }
}

/** A task rebuilt with only its own type's fields, so nothing extra a client sends is stored and shown to members. */
function cleanTask(task: PlanTask): PlanTask {
  switch (task.type) {
    case "research":
      return { type: "research", research: task.research };
    case "project":
      return { type: "project", project: task.project };
    case "heal":
    case "comfort":
    case "stt":
      return { type: task.type, target: task.target };
    case "bring":
      return { type: "bring", itemType: task.itemType };
    default:
      return { type: task.type };
  }
}

/** A drafted slot as stored: unclaimed, and only the fields its kind has (the draft may come from a client). */
function newSlot(slot: DraftSlot): PlanSlot {
  const reserved = slot.reservedFor !== undefined ? { reservedFor: slot.reservedFor } : {};
  return slot.kind === "onCall" ? { kind: "onCall", holder: null, ...reserved } : { kind: "task", task: cleanTask(slot.task), holder: null, ...reserved, done: false };
}

/**
 * Whether a reservation could never be claimed: not a living member, or the claim rules (`claimRefusal`) would refuse
 * the very person it is for: an on-call slot for the author or for someone a second on-call slot is already reserved
 * for, or an STT or Comfort for its own target.
 */
function reservationRefusal(state: Readonly<GameState>, channel: Readonly<PrivateChannel>, authorId: PlayerId, slots: readonly DraftSlot[], slot: DraftSlot): boolean {
  const who = slot.reservedFor!;
  if (!isLivingMember(state, channel, who)) return true;
  if (slot.kind === "onCall") return who === authorId || slots.find((s) => s.kind === "onCall" && s.reservedFor === who) !== slot;
  return (slot.task.type === "stt" || slot.task.type === "comfort") && slot.task.target === who;
}

/**
 * The channel's creator posts a plan (owner, 2026-10-30): alive, playing, after pre-selection, and able to post in the
 * channel (a member with an iTrackie); the channel has no open plan and planning isn't closed. The room must have a door
 * (so never a patrol craft), the slot count within `config.plans.slotsPerPlan`, every reservation claimable by its
 * living member, and every task possible as far as public data says.
 */
export function postPlan(state: GameState, authorId: PlayerId, draft: PlanDraft): ActionResult {
  const author = findPlayer(state, authorId);
  const channel = state.channels.find((c) => c.id === draft.channel);
  if (!author?.alive || state.phase !== "playing" || state.preselection) return fail("plan_forbidden");
  if (!channel || channel.createdBy !== authorId || !chatChannels(state, author).includes(channel.id) || channel.planningClosed) return fail("plan_forbidden");
  if (openPlan(state, channel.id)) return fail("plan_exists");
  if (!Object.hasOwn(state.config.rooms, draft.room) || state.config.rooms[draft.room]!.length === 0) return fail("plan_room_invalid");
  if (!(PLAN_PURPOSES as readonly string[]).includes(draft.purpose)) return fail("plan_invalid");
  if (draft.slots.length === 0) return fail("plan_empty");
  if (draft.slots.length > state.config.plans.slotsPerPlan) return fail("plan_too_many_slots");
  for (const slot of draft.slots) {
    if (slot.kind !== "onCall" && slot.kind !== "task") return fail("plan_invalid");
    if (slot.reservedFor !== undefined && reservationRefusal(state, channel, authorId, draft.slots, slot)) return fail("plan_reserved_invalid");
    if (slot.kind === "task") {
      const refused = taskRefusal(state, slot.task);
      if (refused) return fail(refused);
    }
  }

  const next = clone(state);
  next.plans.push({
    id: `plan-${next.nextPlanId++}`,
    channel: channel.id,
    author: authorId,
    room: draft.room,
    purpose: draft.purpose,
    slots: draft.slots.map(newSlot),
    status: "open",
    postedDay: dayOf(next).day,
  });
  return { ok: true, state: next };
}

/**
 * Ends a plan (called, cancelled or expired) and drops the channel's oldest finished plans beyond
 * `config.plans.finishedKept`. Mutates a state the caller already cloned.
 */
export function finishPlan(state: GameState, plan: Plan, status: Exclude<PlanStatus, "open">): void {
  plan.status = status;
  const finished = state.plans.filter((p) => p.channel === plan.channel && p.status !== "open");
  const drop = new Set(finished.slice(0, Math.max(0, finished.length - state.config.plans.finishedKept)));
  state.plans = state.plans.filter((p) => !drop.has(p));
}

/**
 * `playerId` is leaving `channelId` (or dying, which goes through here): their claims on its open plan are withdrawn
 * and reservations for them lapse (owner, 2026-10-31). If they created it, its open plan is cancelled and the channel
 * can never have a plan again. Called before they are taken out. Mutates a state the caller already cloned.
 */
export function leavePlans(state: GameState, channelId: PrivateChannelId, playerId: PlayerId): void {
  const channel = state.channels.find((c) => c.id === channelId);
  const plan = openPlan(state, channelId);
  if (plan) {
    for (const slot of plan.slots) {
      if (slot.holder === playerId) slot.holder = null;
      if (slot.reservedFor === playerId) delete slot.reservedFor;
    }
    if (plan.author === playerId) finishPlan(state, plan, "cancelled");
  }
  if (channel?.createdBy === playerId) channel.planningClosed = true;
}

/** The channel is gone (its last member left): so are its plans. Mutates a state the caller already cloned. */
export function dropChannelPlans(state: GameState, channelId: PrivateChannelId): void {
  state.plans = state.plans.filter((p) => p.channel !== channelId);
}

/**
 * Strikes out task slots that can no longer be kept: a target who died, in any plan still on a card (owner,
 * 2026-10-30), and, while the plan is open, a research, project or PILGRED someone finished (owner, 2026-10-31). A
 * slot already ticked Done is never struck (owner, 2026-10-31). Run
 * after every action, at every cycle and on every death. Mutates a state the caller already cloned.
 */
export function strikeSlots(state: GameState): void {
  for (const plan of state.plans) {
    if (plan.status !== "open" && plan.status !== "called") continue;
    for (const slot of plan.slots) {
      if (slot.kind !== "task" || slot.struck || slot.done) continue;
      const target = taskTarget(slot.task);
      if (target !== undefined && !findPlayer(state, target)?.alive) slot.struck = "target_died";
      else if (plan.status === "open" && taskFinished(state, slot.task)) slot.struck = "already_done";
    }
  }
}

/** At the day tick: open plans past the end of day `postedDay + expiryDays` expire. Mutates a cloned state. */
export function expirePlans(state: GameState): void {
  const { day } = dayOf(state);
  for (const plan of state.plans.filter((p) => p.status === "open" && p.postedDay + state.config.plans.expiryDays < day)) finishPlan(state, plan, "expired");
}

/**
 * The plans of the channels the viewer can read (`readChannels`), for their view: a plan is part of its channel, so a
 * member without an iTrackie sees it no more than the channel's messages. Nothing in a plan is secret from its members.
 */
export function plansView(state: Readonly<Pick<GameState, "plans">>, readable: readonly ChannelId[]): Plan[] {
  return state.plans.filter((p) => readable.includes(p.channel)).map((p) => clone(p));
}

// ---- The postPlan message ---------------------------------------------------
// Untrusted client input (protocol.ts): rebuilt here, beside the draft types, so `postPlan` only ever sees known keys.

/**
 * Wire bound on a draft's slots. Generous: the rules enforce `config.plans.slotsPerPlan`, so this only stops a huge
 * message before it is copied.
 */
const MAX_WIRE_PLAN_SLOTS = 64;
/** Wire bound on the ids in a draft (rooms, players, research, projects, item types); the rules check they exist. */
const MAX_WIRE_ID_LENGTH = 64;

const wireId = (value: unknown): string | null => (typeof value === "string" && value.length > 0 && value.length <= MAX_WIRE_ID_LENGTH ? value : null);

/**
 * The `postPlan` message's draft (protocol.ts), rebuilt with known keys only, at every level, so nothing extra a client
 * sends reaches the rules.
 */
export function parsePlanDraft(value: unknown): PlanDraft | null {
  if (!isRecord(value)) return null;
  const channel = privateChannelId(value.channel);
  const room = wireId(value.room);
  const purpose = PLAN_PURPOSES.find((p) => p === value.purpose);
  if (!channel || !room || !purpose || !Array.isArray(value.slots) || value.slots.length > MAX_WIRE_PLAN_SLOTS) return null;
  const slots: DraftSlot[] = [];
  for (const raw of value.slots) {
    const slot = parseDraftSlot(raw);
    if (!slot) return null;
    slots.push(slot);
  }
  return { channel, room, purpose, slots };
}

function parseDraftSlot(value: unknown): DraftSlot | null {
  if (!isRecord(value)) return null;
  let reserved: { reservedFor?: PlayerId } = {};
  if (value.reservedFor !== undefined) {
    const who = wireId(value.reservedFor);
    if (!who) return null;
    reserved = { reservedFor: who };
  }
  if (value.kind === "onCall") return { kind: "onCall", ...reserved };
  if (value.kind !== "task") return null;
  const task = parsePlanTask(value.task);
  return task && { kind: "task", task, ...reserved };
}

function parsePlanTask(value: unknown): PlanTask | null {
  if (!isRecord(value)) return null;
  switch (value.type) {
    case "research": {
      const research = wireId(value.research);
      return research === null ? null : { type: "research", research };
    }
    case "project": {
      const project = wireId(value.project);
      return project === null ? null : { type: "project", project };
    }
    case "heal":
    case "comfort":
    case "stt": {
      const target = wireId(value.target);
      return target === null ? null : { type: value.type, target };
    }
    case "bring": {
      const itemType = wireId(value.itemType);
      return itemType === null ? null : { type: "bring", itemType };
    }
    case "repair_pilgred":
    case "fiery_speech":
    case "boring_speech":
      return { type: value.type };
    default:
      return null;
  }
}
