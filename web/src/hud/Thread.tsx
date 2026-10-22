import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import { useNames } from "../i18n/names.ts";
import { Menu } from "@base-ui/react/menu";
import type { ChannelId, ChatMessage, PlayerView, ThreadId } from "@mush2/shared";
import { Markdown } from "./Markdown.tsx";
import { CycleDivider } from "./CycleDivider.tsx";
import { FeedEntry, CrewAvatar, InfoMarker } from "./FeedEntry.tsx";
import { ChatInput } from "./ChatInput.tsx";
import { Scroller } from "./Scroller.tsx";
import { TAB_ICONS } from "../art/assets.ts";
import type { ReactNode } from "react";

/** What global chat's messages link to: the thread started from one, or the form to start one. */
export interface ThreadLinks {
  open: (id: ThreadId) => void;
  start: (message: ChatMessage) => void;
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
  onToggle: (message: number, line: number) => void;
  /** Global chat only: each message links to its thread, or offers to start one. */
  threadLinks?: ThreadLinks;
  /** Shown above the messages (a thread's starter message). */
  head?: ReactNode;
}) {
  const { t } = useTranslation();
  // The dead can read some channels but post in none.
  const readable = view.readChannels.includes(channel);
  const enabled = view.chatChannels.includes(channel);
  const messages = view.chat.filter((m) => m.channel === channel);
  const counts = threadLinks && messageCounts(view);
  return (
    <div className="thread">
      <Scroller items={messages.length}>
        <ol className="feed">
          {readable && head}
          {!readable && <li className="sub">You need an iTrackie in your inventory to read this.</li>}
          {readable && messages.length === 0 && <li className="sub">No messages yet.</li>}
          {messages.map((m, i) => {
            const thread = threadLinks && !m.system ? view.threads.find((th) => th.from === m.id) : undefined;
            return (
              <Fragment key={m.id}>
                {messages[i - 1]?.cycle !== m.cycle && <CycleDivider cycle={m.cycle} />}
                <MessageEntry
                  view={view}
                  message={m}
                  onToggle={m.from === view.you.id && enabled ? (line) => onToggle(m.id, line) : undefined}
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
  message: ChatMessage;
  onToggle?: ((line: number) => void) | undefined;
  tools?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
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
          {m.isBot && <span className="tag">AI</span>}
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
            {report && <Menu.Item render={<button type="button" />}>{t("itrackie.messageMenu.report")}</Menu.Item>}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

/** Messages per thread, for the "3 messages" counts. */
export function messageCounts(view: PlayerView): Map<ChannelId, number> {
  const counts = new Map<ChannelId, number>();
  for (const m of view.chat) counts.set(m.channel, (counts.get(m.channel) ?? 0) + 1);
  return counts;
}
