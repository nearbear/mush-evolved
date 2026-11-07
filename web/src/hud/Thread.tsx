import { Fragment, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNames } from "../i18n/names.ts";
import { Menu } from "@base-ui/react/menu";
import { chatPageOf, type ChannelId, type ChatLine, type PlayerView, type ThreadId } from "@mush2/shared";
import { pageItems, useChatPages } from "../chatPages.tsx";
import { useMobile } from "../useMobile.ts";
import { messageKey } from "../chatSeen.ts";
import { Markdown } from "./Markdown.tsx";
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

/** A chat channel: its messages, then an input. Read and post access come from the server. */
export function Thread({
  view,
  channel,
  placeholder,
  onSend,
  onToggle,
  threadLinks,
  head,
}: {
  view: PlayerView;
  channel: ChannelId;
  placeholder: string;
  onSend: (text: string) => void;
  onToggle: (channel: ChannelId, seq: number, line: number) => void;
  /** Global chat only: each message links to its thread, or offers to start one. */
  threadLinks?: ThreadLinks;
  /** Shown above the messages (a thread's starter message). */
  head?: ReactNode;
}) {
  const { t } = useTranslation();
  // The dead can read some channels but post in none.
  const readable = view.readChannels.includes(channel);
  const enabled = view.chatChannels.includes(channel);
  const live = view.chat.filter((m) => m.channel === channel);
  const counts = threadLinks && messageCounts(view);
  const paging = usePaging(view, channel);
  const messages = paging.messages ?? live;
  return (
    <div className="thread">
      {readable && <PageBar paging={paging} />}
      <Scroller items={messages.length} scrollKey={paging.page}>
        <ol className="feed">
          {readable && head}
          {!readable && <li className="sub">{t("itrackie.needITrackieRead")}</li>}
          {readable && paging.loading && <li className="sub">{t("itrackie.pages.loading")}</li>}
          {readable && !paging.loading && messages.length === 0 && <li className="sub">{t("itrackie.noMessages")}</li>}
          {messages.map((m, i) => {
            const thread = threadLinks && !m.system ? view.threads.find((th) => th.from === m.seq) : undefined;
            return (
              <Fragment key={messageKey(m)}>
                {messages[i - 1]?.cycle !== m.cycle && <CycleDivider cycle={m.cycle} />}
                <MessageEntry
                  view={view}
                  message={m}
                  onToggle={m.from === view.you.id && enabled ? (line) => onToggle(m.channel, m.seq, line) : undefined}
                  tools={
                    <MessageMenu
                      onStartThread={threadLinks && !thread && enabled ? () => threadLinks.start(m) : undefined}
                      report={m.from !== view.you.id}
                    />
                  }
                >
                  {thread && threadLinks && (
                    <button type="button" className="thread-link" onClick={() => threadLinks.open(thread.id)}>
                      <img className="tab-icon" src={TAB_ICONS.threads} alt="" />
                      <span className="thread-name">{thread.name}</span>
                      <span className="thread-count">{t("itrackie.threads.messages", { count: counts?.get(thread.id) ?? 0 })}</span>
                    </button>
                  )}
                </MessageEntry>
              </Fragment>
            );
          })}
        </ol>
      </Scroller>
      {readable && !enabled ? (
        <p className="sub chat-read-only">{t("itrackie.readOnly")}</p>
      ) : (
        <ChatInput enabled={enabled} placeholder={placeholder} onSend={onSend} />
      )}
    </div>
  );
}

/**
 * Which page of a channel the reader is on (#355). Page n holds `seq` n·50 to n·50+49. Null, the default, is the
 * latest: the newest page alone (nearly empty right after a seal, owner 2026-11-06), and it follows new messages. Any
 * other page is fixed: sealed pages never change, so new messages never move the reader. `seen` is the message count
 * when the reader left the latest, for the "N new" chip.
 */
function usePaging(view: PlayerView, channel: ChannelId) {
  const pages = useChatPages();
  const total = view.chatCounts[channel] ?? 0;
  const last = total > 0 ? chatPageOf(total - 1) : 0;
  // The view carries the open page and the tail; without a page cache (no socket) nothing older can be shown.
  const first = pages ? 0 : Math.max(0, last - 1);
  const [picked, setPicked] = useState<{ page: number; seen: number } | null>(null);
  const page = picked && picked.page < last ? picked.page : null;
  // The view carries the open page and the tail; anything older comes from the cache.
  const older = page !== null && page < last - 1;
  const fetched = older ? pages?.get(channel, page) : undefined;
  useEffect(() => {
    if (older && page !== null) pages?.request(channel, page);
  }, [older, page, channel, pages]);
  const shown = page ?? last;
  const messages = older ? (fetched ?? []) : view.chat.filter((m) => m.channel === channel && chatPageOf(m.seq) === shown);
  const go = (to: number | null) =>
    setPicked(to === null || to >= last ? null : { page: Math.max(first, to), seen: page === null ? total : (picked?.seen ?? total) });
  return { page: shown, latest: page === null, first, last, newCount: page === null ? 0 : total - (picked?.seen ?? total), messages, loading: older && !fetched, go };
}

type Paging = ReturnType<typeof usePaging>;

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
      </button>
    </nav>
  );
}

/** One message: a player's (crew sprite, name, markdown) or the game's (info icon, translated line). `children` go under the text. */
export function MessageEntry({
  view,
  message: m,
  onToggle,
  tools,
  className,
  children,
}: {
  view: PlayerView;
  message: ChatLine;
  onToggle?: ((line: number) => void) | undefined;
  tools?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const names = useNames();
  if (m.system) {
    return (
      <FeedEntry marker={<InfoMarker />} at={m.at} className={className ? `sub ${className}` : "sub"}>
        {names.logLine(m.system)}
      </FeedEntry>
    );
  }
  // Senders are named by their character; account names never reach the client.
  const character = m.from === view.you.id ? view.you.character : view.players.find((p) => p.id === m.from)?.character;
  return (
    <FeedEntry
      marker={<CrewAvatar character={character} />}
      name={
        <>
          <strong className={m.from === view.you.id ? "me" : undefined}>{names.character(character ?? "")}</strong>
          {m.isBot && <span className="tag">{t("common.ai")}</span>}
        </>
      }
      at={m.at}
      tools={tools}
      className={className}
    >
      <Markdown text={m.text} onToggle={onToggle} />
      {children}
    </FeedEntry>
  );
}

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
              <Menu.Item render={<button type="button" />} onClick={onStartThread}>
                <img className="menu-item-icon" src={TAB_ICONS.threads} alt="" />
                {t("itrackie.threads.start")}
              </Menu.Item>
            )}
            {/* TODO(report): a placeholder; reporting isn't built yet, so it does nothing. */}
            {report && (
              <Menu.Item render={<button type="button" />}>
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
