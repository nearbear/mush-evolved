// What the replay page needs from a finished game's history (#367, docs/plans/replay-viewer.md, story 1), kept out of
// components (architecture rule 3): the all-seeing view, the event marks a playback stops on, the step that wrote a
// line, and who plays whom.
//
// THIS MODULE SHOWS EVERY HIDDEN THING BY DESIGN. It runs only on a full view, which leaves the server only for an
// ended game through the replay route (fullView.ts). Only the replay page may import it: Biome forbids it in
// `server/src`, so no live view can ever be built from it. That is also why `Reveal` is its own type rather than new
// optional fields on `PlayerView` (owner, 2026-11-05): the live game builds `PlayerView`, and a field there could one day
// be filled by mistake.
//
// Log and chat are streams (plan, "Prerequisites"): entries leave the front (a trim, a sealed chat page) while new
// ones append at the end, so everything here keys entries by id, never by position or length.

import type { CharacterId } from "./characters.ts";
import { plansView } from "./plans.ts";
import { perspective, type FullView } from "./fullView.ts";
import type { ReplayIndex } from "./replayChunks.ts";
import { messageView, sharedPlanetsView, threadsView } from "./rules.ts";
import type { HistoryFrame } from "./viewHistory.ts";
import { CHAT_CHANNELS, GRAVEYARD_CHANNEL, MUSH_CHANNEL, type ChannelId, type ChatMessage, type ItemView, type LogEntry, type PlayerId, type SeatView, type YouView } from "./types.ts";

// ---- Streams ----------------------------------------------------------------

/** Every log line and chat message seen so far, by id (ascending). The full view may have dropped older ones. */
export interface Streams {
  log: LogEntry[];
  chat: ChatMessage[];
}

/** The streams as one full view holds them. */
export function streamsOf(full: Readonly<FullView>): Streams {
  return { log: [...full.log], chat: [...full.chat] };
}

/**
 * `earlier` plus what `full` holds, by id: entries `full` dropped are kept, and where both hold an entry, `full`'s
 * wins. Chat keeps its text as typed; `revealFor` draws the frame's ticks (`chatMarks`). Give it the frames in order.
 * `full` may also be another `Streams`, to join two runs of frames.
 */
export function mergeStreams(earlier: Readonly<Streams>, full: Readonly<Pick<FullView, "log" | "chat">>): Streams {
  return { log: mergeById(earlier.log, full.log), chat: mergeById(earlier.chat, full.chat) };
}

function mergeById<T extends { id: number }>(earlier: readonly T[], now: readonly T[]): T[] {
  const byId = new Map<number, T>();
  for (const e of earlier) byId.set(e.id, e);
  for (const e of now) byId.set(e.id, e);
  return [...byId.values()].sort((a, b) => a.id - b.id);
}

// ---- All-seeing --------------------------------------------------------------

/** One body's hidden side, as its own player saw it, plus what even they didn't (contamination). */
export interface SeatReveal {
  /** The seat (mind) playing the body at this frame. */
  seat: PlayerId;
  /** The body's own `you`: role, alpha, spores, HP, morale, AP, MP and the rest. */
  you: YouView;
  /** Every status, private ones included. */
  statuses: string[];
  inventory: ItemView[];
  /** Hidden from its owner in the live game; 0 for a Mush or a clean human. */
  contamination: number;
}

/** What all-seeing shows that a `PlayerView` has no field for. Only the replay page builds or reads one. */
export interface Reveal {
  /** By body id (the id `PlayerView.players` and `you` use). */
  seats: Record<PlayerId, SeatReveal>;
  /**
   * Who saw a line or message that wasn't public, by its id, as body ids: a log line's `visibleTo`, and a message's
   * channel members (a private channel's members at this frame, or the Mush for the Mush channel). Missing for public
   * ones, and for a message whose private channel no longer exists.
   */
  seenBy: { log: Record<number, PlayerId[]>; chat: Record<number, PlayerId[]> };
}

/**
 * The all-seeing mode, following `followSeat` (a mind): its own view (`perspective`) with every hidden line of its
 * room added, its own lines from elsewhere, every channel with all its messages, and no log window. `streams` are the
 * lines and messages seen from the start of the game up to this frame (`mergeStreams`); without them, only what `full`
 * still holds. Throws as `perspective` does.
 */
export function revealFor(full: Readonly<FullView>, followSeat: PlayerId, streams: Readonly<Streams> = streamsOf(full)): { view: SeatView; reveal: Reveal } {
  const own = perspective(full, followSeat);
  const body = full.players.find((p) => p.mind === followSeat)!;
  const shown = new Set(own.log.map((e) => e.id));
  const log = streams.log.filter(
    (e) => shown.has(e.id) || (e.room !== undefined && e.room === body.room) || (e.visibleTo !== "all" && e.visibleTo.includes(body.id)) || (e.room === undefined && e.visibleTo === "all"),
  );
  const readable: ChannelId[] = [
    ...CHAT_CHANNELS,
    ...full.threads.map((t) => t.id),
    ...full.sharedPlanets.map((s) => s.id),
    MUSH_CHANNEL,
    GRAVEYARD_CHANNEL,
    ...full.channels.map((c) => c.id),
  ];
  const view: SeatView = {
    ...own,
    log,
    // The text as typed, with the ticks of this frame (chatMarks).
    chat: streams.chat.map((m) => messageView(m, full.chatMarks)),
    readChannels: readable,
    privateChannels: full.channels.map((c) => ({ ...c, members: [...c.members] })),
    plans: plansView(full, readable),
    threads: threadsView(full),
    sharedPlanets: sharedPlanetsView(full),
  };
  return { view, reveal: revealOf(full, log, streams.chat) };
}

