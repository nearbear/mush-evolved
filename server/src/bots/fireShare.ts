// How bots find fires together (#429). NERON announces each new fire in global chat without the room
// (`fireStarted`, shared/src/fire.ts), and only someone standing in a burning room sees it burn (`view.roomOnFire`),
// until the Fire sensor project shows every burning room (`view.burningRooms`). So bots search, and tell each other in
// fixed global-chat lines, like the item lines (itemShare.ts):
//   `Fire: in <ROOM>`     the room burns
//   `Fire: out in <ROOM>` the room burned and doesn't any more
//   `Fire: clear in <ROOM>` searched while a fire is unlocated: this room doesn't burn
// Every bot folds the lines it reads, and what it sees itself, into `BotMemory.fires`. Only bots parse them, and only
// this format; a player can post a false one and mislead them (accepted, as with item and planet lines).

import { SHIP_ROOMS, type PlayerView, type RoomId } from "@mush2/shared";
import type { BotMemory, BotSocial } from "./goals/types.ts";

/** The Daedalus's rooms: where a fire can burn (fire never starts in a patrol ship, `daedalusRooms`). */
const FIRE_ROOMS: readonly RoomId[] = SHIP_ROOMS.map((r) => r.id);
const ROOM_IDS: ReadonlySet<string> = new Set(FIRE_ROOMS);

export type FireNews = "in" | "out" | "clear";

export interface FireLine {
  news: FireNews;
  room: RoomId;
}

export const formatFireLine = ({ news, room }: FireLine): string => (news === "in" ? `Fire: in ${room}` : `Fire: ${news} in ${room}`);

/** A chat line's fire report, if it is in the bots' format and names a room of the ship. */
export function parseFireLine(text: string): FireLine | null {
  const m = /^Fire: (?:(out|clear) )?in (\w+)$/.exec(text.trim());
  if (!m || !ROOM_IDS.has(m[2]!)) return null;
  return { news: (m[1] as FireNews | undefined) ?? "in", room: m[2]! };
}

/** What a bot knows about fires (`BotMemory.fires`). */
export interface FireMemory {
  /** Fires believed to burn: announced by NERON and not yet seen put out. At least `burning.size`. */
  active: number;
  /** Rooms known to burn. */
  burning: Set<RoomId>;
  /** Rooms known not to burn since the latest new fire, so a search skips them. */
  checked: Set<RoomId>;
  /** The global-chat position read up to (`ChatLine.seq`). */
  seq: number;
}

export const newFireMemory = (): FireMemory => ({ active: 0, burning: new Set(), checked: new Set(), seq: -1 });

/** Fires announced whose room nobody has found yet. */
export const unlocatedFires = (fires: FireMemory): number => Math.max(0, fires.active - fires.burning.size);

/** Whether the Fire sensor shows every burning room (`view.burningRooms`). */
export const fireSensor = (view: PlayerView): boolean => (view.projects.FIRE_SENSOR ?? 0) >= 100;

/** Rooms a search could still find a fire in: neither known to burn nor checked. */
export const unsearchedRooms = (fires: FireMemory): RoomId[] => FIRE_ROOMS.filter((r) => !fires.burning.has(r) && !fires.checked.has(r));

function apply(fires: FireMemory, { news, room }: FireLine): void {
  if (news === "in") {
    fires.burning.add(room);
    fires.checked.delete(room);
    fires.active = Math.max(fires.active, fires.burning.size);
    return;
  }
  const was = fires.burning.delete(room);
  fires.checked.add(room);
  if (news === "out" && was) fires.active = Math.max(fires.burning.size, fires.active - 1);
}

/**
 * Folds the new global-chat fire lines (and NERON's new-fire notices), the Fire sensor, and the bot's own room into its
 * memory. Returns whether something new about fires was learned (a goal below the fire goal should give way), and the
 * line to post if the bot saw something chat doesn't say yet (at most one a turn).
 */
export function observeFires(view: PlayerView, memory: BotMemory): { news: boolean; post: BotSocial | null } {
  const fires = memory.fires;
  const before = { active: fires.active, burning: fires.burning.size };
  for (const line of view.chat) {
    if (line.channel !== "global" || line.seq <= fires.seq) continue;
    fires.seq = line.seq;
    if (line.system?.key === "fireStarted") {
      // A new fire may be in a room checked before, so the search starts over; known fires stay known.
      fires.active += 1;
      fires.checked.clear();
      continue;
    }
    if (line.system) continue;
    const report = parseFireLine(line.text);
    if (report) apply(fires, report);
  }
  if (fireSensor(view)) {
    // The sensor shows every burning room: nothing to search for or to tell.
    fires.burning = new Set(view.burningRooms);
    fires.active = fires.burning.size;
    fires.checked = new Set(FIRE_ROOMS.filter((r) => !fires.burning.has(r)));
    return { news: fires.burning.size > before.burning, post: null };
  }
  const room = view.you.room;
  let post: BotSocial | null = null;
  if (ROOM_IDS.has(room) && view.you.alive) {
    let seen: FireLine | null = null;
    if (view.roomOnFire) {
      if (!fires.burning.has(room)) seen = { news: "in", room };
    } else if (fires.burning.has(room)) seen = { news: "out", room };
    else if (unlocatedFires(fires) > 0 && !fires.checked.has(room)) seen = { news: "clear", room };
    if (seen) {
      apply(fires, seen);
      if (view.chatChannels.includes("global")) post = { type: "chat", channel: "global", text: formatFireLine(seen) };
    }
  }
  // Searched everywhere and found nothing: a drone (or someone not saying) put it out. Stop looking.
  if (unlocatedFires(fires) > 0 && unsearchedRooms(fires).length === 0) fires.active = fires.burning.size;
  return { news: fires.active > before.active || fires.burning.size > before.burning, post };
}
