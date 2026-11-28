// The "New messages" divider and the unread bar in a chat feed (#400). The divider sits before the first message the
// reader hadn't read when they opened the channel, and stays there as they read. The bar offers a jump to it while it
// is out of sight. The pure parts are here; the hook is `useUnreadDivider` in Thread.tsx.

import { createContext } from "react";
import { chatPageOf, countInRanges, inRanges, type ChatLine, type SeqRange } from "@mush2/shared";

export interface DividerPlacement {
  /** Render the divider before the row with this `seq`: it is on the page shown. */
  beforeSeq: number | null;
  /** The page holding the divider, when it is before the page shown (the bar's jump). */
  jumpPage: number | null;
  /** Messages from the divider on. */
  count: number;
}

const NONE: DividerPlacement = { beforeSeq: null, jumpPage: null, count: 0 };

/**
 * Where a divider at `at` goes when page `shownPage` of a channel with `total` messages is shown. A divider on a later
 * page (the reader went back past it) has no jump: » shows the count there.
 */
export function dividerPlacement(at: number | null, total: number, shownPage: number, unheard?: readonly SeqRange[]): DividerPlacement {
  if (at === null || at < 0 || at >= total) return NONE;
  const page = chatPageOf(at);
  return { beforeSeq: page === shownPage ? at : null, jumpPage: page < shownPage ? page : null, count: total - at - countInRanges(unheard, at, total) };
}

/**
 * Where a new divider goes: before the first unread message from `read`, the channel's count, to `total`. Messages
 * read one at a time past the count (`local`, #513), the reader's own (never unread, though the read for one arrives a
 * moment after the view that carries it) and those they couldn't hear (`unheard`: Damaged or Destroyed Ears, never
 * drawn) are skipped. `messages` are the channel's messages in the view; one not in it counts as someone else's. Null
 * when nothing is unread.
 */
export function dividerAt(
  read: number,
  total: number,
  messages: readonly Pick<ChatLine, "seq" | "from">[],
  me: string,
  unheard?: readonly SeqRange[],
  local: readonly number[] = [],
): number | null {
  const skip = new Set(local);
  for (const m of messages) if (m.from === me) skip.add(m.seq);
  for (let at = read; at < total; at++) if (!skip.has(at) && !inRanges(unheard, at)) return at;
  return null;
}

/** Bumped by Mark all read in the iTrackie; every feed drops its divider when it changes (owner, 2026-11-08). */
export const MarkAllContext = createContext(0);
