import { DEFAULT_CONFIG, doorCount, doorOtherRoom, doorRooms, type Action, type DoorId, type PlayerView, type RoomId } from "@mush2/shared";
import { act, canAfford, goTo, nearest, offered, where } from "./blocks.ts";
import type { BotMemory, Goal, GoalDef, GoalStep } from "./types.ts";

/**
 * Where repairing a broken door ranks (owner, 2026-11-15): just above patching the hull (55), below personal and role
 * duties. Preserves `BOT_AP_RESERVE`.
 */
export const REPAIR_DOOR_PRIORITY = 56;

const repairAp = DEFAULT_CONFIG.repair.cost.ap;

/** The key for repairing `door` from the bot's room, and for walking to it: one per door, so ending one leaves the rest. */
const hereKey = (door: DoorId): string => `repairDoor:here:${door}`;
const goKey = (door: DoorId): string => `repairDoor:go:${door}`;

/**
 * The repair of a broken door in the bot's room it can pay for while keeping the AP reserve, if any, skipping doors
 * whose repair here ended this cycle.
 */
function repairHere(view: PlayerView, memory: BotMemory) {
  const broken = new Set(view.doors.filter((d) => d.broken).map((d) => d.id));
  return offered(view, "repair").find(
    (o) =>
      o.lacks.length === 0 &&
      "door" in o.action &&
      broken.has(o.action.door) &&
      !memory.ended.has(hereKey(o.action.door)) &&
      view.you.ap - o.cost.ap >= memory.reserve,
  );
}

/** What repairing broken doors means for this bot now; null when there's nothing it can do. */
type Plan =
  | { key: string; label: string; kind: "here"; action: Action }
  | { key: string; label: string; kind: "go"; room: RoomId };

/**
 * The first that applies, skipping any ended this cycle:
 * 1. A broken door is in the bot's room and it can pay while keeping the AP reserve: repair it.
 * 2. A broken door is reported on the alert bar (`view.alerts.reports`): consider both `doorRooms(door)` endpoints
 *    that are reachable and affordable while keeping the AP reserve, pick the nearest, and walk there. Unreachable
 *    rooms behind broken doors are naturally skipped. A door with the bot already on one of its sides is skipped: the
 *    other side offers the same repair, so if it can't be done here (Rubella, too little AP, a refusal) walking across
 *    won't help, and doing so swung the bot back and forth between the two sides.
 */
function plan(view: PlayerView, memory: BotMemory): Plan | null {
  const here = repairHere(view, memory);
  if (here && "door" in here.action) {
    const label = `Repair the broken door to ${doorOtherRoom(here.action.door, view.you.room)} here`; // i18n-ignore: model prompt text, not player-visible
    return { key: hereKey(here.action.door), label, kind: "here", action: here.action };
  }
  const goals: { door: DoorId; room: RoomId }[] = [];
  for (const r of view.alerts.reports) {
    if (r.kind !== "door" || memory.ended.has(goKey(r.door))) continue;
    const sides = doorRooms(r.door);
    if (sides.includes(view.you.room)) continue;
    const reachable = sides.filter((room) => doorCount(view, room) !== null && canAfford(view, room, repairAp, memory.reserve, memory));
    const room = nearest(view, reachable)[0];
    if (room !== undefined) goals.push({ door: r.door, room });
  }
  const room = nearest(view, goals.map((g) => g.room))[0];
  const goal = goals.find((g) => g.room === room);
  if (!goal) return null;
  const label = `Repair the broken door ${where(view, goal.room)}`; // i18n-ignore: model prompt text, not player-visible
  return { key: goKey(goal.door), label, kind: "go", room: goal.room };
}

/** One step of the plan with `key`, read again from the view each turn. */
function step(view: PlayerView, memory: BotMemory, key: string): GoalStep {
  const p = plan(view, memory);
  if (p?.key !== key) return { kind: "done", again: true };
  if (p.kind === "here") return act(p.action);
  // Arrived: the plan says repair here next turn, or the door works and the goal is done.
  return goTo(view, p.room) ?? { kind: "done", again: true };
}

/** Repair broken doors reported on the alert bar (`view.alerts.reports`), preserving the AP reserve. */
export const repairDoor: GoalDef = {
  id: "repairDoor",
  priority: REPAIR_DOOR_PRIORITY,
  options(view, memory) {
    const p = plan(view, memory);
    if (!p) return [];
    const goal: Goal = { id: "repairDoor", key: p.key, label: p.label, step: (v, m) => step(v, m, p.key) };
    return [goal];
  },
};
