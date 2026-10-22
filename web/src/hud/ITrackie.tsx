// Right panel: the iTrackie. Tabs for the current room's log, global chat, the
// threads under it (Discord-style), and the feature threads (one at a time,
// picked from a drop-down), plus a collapsible for private channels. Chat input stays in the DOM regardless of
// renderer (CLAUDE.md).

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useNames } from "../i18n/names.ts";
import { Menu } from "@base-ui/react/menu";
import { ScrollArea } from "@base-ui/react/scroll-area";
import { Tabs } from "@base-ui/react/tabs";
import { FEATURE_CHANNELS, ITRACKIE_ITEM, GRAVEYARD_CHANNEL, MAX_CHAT_LENGTH, MAX_THREAD_NAME_LENGTH, MUSH_CHANNEL, type ChannelId, type ChatMessage, type FeatureChannel, type PlayerView, type PrivateChannelId, type ThreadId } from "@mush2/shared";
import { FeatureSelect } from "./FeatureSelect.tsx";
import { Hint, IconButton, IconTab } from "./IconButton.tsx";
import { Markdown } from "./Markdown.tsx";
import { CycleDivider } from "./CycleDivider.tsx";
import { CrewAvatar, FeedEntry, InfoMarker, WarningMarker } from "./FeedEntry.tsx";
import { TAB_ICONS } from "../art/assets.ts";


type Notes = Record<FeatureChannel, string[]>;
const NO_NOTES = Object.fromEntries(FEATURE_CHANNELS.map((f) => [f, []])) as unknown as Notes;

type TabId = "room" | "global" | "threads" | "features" | "private" | "mush" | "graveyard";
const TAB_TITLES = {
  room: "itrackie.tabs.room",
  global: "itrackie.tabs.global",
  threads: "itrackie.tabs.threads",
  features: "itrackie.tabs.features",
  private: "channels.tab",
  mush: "itrackie.tabs.mush",
  graveyard: "itrackie.tabs.graveyard",
} as const;

export interface ChannelHandlers {
  onCreate: (name: string) => void;
  onInvite: (channel: PrivateChannelId, player: string) => void;
  onLeave: (channel: PrivateChannelId) => void;
}

