import { Fragment, memo, useCallback, useContext, useLayoutEffect, useRef, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNames } from "../i18n/names.ts";
import { Menu } from "@base-ui/react/menu";
import { chatPageOf, jsonEqual, type CharacterId, type ChannelId, type ChatLine, type PlayerId, type PlayerView, type SeqRange, type ThreadId } from "@mush2/shared";
import { pageItems, useChatPages } from "../chatPages.tsx";
import { useMobile } from "../useMobile.ts";
import { messageKey, useChatReadStore, useLocalReads, useReadCount } from "../chatRead.ts";
import { Markdown } from "./Markdown.tsx";
import { useFeedReading } from "./useFeedReading.ts";
import { useUnreadIn } from "./UnreadChip.tsx";
import { MarkAllContext, dividerAt, dividerPlacement } from "./unreadDivider.ts";
import { CycleDivider } from "./CycleDivider.tsx";
import { FeedEntry, CrewAvatar, InfoMarker, NeronAvatar, NeronName, isNeronMessage } from "./FeedEntry.tsx";
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
  /** `as`: post as your Radio Piracy target (`view.radioHack`) instead of yourself. */
  onSend: (text: string, as?: PlayerId) => void;
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
    v.chatUnheard === w.chatUnheard &&
    v.readChannels === w.readChannels &&
    v.chatChannels === w.chatChannels &&
    jsonEqual(v.radioHack, w.radioHack) &&
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
  const own = view.chatChannels.includes(channel);
  // Radio Piracy: where your target can post, you may post as them; in their private channels you aren't in, only as them.
  const hackTarget = view.radioHack?.channels.includes(channel) ? view.radioHack.target : undefined;
  const [asTarget, setAsTarget] = useState(false);
  const postAs = hackTarget !== undefined && (asTarget || !own) ? hackTarget : undefined;
  const enabled = own || hackTarget !== undefined;
  const live = view.chat.filter((m) => m.channel === channel);
  const counts = threadLinks && messageCounts(view);
  const paging = usePaging(view, channel);
  const messages = paging.messages ?? live;
  const actions = useHandlers(onSend, onToggle, threadLinks);
  const total = view.chatCounts[channel] ?? 0;
  const unheard = view.chatUnheard?.[channel];
  const unread = useUnreadSeqs(channel, total, view.you.id);
  const marking = useReadMarking(channel, total, paging.latest, readable, live, unheard, unread);
  // After `useReadMarking`: its effect marks arrivals in view first, so this one sees them as read.
  const divider = useUnreadDivider(channel, total, active && readable, live, view.you.id, paging, unheard);
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
          onPointerOver={marking.onPointerOver}
          onPointerLeave={marking.onPointerLeave}
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
                {messages[i - 1]?.cycle !== m.cycle && <CycleDivider cycle={m.cycle} cyclesPerDay={view.config.cyclesPerDay} />}
                {m.seq === divider.beforeSeq && (
                  <li ref={divider.ref} className="unread-divider">
                    {t("itrackie.unread.divider")}
                  </li>
                )}
                <ChatRow
                  message={m}
                  character={senderOf(view, m)}
                  mine={mine}
                  unread={unread(m)}
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
      {hackTarget !== undefined && <PostAs view={view} target={hackTarget} own={own} asTarget={postAs !== undefined} onChange={setAsTarget} />}
      {readable && !enabled ? (
        <p className="sub chat-read-only">{t("itrackie.readOnly")}</p>
      ) : (
        <ChatInput
          enabled={enabled}
          placeholder={placeholder}
          onSend={(text) => actions.send(text, postAs)}
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
  const unread = useUnreadIn(channel, total, view.chatUnheard?.[channel]);
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
  return { page: shown, latest: page === null, first, last, newCount: page === null ? 0 : unread, messages, loading: older && !fetched, go };
}

type Paging = ReturnType<typeof usePaging>;

/**
 * Whether a message shows as unread (#513): past the channel's count and not read one at a time. Your own messages
 * never are. With no store nothing is.
 */
function useUnreadSeqs(channel: ChannelId, total: number, me: string): (m: Pick<ChatLine, "seq" | "from" | "system">) => boolean {
  const store = useChatReadStore();
  const read = useReadCount(channel, total);
  const local = useLocalReads(channel);
  return (m) => !!store && m.seq >= read && !local.includes(m.seq) && (m.system !== undefined || m.from !== me);
}

/**
 * Marking a channel's messages read (#513, replacing #400's "read everything up to it"). A message is read on its own by
 * a mouse rest, a tap or keyboard focus (`useFeedReading`). A message that arrives while the feed is on screen, on the
 * latest page, in a visible and focused window, is read (Discord's behaviour), so the open channel's badge doesn't grow
 * as people talk; only the arriving messages are, never older unread ones (owner, 2026-11-27). Your own messages are
 * read wherever you are (`useOwnMessagesRead` in ITrackie.tsx). "On screen" is read from the DOM: every hidden tab, feature, private channel
 * and phone panel is hidden with CSS, so a feed with no layout boxes isn't being watched.
 */
function useReadMarking(
  channel: ChannelId,
  total: number,
  latest: boolean,
  readable: boolean,
  live: readonly ChatLine[],
  unheard: readonly SeqRange[] | undefined,
  unread: (m: Pick<ChatLine, "seq" | "from" | "system">) => boolean,
) {
  const store = useChatReadStore();
  const feed = useRef<HTMLOListElement>(null);
  // The count last rendered while readable: history that becomes readable (an iTrackie picked up) didn't arrive.
  const seen = useRef<{ channel: ChannelId; total: number } | null>(null);
  const latestUnheard = useRef(unheard);
  latestUnheard.current = unheard;
  useEffect(() => {
    const before = seen.current?.channel === channel ? seen.current.total : null;
    seen.current = readable ? { channel, total } : null;
    if (!store || !readable || before === null || total <= before) return;
    const el = feed.current;
    const watching = latest && !!el && el.getClientRects().length > 0 && document.visibilityState === "visible" && document.hasFocus();
    if (!watching) return;
    const arrived: number[] = [];
    for (let seq = before; seq < total; seq++) arrived.push(seq);
    store.markSeqs(channel, arrived, total, latestUnheard.current);
  }, [store, channel, total, latest, readable]);

  const reading = useFeedReading(
    "seq",
    (seq) => store?.markSeqs(channel, [seq], total, unheard),
    (seq) => {
      const m = live.find((x) => x.seq === seq);
      return unread(m ?? { seq, from: "", system: undefined });
    },
  );
  return { feed, ...reading };
}

/**
 * The "New messages" divider and the unread bar (#400, #513; owner, 2026-11-09). Opening the channel (`active` turning
 * true) places the divider before the first unread message then, and it stays put however the reader reads (#513:
 * clicking a message no longer moves it). With none placed, unread that arrives and isn't marked (the window wasn't
 * focused) places one. Mark all read drops it. The bar shows while the divider is out of sight: on an earlier page, or
 * scrolled above the feed. With no read store nothing is placed.
 */
function useUnreadDivider(
  channel: ChannelId,
  total: number,
  active: boolean,
  live: readonly ChatLine[],
  me: string,
  paging: Paging,
  unheard: readonly SeqRange[] | undefined,
) {
  const store = useChatReadStore();
  const on = !!store && active;
  const [at, setAt] = useState<number | null>(null);
  const place = () => (store ? dividerAt(store.read(channel), total, live, me, unheard, store.local(channel)) : null);
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

  const placement = dividerPlacement(at, total, paging.page, unheard);
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
  unread = false,
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
  /** Set on a feed's rows: hovering, tapping or focusing the row marks it read (`useReadMarking`). */
  seq?: number | undefined;
  /** Shows the unread icon (#513). */
  unread?: boolean;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const names = useNames();
  if (m.system) {
    if (isNeronMessage(m.system.key)) {
      return (
        <FeedEntry marker={<NeronAvatar />} name={<NeronName />} at={m.at} className={className} seq={seq} unread={unread}>
          {names.logLine(m.system)}
        </FeedEntry>
      );
    }
    return (
      <FeedEntry marker={<InfoMarker />} at={m.at} className={className} seq={seq} unread={unread}>
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
      unread={unread}
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

/**
 * Radio Piracy's "post as" switch above the input (`view.radioHack`): yourself or your target where you can both post;
 * only the target in their private channels you read through the hack. A spoof never reaches the target.
 */
function PostAs({ view, target, own, asTarget, onChange }: { view: PlayerView; target: PlayerId; own: boolean; asTarget: boolean; onChange: (asTarget: boolean) => void }) {
  const { t } = useTranslation();
  const names = useNames();
  const character = view.players.find((p) => p.id === target)?.character;
  const name = character ? names.characterGiven(character) : "?";
  if (!own) return <p className="sub chat-post-as">{t("itrackie.postAs.only", { name })}</p>;
  return (
    <div className="chat-post-as" role="group" aria-label={t("itrackie.postAs.label")}>
      <span className="sub">{t("itrackie.postAs.label")}</span>
      <button type="button" className="pick-tile" aria-pressed={!asTarget} onClick={() => onChange(false)}>
        {t("itrackie.postAs.me")}
      </button>
      <button type="button" className="pick-tile" aria-pressed={asTarget} onClick={() => onChange(true)}>
        {name}
      </button>
    </div>
  );
}

/** What a thread and its rows do on input. Stable for the life of the `Thread`, so it and its rows can skip re-rendering. */
interface RowActions {
  send: (text: string, as?: PlayerId) => void;
  toggle: (m: ChatLine, line: number) => void;
  start: (m: ChatLine) => void;
  open: (id: ThreadId) => void;
}

/**
 * Callbacks that never change identity but always call the latest handlers (the parents pass new closures on every
 * render).
 */
function useHandlers(
  onSend: (text: string, as?: PlayerId) => void,
  onToggle: (channel: ChannelId, seq: number, line: number) => void,
  threadLinks: ThreadLinks | undefined,
): RowActions {
  const latest = useRef({ onSend, onToggle, threadLinks });
  useLayoutEffect(() => {
    latest.current = { onSend, onToggle, threadLinks };
  });
  const [actions] = useState<RowActions>(() => ({
    send: (text, as) => latest.current.onSend(text, as),
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
  unread: boolean;
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
  function ChatRow({ message: m, character, mine, unread, canToggle, canStartThread, report, threadId, threadName, threadCount, actions }: ChatRowProps) {
    const { t } = useTranslation();
    return (
      <MessageEntry
        character={character}
        mine={mine}
        message={m}
        seq={m.seq}
        unread={unread}
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
