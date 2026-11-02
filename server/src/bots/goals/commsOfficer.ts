import type { PlayerView } from "@mush2/shared";
import { dutyPriority, holdsTrigger } from "../duties.ts";
import { act, canAfford, failed, goTo, offered, roomsWith, where } from "./blocks.ts";
import type { BotMemory, Goal, GoalDef } from "./types.ts";

const COM_CENTER = "COM_CENTER";
const isCommsOfficerDuty = (d: { actions?: readonly string[] }): boolean => Boolean(d.actions?.includes("decode_rebel"));

/**
 * AP a round at the Comms terminal costs: free when standing at the terminal with an open rebel call and a Computer
 * point (`decode_rebel.ts`), otherwise the base comms cost.
 */
export function nextCommsAp(view: PlayerView): number {
  if (offered(view, "decode_rebel").length > 0 && view.you.resources.comp > 0) return 0;
  return Math.min(view.config.rebelAp, view.config.xylophAp, view.config.neronAp);
}

/**
 * The Comms Officer's duty while the link with Sol is up (`BOT_DUTIES`, owner 2026-11-01, #222): walk to the Com
 * center terminal and decode open rebel calls first, then contact Xyloph while entries remain, then update NERON,
 * stopping at the AP reserve or when the link drops.
 */
export const commsOfficer: GoalDef = {
  id: "commsOfficer",
  get priority() {
    return dutyPriority("linkUp", isCommsOfficerDuty);
  },
  options: (view, memory) => commsOfficerOptions(view, memory, false),
};

export function commsOfficerOptions(view: PlayerView, memory: BotMemory, ignoreDirty: boolean): Goal[] {
  if (!view.comms.linked || !holdsTrigger(view, "linkUp", isCommsOfficerDuty)) return [];
  if (!ignoreDirty && view.statuses.includes("dirty")) return [];
  const ap = nextCommsAp(view);
  const room = roomsWith(view, [COM_CENTER]).find(
    (r) => !memory.ended.has(`commsOfficer:${r}`) && canAfford(view, r, ap, memory.reserve),
  );
  if (!room) return [];
  return [
    {
      id: "commsOfficer",
      key: `commsOfficer:${room}`,
      label: `Work at the comms center ${where(view, room)}: decode rebel signals, contact Xyloph, update NERON`, // i18n-ignore: model prompt text, not player-visible
      step(v, m) {
        if (!v.comms.linked) return { kind: "done" };
        const walk = goTo(v, room);
        if (walk) return walk;
        const option = offered(v, "decode_rebel")[0] ?? offered(v, "contact_xyloph")[0] ?? offered(v, "update_neron")[0];
        if (!option) return failed("cant_use_comms");
        if (v.you.ap - option.cost.ap < m.reserve) return { kind: "done" };
        if (option.lacks.includes("clean")) return { kind: "done", again: true };
        if (option.lacks.length > 0) return { kind: "done" };
        return act(option.action);
      },
    },
  ];
}
