// How bots find fires together (#429, #444). NERON announces each new fire in global chat without the room
// (`fireStarted`, shared/src/fire.ts), and only someone standing in a burning room sees it burn (`view.roomOnFire`).
// The alert bar (`view.alerts`, #444) counts every fire aboard, and `view.burningRooms` lists the reported ones. A bot
// that finds a fire reports it (`report_fire`, `GoalBot.reportReflex`), which locates it for everyone, humans
// included. What reports can't say is where a fire *isn't*, so searching bots tell each other in one fixed
// global-chat line, like the item lines (itemShare.ts):
//   `Fire: clear in <ROOM>` searched while a fire is unlocated: this room doesn't burn
// Every bot folds the lines it reads, and what it sees itself, into `BotMemory.fires`. Only bots parse them, and only
// this format; a player can post a false one and mislead a search (accepted, as with item and planet lines).

import { SHIP_ROOMS, type PlayerView, type RoomId } from "@mush2/shared";
import type { BotMemory, BotSocial } from "./goals/types.ts";

/** The Daedalus's rooms: where a fire can burn (fire never starts in a patrol ship, `daedalusRooms`). */
const FIRE_ROOMS: readonly RoomId[] = SHIP_ROOMS.map((r) => r.id);
const ROOM_IDS: ReadonlySet<string> = new Set(FIRE_ROOMS);

/** A searched room that doesn't burn. */
export interface FireLine {
  room: RoomId;
}

export const formatFireLine = ({ room }: FireLine): string => `Fire: clear in ${room}`;

/** A chat line's search result, if it is in the bots' format and names a room of the ship. */
export function parseFireLine(text: string): FireLine | null {
  const m = /^Fire: clear in (\w+)$/.exec(text.trim());
  if (!m || !ROOM_IDS.has(m[1]!)) return null;
  return { room: m[1]! };
}

/** What a bot knows about fires (`BotMemory.fires`). */
export interface FireMemory {
  /** Fires aboard, from the alert bar. At least `burning.size`. */
  active: number;
  /** Rooms known to burn: the reported ones, and the bot's own room if it burns. */
  burning: Set<RoomId>;
  /** Rooms known not to burn since the latest new fire, so a search skips them. */
  checked: Set<RoomId>;
  /** The global-chat position read up to (`ChatLine.seq`). */
  seq: number;
}

export const newFireMemory = (): FireMemory => ({ active: 0, burning: new Set(), checked: new Set(), seq: -1 });

/** Fires aboard whose room nobody has reported yet. */
export const unlocatedFires = (fires: FireMemory): number => Math.max(0, fires.active - fires.burning.size);

/** Whether the Fire sensor reports every burning room (`view.burningRooms`). */
export const fireSensor = (view: PlayerView): boolean => (view.projects.FIRE_SENSOR ?? 0) >= 100;

/** Rooms a search could still find a fire in: neither known to burn nor checked. */
export const unsearchedRooms = (fires: FireMemory): RoomId[] => FIRE_ROOMS.filter((r) => !fires.burning.has(r) && !fires.checked.has(r));

/**
 * Folds the alert bar, the new global-chat search lines (and NERON's new-fire notices) and the bot's own room into its
 * memory. Returns whether something new about fires was learned (a goal below the fire goal should give way), and the
 * line to post if the bot searched a room chat doesn't say is clear yet (at most one a turn).
 */
export function observeFires(view: PlayerView, memory: BotMemory): { news: boolean; post: BotSocial | null } {
  const fires = memory.fires;
  const before = { active: fires.active, burning: fires.burning.size };
  for (const line of view.chat) {
    if (line.channel !== "global" || line.seq <= fires.seq) continue;
    fires.seq = line.seq;
    // A new fire may be in a room checked before, so the search starts over.
    if (line.system?.key === "fireStarted") fires.checked.clear();
    if (line.system) continue;
    const clear = parseFireLine(line.text);
    if (clear) fires.checked.add(clear.room);
  }
  const room = view.you.room;
  const here = ROOM_IDS.has(room) && view.you.alive;
  // The alert bar (#444): the true count, and every reported room.
  fires.active = view.alerts.fires;
  fires.burning = new Set(view.burningRooms);
  if (here && view.roomOnFire) fires.burning.add(room); // reported by the reflex this turn
  for (const r of fires.burning) fires.checked.delete(r);
  if (fireSensor(view)) {
    // The sensor reports every burning room: nothing to search for or to tell.
    fires.checked = new Set(FIRE_ROOMS.filter((r) => !fires.burning.has(r)));
    return { news: fires.burning.size > before.burning, post: null };
  }
  let post: BotSocial | null = null;
  if (here && !view.roomOnFire && unlocatedFires(fires) > 0 && !fires.checked.has(room)) {
    fires.checked.add(room);
    if (view.chatChannels.includes("global")) post = { type: "chat", channel: "global", text: formatFireLine({ room }) };
  }
  // Searched everywhere and found nothing, yet the alert bar still counts one: a line was wrong. Search again.
  if (unlocatedFires(fires) > 0 && unsearchedRooms(fires).length === 0) fires.checked.clear();
  return { news: fires.active > before.active || fires.burning.size > before.burning, post };
}
