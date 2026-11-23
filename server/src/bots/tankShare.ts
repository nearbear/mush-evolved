// How bots find and share out broken oxygen tanks (#443). A broken tank leaks oxygen every cycle (breakage.ts). NERON
// names the broken equipment in global chat but not its room (`equipmentBroken`); the alert bar (`view.alerts`, #444)
// counts every breakdown and locates the reported ones. Bots know which rooms hold a tank from the public ship map
// (`roomsWith`; owner, 2026-11-14: the layout is the same for every player), so once NERON announces a tank, each
// tank room is a suspect until someone stands in it. A bot that finds the tank broken reports it (the report reflex,
// `GoalBot`), which locates it for everyone. Two fixed global-chat lines, like the fire and item lines:
//   `Tank: going to <ROOM>` claims a tank room for this cycle, so other bots go elsewhere (owner, 2026-11-14)
//   `Tank: fine in <ROOM>`  a suspected tank room's tank works
// Only bots parse them, and only this format; a player can post a false one and mislead them (accepted, as with fires).

import { SHIP_ROOMS, type PlayerId, type PlayerView, type RoomId } from "@mush2/shared";
import type { BotMemory, BotSocial } from "./goals/types.ts";

export const OXYGEN_TANK = "OXYGEN_TANK";

/** Rooms of the fixed ship map holding an oxygen tank. */
export const TANK_ROOMS: readonly RoomId[] = SHIP_ROOMS.filter((r) => r.equipment.some((e) => e.type === OXYGEN_TANK)).map((r) => r.id);
const TANK_ROOM_IDS: ReadonlySet<string> = new Set(TANK_ROOMS);

export type TankLine = { kind: "claim"; room: RoomId } | { kind: "fine"; room: RoomId };

export const formatTankLine = (line: TankLine): string => (line.kind === "claim" ? `Tank: going to ${line.room}` : `Tank: fine in ${line.room}`);

/** A chat line's tank claim or result, if it is in the bots' format and names a tank room. */
export function parseTankLine(text: string): TankLine | null {
  const m = /^Tank: (going to|fine in) (\w+)$/.exec(text.trim());
  if (!m || !TANK_ROOM_IDS.has(m[2]!)) return null;
  return { kind: m[1] === "going to" ? "claim" : "fine", room: m[2]! };
}

/** What a bot knows about oxygen tanks (`BotMemory.tanks`). */
export interface TankMemory {
  /** Tank rooms known to hold a broken tank: the reported ones, and the bot's own room if it sees one. */
  broken: Set<RoomId>;
  /** Tank rooms that may hold the broken tank NERON announced, until someone looks. */
  suspect: Set<RoomId>;
  /** This cycle's claims, by room: who said they're going (`Tank: going to`), and in which cycle. */
  claims: Map<RoomId, { by: PlayerId; cycle: number }>;
  /** The global-chat position read up to (`ChatLine.seq`). */
  seq: number;
}

export const newTankMemory = (): TankMemory => ({ broken: new Set(), suspect: new Set(), claims: new Map(), seq: -1 });

/** Whether the Anomaly detector reports every breakdown, so nothing needs searching. */
const anomalyDetector = (view: PlayerView): boolean => (view.projects.EQUIPMENT_SENSOR ?? 0) >= 100;

/** Who claimed `room` this cycle, if anyone. */
export function claimant(view: PlayerView, tanks: TankMemory, room: RoomId): PlayerId | null {
  const claim = tanks.claims.get(room);
  return claim && claim.cycle === view.cycle ? claim.by : null;
}

/** Tank rooms worth going to, broken ones first then suspects, not claimed by another this cycle. */
export function tankTargets(view: PlayerView, tanks: TankMemory): RoomId[] {
  const free = (r: RoomId): boolean => {
    const by = claimant(view, tanks, r);
    return by === null || by === view.you.id;
  };
  return [...tanks.broken, ...[...tanks.suspect].filter((r) => !tanks.broken.has(r))].filter(free);
}

/**
 * Folds the alert bar, the new global-chat tank lines (and NERON's tank breakdowns) and the bot's own room into its
 * memory. Returns whether something new was learned (a goal below the tank goal should give way), and the line to
 * post if the bot found a suspected tank working (at most one a turn).
 */
export function observeTanks(view: PlayerView, memory: BotMemory): { news: boolean; post: BotSocial | null } {
  const tanks = memory.tanks;
  const before = new Set([...tanks.broken, ...tanks.suspect]);
  for (const line of view.chat) {
    if (line.channel !== "global" || line.seq <= tanks.seq) continue;
    tanks.seq = line.seq;
    if (line.system?.key === "equipmentBroken" && line.system.params?.equipment === OXYGEN_TANK) for (const r of TANK_ROOMS) tanks.suspect.add(r);
    if (line.system || line.from === null) continue;
    const parsed = parseTankLine(line.text);
    if (parsed?.kind === "claim") tanks.claims.set(parsed.room, { by: line.from, cycle: line.cycle });
    if (parsed?.kind === "fine") tanks.suspect.delete(parsed.room);
  }
  // Claims from earlier cycles lapse: the claimant may have run out of AP.
  for (const [room, claim] of tanks.claims) if (claim.cycle !== view.cycle) tanks.claims.delete(room);
  // The alert bar (#444): every reported tank.
  const reported = view.alerts.reports.filter((r) => r.kind === "equipment");
  tanks.broken = new Set(reported.filter((r) => r.equipment === OXYGEN_TANK).map((r) => r.room));
  const room = view.you.room;
  const tankHere = view.you.alive ? view.roomEquipment.filter((e) => e.type === OXYGEN_TANK) : [];
  if (tankHere.some((e) => e.broken)) tanks.broken.add(room); // reported by the reflex this turn
  for (const r of tanks.broken) tanks.suspect.delete(r);
  // Nothing left unlocated (every breakdown aboard is reported) or the Anomaly detector reports them all: no search.
  // A broken Gravity Simulator counts but is never reported (its own `alerts.gravity` row), so it isn't one to locate.
  const unreportable = view.alerts.gravity === "broken" ? 1 : 0;
  if (anomalyDetector(view) || view.alerts.broken - unreportable <= reported.length) tanks.suspect.clear();
  let post: BotSocial | null = null;
  if (tankHere.length > 0 && !tanks.broken.has(room) && tanks.suspect.delete(room) && view.chatChannels.includes("global")) {
    post = { type: "chat", channel: "global", text: formatTankLine({ kind: "fine", room }) }; // seen working: tell the others
  }
  const news = [...tanks.broken, ...tanks.suspect].some((r) => !before.has(r));
  return { news, post };
}