function revealOf(full: Readonly<FullView>, log: readonly LogEntry[], chat: readonly ChatMessage[]): Reveal {
  const seats: Record<PlayerId, SeatReveal> = {};
  for (const p of full.players) {
    const own = perspective(full, p.mind);
    seats[p.id] = { seat: p.mind, you: own.you, statuses: own.statuses, inventory: own.inventory, contamination: full.contamination[p.id] ?? 0 };
  }
  const members = new Map<ChannelId, PlayerId[]>(full.channels.map((c) => [c.id, c.members]));
  members.set(
    MUSH_CHANNEL,
    full.players.filter((p) => p.role === "mush").map((p) => p.id),
  );
  const seenBy: Reveal["seenBy"] = { log: {}, chat: {} };
  for (const e of log) if (e.visibleTo !== "all") seenBy.log[e.id] = [...e.visibleTo];
  for (const m of chat) {
    const who = members.get(m.channel);
    if (who) seenBy.chat[m.id] = [...who];
  }
  return { seats, seenBy };
}

// ---- Event marks ---------------------------------------------------------------

/** What a mark is about, for its pip's colour: the most notable thing the step added. */
export type MarkKind = "death" | "conversion" | "fire" | "chat" | "cycle" | "other";

/** A step a playback stops on with skipping on (decision 3): it added a log line or a message, or started a cycle. */
export interface Mark {
  /** The record position of the input (`ChunkInfo.firstInput` plus its place in the chunk). */
  step: number;
  kind: MarkKind;
}

const DEATH_KEYS = new Set(["died"]);
const CONVERSION_KEYS = new Set(["converted"]);
// A fire starting or going out, not each cycle it burns (fireBurns), which would put a pip on every one (owner, 2026-11-05).
const FIRE_KEYS = new Set(["ignited", "fireStarted", "fireExtinguished", "extinguishFailed"]);

const maxId = (list: readonly { id: number }[]): number => list.reduce((m, e) => Math.max(m, e.id), 0);

/**
 * The marks of `frames`, a chunk's frames whose first input is record position `firstStep`, in order. Each step is
 * compared with the view before its input: its `base` when it carries one (a room restart's copy is never an event
 * itself, owner, 2026-11-05), else the frame before it, else `before` (the last frame of the chunk before). It
 * compares the highest id, never lengths, since a trim can drop entries in the step that adds one. A chunk's first
 * step without `base` or `before` is a cycle's full copy: everything of its new cycle counts as added.
 * Reads frames as recorded, not through `readFrame`: only log and chat ids and keys, so a whole chunk costs no
 * normalizing.
 */
export function stepMarks(frames: readonly Pick<HistoryFrame, "base" | "view">[], firstStep: number, before?: Readonly<FullView>): Mark[] {
  const marks: Mark[] = [];
  frames.forEach((frame, i) => {
    const prev = frame.base ?? frames[i - 1]?.view ?? before;
    const { view } = frame;
    const cycle = prev === undefined || view.cycle > prev.cycle;
    const [logFrom, chatFrom] = prev === undefined ? [-1, -1] : [maxId(prev.log), maxId(prev.chat)];
    const added = (e: { id: number; cycle: number }, from: number) => (from < 0 ? e.cycle >= view.cycle : e.id > from);
    const lines = view.log.filter((e) => added(e, logFrom));
    const messages = view.chat.filter((m) => added(m, chatFrom));
    if (!cycle && lines.length === 0 && messages.length === 0) return;
    const keys = [...lines.map((e) => e.key), ...messages.flatMap((m) => (m.system ? [m.system.key] : []))];
    const kind: MarkKind = keys.some((k) => DEATH_KEYS.has(k))
      ? "death"
      : keys.some((k) => CONVERSION_KEYS.has(k))
        ? "conversion"
        : keys.some((k) => FIRE_KEYS.has(k))
          ? "fire"
          : cycle
            ? "cycle"
            : messages.some((m) => m.from !== null)
              ? "chat"
              : "other";
    marks.push({ step: firstStep + i, kind });
  });
  return marks;
}

/**
 * The record position of the step whose frame first holds log line or message `id`, for click-to-jump: one before
 * `firstStep` when the chunk's starting copy (`frames[0].base`, the launch state for chunk 0) already holds it, null
 * when these frames never do. Ids only grow, so the first frame whose highest id reaches `id` holds it.
 */
export function lineStep(frames: readonly Pick<HistoryFrame, "base" | "view">[], kind: "log" | "chat", id: number, firstStep = 0): number | null {
  const reaches = (v: Readonly<FullView> | undefined) => v !== undefined && maxId(v[kind]) >= id;
  if (reaches(frames[0]?.base)) return firstStep - 1;
  const i = frames.findIndex((f) => reaches(f.view));
  return i < 0 ? null : firstStep + i;
}

// ---- Seats -----------------------------------------------------------------------

/** A seat at one frame, for the perspective switcher. */
export interface SeatAt {
  /** The seat (mind). */
  seat: PlayerId;
  /** The body it plays now, and that body's character. */
  body: PlayerId;
  character: CharacterId;
  /** The character it started in (`ReplayIndex.seats`). */
  start: CharacterId;
  /** A Transfer moved it out of the body it started in. */
  moved: boolean;
}

/** Every seat aboard at this frame, in the index's order. A seat still to board (pre-selection) is left out. */
export function seatsAt(full: Readonly<FullView>, index: Readonly<Pick<ReplayIndex, "seats">>): SeatAt[] {
  return index.seats.flatMap(({ seat, character: start }) => {
    const p = full.players.find((b) => b.mind === seat);
    // A body's id is the id of the seat that boarded in it, so a seat elsewhere was moved by a Transfer.
    return p ? [{ seat, body: p.id, character: p.character, start, moved: p.id !== seat }] : [];
  });
}
