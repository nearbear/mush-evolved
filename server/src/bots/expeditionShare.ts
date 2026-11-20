// How bots tell the Commander that expeditions are over (owner, 2026-11-19, docs/scratchpad/bot-survival-plan.md Run A): Board
// the Icarus and Take off show disabled with the reason "explored" (every sector of the orbited planet is explored) or
// "icarusLost", and only to someone in the Icarus Bay or aboard. A bot that sees either posts one fixed global line,
// `Expedition: done at <planet>` or `Expedition: no Icarus`, once per fact; both hold for the whole ship, so one bot is
// enough, and a bot that read the line doesn't repeat it. The Commander leaves orbit on it (`readyToLeaveOrbit`) and
// Pilots stop trying to launch. A missing spacesuit is per person and posts nothing. The line says only what the bay
// shows anyone standing in it. Only bots parse it, and only this format; a player can post it too and send the
// Commander off early (accepted, as with shared planets and reports).

import type { PlayerView } from "@mush2/shared";
import type { BotMemory, BotSocial } from "./goals/types.ts";

export const EXPEDITION_NO_ICARUS_LINE = "Expedition: no Icarus";

/** The line for a planet with every sector explored. */
export const formatExpeditionDone = (planet: string): string => `Expedition: done at ${planet}`;

export type ExpeditionLine = { kind: "done"; planet: string } | { kind: "noIcarus" };

/** A chat line in the bots' expedition format, or null. */
export function parseExpeditionLine(text: string): ExpeditionLine | null {
  const t = text.trim();
  if (t === EXPEDITION_NO_ICARUS_LINE) return { kind: "noIcarus" };
  const planet = /^Expedition: done at (.+)$/.exec(t)?.[1]?.trim();
  return planet ? { kind: "done", planet } : null;
}

/** What a bot knows about expeditions being over (`BotMemory.expeditionEnd`). */
export interface ExpeditionEndMemory {
  /** Planets known to have every sector explored, from the bay or a line. */
  done: Set<string>;
  /** Whether the Icarus is known to be lost. */
  noIcarus: boolean;
  /** Lines already in global chat (from anyone) or posted by this bot, so none is posted twice. */
  said: Set<string>;
  /** The global-chat position read up to (`ChatLine.seq`). */
  seq: number;
}

export const newExpeditionEndMemory = (): ExpeditionEndMemory => ({ done: new Set(), noIcarus: false, said: new Set(), seq: -1 });

/** The lacks on Board the Icarus and Take off that mean no expedition can launch for anyone. */
export const EXPEDITIONS_OVER_LACKS: readonly PlayerView["actions"][number]["lacks"][number][] = ["explored", "icarusLost"];

/**
 * Folds new expedition lines into memory, records what the bot itself sees in the bay (a disabled Board or Take off),
 * and returns the line to post for a fact nobody has posted yet, when `canPost`.
 */
export function observeExpeditionEnd(view: PlayerView, memory: BotMemory, canPost = true): BotSocial | null {
  const end = memory.expeditionEnd;
  for (const line of view.chat) {
    if (line.channel !== "global" || line.seq <= end.seq) continue;
    end.seq = line.seq;
    if (line.system || line.from === null) continue;
    const info = parseExpeditionLine(line.text);
    if (!info) continue;
    end.said.add(line.text.trim());
    if (info.kind === "noIcarus") end.noIcarus = true;
    else end.done.add(info.planet);
  }
  const lacks = new Set(view.actions.filter((o) => o.action.type === "board_icarus" || o.action.type === "icarus_takeoff").flatMap((o) => o.lacks));
  let text: string | null = null;
  if (lacks.has("icarusLost")) {
    end.noIcarus = true;
    text = EXPEDITION_NO_ICARUS_LINE;
  } else if (lacks.has("explored") && view.navigation.orbiting && view.navigation.orbitName) {
    end.done.add(view.navigation.orbitName);
    text = formatExpeditionDone(view.navigation.orbitName);
  }
  if (text === null || end.said.has(text) || !canPost || !view.chatChannels.includes("global")) return null;
  end.said.add(text);
  return { type: "chat", channel: "global", text };
}

/** Whether no expedition can launch from this orbit, as far as the bot knows: the planet is done or the Icarus lost. */
export function expeditionsOver(view: PlayerView, memory: BotMemory): boolean {
  const end = memory.expeditionEnd;
  if (!view.navigation.orbiting) return false;
  return end.noIcarus || (view.navigation.orbitName !== null && end.done.has(view.navigation.orbitName));
}
