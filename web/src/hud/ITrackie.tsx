// Right panel: the iTrackie. Tabs for the current room's log, global chat, and
// the feature threads (one at a time, picked from a drop-down), plus a
// collapsible for private channels. Chat input stays in the DOM regardless of
// renderer (CLAUDE.md).

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ScrollArea } from "@base-ui/react/scroll-area";
import { Tabs } from "@base-ui/react/tabs";
import { FEATURE_CHANNELS, ITRACKIE_ITEM, MAX_CHAT_LENGTH, type ChannelId, type FeatureChannel, type PlayerView, type PrivateChannelId } from "@mush2/shared";
import { FeatureSelect } from "./FeatureSelect.tsx";
import { IconButton, IconTab } from "./IconButton.tsx";
import { TAB_ICONS } from "../art/assets.ts";
import { roomLabel } from "../scene/names.ts";


type Notes = Record<FeatureChannel, string[]>;
const NO_NOTES = Object.fromEntries(FEATURE_CHANNELS.map((f) => [f, []])) as unknown as Notes;

type TabId = "room" | "global" | "features" | "private";
const TAB_TITLES = {
  room: "itrackie.tabs.room",
  global: "itrackie.tabs.global",
  features: "itrackie.tabs.features",
  private: "channels.tab",
} as const;

export interface ChannelHandlers {
  onCreate: (name: string) => void;
  onInvite: (channel: PrivateChannelId, player: string) => void;
  onLeave: (channel: PrivateChannelId) => void;
}

export function ITrackie({
  view,
  onChat,
  channels,
}: {
  view: PlayerView;
  onChat: (channel: ChannelId, text: string) => void;
  channels: ChannelHandlers;
}) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<TabId>("room");
  const here = view.you.room;
  // The server sends this room's public history plus our private entries from
  // anywhere; the Room tab shows what belongs to the room we're standing in.
  const roomLog = view.log.filter((e) => e.room === undefined || e.room === here);
  const [feature, setFeature] = useState<FeatureChannel>("botany");
  // UI-only for now: lives in this tab and is lost on reload. Will become
  // private server-side state tied to the iTrackie.
  const [notes, setNotes] = useState<Notes>(NO_NOTES);
  const carrying = view.inventory.some((i) => i.type === ITRACKIE_ITEM);

  return (
    <div className="panel itrackie">
      <Tabs.Root className="itrackie-tabs-root" value={tab} onValueChange={(v) => setTab(v as TabId)}>
        <Tabs.List className="itrackie-tabs">
          <IconTab value="room" src={TAB_ICONS.roomLog} label={t("itrackie.tabs.room")} />
          <IconTab value="global" src={TAB_ICONS.global} label={t("itrackie.tabs.global")} />
          <IconTab value="features" src={TAB_ICONS.features} label={t("itrackie.tabs.features")} />
          <IconTab value="private" src={TAB_ICONS.private} label={t("channels.tab")} />
        </Tabs.List>
        <div className="itrackie-card">
          <h2 className="itrackie-title">{t(TAB_TITLES[tab])}</h2>

          {/* keepMounted: hidden with CSS, so chat drafts survive switching tabs. */}
          <Tabs.Panel className="itrackie-panel" value="room" keepMounted>
            <div className="sub itrackie-caption">{roomLabel(here)}</div>
            <Scroller items={roomLog.length}>
              <ol className="feed">
                {roomLog.map((e, i) => (
                  <li key={i} className={e.visibleTo === "all" ? undefined : "private"}>
                    <span className="sub">[{e.cycle}]</span> {e.text}
                  </li>
                ))}
              </ol>
            </Scroller>
          </Tabs.Panel>

          <Tabs.Panel className="itrackie-panel" value="global" keepMounted>
            <Thread view={view} channel="global" placeholder="Message everyone…" onSend={(text) => onChat("global", text)} />
          </Tabs.Panel>

          <Tabs.Panel className="itrackie-panel" value="features" keepMounted>
            <FeatureSelect value={feature} onChange={setFeature} />
            {/* One block per feature, hidden with CSS, so each keeps its own draft. */}
            {FEATURE_CHANNELS.map((f) => {
              const name = t(`itrackie.features.${f}`);
              return (
              <div key={f} className="feature" hidden={f !== feature}>
                {carrying ? (
                  <Tracker notes={notes[f]} onChange={(next) => setNotes((all) => ({ ...all, [f]: next }))} />
                ) : (
                  <p className="sub">You need an iTrackie in your inventory to track anything.</p>
                )}
                <Thread
                  view={view}
                  channel={f}
                  placeholder={`Message the ${name} thread…`}
                  onSend={(text) => onChat(f, text)}
                />
              </div>
              );
            })}
          </Tabs.Panel>

          <Tabs.Panel className="itrackie-panel" value="private" keepMounted>
            <PrivateChannels view={view} onChat={onChat} {...channels} />
          </Tabs.Panel>
        </div>
      </Tabs.Root>
    </div>
  );
}

/** A chat channel: its messages, then an input. Read and post access come from the server. */
function Thread({
  view,
  channel,
  placeholder,
  onSend,
}: {
  view: PlayerView;
  channel: ChannelId;
  placeholder: string;
  onSend: (text: string) => void;
}) {
  const enabled = view.chatChannels.includes(channel);
  const messages = view.chat.filter((m) => m.channel === channel);
  return (
    <>
      <Scroller items={messages.length}>
        <ol className="feed">
          {!enabled && <li className="sub">You need an iTrackie in your inventory to read this.</li>}
          {enabled && messages.length === 0 && <li className="sub">No messages yet.</li>}
          {messages.map((m) => (
            <li key={m.id}>
              <strong className={m.from === view.you.id ? "me" : undefined}>{m.name}</strong>
              {m.isBot && <span className="tag">AI</span>}: {m.text}
            </li>
          ))}
        </ol>
      </Scroller>
      <ChatInput enabled={enabled} placeholder={placeholder} onSend={onSend} />
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

function ChatInput({ enabled, placeholder, onSend }: { enabled: boolean; placeholder: string; onSend: (text: string) => void }) {
  const [text, setText] = useState("");
  return (
    <form
      className="chat-input"
      onSubmit={(e) => {
        e.preventDefault();
        if (!text.trim()) return;
        onSend(text);
        setText("");
      }}
    >
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={MAX_CHAT_LENGTH}
        placeholder={enabled ? placeholder : "Needs an iTrackie"}
        disabled={!enabled}
        aria-label="Chat message"
      />
      <button className="chat-send" type="submit" disabled={!enabled || !text.trim()} aria-label="Send" title="Send" />
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
  onCreate,
  onInvite,
  onLeave,
}: { view: PlayerView; onChat: (channel: ChannelId, text: string) => void } & ChannelHandlers) {
  const { t, i18n } = useTranslation();
  const [picked, setPicked] = useState<PrivateChannelId | "">("");
  const [name, setName] = useState("");
  const [invitee, setInvitee] = useState("");
  // Falls back to the first channel when none is picked or the picked one is gone (left, or deleted).
  const current = view.privateChannels.find((c) => c.id === picked) ?? view.privateChannels[0];
  const nameOf = (id: string) => (id === view.you.id ? view.you.name : (view.players.find((p) => p.id === id)?.name ?? id));
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
                    {p.name}
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
