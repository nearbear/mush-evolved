// How a bot asks the Shrink for comfort (owner, 2026-11-18, #452): a fixed line in global chat, like the tank and fire
// lines. A bot whose own morale drops to `SELF_CARE_MORALE` or less posts `Morale: low` once, and again only after it
// has been above that. A Shrink bot reads the lines and comforts each asker `COMFORTS_PER_REQUEST` times (the
// `comfort` goal). The line says only what the bot chooses to say about itself; nobody else's morale is ever read. Only
// bots parse it, and only this format; a player can post it too and get comforted (accepted: it costs them nothing a
// chat request wouldn't).

import type { PlayerId, PlayerView } from "@mush2/shared";
import { SELF_CARE_MORALE } from "./goals/selfCare.ts";
import type { BotMemory, BotSocial } from "./goals/types.ts";

export const MORALE_LOW_LINE = "Morale: low";

/** Comforts a Shrink gives one `Morale: low` line (owner, 2026-11-18): +4, from 5 to about 9. */
export const COMFORTS_PER_REQUEST = 2;

/** Whether a chat line is the bots' morale request. */
export const parseMoraleLine = (text: string): boolean => text.trim() === MORALE_LOW_LINE;

/** What a bot knows about morale requests (`BotMemory.morale`). */
export interface MoraleMemory {
  /** Whether this bot has posted the line since its morale was last above `SELF_CARE_MORALE`. */
  said: boolean;
  /** Who asked, and how many comforts this bot (a Shrink) has given them since. */
  requests: Map<PlayerId, number>;
  /** The global-chat position read up to (`ChatLine.seq`). */
  seq: number;
}

export const newMoraleMemory = (): MoraleMemory => ({ said: false, requests: new Map(), seq: -1 });

/**
 * Folds new `Morale: low` lines into the bot's memory (a new line from someone resets their count), forgets the dead,
 * and returns the line to post if this bot's own morale just dropped to `SELF_CARE_MORALE` or less.
 */
export function observeMorale(view: PlayerView, memory: BotMemory): BotSocial | null {
  const morale = memory.morale;
  for (const line of view.chat) {
    if (line.channel !== "global" || line.seq <= morale.seq) continue;
    morale.seq = line.seq;
    if (line.system || line.from === null || line.from === view.you.id) continue;
    if (parseMoraleLine(line.text)) morale.requests.set(line.from, 0);
  }
  for (const id of morale.requests.keys()) if (!view.players.some((p) => p.id === id && p.alive)) morale.requests.delete(id);
  if (view.you.morale > SELF_CARE_MORALE) {
    morale.said = false;
    return null;
  }
  if (morale.said || !view.chatChannels.includes("global")) return null;
  morale.said = true;
  return { type: "chat", channel: "global", text: MORALE_LOW_LINE };
}
