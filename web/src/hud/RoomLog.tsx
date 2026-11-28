// The iTrackie's Room tab: the log of the room you stand in, with the room log's unread state (#513,
// docs/plans/archive/chat-pages.md "Room log read state (#513)"). Only lines missed while the seat had no connection open
// are unread. Each gets the unread icon until it is read one at a time, by a short mouse rest, a tap or keyboard focus,
// or all at once by Mark all read. A "New messages" divider goes before the first unread line when the tab opens and
// stays put while it is open.

import { Fragment, memo, useContext, useEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { jsonEqual, type LogLine, type PlayerView } from "@mush2/shared";
import { useNames } from "../i18n/names.ts";
import { isUnread, positionOf, shownIn, unreadPositions, useLogRead, useLogReadStore } from "../logRead.ts";
import { CycleDivider } from "./CycleDivider.tsx";
import { FeedEntry, InfoMarker, NeronAvatar, NeronName, WarningMarker, isNeronMessage } from "./FeedEntry.tsx";
import { rowAfterKey } from "./feedKeys.ts";
import { Scroller } from "./Scroller.tsx";
import { MarkAllContext } from "./unreadDivider.ts";
import { DefacedBadge, VisibilityBadge } from "./VisibilityBadge.tsx";

/** How long the mouse rests on a line before it counts as read, so sweeping across the feed doesn't read it all. */
export const HOVER_READ_MS = 400;

/**
 * A log line's look: a warning (an alarm, or a secret line that leaked) in amber, a covert line that leaked in red
 * (covert actions are usually malicious; owner, 2026-11-05), and a line others didn't see muted. An Outcast's leaked
 * line has no warning level and keeps the plain look (owner, 2026-11-08); its badge still shows.
 */
function logRowClass(e: LogLine): string | undefined {
  if (e.level === "danger") return "warning danger";
  if (e.level === "warning") return e.leaked && e.kind === "covert" ? "warning danger" : "warning";
  return e.visibleTo === "all" ? undefined : "private";
}

/**
 * One room log line, memoized by content: the log tab stays mounted, so every new view would otherwise redraw each
 * line and its time popover (web/CLAUDE.md "Render cost"). `onRead` must be stable (a state setter).
 */
const LogRow = memo(
  function LogRow({ entry: e, pos, unread, canRead, onRead }: { entry: LogLine; pos: number; unread: boolean; canRead: boolean; onRead: (report: string) => void }) {
    const { t } = useTranslation();
    const names = useNames();
    const neron = !e.kind && e.level !== "warning" && e.level !== "danger" && isNeronMessage(e.key);
    const marker = neron ? (
      <NeronAvatar />
    ) : e.kind ? (
      <VisibilityBadge kind={e.kind} leaked={e.leaked === true} />
    ) : e.level === "warning" || e.level === "danger" ? (
      <WarningMarker />
    ) : (
      <InfoMarker />
    );
    return (
      <FeedEntry marker={marker} name={neron ? <NeronName /> : undefined} at={e.at} className={logRowClass(e)} pos={pos} unread={unread}>
        {e.defaced && <DefacedBadge />}
        {names.logLine(e)}
        {canRead && (
          <button type="button" className="expedition-read" onClick={() => onRead(String(e.params?.report))}>
            {t("expedition.read")}
          </button>
        )}
      </FeedEntry>
    );
  },
  (a, b) => a.pos === b.pos && a.unread === b.unread && a.canRead === b.canRead && a.onRead === b.onRead && jsonEqual(a.entry, b.entry),
);

export function RoomLog({
  view,
  active,
  onRead,
}: {
  view: Pick<PlayerView, "log" | "logSeen" | "you" | "expeditions" | "config">;
  /** The Room tab is the one on screen: opening it places the divider. */
  active: boolean;
  /** Opens an expedition report. Must be stable (a state setter). */
  onRead: (report: string) => void;
}) {
  const { t } = useTranslation();
  const here = view.you.room;
  const state = useLogRead();
  // The server sends this room's public history plus our private entries from anywhere; the Room tab shows what
  // belongs to the room we're standing in.
  const rows = view.log.flatMap((entry, i) => (shownIn(entry, here) ? [{ entry, pos: positionOf(view, i) }] : []));
  const unread = (pos: number) => state.body === view.you.id && isUnread(state, pos);
  const divider = useDivider(active, here, unreadPositions(view, state)[0] ?? null);
  const marking = useHoverTapFocus();
  return (
    <Scroller items={rows.length}>
      {/* aria-live is off here: new entries are spoken by the announcer (announce.ts), so a hidden tab still announces and bursts are batched. */}
      <div role="log" aria-live="off" aria-label={t("itrackie.tabs.room")}>
        {rows.length === 0 ? (
          <p className="sub">{t("itrackie.roomEmpty")}</p>
        ) : (
          // The feed is one tab stop; arrow keys move between lines (feedKeys.ts), as in chat.
          // biome-ignore lint/a11y/noNoninteractiveTabindex: a keyboard-navigable feed, as chat's (Thread.tsx).
          <ol className="feed" tabIndex={0} {...marking}>
            {rows.map(({ entry: e, pos }, i) => (
              <Fragment key={pos}>
                {rows[i - 1]?.entry.cycle !== e.cycle && <CycleDivider cycle={e.cycle} cyclesPerDay={view.config.cyclesPerDay} />}
                {pos === divider && <li className="unread-divider">{t("itrackie.unread.divider")}</li>}
                <LogRow entry={e} pos={pos} unread={unread(pos)} canRead={e.key === "expeditionReturned" && view.expeditions.some((r) => r.id === e.params?.report)} onRead={onRead} />
              </Fragment>
            ))}
          </ol>
        )}
      </div>
    </Scroller>
  );
}

/**
 * Where the "New messages" divider goes: before the first unread line when the tab opens (or you walk into another
 * room), and there it stays while the tab is open, however the lines are read. The server's read point can arrive just
 * after the tab opens, so a tab opened with nothing unread takes the first unread line that turns up. Mark all read
 * drops it.
 */
function useDivider(active: boolean, room: string, firstUnread: number | null): number | null {
  const [at, setAt] = useState<number | null>(null);
  const opened = useRef<{ active: boolean; room: string } | null>(null);
  const markAll = useContext(MarkAllContext);
  const seenMarkAll = useRef(markAll);
  useEffect(() => {
    const was = opened.current;
    opened.current = { active, room };
    if (seenMarkAll.current !== markAll) {
      seenMarkAll.current = markAll;
      setAt(null);
      return;
    }
    if (!active) return;
    if (!was || !was.active || was.room !== room) setAt(firstUnread);
    else setAt((prev) => prev ?? firstUnread);
  }, [active, room, firstUnread, markAll]);
  return at;
}

/** The row an event happened in, as its position, or null outside a row. */
function rowPos(feed: HTMLElement, target: EventTarget | null): number | null {
  const row = target instanceof Element ? target.closest<HTMLElement>("[data-pos]") : null;
  // Popovers are portalled: their events bubble here through React but sit outside the feed in the DOM.
  if (!row || !feed.contains(row)) return null;
  const pos = Number(row.dataset.pos);
  return Number.isSafeInteger(pos) ? pos : null;
}

/**
 * Marking one line read (#513): a mouse resting on it for `HOVER_READ_MS`, a tap or click on it, or keyboard focus on
 * it. Never everything up to it. Tabbing into the feed focuses its first unread line, else the last.
 */
function useHoverTapFocus() {
  const store = useLogReadStore();
  const hover = useRef<{ pos: number; timer: ReturnType<typeof setTimeout> } | null>(null);
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
  const rowsOf = (ol: HTMLElement) => Array.from(ol.querySelectorAll<HTMLElement>(":scope > [data-pos]"));
  return {
    onPointerOver: (e: PointerEvent<HTMLOListElement>) => {
      // Touch and pen read by tapping (a touch also fires pointerover, which would read on every scroll).
      if (e.pointerType !== "mouse" || !store) return;
      const pos = rowPos(e.currentTarget, e.target);
      if (pos === hover.current?.pos) return;
      stopHover();
      if (pos === null) return;
      hover.current = { pos, timer: setTimeout(() => store.markRead(pos), HOVER_READ_MS) };
    },
    onPointerLeave: stopHover,
    onClick: (e: MouseEvent<HTMLOListElement>) => {
      const pos = rowPos(e.currentTarget, e.target);
      if (pos !== null) store?.markRead(pos);
    },
    onFocus: (e: FocusEvent<HTMLOListElement>) => {
      if (e.target !== e.currentTarget) {
        const pos = rowPos(e.currentTarget, e.target);
        if (pos !== null) store?.markRead(pos);
        return;
      }
      // Only from the keyboard: a click on the feed's blank space isn't reading anything.
      if (!e.currentTarget.matches(":focus-visible")) return;
      const rows = rowsOf(e.currentTarget);
      const state = store?.state();
      const first = state ? rows.findIndex((r) => isUnread(state, Number(r.dataset.pos))) : -1;
      rows[first < 0 ? rows.length - 1 : first]?.focus();
    },
    onKeyDown: (e: KeyboardEvent<HTMLOListElement>) => {
      const ol = e.currentTarget;
      const target = e.target as HTMLElement;
      // Keys inside a line's own controls (a badge's popover, a report button) are theirs.
      if (target !== ol && !(target.parentElement === ol && target.dataset.pos !== undefined)) return;
      const rows = rowsOf(ol);
      const to = rowAfterKey(e.key, rows.indexOf(target), rows.length);
      if (to === null) return;
      e.preventDefault();
      rows[to]?.focus();
    },
  };
}
