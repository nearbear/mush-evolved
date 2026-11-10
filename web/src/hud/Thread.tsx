import { Fragment, memo, useCallback, useContext, useLayoutEffect, useRef, useState, useEffect, type FocusEvent, type KeyboardEvent, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNames } from "../i18n/names.ts";
import { Menu } from "@base-ui/react/menu";
import { chatPageOf, jsonEqual, type CharacterId, type ChannelId, type ChatLine, type PlayerView, type ThreadId } from "@mush2/shared";
import { pageItems, useChatPages } from "../chatPages.tsx";
import { useMobile } from "../useMobile.ts";
import { messageKey, useChatReadStore, useReadCount } from "../chatRead.ts";
import { Markdown } from "./Markdown.tsx";
import { firstUnreadRow, rowAfterKey } from "./feedKeys.ts";
import { MarkAllContext, dividerAt, dividerPlacement } from "./unreadDivider.ts";
import { CycleDivider } from "./CycleDivider.tsx";
import { FeedEntry, CrewAvatar, InfoMarker } from "./FeedEntry.tsx";
import { ChatInput } from "./ChatInput.tsx";
import { Scroller } from "./Scroller.tsx";
import { SHIP_RESOURCE_ICONS, TAB_ICONS } from "../art/assets.ts";
import type { ReactNode } from "react";

/** What global chat's messages link to: the thread started from one, or the form to start one. */
export interface ThreadLinks {
  open: (id: ThreadId) => void;
  start: (message: ChatLine) => void;
}

interface ThreadProps {
  view: PlayerView;
  channel: ChannelId;
  placeholder: string;
  onSend: (text: string) => void;
  onToggle: (channel: ChannelId, seq: number, line: number) => void;
  /** Global chat only: each message links to its thread, or offers to start one. */
  threadLinks?: ThreadLinks;
  /** Shown above the messages (a thread's starter message). Re-rendered only when `headKey` changes. */
  head?: ReactNode;
  /** Everything `head` shows, as plain data: the memo compares this, never the `head` element itself. */
  headKey?: unknown;
  /**
   * The channel on screen: its tab, thread, feature or entry is the one picked. Opening it places the "New messages"
   * divider (#400). Defaults to true for a thread shown on its own.
   */
  active?: boolean;
}

/**
 * Whether a `Thread` would render the same. Every chat tab stays mounted, so each new view would otherwise re-render
 * every channel and thread. This reads only the parts of the view a thread uses, which keep their identity across
 * updates that didn't touch them (`shareUnchanged`, shareView.ts). Callbacks are not compared: the thread calls the
 * latest ones through a ref (`useHandlers`).
 */
function sameThread(a: ThreadProps, b: ThreadProps): boolean {
  const [v, w] = [a.view, b.view];
  return (
    a.channel === b.channel &&
    a.placeholder === b.placeholder &&
    a.active === b.active &&
    !a.threadLinks === !b.threadLinks &&
    !a.head === !b.head &&
    jsonEqual(a.headKey, b.headKey) &&
    v.chat === w.chat &&
    v.chatCounts === w.chatCounts &&
    v.readChannels === w.readChannels &&
    v.chatChannels === w.chatChannels &&
    v.threads === w.threads &&
    v.players === w.players &&
    v.you.id === w.you.id &&
    v.you.character === w.you.character
  );
}

