import { DEFAULT_CONFIG, ITRACKIE_ITEM, viewPath, type Plan, type PlayerView } from "@mush2/shared";
import { hasBotSkill } from "../duties.ts";
import { roomsHolding, type SharedItem } from "../itemShare.ts";
import { activeSharedPlanet } from "../planetShare.ts";
import { act, canAfford, find, goTo, nearest } from "./blocks.ts";
import type { BotMemory, Goal, GoalDef, GoalStep } from "./types.ts";

export const EXPEDITION_PREP_PRIORITY = 73;

const ICARUS = DEFAULT_CONFIG.expedition.room;
const ROPE_TAGS: ReadonlySet<string> = new Set(["CAVE", "MOUNTAIN", "SISMIC_ACTIVITY"]);
const COMPASS_TAGS: ReadonlySet<string> = new Set(["FOREST", "DESERT", "CAVE"]);

/** Whether the bot carries at least one unbroken gun with ammo left. */
export function hasWorkingGun(view: PlayerView): boolean {
  return view.inventory.some(
    (i) => DEFAULT_CONFIG.weapons.types[i.type]?.gun === true && !i.broken && (i.charges === undefined || i.charges > 0),
  );
}

/** Whether the bot is fit to join an expedition (alive, mobile, fed, not hopeless, at least half HP, can reach ICARUS). */
export function isFitForExpedition(view: PlayerView): boolean {
  if (!view.you.alive || view.patrolShip !== null) return false;
  if (view.statuses.includes("wheelchair") || view.statuses.includes("hungry") || view.statuses.includes("hopeless")) return false;
  if (view.you.hp < Math.ceil(view.maxHp / 2)) return false;
  return viewPath(view, view.you.room, ICARUS) !== null;
}

/** Whether the bot has an expedition-helpful skill for the target planet's sectors. */
export function isPriorityExpeditionClaimant(view: PlayerView, sectors: readonly (string | null)[]): boolean {
  if (sectors.includes("INTELLIGENT") && (hasBotSkill(view, "diplomacy") || hasBotSkill(view, "polymath"))) return true;
  if (hasBotSkill(view, "sprint")) return true;
  if (hasBotSkill(view, "gunman") && hasWorkingGun(view)) return true;
  if (hasBotSkill(view, "survival")) return true;
  if (hasBotSkill(view, "botanic") || hasBotSkill(view, "polymath")) return true;
  return false;
}

/** Expedition gear items needed for a planet with `sectors`, from this bot's view. */
export function requiredExpeditionGear(sectors: readonly (string | null)[], view: PlayerView): SharedItem[] {
  const gear: SharedItem[] = [];
  if (!sectors.includes("OXYGEN")) gear.push("space_suit");
  if (sectors.includes("HYDROCARBON")) gear.push("drill");
  if (sectors.some((s) => s !== null && COMPASS_TAGS.has(s))) gear.push("quad_compass");
  if (sectors.includes("INTELLIGENT")) {
    const hasDiplomatHere =
      hasBotSkill(view, "diplomacy") ||
      hasBotSkill(view, "polymath") ||
      view.players.some(
        (p) => p.alive && p.room === view.you.room && (p.skills.includes("diplomacy") || p.skills.includes("polymath") || p.bookSkill === "diplomacy" || p.bookSkill === "polymath"),
      );
    if (!hasDiplomatHere) gear.push("white_flag");
  }
  if (sectors.filter((s) => s !== null && ROPE_TAGS.has(s)).length >= 2) gear.push("rope");
  return gear;
}

function syncPrepMemory(view: PlayerView, memory: BotMemory): void {
  if (!view.navigation.traveling && !view.navigation.orbiting) {
    memory.expeditionPrep = null;
    return;
  }
  if (memory.expeditionPrep !== null && (view.expedition !== null || view.expeditions.length > memory.expeditionPrep.expeditions)) {
    memory.expeditionPrep.ready = false;
    memory.expeditionPrep.done = true;
  }
}

