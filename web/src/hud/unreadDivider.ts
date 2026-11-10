// The "New messages" divider and the unread bar in a chat feed (#400). The divider sits before the first message the
// reader hadn't read when they opened the channel, and stays there as they read. The bar offers a jump to it while it
// is out of sight. The pure parts are here; the hook is `useUnreadDivider` in Thread.tsx.

import { createContext } from "react";
import { chatPageOf, type ChatLine } from "@mush2/shared";

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
export function dividerPlacement(at: number | null, total: number, shownPage: number): DividerPlacement {
  if (at === null || at < 0 || at >= total) return NONE;
  const page = chatPageOf(at);
  return { beforeSeq: page === shownPage ? at : null, jumpPage: page < shownPage ? page : null, count: total - at };
}

/**
 * Where a new divider goes: at `read`, the channel's read count, unless every message from there to `total` is the
 * reader's own. Your own messages are never unread, but the server's count for them arrives a moment after the view
 * that carries them. `messages` are the channel's messages in the view; one from `read` on that isn't in it counts as
 * someone else's.
 */
export function dividerAt(read: number, total: number, messages: readonly Pick<ChatLine, "seq" | "from">[], me: string): number | null {
  if (read >= total) return null;
  let own = 0;
  for (const m of messages) if (m.seq >= read && m.seq < total && m.from === me) own++;
  return own === total - read ? null : read;
}

/** Bumped by Mark all read in the iTrackie; every feed drops its divider when it changes (owner, 2026-11-08). */
export const MarkAllContext = createContext(0);
