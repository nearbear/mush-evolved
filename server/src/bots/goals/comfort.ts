import { DEFAULT_CONFIG, type PlayerId, type PlayerView, type RoomId } from "@mush2/shared";
import { hasBotSkill } from "../duties.ts";
import { COMFORTS_PER_REQUEST } from "../moraleShare.ts";
import { act, canAfford, find, goTo, nearest, where } from "./blocks.ts";
import { SELF_CARE_PRIORITY } from "./selfCare.ts";
import type { BotMemory, GoalDef } from "./types.ts";

/** Who asked for comfort and still has comforts owed, with the room ACTOPI (or sharing it) shows them in. */
function askers(view: PlayerView, memory: BotMemory): { id: PlayerId; room: RoomId }[] {
  const out: { id: PlayerId; room: RoomId }[] = [];
  for (const [id, given] of memory.morale.requests) {
    const p = view.players.find((q) => q.id === id && q.alive);
    if (p?.room !== undefined && given < COMFORTS_PER_REQUEST) out.push({ id, room: p.room });
  }
  return out;
}

/** Comfort's AP cost; the view's config doesn't carry it, and the action's own cost shows only in the asker's room. */
const COMFORT_AP = DEFAULT_CONFIG.comfort.cost.ap;

/**
 * The Shrink comforts whoever posted `Morale: low` (owner, 2026-11-18, #452; `moraleShare.ts`): walks to the nearest
 * asker, by the room ACTOPI shows, and comforts them `COMFORTS_PER_REQUEST` times (1 AP and +2 morale each), keeping the
 * AP reserve. Same priority as `selfCare`: a bot at 0 dies at the cycle's end. Shrink bots only.
 */
export const comfort: GoalDef = {
  id: "comfort",
  priority: SELF_CARE_PRIORITY,
  options(view, memory) {
    if (!hasBotSkill(view, "shrink")) return [];
    const open = askers(view, memory).filter((a) => !memory.ended.has(`comfort:${a.id}`) && canAfford(view, a.room, COMFORT_AP, memory.reserve, memory));
    const room = nearest(view, open.map((a) => a.room))[0];
    const target = open.find((a) => a.room === room);
    if (!target) return [];
    return [
      {
        id: "comfort",
        key: `comfort:${target.id}`,
        label: `Comfort the crewmate who asked for it, ${where(view, target.room)}`, // i18n-ignore: model prompt text, not player-visible
        step(v, m) {
          const given = m.morale.requests.get(target.id);
          if (given === undefined || given >= COMFORTS_PER_REQUEST) {
            m.morale.requests.delete(target.id);
            return { kind: "done" };
          }
          const now = askers(v, m).find((a) => a.id === target.id);
          if (!now) return { kind: "failed", reason: "asker_lost" };
          const walk = goTo(v, now.room);
          if (walk) return walk;
          if (v.you.ap - COMFORT_AP < m.reserve) return { kind: "done" };
          const action = find(v, "comfort", (a) => a.target === target.id);
          if (!action) return { kind: "failed", reason: "cant_comfort" };
          m.morale.requests.set(target.id, given + 1);
          return act(action);
        },
      },
    ];
  },
};
