// Reading one message at a time in a feed (#513): chat (Thread.tsx) and the Room tab (RoomLog.tsx). A message is read
// by a mouse resting on it for `HOVER_READ_MS`, a tap or click on it, or keyboard focus on it; never everything up to
// it. The feed is one tab stop: tabbing in focuses its first unread row, else the last; ArrowUp/Down, Home and End move
// between rows (feedKeys.ts).

import { useEffect, useRef, type FocusEvent, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import { rowAfterKey } from "./feedKeys.ts";

/** How long the mouse rests on a message before it counts as read, so sweeping across the feed doesn't read it all. */
export const HOVER_READ_MS = 400;

/**
 * Handlers for a feed `<ol>` whose rows carry `data-<attr>` (a chat message's `seq`, a log line's `pos`). `read` marks
 * one row's number read; `unread` says whether it is. Both are read when called, so they may change every render.
 */
export function useFeedReading(attr: "seq" | "pos", read: (n: number) => void, unread: (n: number) => boolean) {
  const hover = useRef<{ n: number; timer: ReturnType<typeof setTimeout> } | null>(null);
  const latest = useRef({ read, unread });
  latest.current = { read, unread };
  const stopHover = () => {
    if (hover.current) clearTimeout(hover.current.timer);
    hover.current = null;
  };
  // Unmounting drops a pending hover read.
  useEffect(
    () => () => {
      if (hover.current) clearTimeout(hover.current.timer);
    },
    [],
  );
  /** The row an event happened in, as its number, or null outside a row. */
  const rowOf = (feed: HTMLElement, target: EventTarget | null): number | null => {
    const row = target instanceof Element ? target.closest<HTMLElement>(`[data-${attr}]`) : null;
    // Menus and popovers are portalled: their events bubble here through React but sit outside the feed in the DOM.
    if (!row || !feed.contains(row)) return null;
    const n = Number(row.dataset[attr]);
    return Number.isSafeInteger(n) ? n : null;
  };
  const rowsOf = (ol: HTMLElement) => Array.from(ol.querySelectorAll<HTMLElement>(`:scope > [data-${attr}]`));
  const markAt = (feed: HTMLElement, target: EventTarget | null) => {
    const n = rowOf(feed, target);
    if (n !== null) latest.current.read(n);
  };
  return {
    onPointerOver: (e: PointerEvent<HTMLOListElement>) => {
      // Touch and pen read by tapping (a touch also fires pointerover, which would read on every scroll).
      if (e.pointerType !== "mouse") return;
      const n = rowOf(e.currentTarget, e.target);
      if (n === hover.current?.n) return;
      stopHover();
      if (n === null) return;
      hover.current = { n, timer: setTimeout(() => latest.current.read(n), HOVER_READ_MS) };
    },
    onPointerLeave: stopHover,
    // Safari doesn't focus a button on click, so a click reads too.
    onClick: (e: MouseEvent<HTMLOListElement>) => markAt(e.currentTarget, e.target),
    onFocus: (e: FocusEvent<HTMLOListElement>) => {
      if (e.target !== e.currentTarget) {
        markAt(e.currentTarget, e.target);
        return;
      }
      // Only from the keyboard: a click on the feed's blank space isn't reading anything.
      if (!e.currentTarget.matches(":focus-visible")) return;
      const rows = rowsOf(e.currentTarget);
      const first = rows.findIndex((r) => latest.current.unread(Number(r.dataset[attr])));
      rows[first < 0 ? rows.length - 1 : first]?.focus();
    },
    onKeyDown: (e: KeyboardEvent<HTMLOListElement>) => {
      const ol = e.currentTarget;
      const target = e.target as HTMLElement;
      // Keys inside a row's own controls (a checkbox, a menu, a badge's popover) are theirs.
      if (target !== ol && !(target.parentElement === ol && target.dataset[attr] !== undefined)) return;
      const rows = rowsOf(ol);
      const to = rowAfterKey(e.key, rows.indexOf(target), rows.length);
      if (to === null) return;
      e.preventDefault();
      rows[to]?.focus();
    },
  };
}
