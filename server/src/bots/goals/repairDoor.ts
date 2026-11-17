import { DEFAULT_CONFIG, doorCount, doorRooms, type PlayerView, type RoomId } from "@mush2/shared";
import { act, canAfford, goTo, nearest, offered, where } from "./blocks.ts";
import type { BotMemory, Goal, GoalDef, GoalStep } from "./types.ts";

/**
 * Where repairing a broken door ranks (owner, 2026-11-15): just above patching the hull (55), below personal and role
 * duties. Preserves `BOT_AP_RESERVE`.
 */
export const REPAIR_DOOR_PRIORITY = 56;

const repairAp = DEFAULT_CONFIG.repair.cost.ap;

/** The repair of a broken door in the bot's room it can pay for while keeping the AP reserve, if any. */
function repairHere(view: PlayerView, memory: BotMemory) {
  const broken = new Set(view.doors.filter((d) => d.broken).map((d) => d.id));
  return offered(view, "repair").find(
    (o) => o.lacks.length === 0 && "door" in o.action && broken.has(o.action.door) && view.you.ap - o.cost.ap >= memory.reserve,
  );
}

/** What repairing broken doors means for this bot now, by its key; null when there's nothing it can do. */
interface Plan {
  key: string;
  label: string;
}

/**
 * The first that applies, skipping any ended this cycle:
 * 1. A broken door is in the bot's room and it can pay while keeping the AP reserve: repair it.
 * 2. A broken door is reported on the alert bar (`view.alerts.reports`): consider both `doorRooms(door)` endpoints
 *    that are reachable and affordable while keeping the AP reserve, pick the nearest, and walk there. Unreachable
 *    rooms behind broken doors are naturally skipped.
 */
function plan(view: PlayerView, memory: BotMemory): Plan | null {
  const open = (key: string): boolean => !memory.ended.has(key);
  if (repairHere(view, memory) && open("repairDoor:here")) {
    return { key: "repairDoor:here", label: "Repair the broken door here" }; // i18n-ignore: model prompt text, not player-visible
  }
  const candidates = new Set<RoomId>();
  for (const r of view.alerts.reports) {
    if (r.kind !== "door") continue;
    for (const room of doorRooms(r.door)) {
      if (room === view.you.room) continue; // here and not repairable: nothing broken to see, or not enough AP
      if (doorCount(view, room) !== null && canAfford(view, room, repairAp, memory.reserve, memory)) {
        candidates.add(room);
      }
    }
  }
  for (const room of nearest(view, [...candidates])) {
    const key = `repairDoor:go:${room}`;
    if (!open(key)) continue;
    return { key, label: `Repair the broken door ${where(view, room)}` }; // i18n-ignore: model prompt text, not player-visible
  }
  return null;
}

/** One step of the plan with `key`, read again from the view each turn. */
function step(view: PlayerView, memory: BotMemory, key: string): GoalStep {
  if (plan(view, memory)?.key !== key) return { kind: "done", again: true };
  if (key === "repairDoor:here") return act(repairHere(view, memory)!.action);
  const room = key.slice("repairDoor:go:".length) as RoomId;
  // Arrived: the plan says repair here next turn, or the door works and the goal is done.
  return goTo(view, room) ?? { kind: "done", again: true };
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
