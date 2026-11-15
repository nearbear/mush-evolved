import { DEFAULT_CONFIG, type PlayerView, type RoomId } from "@mush2/shared";
import { claimant, formatTankLine, OXYGEN_TANK, tankTargets } from "../tankShare.ts";
import { act, canAfford, goTo, nearest, offered, where } from "./blocks.ts";
import type { BotMemory, Goal, GoalDef, GoalStep } from "./types.ts";

/**
 * Where repairing an oxygen tank ranks (owner, 2026-11-14, #443): right behind fighting fires (78), above the
 * Commander's jumps (77). A broken tank leaks oxygen every cycle (breakage.ts).
 */
export const REPAIR_OXYGEN_PRIORITY = 77.5;

const repairAp = DEFAULT_CONFIG.repair.cost.ap;

/** The repair of a broken tank in the bot's room it can pay for (an Engineer point counts), if any. */
function repairHere(view: PlayerView) {
  const broken = new Set(view.roomEquipment.filter((e) => e.type === OXYGEN_TANK && e.broken).map((e) => e.id));
  return offered(view, "repair").find((o) => o.lacks.length === 0 && "equipment" in o.action && broken.has(o.action.equipment));
}

/** What repairing tanks means for this bot now, by its key; null when there's nothing it can do. */
interface Plan {
  key: string;
  label: string;
}

/**
 * The first that applies, skipping any ended this cycle:
 * 1. A broken tank is in the bot's room and it can pay: repair it, try after try (25% each; a broken tank is an
 *    emergency, so the AP reserve may go too).
 * 2. A tank room is known broken (reported) or suspected (NERON announced a tank, nobody has looked), and no other bot
 *    has claimed it this cycle: claim it in global chat (`Tank: going to`, so other bots pick another room), walk there,
 *    and repair. A known broken tank may spend the reserve on the walk and one try; a suspect only keeps it, like a
 *    fire search.
 */
function plan(view: PlayerView, memory: BotMemory): Plan | null {
  const open = (key: string): boolean => !memory.ended.has(key);
  if (repairHere(view) && open("repairOxygen:here")) return { key: "repairOxygen:here", label: "Repair the broken oxygen tank here" }; // i18n-ignore: model prompt text, not player-visible
  const tanks = memory.tanks;
  for (const room of nearest(view, tankTargets(view, tanks))) {
    if (room === view.you.room) continue; // here and not repairable: nothing broken to see, or no AP
    const known = tanks.broken.has(room);
    if (!canAfford(view, room, known ? repairAp : 0, known ? 0 : memory.reserve, memory)) continue;
    const key = `repairOxygen:go:${room}`;
    if (!open(key)) continue;
    const label = known ? `Repair the broken oxygen tank ${where(view, room)}` : `An oxygen tank broke: check the one ${where(view, room)}`; // i18n-ignore: model prompt text, not player-visible
    return { key, label };
  }
  return null;
}

/** One step of the plan with `key`, read again from the view each turn. */
function step(view: PlayerView, memory: BotMemory, key: string): GoalStep {
  if (plan(view, memory)?.key !== key) return { kind: "done", again: true };
  if (key === "repairOxygen:here") return act(repairHere(view)!.action);
  const room = key.slice("repairOxygen:go:".length) as RoomId;
  // Claim the room first, unless chat is closed to this bot; the line is read back next turn.
  if (claimant(view, memory.tanks, room) !== view.you.id && view.chatChannels.includes("global")) {
    return { kind: "social", message: { type: "chat", channel: "global", text: formatTankLine({ kind: "claim", room }) } };
  }
  // Arrived: the plan says repair here next turn, or the tank works and the goal is done.
  return goTo(view, room) ?? { kind: "done", again: true };
}

/**
 * Repair broken oxygen tanks (#443; owner, 2026-11-14: every bot, claiming a tank before going). See `plan`, and
 * `tankShare.ts` for how bots learn where a tank is broken.
 */
export const repairOxygen: GoalDef = {
  id: "repairOxygen",
  priority: REPAIR_OXYGEN_PRIORITY,
  options(view, memory) {
    const p = plan(view, memory);
    if (!p) return [];
    const goal: Goal = { id: "repairOxygen", key: p.key, label: p.label, step: (v, m) => step(v, m, p.key) };
    return [goal];
  },
};