/** A chat channel: its messages, then an input. Read and post access come from the server. */
export const Thread = memo(function Thread({ view, channel, placeholder, onSend, onToggle, threadLinks, head, active = true }: ThreadProps) {
  const { t } = useTranslation();
  // The dead can read some channels but post in none.
  const readable = view.readChannels.includes(channel);
  const enabled = view.chatChannels.includes(channel);
  const live = view.chat.filter((m) => m.channel === channel);
  const counts = threadLinks && messageCounts(view);
  const paging = usePaging(view, channel);
  const messages = paging.messages ?? live;
  const actions = useHandlers(onSend, onToggle, threadLinks);
  const total = view.chatCounts[channel] ?? 0;
  const marking = useReadMarking(channel, total, paging.latest, readable);
  // After `useReadMarking`: its effect marks arrivals in view first, so this one sees them as read.
  const divider = useUnreadDivider(channel, total, active && readable, live, view.you.id, paging);
  const rows = readable && messages.length > 0;
  return (
    <div className="thread">
      {readable && <PageBar paging={paging} />}
      {divider.bar && <UnreadBar count={divider.count} onJump={divider.jump} />}
      <Scroller items={messages.length} scrollKey={paging.page} top={!paging.latest}>
        {/* One tab stop per feed; arrow keys move between messages (owner, 2026-11-08). The rows' own controls stay tabbable. */}
        <ol
          ref={marking.feed}
          className="feed"
          tabIndex={rows ? 0 : undefined}
          onFocus={marking.onFocus}
          onClick={marking.onClick}
          onKeyDown={rows ? marking.onKeyDown : undefined}
        >
          {readable && head}
          {!readable && <li className="sub">{t("itrackie.needITrackieRead")}</li>}
          {readable && paging.loading && <li className="sub">{t("itrackie.pages.loading")}</li>}
          {readable && !paging.loading && messages.length === 0 && <li className="sub">{t("itrackie.noMessages")}</li>}
          {messages.map((m, i) => {
            const thread = threadLinks && !m.system ? view.threads.find((th) => th.from === m.seq) : undefined;
            const mine = m.from === view.you.id;
            return (
              <Fragment key={messageKey(m)}>
                {messages[i - 1]?.cycle !== m.cycle && <CycleDivider cycle={m.cycle} />}
                {m.seq === divider.beforeSeq && (
                  <li ref={divider.ref} className="unread-divider">
                    {t("itrackie.unread.divider")}
                  </li>
                )}
                <ChatRow
                  message={m}
                  character={senderOf(view, m)}
                  mine={mine}
                  canToggle={mine && enabled}
                  canStartThread={!!threadLinks && !thread && enabled}
                  report={!mine}
                  threadId={thread?.id}
                  threadName={thread?.name}
                  threadCount={thread ? (counts?.get(thread.id) ?? 0) : undefined}
                  actions={actions}
                />
              </Fragment>
            );
          })}
        </ol>
      </Scroller>
      {readable && !enabled ? (
        <p className="sub chat-read-only">{t("itrackie.readOnly")}</p>
      ) : (
        <ChatInput
          enabled={enabled}
          placeholder={placeholder}
          onSend={(text) => {
            divider.clear();
            actions.send(text);
          }}
        />
      )}
    </div>
  );
}, sameThread);

/**
 * Which page of a channel the reader is on (#355). Page n holds `seq` n·50 to n·50+49. Null, the default, is the
 * latest: the newest page alone (nearly empty right after a seal, owner 2026-11-06), and it follows new messages. Any
 * other page is fixed: sealed pages never change, so new messages never move the reader. `newCount` is the channel's
 * unread (#400), shown on » while the reader is off the latest page.
 */
function usePaging(view: PlayerView, channel: ChannelId) {
  const pages = useChatPages();
  const total = view.chatCounts[channel] ?? 0;
  const last = total > 0 ? chatPageOf(total - 1) : 0;
  // The view carries the open page and the tail; without a page cache (no socket) nothing older can be shown.
  const first = pages ? 0 : Math.max(0, last - 1);
  const read = useReadCount(channel, total);
  const [picked, setPicked] = useState<number | null>(null);
  const page = picked !== null && picked < last ? picked : null;
  // The view carries the open page and the tail; anything older comes from the cache.
  const older = page !== null && page < last - 1;
  const fetched = older ? pages?.get(channel, page) : undefined;
  useEffect(() => {
    if (older && page !== null) pages?.request(channel, page);
  }, [older, page, channel, pages]);
  const shown = page ?? last;
  const messages = older ? (fetched ?? []) : view.chat.filter((m) => m.channel === channel && chatPageOf(m.seq) === shown);
  const go = (to: number | null) => setPicked(to === null || to >= last ? null : Math.max(first, to));
  return { page: shown, latest: page === null, first, last, newCount: page === null ? 0 : Math.max(0, total - read), messages, loading: older && !fetched, go };
}

