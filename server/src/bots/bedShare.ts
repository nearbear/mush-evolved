// Bed tiers (owner, 2026-11-19; docs/scratchpad/bot-survival-plan.md Run A3). Seven beds for sixteen crew, and a bed
// doubles the AP a cycle brings, so the bots whose jobs need the most AP get them first. No bed is reserved: a bot
// that finds a bedroom full and sees someone of a lower tier lying there asks for a bed with a fixed global line, and
// waits in the room. A lying bot of the lowest tier there that reads it, with the asker standing in its room, gets up:
// as the next cycle starts, since a bot in bed has usually ended its cycle (ready) and can't act before then.
//   `Bed: waiting in <ROOM>`  the asker is standing in that room for a bed (it says only where it chose to be)
// Only that line triggers a yield (owner, 2026-11-19): a higher-tier bot merely walking through must not. Among the
// lowest tier, the first sleeper to read it gets up (owner, 2026-11-20: others' AP isn't visible, so not "most AP");
// the others then see a free bed and stay. A bot learns others' tiers from what it sees: titles are public, skills
// only for people in its room (`OtherPlayerView.skills`), so it remembers the skills it saw (`BedMemory.skills`).
// Only bots parse the line; a player can post it to make bots get up (accepted, as with the other lines).

import { EQUIPMENT_TYPES, SHIP_ROOMS, type PlayerId, type PlayerView, type RoomId } from "@mush2/shared";
import type { BotMemory } from "./goals/types.ts";

/** 1 goes first. Pilots and the Commander; then the Astrophysicist, Gunner and Comms Officer (owner, 2026-11-20); then everyone else. */
export type BedTier = 1 | 2 | 3;

const TIER_1_SKILLS: ReadonlySet<string> = new Set(["pilot"]);
const TIER_1_TITLES: ReadonlySet<string> = new Set(["commander"]);
const TIER_2_SKILLS: ReadonlySet<string> = new Set(["astrophysician", "gunner"]);
const TIER_2_TITLES: ReadonlySet<string> = new Set(["comms_officer"]);

/** The tier of someone holding `skills` (picked and book) and `titles`. */
export function bedTier(skills: readonly string[], titles: readonly string[]): BedTier {
  if (skills.some((s) => TIER_1_SKILLS.has(s)) || titles.some((t) => TIER_1_TITLES.has(t))) return 1;
  if (skills.some((s) => TIER_2_SKILLS.has(s)) || titles.some((t) => TIER_2_TITLES.has(t))) return 2;
  return 3;
}

/** Any room: a sofa (a bed) can be built anywhere. */
const ROOMS: ReadonlySet<string> = new Set(SHIP_ROOMS.map((r) => r.id));

export const formatBedAsk = (room: RoomId): string => `Bed: waiting in ${room}`;

/** The room a bed request names, if the line is one and names a room of the ship. */
export function parseBedLine(text: string): RoomId | null {
  const m = /^Bed: waiting in (\w+)$/.exec(text.trim());
  return m && ROOMS.has(m[1]!) ? m[1]! : null;
}

/** What a bot knows of the bed requests (`BotMemory.beds`). */
export interface BedMemory {
  /**
   * Requests by asker: the room and the cycle. A request stands for its cycle and the next: a bot lying in a bed has
   * usually ended its cycle (ready) and can't act until the next one, so that is when it answers.
   */
  asks: Map<PlayerId, { room: RoomId; cycle: number }>;
  /** The skills last seen on each person (picked and book): skills are visible only in the same room. */
  skills: Map<PlayerId, string[]>;
  /** Where and when this bot last asked, so it asks once. */
  asked: { room: RoomId; cycle: number } | null;
  /** Rooms where this bot's request went unanswered: it doesn't ask there again until it sees a bed free there. */
  unanswered: Set<RoomId>;
  /** The global-chat position read up to (`ChatLine.seq`). */
  seq: number;
}

export const newBedMemory = (): BedMemory => ({ asks: new Map(), skills: new Map(), asked: null, unanswered: new Set(), seq: -1 });