function activeExpeditionPlan(view: PlayerView, memory: BotMemory): Plan | undefined {
  const isDone = (p: Plan) => memory.expeditionPrep?.planId === p.id && memory.expeditionPrep.done === true;
  return (
    view.plans.find((p) => p.purpose === "expedition" && p.status === "open" && !isDone(p)) ??
    view.plans.find(
      (p) =>
        p.purpose === "expedition" &&
        p.status === "called" &&
        p.id === memory.expeditionPrep?.planId &&
        !memory.expeditionPrep.done &&
        p.slots.some((s) => s.kind === "onCall" && s.holder === view.you.id),
    )
  );
}

function dropITrackie(view: PlayerView): GoalStep | null {
  const drop = find(view, "drop", (a) => view.inventory.some((i) => i.id === a.item && i.type === ITRACKIE_ITEM));
  return drop ? act(drop) : null;
}

function takeMissingHere(view: PlayerView, missing: readonly SharedItem[]): GoalStep | null {
  for (const type of missing) {
    const take = find(view, "take", (a) => view.roomItems.some((i) => i.id === a.item && i.type === type && !i.broken));
    if (take) return act(take);
    // In ICARUS with a full inventory, drop the iTrackie to make room for needed gear (e.g. a spacesuit).
    if (view.you.room === ICARUS && view.inventory.length >= view.inventorySlots && view.roomItems.some((i) => i.type === type && !i.broken)) {
      const drop = dropITrackie(view);
      if (drop) return drop;
    }
  }
  return null;
}

function fetchGearElsewhere(view: PlayerView, memory: BotMemory, missing: readonly SharedItem[]): GoalStep | null {
  if (view.inventory.length >= view.inventorySlots) return null;
  for (const type of missing) {
    const candidates = roomsHolding(memory, type).filter((r) => r !== view.you.room && r !== ICARUS);
    const room = nearest(view, candidates).find((r) => canAfford(view, r, 0, memory.reserve, memory));
    if (room) return goTo(view, room);
  }
  return null;
}

function stepPrep(view: PlayerView, memory: BotMemory, planId: string, slotIndex: number | null): GoalStep {
  syncPrepMemory(view, memory);
  if (memory.expeditionPrep === null || memory.expeditionPrep.done) return { kind: "done" };

  const plan = view.plans.find((p) => p.id === planId);
  if (!plan) {
    if (memory.expeditionPrep.ready && view.you.room === ICARUS && view.navigation.orbiting) return { kind: "wait" };
    return { kind: "done" };
  }

  const holdsSlot = plan.slots.some((s) => s.kind === "onCall" && s.holder === view.you.id);
  if (!holdsSlot) {
    if (plan.status !== "open" || slotIndex === null) return { kind: "done" };
    const claim = find(view, "claim_slot", (a) => a.plan === plan.id && a.slot === slotIndex);
    return claim ? act(claim) : { kind: "done" };
  }

  const sectors = activeSharedPlanet(view)?.sectors ?? [];
  const missing = requiredExpeditionGear(sectors, view).filter((t) => !view.inventory.some((i) => i.type === t && !i.broken));

  const takeHere = takeMissingHere(view, missing);
  if (takeHere) return takeHere;

  const fetchOther = fetchGearElsewhere(view, memory, missing);
  if (fetchOther) return fetchOther;

  if (view.you.room !== ICARUS) {
    if (view.navigation.orbiting || canAfford(view, ICARUS, 0, memory.reserve, memory)) {
      const walk = goTo(view, ICARUS);
      if (walk && walk.kind === "act") return walk;
    }
    return { kind: "wait" };
  }

  if (view.navigation.orbiting) {
    memory.expeditionPrep.ready = true;
    const drop = dropITrackie(view);
    if (drop) return drop;
  }

  return { kind: "wait" };
}

const GEAR_TO_DROP: readonly SharedItem[] = ["space_suit", "drill", "quad_compass", "white_flag", "rope"];

function dropToRecoverITrackie(view: PlayerView) {
  if (view.inventory.length < view.inventorySlots) return undefined;
  for (const type of GEAR_TO_DROP) {
    const drop = find(view, "drop", (a) => view.inventory.some((i) => i.id === a.item && i.type === type));
    if (drop) return drop;
  }
  return find(view, "drop", (a) => view.inventory.some((i) => i.id === a.item && i.type !== ITRACKIE_ITEM));
}