export function ITrackie({
  view,
  onChat,
  onCreateThread,
  onToggle,
  channels,
  roomLogRequest,
}: {
  view: PlayerView;
  /** Bumped each time the player acts; switches to the Room tab to show the result. */
  roomLogRequest: number;
  onChat: (channel: ChannelId, text: string) => void;
  /** Start a thread under global chat, from global message `from` or on its own. */
  onCreateThread: (name: string, from?: number) => void;
  /** Tick or untick a checkbox in one of your own messages (`line` is 0-based). */
  onToggle: (message: number, line: number) => void;
  channels: ChannelHandlers;
}) {
  const { t } = useTranslation();
  const names = useNames();
  const [tab, setTab] = useState<TabId>("room");
  useEffect(() => {
    if (roomLogRequest > 0) setTab("room");
  }, [roomLogRequest]);
  const here = view.you.room;
  // The server sends this room's public history plus our private entries from
  // anywhere; the Room tab shows what belongs to the room we're standing in.
  const roomLog = view.log.filter((e) => e.room === undefined || e.room === here);
  const [feature, setFeature] = useState<FeatureChannel>("botany");
  // UI-only for now: lives in this tab and is lost on reload. Will become
  // private server-side state tied to the iTrackie.
  const [notes, setNotes] = useState<Notes>(NO_NOTES);
  // The Mush tab exists only for Mush (the server sends the channel to no one else) and pulses until its newest message is read.
  const mush = view.readChannels.includes(MUSH_CHANNEL);
  const newestMush = view.chat.reduce((n, m) => (m.channel === MUSH_CHANNEL ? Math.max(n, m.id) : n), 0);
  const [mushSeen, setMushSeen] = useState(0);
  useEffect(() => {
    if (mush && tab === "mush") setMushSeen(newestMush);
  }, [mush, tab, newestMush]);
  // The Graveyard tab is for the dead alone; the server sends the channel to no one else.
  const graveyard = view.readChannels.includes(GRAVEYARD_CHANNEL);
  // The dead have no room log and no private channels (#45): those tabs go, and they land on global chat.
  const alive = view.you.alive;
  const activeTab: TabId = !alive && (tab === "room" || tab === "private") ? "global" : (tab === "mush" && !mush) || (tab === "graveyard" && !graveyard) ? "room" : tab;
  const carrying = view.inventory.some((i) => i.type === ITRACKIE_ITEM);
  // Threads tab: the open thread (null for the list), and the new-thread form's
  // name and starter message. Kept here so a message in global chat can fill them.
  const [openThread, setOpenThread] = useState<ThreadId | null>(null);
  const [threadName, setThreadName] = useState("");
  const [starter, setStarter] = useState<number | null>(null);
  const shownThread = view.threads.find((th) => th.id === openThread);
  const threadLinks: ThreadLinks = {
    open: (id) => {
      setOpenThread(id);
      setTab("threads");
    },
    start: (m) => {
      setStarter(m.id);
      setThreadName(threadNameFrom(m.text));
      setOpenThread(null);
      setTab("threads");
    },
  };

  return (
    <div className="kit-panel itrackie">
      <Tabs.Root className="itrackie-tabs-root" value={activeTab} onValueChange={(v) => setTab(v as TabId)}>
        <Tabs.List className="itrackie-tabs">
          {alive && <IconTab value="room" src={TAB_ICONS.roomLog} label={t("itrackie.tabs.room")} />}
          <IconTab value="global" src={TAB_ICONS.global} label={t("itrackie.tabs.global")} />
          <IconTab value="threads" src={TAB_ICONS.threads} label={t("itrackie.tabs.threads")} />
          <IconTab value="features" src={TAB_ICONS.features} label={t("itrackie.tabs.features")} />
          {alive && <IconTab value="private" src={TAB_ICONS.private} label={t("channels.tab")} />}
          {mush && (
            <IconTab
              value="mush"
              src={TAB_ICONS.mushChat}
              label={t("itrackie.tabs.mush")}
              className={`mush-tab${newestMush > mushSeen ? " unread" : ""}`}
            />
          )}
          {graveyard && <IconTab value="graveyard" src={TAB_ICONS.graveyard} label={t("itrackie.tabs.graveyard")} />}
        </Tabs.List>
        <div className="itrackie-card">
          <h2 className="itrackie-title">{t(TAB_TITLES[activeTab])}{activeTab === "room" && ` – ${names.room(here)}`}{activeTab === "threads" && shownThread && ` – ${shownThread.name}`}</h2>

          {/* keepMounted: hidden with CSS, so chat drafts survive switching tabs. */}
          <Tabs.Panel className="itrackie-panel" value="room" keepMounted>
            <Scroller items={roomLog.length}>
              <ol className="feed">
                {roomLog.map((e, i) => (
                  <Fragment key={i}>
                    {roomLog[i - 1]?.cycle !== e.cycle && <CycleDivider cycle={e.cycle} />}
                    <FeedEntry
                      marker={e.level === "warning" ? <WarningMarker /> : <InfoMarker />}
                      at={e.at}
                      className={e.level === "warning" ? "warning" : e.visibleTo === "all" ? undefined : "private"}
                    >
                      {names.logLine(e)}
                    </FeedEntry>
                  </Fragment>
                ))}
              </ol>
            </Scroller>
          </Tabs.Panel>

          <Tabs.Panel className="itrackie-panel" value="global" keepMounted>
            <Thread view={view} channel="global" placeholder="Message everyone…" onSend={(text) => onChat("global", text)} onToggle={onToggle} threadLinks={threadLinks} />
          </Tabs.Panel>

          <Tabs.Panel className="itrackie-panel" value="threads" keepMounted>
            <Threads
              view={view}
              open={shownThread?.id ?? null}
              onOpen={setOpenThread}
              name={threadName}
              onName={setThreadName}
              starter={starter}
              onCancelStarter={() => {
                setStarter(null);
                setThreadName("");
              }}
              onCreate={(name, from) => {
                onCreateThread(name, from);
                setStarter(null);
                setThreadName("");
              }}
              onChat={onChat}
              onToggle={onToggle}
            />
          </Tabs.Panel>

          <Tabs.Panel className="itrackie-panel" value="features" keepMounted>
            <FeatureSelect value={feature} onChange={setFeature} />
            {/* One block per feature, hidden with CSS, so each keeps its own draft. */}
            {FEATURE_CHANNELS.map((f) => {
              const name = t(`itrackie.features.${f}`);
              return (
              <div key={f} className="feature" hidden={f !== feature}>
                {!alive ? null : carrying ? (
                  <Tracker notes={notes[f]} onChange={(next) => setNotes((all) => ({ ...all, [f]: next }))} />
                ) : (
                  <p className="sub">You need an iTrackie in your inventory to track anything.</p>
                )}
                <Thread
                  view={view}
                  channel={f}
                  placeholder={`Message the ${name} thread…`}
                  onSend={(text) => onChat(f, text)}
                  onToggle={onToggle}
                />
              </div>
              );
            })}
          </Tabs.Panel>

          {mush && (
            <Tabs.Panel className="itrackie-panel" value="mush" keepMounted>
              <Thread view={view} channel={MUSH_CHANNEL} placeholder={t("itrackie.mushPlaceholder")} onSend={(text) => onChat(MUSH_CHANNEL, text)} onToggle={onToggle} />
            </Tabs.Panel>
          )}

          {graveyard && (
            <Tabs.Panel className="itrackie-panel" value="graveyard" keepMounted>
              <Thread view={view} channel={GRAVEYARD_CHANNEL} placeholder={t("itrackie.graveyardPlaceholder")} onSend={(text) => onChat(GRAVEYARD_CHANNEL, text)} onToggle={onToggle} />
            </Tabs.Panel>
          )}

          <Tabs.Panel className="itrackie-panel" value="private" keepMounted>
            <PrivateChannels view={view} onChat={onChat} onToggle={onToggle} {...channels} />
          </Tabs.Panel>
        </div>
      </Tabs.Root>
    </div>
  );
}