/** Folds new bed lines and the skills of the people in the bot's room into memory; drops requests older than last cycle. */
export function observeBedAsks(view: PlayerView, memory: BotMemory): void {
  const beds = memory.beds;
  for (const line of view.chat) {
    if (line.channel !== "global" || line.seq <= beds.seq) continue;
    beds.seq = line.seq;
    if (line.system || line.from === null || line.from === view.you.id) continue;
    const room = parseBedLine(line.text);
    if (room) beds.asks.set(line.from, { room, cycle: line.cycle });
  }
  for (const [id, ask] of beds.asks) if (ask.cycle < view.cycle - 1) beds.asks.delete(id);
  for (const p of view.players) if (p.alive && p.room === view.you.room) beds.skills.set(p.id, p.bookSkill ? [...p.skills, p.bookSkill] : [...p.skills]);
  // A bed seen free: the next request there may be answered.
  if (!memory.fullBeds.has(view.you.room)) beds.unanswered.delete(view.you.room);
}

const titlesOf = (view: PlayerView, character: string): string[] => view.titles.filter((t) => t.holder === character).map((t) => t.id);

/** This bot's own tier. */
export const ownTier = (view: PlayerView): BedTier =>
  bedTier(view.you.bookSkill ? [...view.you.skills, view.you.bookSkill] : view.you.skills, titlesOf(view, view.you.character));

/** Someone else's tier, from their public titles and the skills this bot last saw on them. */
export function tierOf(view: PlayerView, memory: BotMemory, id: PlayerId): BedTier {
  const p = view.players.find((q) => q.id === id);
  return bedTier(memory.beds.skills.get(id) ?? [], p ? titlesOf(view, p.character) : []);
}

/** People lying in a bed in the bot's room, other than itself. */
const sleepersHere = (view: PlayerView) => view.players.filter((p) => p.alive && p.room === view.you.room && p.lying !== undefined && p.id !== view.you.id);

/**
 * Whether someone of a lower tier than this bot lies in a bed in its room: a request there could be answered.
 * `notReady`: only one who hasn't ended this cycle yet, so still has a turn to answer in.
 */
export const lowerTierSleeperHere = (view: PlayerView, memory: BotMemory, notReady = false): boolean =>
  sleepersHere(view).some((p) => tierOf(view, memory, p.id) > ownTier(view) && (!notReady || !p.ready));

/**
 * Whether a room remembered as full (`observeBeds`) held someone of a lower tier than this bot, so it may go there and
 * ask, unless a request there already went unanswered.
 */
export function askableRoom(view: PlayerView, memory: BotMemory, room: RoomId): boolean {
  if (memory.beds.unanswered.has(room)) return false;
  const sleepers = memory.fullBeds.get(room);
  if (!sleepers) return false;
  const tier = ownTier(view);
  return [...sleepers].some((id) => view.players.some((p) => p.id === id && p.alive) && tierOf(view, memory, id) > tier);
}

/**
 * Whether this bot, lying in a bed, should get up for a request (Run A3): someone of a higher tier asked this cycle to
 * be given a bed in this room and stands here, this bot is of the lowest tier lying here, and there are more such
 * askers than free beds (so the first sleeper to read it gets up, and the rest stay).
 */
export function shouldYieldBed(view: PlayerView, memory: BotMemory): boolean {
  if (view.you.lyingIn === undefined) return false;
  const room = view.you.room;
  const mine = ownTier(view);
  const askers = view.players.filter((p) => {
    const ask = memory.beds.asks.get(p.id);
    return ask !== undefined && ask.room === room && ask.cycle >= view.cycle - 1 && p.alive && p.room === room && p.lying === undefined && tierOf(view, memory, p.id) < mine;
  });
  if (askers.length === 0) return false;
  if (sleepersHere(view).some((p) => tierOf(view, memory, p.id) > mine)) return false;
  const beds = view.roomEquipment.filter((e) => EQUIPMENT_TYPES[e.type]?.bed);
  const taken = new Set(view.players.filter((p) => p.alive && p.room === room && p.lying !== undefined).map((p) => p.lying!));
  taken.add(view.you.lyingIn);
  const free = beds.filter((b) => !taken.has(b.id)).length;
  return askers.length > free;
}