function recoverITrackieGoal(): Goal {
  return {
    id: "expeditionPrep",
    key: "expeditionPrep:recoverItrackie",
    label: "Pick up your iTrackie after returning from the expedition", // i18n-ignore: model prompt text, not player-visible
    step(v) {
      const take = find(v, "take", (a) => v.roomItems.some((i) => i.id === a.item && i.type === ITRACKIE_ITEM && !i.broken));
      if (take) return act(take);
      const drop = dropToRecoverITrackie(v);
      return drop ? act(drop) : { kind: "done" };
    },
  };
}

/**
 * Claim an `onCall` slot on an open expedition plan, fetch needed gear from known rooms (`itemShare.ts`), walk to
 * `ICARUS` (or remain reachable), drop `itrackie` before takeoff to free an inventory slot, and recover it after
 * returning. Priority claimants (helpful skills for the shared planet) claim immediately; any fit bot claims after a
 * 1-cycle wait; ties break by turn order.
 */
export const expeditionPrep: GoalDef = {
  id: "expeditionPrep",
  priority: EXPEDITION_PREP_PRIORITY,
  options(view, memory) {
    syncPrepMemory(view, memory);

    const hasITrackie = view.inventory.some((i) => i.type === ITRACKIE_ITEM && !i.broken);
    const itrackieInRoom = view.roomItems.some((i) => i.type === ITRACKIE_ITEM && !i.broken);
    if (
      !hasITrackie &&
      itrackieInRoom &&
      (memory.expeditionPrep === null || memory.expeditionPrep.done === true) &&
      (find(view, "take", (a) => view.roomItems.some((i) => i.id === a.item && i.type === ITRACKIE_ITEM && !i.broken)) ||
        dropToRecoverITrackie(view) !== undefined)
    ) {
      return [recoverITrackieGoal()];
    }

    if (memory.expeditionPrep?.ready && !memory.expeditionPrep.done && view.navigation.orbiting && view.expedition === null && view.you.room === ICARUS) {
      return [
        {
          id: "expeditionPrep",
          key: `expeditionPrep:${memory.expeditionPrep.planId}`,
          label: "Wait in the Icarus Bay for expedition takeoff", // i18n-ignore: model prompt text, not player-visible
          step: (v, m) => stepPrep(v, m, memory.expeditionPrep!.planId, null),
        },
      ];
    }

    const plan = activeExpeditionPlan(view, memory);
    if (!plan) return [];

    if (plan.status === "open" && memory.expeditionPrep?.planId !== plan.id) {
      memory.expeditionPrep = {
        planId: plan.id,
        seenCycle: view.cycle,
        ready: false,
        expeditions: view.expeditions.length,
      };
    }

    const holdsSlot = plan.slots.some((s) => s.kind === "onCall" && s.holder === view.you.id);
    if (holdsSlot) {
      return [
        {
          id: "expeditionPrep",
          key: `expeditionPrep:${plan.id}`,
          label: "Prepare gear and go to the Icarus Bay for the expedition", // i18n-ignore: model prompt text, not player-visible
          step: (v, m) => stepPrep(v, m, plan.id, null),
        },
      ];
    }

    if (plan.status !== "open" || plan.author === view.you.id || !isFitForExpedition(view)) return [];

    const slotIndex = plan.slots.findIndex(
      (s) => s.kind === "onCall" && s.holder === null && (s.reservedFor === undefined || s.reservedFor === view.you.id),
    );
    if (slotIndex === -1) return [];
    if (!find(view, "claim_slot", (a) => a.plan === plan.id && a.slot === slotIndex)) return [];

    const sectors = activeSharedPlanet(view)?.sectors ?? [];
    const priority = isPriorityExpeditionClaimant(view, sectors);
    const waited = memory.expeditionPrep !== null && memory.expeditionPrep.planId === plan.id && view.cycle > memory.expeditionPrep.seenCycle;
    if (!priority && !waited) return [];

    return [
      {
        id: "expeditionPrep",
        key: `expeditionPrep:${plan.id}`,
        label: "Claim an expedition slot and prepare gear", // i18n-ignore: model prompt text, not player-visible
        step: (v, m) => stepPrep(v, m, plan.id, slotIndex),
      },
    ];
  },
};