type Paging = ReturnType<typeof usePaging>;

/**
 * Marking a channel read (#400; owner, 2026-11-08). Focusing or clicking a message marks it and everything before it;
 * hover and merely being on screen don't. A message that arrives while the feed is on screen, on the latest page, in a
 * visible and focused window, counts as read (Discord's behaviour), so the open channel's badge doesn't grow as people
 * talk. "On screen" is read from the DOM: every hidden tab, feature, private channel and phone panel is hidden with CSS,
 * so a feed with no layout boxes isn't being watched.
 *
 * Keyboard: the feed is one tab stop. Tabbing in moves focus to the first unread message on the page (else the last);
 * ArrowUp/Down, Home and End move between messages.
 */
function useReadMarking(channel: ChannelId, total: number, latest: boolean, readable: boolean) {
  const store = useChatReadStore();
  const feed = useRef<HTMLOListElement>(null);
  // The count last rendered while readable: history that becomes readable (an iTrackie picked up) didn't arrive.
  const seen = useRef<{ channel: ChannelId; total: number } | null>(null);
  useEffect(() => {
    const before = seen.current?.channel === channel ? seen.current.total : null;
    seen.current = readable ? { channel, total } : null;
    if (!store || !readable || !latest || before === null || total <= before) return;
    const el = feed.current;
    if (el && el.getClientRects().length > 0 && document.visibilityState === "visible" && document.hasFocus()) store.mark(channel, total);
  }, [store, channel, total, latest, readable]);

  const rowsOf = (ol: HTMLOListElement) => Array.from(ol.querySelectorAll<HTMLElement>(":scope > [data-seq]"));
  const seqOf = (row: HTMLElement) => Number(row.dataset.seq);
  const markRow = (target: EventTarget) => {
    const row = target instanceof Element ? target.closest<HTMLElement>("[data-seq]") : null;
    // Menus are portalled: their events bubble here through React but sit outside the feed in the DOM.
    if (!row || !feed.current?.contains(row)) return;
    const seq = seqOf(row);
    if (Number.isSafeInteger(seq)) store?.mark(channel, seq + 1);
  };
  return {
    feed,
    onFocus: (e: FocusEvent<HTMLOListElement>) => {
      if (e.target !== e.currentTarget) return markRow(e.target);
      // Only from the keyboard: a click on the feed's blank space isn't reading anything.
      if (!e.currentTarget.matches(":focus-visible")) return;
      const rows = rowsOf(e.currentTarget);
      rows[firstUnreadRow(rows.map(seqOf), store?.read(channel))]?.focus();
    },
    // Safari doesn't focus a button on click, so a click marks too.
    onClick: (e: MouseEvent<HTMLOListElement>) => markRow(e.target),
    onKeyDown: (e: KeyboardEvent<HTMLOListElement>) => {
      const ol = e.currentTarget;
      const target = e.target as HTMLElement;
      // Keys inside a message's own controls (a checkbox, a menu) are theirs.
      if (target !== ol && !(target.parentElement === ol && target.dataset.seq !== undefined)) return;
      const rows = rowsOf(ol);
      const to = rowAfterKey(e.key, rows.indexOf(target), rows.length);
      if (to === null) return;
      e.preventDefault();
      rows[to]?.focus();
    },
  };
}

/**
 * The "New messages" divider and the unread bar (#400; owner, 2026-11-09). Opening the channel (`active` turning true)
 * places the divider at the count read then, and it stays put as the reader reads. With none placed, unread that
 * arrives and isn't marked (the window wasn't focused) places one. Posting and Mark all read drop it; posting also
 * marks the channel read locally, as the server does, so the divider doesn't come straight back. The bar shows while
 * the divider is out of sight: on an earlier page, or scrolled above the feed. With no read store nothing is placed.
 */
