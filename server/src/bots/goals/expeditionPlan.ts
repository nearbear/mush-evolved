import { DEFAULT_CONFIG, type DraftSlot, type PlayerView } from "@mush2/shared";
import { hasBotSkill } from "../duties.ts";
import { act, offered } from "./blocks.ts";
import type { Goal, GoalDef } from "./types.ts";

export const EXPEDITION_CHANNEL_NAME = "Expedition";
export const EXPEDITION_PLAN_PRIORITY = 75.5;

const openExpeditionPlan = (view: PlayerView) =>
  view.plans.find((p) => p.purpose === "expedition" && p.status === "open");

const ownExpeditionChannel = (view: PlayerView) =>
  view.privateChannels.find((c) => c.name === EXPEDITION_CHANNEL_NAME && c.createdBy === view.you.id && !c.planningClosed);

const otherExpeditionChannel = (view: PlayerView) =>
  view.privateChannels.find(
    (c) =>
      c.name === EXPEDITION_CHANNEL_NAME &&
      c.createdBy !== view.you.id &&
      !c.planningClosed &&
      view.players.some((p) => p.id === c.createdBy && p.alive),
  );

function buildOnCallSlots(view: PlayerView, memberIds: readonly string[]): DraftSlot[] {
  const maxCrew =
    view.projects["ICARUS_LARGER_BAY"] === 100
      ? DEFAULT_CONFIG.expedition.largerBayCrew
      : DEFAULT_CONFIG.expedition.maxCrew;
  const others = memberIds.filter((m) => m !== view.you.id && view.players.some((p) => p.id === m && p.alive)).length;
  const count = Math.min(maxCrew - 1, others);
  return Array.from({ length: Math.max(0, count) }, () => ({ kind: "onCall" as const }));
}

/**
 * While the ship is traveling (`view.navigation.traveling`), a Pilot opens an `"Expedition"` private channel (or reuses
 * their existing one) and posts an `"expedition"` plan for `ICARUS` with `onCall` slots up to `maxCrew` (4, or 6 with
 * `ICARUS_LARGER_BAY`). If the ship aborts or finishes traveling without orbiting, or an expedition launches before the
 * plan is called, the Pilot cancels their open expedition plan with `cancel_plan`.
 */
export const expeditionPlan: GoalDef = {
  id: "expeditionPlan",
  priority: EXPEDITION_PLAN_PRIORITY,
  options(view, memory) {
    if (!hasBotSkill(view, "pilot") || !view.chatChannels.includes("global")) return [];

    const open = openExpeditionPlan(view);
    if (open && open.author === view.you.id) {
      const stale = (!view.navigation.traveling && !view.navigation.orbiting) || view.expedition !== null;
      if (stale) {
        const key = `expeditionPlan:cancel:${open.id}`;
        if (memory.ended.has(key)) return [];
        const cancel = offered(view, "cancel_plan").find((o) => o.lacks.length === 0 && o.action.plan === open.id);
        if (cancel) return [cancelExpeditionGoal(open.id, key)];
      }
      return [];
    }

    if (!view.navigation.traveling || open) return [];
    const key = "expeditionPlan:setup";
    if (memory.ended.has(key)) return [];

    const own = ownExpeditionChannel(view);
    if (own) {
      if (view.plans.some((p) => p.channel === own.id && p.status === "open")) return [];
      if (buildOnCallSlots(view, own.members).length === 0) return [];
      return [setupExpeditionGoal(key)];
    }

    if (otherExpeditionChannel(view)) return [];
    if (view.privateChannels.length >= view.channelLimit) return [];
    if (!view.players.some((p) => p.alive && p.id !== view.you.id)) return [];
    return [setupExpeditionGoal(key)];
  },
};

function setupExpeditionGoal(key: string): Goal {
  return {
    id: "expeditionPlan",
    key,
    label: "Open an Expedition channel and post the expedition plan", // i18n-ignore: model prompt text, not player-visible
    step(v) {
      if (!v.navigation.traveling || openExpeditionPlan(v)) return { kind: "done" };
      const own = ownExpeditionChannel(v);
      if (own) {
        if (v.plans.some((p) => p.channel === own.id && p.status === "open")) return { kind: "done" };
        const slots = buildOnCallSlots(v, own.members);
        if (slots.length === 0) return { kind: "done" };
        return {
          kind: "social",
          message: {
            type: "postPlan",
            plan: {
              channel: own.id,
              room: DEFAULT_CONFIG.expedition.room,
              purpose: "expedition",
              slots,
            },
          },
        };
      }
      if (otherExpeditionChannel(v) || v.privateChannels.length >= v.channelLimit) return { kind: "done" };
      const members = v.players.filter((p) => p.alive && p.id !== v.you.id).map((p) => p.id);
      if (members.length === 0) return { kind: "done" };
      return {
        kind: "social",
        message: {
          type: "createChannel",
          name: EXPEDITION_CHANNEL_NAME,
          members,
        },
      };
    },
  };
}

function cancelExpeditionGoal(planId: string, key: string): Goal {
  return {
    id: "expeditionPlan",
    key,
    label: "Cancel the unused expedition plan", // i18n-ignore: model prompt text, not player-visible
    step(v) {
      const cancel = offered(v, "cancel_plan").find((o) => o.lacks.length === 0 && o.action.plan === planId);
      if (!cancel) return { kind: "done" };
      return act(cancel.action);
    },
  };
}