/** What global chat's messages link to: the thread started from one, or the form to start one. */
interface ThreadLinks {
  open: (id: ThreadId) => void;
  start: (message: ChatMessage) => void;
}

/** A chat channel: its messages, then an input. Read and post access come from the server. */
function Thread({
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
function MessageEntry({
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
function messageCounts(view: PlayerView): Map<ChannelId, number> {
  const counts = new Map<ChannelId, number>();
  for (const m of view.chat) counts.set(m.channel, (counts.get(m.channel) ?? 0) + 1);
  return counts;
}

/** A thread name suggested from a message: its first line, without markdown marks, cut to the limit. */
function threadNameFrom(text: string): string {
  return (text.split("\n")[0] ?? "").replace(/[*_`#>~[\]]/g, "").replace(/\s+/g, " ").trim().slice(0, MAX_THREAD_NAME_LENGTH);
}

/**
 * The Threads tab, like Discord threads under a channel: a list of global
 * chat's threads (newest first) with a form to start one, or one open thread
 * with its starter message on top. Every thread stays mounted, hidden with
 * CSS, so each keeps its own draft.
 */
function Threads({
  view,
  open,
  onOpen,
  name,
  onName,
  starter,
  onCancelStarter,
  onCreate,
  onChat,
  onToggle,
}: {
  view: PlayerView;
  open: ThreadId | null;
  onOpen: (id: ThreadId | null) => void;
  name: string;
  onName: (name: string) => void;
  /** The global message the new thread will start from, if any. */
  starter: number | null;
  onCancelStarter: () => void;
  onCreate: (name: string, from?: number) => void;
  onChat: (channel: ChannelId, text: string) => void;
  onToggle: (message: number, line: number) => void;
}) {
  const { t } = useTranslation();
  const readable = view.readChannels.includes("global");
  const canStart = view.chatChannels.includes("global");
  const counts = messageCounts(view);
  const globalMessage = (id: number | null | undefined) => (id == null ? undefined : view.chat.find((m) => m.channel === "global" && m.id === id));
  const starterMessage = globalMessage(starter);
  const threads = [...view.threads].reverse();

  // Open the thread we just asked for once the server's view has it: the first
  // of ours that wasn't there when we sent the request.
  const [awaiting, setAwaiting] = useState<ReadonlySet<ThreadId> | null>(null);
  useEffect(() => {
    if (!awaiting) return;
    const made = view.threads.find((th) => th.createdBy === view.you.id && !awaiting.has(th.id));
    if (!made) return;
    setAwaiting(null);
    onOpen(made.id);
  }, [awaiting, view.threads, view.you.id, onOpen]);

  if (!readable) return <p className="sub">{t("itrackie.threads.needITrackie")}</p>;
  return (
    <>
      <div className="threads-list" hidden={open !== null}>
        <Scroller items={threads.length}>
          {threads.length === 0 ? (
            <p className="sub">{t("itrackie.threads.empty")}</p>
          ) : (
            <ul className="thread-rows" aria-label={t("itrackie.threads.list")}>
              {threads.map((th) => (
                <li key={th.id}>
                  <button type="button" className="thread-link" onClick={() => onOpen(th.id)}>
                    <img className="tab-icon" src={TAB_ICONS.threads} alt="" />
                    <span className="thread-name">{th.name}</span>
                    <span className="thread-count">{t("itrackie.threads.messages", { count: counts.get(th.id) ?? 0 })}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Scroller>
        {canStart && starterMessage && (
          <div className="thread-starter">
            <p className="sub">{t("itrackie.threads.startingFrom")}</p>
            <ol className="feed">
              <MessageEntry view={view} message={starterMessage} />
            </ol>
          </div>
        )}
        {canStart && (
          <form
            className="chat-input thread-create"
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim()) return;
              setAwaiting(new Set(view.threads.map((th) => th.id)));
              onCreate(name, starterMessage?.id);
            }}
          >
            <input
              value={name}
              onChange={(e) => onName(e.target.value)}
              maxLength={MAX_THREAD_NAME_LENGTH}
              placeholder={t("itrackie.threads.namePlaceholder")}
              aria-label={t("itrackie.threads.nameLabel")}
            />
            {starterMessage && (
              <button type="button" onClick={onCancelStarter}>
                {t("itrackie.threads.cancel")}
              </button>
            )}
            <IconButton type="submit" src={TAB_ICONS.newChannel} label={t("itrackie.threads.create")} disabled={!name.trim()} />
          </form>
        )}
      </div>
      {open !== null && (
        <div className="channel-bar">
          <button type="button" className="thread-back" onClick={() => onOpen(null)}>
            ← {t("itrackie.threads.back")}
          </button>
        </div>
      )}
      {view.threads.map((th) => {
        const from = globalMessage(th.from);
        return (
          <div key={th.id} className="feature" hidden={th.id !== open}>
            <Thread
              view={view}
              channel={th.id}
              placeholder={t("itrackie.threads.messagePlaceholder", { name: th.name })}
              onSend={(text) => onChat(th.id, text)}
              onToggle={onToggle}
              head={
                th.from === undefined ? undefined : from ? (
                  <MessageEntry view={view} message={from} className="thread-head" />
                ) : (
                  <li className="sub thread-head">{t("itrackie.threads.starterGone")}</li>
                )
              }
            />
          </div>
        );
      })}
    </>
  );
}

/** The feature's tracker: a list of lines the player types in themselves. */
function Tracker({ notes, onChange }: { notes: string[]; onChange: (notes: string[]) => void }) {
  const [text, setText] = useState("");
  return (
    <div className="tracker">
      <ul className="tracker-list">
        {notes.length === 0 && <li className="sub">Nothing tracked yet.</li>}
        {notes.map((note, i) => (
          <li key={i}>
            <span>{note}</span>
            <button
              className="tracker-remove"
              type="button"
              aria-label={`Remove "${note}"`}
              onClick={() => onChange(notes.filter((_, j) => j !== i))}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          onChange([...notes, text.trim()]);
          setText("");
        }}
      >
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={MAX_CHAT_LENGTH} placeholder="Track something…" aria-label="New tracker line" />
        <button type="submit" disabled={!text.trim()}>
          Add
        </button>
      </form>
    </div>
  );
}

/**
 * Scroll area that sticks to the bottom when new items arrive, and again when
 * it becomes visible (a hidden panel on the phone layout can't scroll).
 */
function Scroller({ items, children }: { items: number; children: ReactNode }) {
  const viewport = useRef<HTMLDivElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `items` is a count that only triggers the scroll.
  useEffect(() => {
    const el = viewport.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items]);
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    let wasHidden = el.clientHeight === 0;
    const observer = new ResizeObserver(() => {
      if (wasHidden && el.clientHeight > 0) el.scrollTop = el.scrollHeight;
      wasHidden = el.clientHeight === 0;
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return (
    <ScrollArea.Root className="scroll-root">
      <ScrollArea.Viewport ref={viewport} className="scroll-viewport">
        {children}
      </ScrollArea.Viewport>
      <ScrollArea.Scrollbar className="scroll-bar" orientation="vertical">
        <ScrollArea.Thumb className="scroll-thumb" />
      </ScrollArea.Scrollbar>
    </ScrollArea.Root>
  );
}

const CHAT_MIN_LINES = 3;
const CHAT_LINE_PX = 18;
const CHAT_MIN_HEIGHT = CHAT_MIN_LINES * CHAT_LINE_PX + 12;
/** The markdown preview toggle. TODO(preview): off for now. */
const CHAT_PREVIEW: boolean = false;

/** A three-line text area that grows upward (drag the grip above it to make it taller), the preview toggle above it (stubbed out, see CHAT_PREVIEW) and send below. */
function ChatInput({ enabled, placeholder, onSend }: { enabled: boolean; placeholder: string; onSend: (text: string) => void }) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [height, setHeight] = useState(CHAT_MIN_HEIGHT);
  // Previewing: the thread area splits, rendered markdown above and the text box below (see .chat-previewing).
  const [previewing, setPreviewing] = useState(false);
  const drag = useRef<{ startY: number; startHeight: number } | null>(null);
  const previewLabel = previewing ? t("itrackie.composer.edit") : t("itrackie.composer.preview");
  const submit = () => {
    if (!text.trim()) return;
    onSend(text);
    setText("");
  };
  return (
    <form
      className={previewing ? "chat-input chat-compose chat-previewing" : "chat-input chat-compose"}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div
        className="chat-grip"
        role="separator"
        aria-orientation="horizontal"
        aria-label={t("itrackie.composer.grip")}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { startY: e.clientY, startHeight: height };
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const max = Math.max(CHAT_MIN_HEIGHT, window.innerHeight * 0.6);
          setHeight(Math.min(max, Math.max(CHAT_MIN_HEIGHT, drag.current.startHeight + drag.current.startY - e.clientY)));
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      />
      {/* TODO(preview): stubbed out for now, to be revisited; flip CHAT_PREVIEW to bring the toggle back. */}
      {CHAT_PREVIEW && (
        <div className="chat-tools">
          <Hint label={previewLabel}>
            <button className="chat-max" type="button" onClick={() => setPreviewing(!previewing)} aria-pressed={previewing} aria-label={previewLabel} />
          </Hint>
        </div>
      )}
      {previewing && (
        <div className="chat-preview" aria-live="polite">
          {text.trim() ? <Markdown text={text} /> : <p className="sub">{t("itrackie.composer.previewEmpty")}</p>}
        </div>
      )}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          // Enter sends; Shift+Enter adds a line. Ignore Enter while an IME is composing.
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          }
        }}
        style={previewing ? undefined : { height }}
        maxLength={MAX_CHAT_LENGTH}
        placeholder={enabled ? placeholder : "Needs an iTrackie"}
        disabled={!enabled}
        aria-label="Chat message"
      />
      <button className="chat-send" type="submit" disabled={!enabled || !text.trim()} aria-label="Send" />
    </form>
  );
}

/**
 * The Private tab, laid out like Features: a drop-down picks one of your
 * channels, its thread fills the panel, and members, invite, and leave sit
 * above it. Creating a channel is at the bottom.
 */
function PrivateChannels({
  view,
  onChat,
  onToggle,
  onCreate,
  onInvite,
  onLeave,
}: { view: PlayerView; onChat: (channel: ChannelId, text: string) => void; onToggle: (message: number, line: number) => void } & ChannelHandlers) {
  const { t, i18n } = useTranslation();
  const [picked, setPicked] = useState<PrivateChannelId | "">("");
  const [name, setName] = useState("");
  const [invitee, setInvitee] = useState("");
  // Falls back to the first channel when none is picked or the picked one is gone (left, or deleted).
  const current = view.privateChannels.find((c) => c.id === picked) ?? view.privateChannels[0];
  const names = useNames();
  const nameOf = (id: string) => names.character((id === view.you.id ? view.you : view.players.find((p) => p.id === id))?.character ?? id);
  const atLimit = view.privateChannels.length >= view.channelLimit;
  const invitable = current ? view.players.filter((p) => p.alive && !current.members.includes(p.id)) : [];

  return (
    <>
      {current ? (
        <>
          <div className="channel-bar">
            <select
              className="feature-select"
              value={current.id}
              onChange={(e) => setPicked(e.target.value as PrivateChannelId)}
              aria-label={t("channels.list")}
            >
              {view.privateChannels.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <IconButton icon="🚪" label={t("channels.leave")} onClick={() => onLeave(current.id)} />
          </div>
          <p className="sub channel-members">
            {t("channels.members", { names: new Intl.ListFormat(i18n.language, { type: "conjunction" }).format(current.members.map(nameOf)) })}
          </p>
          {/* One block per channel, hidden with CSS, so each keeps its own draft. */}
          {view.privateChannels.map((c) => (
            <div key={c.id} className="feature" hidden={c.id !== current.id}>
              <Thread
                view={view}
                channel={c.id}
                placeholder={t("channels.messagePlaceholder", { name: c.name })}
                onSend={(text) => onChat(c.id, text)}
                onToggle={onToggle}
              />
            </div>
          ))}
          {invitable.length > 0 && (
            <form
              className="chat-input channel-invite"
              onSubmit={(e) => {
                e.preventDefault();
                if (!invitee) return;
                onInvite(current.id, invitee);
                setInvitee("");
              }}
            >
              <select value={invitee} onChange={(e) => setInvitee(e.target.value)} aria-label={t("channels.inviteLabel")}>
                <option value="">{t("channels.invitePick")}</option>
                {invitable.map((p) => (
                  <option key={p.id} value={p.id}>
                    {names.character(p.character)}
                  </option>
                ))}
              </select>
              <IconButton type="submit" icon="📨" label={t("channels.invite")} disabled={!invitee} />
            </form>
          )}
        </>
      ) : (
        <p className="sub channel-empty">{t("channels.empty")}</p>
      )}
      <form
        className="chat-input channel-create"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim() || atLimit) return;
          onCreate(name);
          setName("");
        }}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={24}
          placeholder={t("channels.namePlaceholder")}
          aria-label={t("channels.nameLabel")}
          disabled={atLimit}
        />
        <IconButton type="submit" src={TAB_ICONS.newChannel} label={t("channels.create")} disabled={atLimit || !name.trim()} />
      </form>
      <p className="sub">{t("channels.count", { used: view.privateChannels.length, limit: view.channelLimit })}</p>
    </>
  );
}