function useUnreadDivider(channel: ChannelId, total: number, active: boolean, live: readonly ChatLine[], me: string, paging: Paging) {
  const store = useChatReadStore();
  const on = !!store && active;
  const [at, setAt] = useState<number | null>(null);
  const place = () => (store ? dividerAt(store.read(channel), total, live, me) : null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: placed when the channel opens, never moved as it is read.
  useEffect(() => {
    setAt(on ? place() : null);
  }, [on, channel]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: only a new message can need one.
  useEffect(() => {
    if (on) setAt((prev) => prev ?? place());
  }, [on, total]);
  const markAll = useContext(MarkAllContext);
  const seenMarkAll = useRef(markAll);
  useEffect(() => {
    if (seenMarkAll.current === markAll) return;
    seenMarkAll.current = markAll;
    setAt(null);
  }, [markAll]);

  const placement = dividerPlacement(at, total, paging.page);
  // Whether the divider is on screen. True until an observer says otherwise (jsdom has none).
  const [inView, setInView] = useState(true);
  const el = useRef<HTMLLIElement | null>(null);
  const ref = useCallback((li: HTMLLIElement) => {
    el.current = li;
    if (typeof IntersectionObserver === "undefined") return;
    // Root null still clips to the scroll area, and a CSS-hidden feed never intersects.
    const observer = new IntersectionObserver((entries) => {
      const last = entries[entries.length - 1];
      if (last) setInView(last.isIntersecting);
    });
    observer.observe(li);
    return () => {
      observer.disconnect();
      el.current = null;
      setInView(true);
    };
  }, []);

  // A jump to an earlier page scrolls once the page is shown (and fetched). This runs after `Scroller`'s own scroll to
  // the page's top: a child's effects run first.
  const pending = useRef<{ focus: boolean } | null>(null);
  useEffect(() => {
    if (!pending.current || paging.loading) return;
    const { focus } = pending.current;
    pending.current = null;
    if (el.current) reveal(el.current, focus);
  });

  return {
    ref,
    beforeSeq: placement.beforeSeq,
    count: placement.count,
    bar: placement.jumpPage !== null || (placement.beforeSeq !== null && !inView),
    /** `focus`: from the keyboard, so focus follows to the first new message (the bar is about to go). */
    jump: (focus: boolean) => {
      if (placement.jumpPage !== null) {
        pending.current = { focus };
        paging.go(placement.jumpPage);
      } else if (el.current) reveal(el.current, focus);
    },
    clear: () => {
      store?.mark(channel, total);
      setAt(null);
    },
  };
}

/**
 * Scrolls the feed so the divider is at its top, without scrolling anything outside the feed. With `focus`, the
 * message after it takes focus, which marks it read like any focus.
 */
function reveal(divider: HTMLElement, focus: boolean) {
  const viewport = divider.closest<HTMLElement>(".scroll-viewport");
  if (viewport) viewport.scrollTop += divider.getBoundingClientRect().top - viewport.getBoundingClientRect().top;
  if (focus && divider.nextElementSibling instanceof HTMLElement) divider.nextElementSibling.focus({ preventScroll: true });
}

/** "12 new messages · Jump", above the feed while its divider is out of sight. Jump only (owner, 2026-11-09). */
function UnreadBar({ count, onJump }: { count: number; onJump: (focus: boolean) => void }) {
  const { t } = useTranslation();
  return (
    <div className="unread-bar">
      <span className="unread-bar-text">{t("itrackie.unread.bar", { count })}</span>
      <button type="button" className="unread-bar-jump" aria-label={t("itrackie.unread.jumpLabel")} onClick={(e) => onJump(e.currentTarget.matches(":focus-visible"))}>
        {t("itrackie.unread.jump")}
      </button>
    </div>
  );
}

/**
 * `« ‹ 1 2 … 6 7 › »` on desktop, `« ‹ 6 / 7 › »` on the phone layout: « the earliest page, » the latest. Shown once a
 * channel has more than one page. Page numbers start at 1 on screen.
 */
function PageBar({ paging }: { paging: Paging }) {
  const { t } = useTranslation();
  const mobile = useMobile();
  const { page, latest, first, last, newCount, go } = paging;
  if (last <= first) return null;
  return (
    <nav className="chat-pages" aria-label={t("itrackie.pages.label")}>
      <button type="button" className="chat-page-step" disabled={page <= first} onClick={() => go(first)} aria-label={t("itrackie.pages.earliest")}>
        «
      </button>
      <button type="button" className="chat-page-step" disabled={page <= first} onClick={() => go(page - 1)} aria-label={t("itrackie.pages.previous")}>
        ‹
      </button>
      {mobile ? (
        <span className="chat-page-of">{t("itrackie.pages.of", { page: page + 1, pages: last + 1 })}</span>
      ) : (
        pageItems(first, last, page).map((p, i) =>
          p === "gap" ? (
            // biome-ignore lint/suspicious/noArrayIndexKey: a gap has no identity but its place.
            <span key={`gap${i}`} className="chat-page-gap" aria-hidden="true">
              …
            </span>
          ) : (
            <button
              type="button"
              key={p}
              className="chat-page"
              aria-current={p === page ? "page" : undefined}
              aria-label={t("itrackie.pages.page", { page: p + 1 })}
              onClick={() => go(p === last ? null : p)}
            >
              {p + 1}
            </button>
          ),
        )
      )}
      <button type="button" className="chat-page-step" disabled={latest} onClick={() => go(page + 1)} aria-label={t("itrackie.pages.next")}>
        ›
      </button>
      <button
        type="button"
        className="chat-page-step"
        disabled={latest}
        onClick={() => go(null)}
        aria-label={newCount > 0 ? t("itrackie.pages.latestNew", { count: newCount }) : t("itrackie.pages.latest")}
      >
        »
        {newCount > 0 && (
          <span className="chat-page-new" aria-hidden="true">
            {newCount > 99 ? "99+" : newCount}
          </span>
        )}
      </button>
    </nav>
  );
}

/** One message: a player's (crew sprite, name, markdown) or the game's (info icon, translated line). `children` go under the text. */
export function MessageEntry({
  character,
  mine,
  message: m,
  onToggle,
  tools,
  className,
  seq,
  children,
}: {
  /** The sender's character (`senderOf`); unused for the game's own messages. */
  character: CharacterId | undefined;
  /** Sent by the reader. */
  mine: boolean;
  message: ChatLine;
  onToggle?: ((line: number) => void) | undefined;
  tools?: ReactNode;
  className?: string;
  /** Set on a feed's rows: focusing or clicking the row marks it read (`useReadMarking`). */
  seq?: number | undefined;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const names = useNames();
  if (m.system) {
    return (
      <FeedEntry marker={<InfoMarker />} at={m.at} className={className ? `sub ${className}` : "sub"} seq={seq}>
        {names.logLine(m.system)}
      </FeedEntry>
    );
  }
  return (
    <FeedEntry
      marker={<CrewAvatar character={character} />}
      name={
        <>
          <strong className={mine ? "me" : undefined}>{names.character(character ?? "")}</strong>
          {m.isBot && <span className="tag">{t("common.ai")}</span>}
        </>
      }
      at={m.at}
      tools={tools}
      className={className}
      seq={seq}
    >
      <Markdown text={m.text} onToggle={onToggle} />
      {children}
    </FeedEntry>
  );
}

/** A message's sender as a character: senders are named by their character; account names never reach the client. */
export function senderOf(view: PlayerView, m: ChatLine): CharacterId | undefined {
  return m.from === view.you.id ? view.you.character : view.players.find((p) => p.id === m.from)?.character;
}

/** What a thread and its rows do on input. Stable for the life of the `Thread`, so it and its rows can skip re-rendering. */
interface RowActions {
  send: (text: string) => void;
  toggle: (m: ChatLine, line: number) => void;
  start: (m: ChatLine) => void;
  open: (id: ThreadId) => void;
}

/**
 * Callbacks that never change identity but always call the latest handlers (the parents pass new closures on every
 * render).
 */
function useHandlers(
  onSend: (text: string) => void,
  onToggle: (channel: ChannelId, seq: number, line: number) => void,
  threadLinks: ThreadLinks | undefined,
): RowActions {
  const latest = useRef({ onSend, onToggle, threadLinks });
  useLayoutEffect(() => {
    latest.current = { onSend, onToggle, threadLinks };
  });
  const [actions] = useState<RowActions>(() => ({
    send: (text) => latest.current.onSend(text),
    toggle: (m, line) => latest.current.onToggle(m.channel, m.seq, line),
    start: (m) => latest.current.threadLinks?.start(m),
    open: (id) => latest.current.threadLinks?.open(id),
  }));
  return actions;
}

interface ChatRowProps {
  message: ChatLine;
  character: CharacterId | undefined;
  mine: boolean;
  canToggle: boolean;
  canStartThread: boolean;
  report: boolean;
  threadId: ThreadId | undefined;
  threadName: string | undefined;
  threadCount: number | undefined;
  actions: RowActions;
}

/**
 * One message in a `Thread`, memoized. Every keepMounted chat tab renders its whole page on each new view, and the
 * view arrives as fresh JSON, so messages are compared by content: a move re-renders only rows that changed.
 */
const ChatRow = memo(
  function ChatRow({ message: m, character, mine, canToggle, canStartThread, report, threadId, threadName, threadCount, actions }: ChatRowProps) {
    const { t } = useTranslation();
    return (
      <MessageEntry
        character={character}
        mine={mine}
        message={m}
        seq={m.seq}
        onToggle={canToggle ? (line) => actions.toggle(m, line) : undefined}
        tools={<MessageMenu onStartThread={canStartThread ? () => actions.start(m) : undefined} report={report} />}
      >
        {threadId !== undefined && (
          <button type="button" className="thread-link" onClick={() => actions.open(threadId)}>
            <img className="tab-icon" src={TAB_ICONS.threads} alt="" />
            <span className="thread-name">{threadName}</span>
            <span className="thread-count">{t("itrackie.threads.messages", { count: threadCount ?? 0 })}</span>
          </button>
        )}
      </MessageEntry>
    );
  },
  (a, b) => (Object.keys(a) as (keyof ChatRowProps)[]).every((k) => (k === "message" ? jsonEqual(a.message, b.message) : a[k] === b[k])),
);

/**
 * A message's "⋯" menu: start a thread (global chat), report. Shown on hover or
 * focus where there is a mouse, always on touch screens (styles/chat.css).
 * Renders nothing when it would be empty.
 */
function MessageMenu({ onStartThread, report }: { onStartThread: (() => void) | undefined; report: boolean }) {
  const { t } = useTranslation();
  if (!onStartThread && !report) return null;
  return (
    <Menu.Root>
      <Menu.Trigger className="message-menu-button" aria-label={t("itrackie.messageMenu.open")}>
        ⋯
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={4} align="end" className="message-menu-positioner">
          <Menu.Popup className="menu-popup">
            {onStartThread && (
              <Menu.Item nativeButton render={<button type="button" />} onClick={onStartThread}>
                <img className="menu-item-icon" src={TAB_ICONS.threads} alt="" />
                {t("itrackie.threads.start")}
              </Menu.Item>
            )}
            {/* TODO(report): a placeholder; reporting isn't built yet, so it does nothing. */}
            {report && (
              <Menu.Item nativeButton render={<button type="button" />}>
                <img className="menu-item-icon" src={SHIP_RESOURCE_ICONS.alerts} alt="" />
                {t("itrackie.messageMenu.report")}
              </Menu.Item>
            )}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

/** Messages per thread, for the "3 messages" counts: every message ever posted, older pages included. */
export function messageCounts(view: PlayerView): Map<ChannelId, number> {
  return new Map(Object.entries(view.chatCounts) as [ChannelId, number][]);
}
