import type { PlayerView } from "@mush2/shared";
import { dutyPriority, holdsTrigger } from "../duties.ts";
import { act, canAfford, failed, goTo, offered, roomsWith, where } from "./blocks.ts";
import type { BotMemory, Goal, GoalDef } from "./types.ts";

const COM_CENTER = "COM_CENTER";
/** `memory.today` key: today's one Sol attempt is made. */
const TRIED = "contactSol";
const isSolDuty = (d: { actions?: readonly string[] }): boolean => Boolean(d.actions?.includes("contact_sol"));

/**
 * The Radio Expert's duty while the link with Sol is down (`BOT_DUTIES`, owner 2026-11-01, #222): walk to the Com
 * center terminal and try `contact_sol` once a day (owner, 2026-11-27: one attempt per character a day), unless the
 * link is already established or the try would dip into the AP reserve. The try is noted in `memory.today`.
 */
export const contactSol: GoalDef = {
  id: "contactSol",
  get priority() {
    return dutyPriority("linkDown", isSolDuty);
  },
  options: (view, memory) => contactSolOptions(view, memory, false),
};

export function contactSolOptions(view: PlayerView, memory: BotMemory, ignoreDirty: boolean): Goal[] {
  if (view.comms.linked || memory.today.has(TRIED) || !holdsTrigger(view, "linkDown", isSolDuty)) return [];
  if (!ignoreDirty && view.statuses.includes("dirty")) return [];
  const room = roomsWith(view, [COM_CENTER]).find(
    (r) => !memory.ended.has(`contactSol:${r}`) && canAfford(view, r, view.config.contactSolAp, memory.reserve, memory),
  );
  if (!room) return [];
  return [
    {
      id: "contactSol",
      key: `contactSol:${room}`,
      label: `Establish contact with Sol at the comms center ${where(view, room)}`, // i18n-ignore: model prompt text, not player-visible
      step(v, m) {
        if (v.comms.linked || m.today.has(TRIED)) return { kind: "done" };
        const walk = goTo(v, room);
        if (walk) return walk;
        const option = offered(v, "contact_sol")[0];
        if (!option) return failed("cant_contact_sol");
        if (v.you.ap - option.cost.ap < m.reserve) return { kind: "done" };
        if (option.lacks.includes("clean")) return { kind: "done", again: true };
        if (option.lacks.length > 0) return { kind: "done" };
        m.today.add(TRIED);
        return act(option.action);
      },
    },
  ];
}
