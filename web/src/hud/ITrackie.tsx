// Right panel: the iTrackie. Tabs for the current room's log, global chat, and
// the feature threads (one at a time, picked from a drop-down), plus a
// collapsible for private channels. Chat input stays in the DOM regardless of
// renderer (CLAUDE.md).

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Collapsible } from "@base-ui/react/collapsible";
import { ScrollArea } from "@base-ui/react/scroll-area";
import { Tabs } from "@base-ui/react/tabs";
import { FEATURE_CHANNELS, ITRACKIE_ITEM, MAX_CHAT_LENGTH, type ChatChannel, type FeatureChannel, type PlayerView } from "@mush2/shared";
import { roomLabel } from "../scene/names.ts";

const FEATURE_LABELS: Record<FeatureChannel, string> = {
  botany: "Botany",
  research: "Research",
  inventory: "Inventory",
  space_battle: "Space battle",
  comms: "Comms center",
  pilgred: "Pilgred repair",
  neron: "NERON projects",
};

type Notes = Record<FeatureChannel, string[]>;
const NO_NOTES = Object.fromEntries(FEATURE_CHANNELS.map((f) => [f, []])) as unknown as Notes;

export function ITrackie({ view, onChat }: { view: PlayerView; onChat: (channel: ChatChannel, text: string) => void }) {
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
      <Tabs.Root className="itrackie-tabs-root" defaultValue="room">
        <Tabs.List className="itrackie-tabs">
          <Tabs.Tab className="itrackie-tab" value="room">
            Room log
          </Tabs.Tab>
          <Tabs.Tab className="itrackie-tab" value="global">
            Global chat
          </Tabs.Tab>
          <Tabs.Tab className="itrackie-tab" value="features">
            Features
          </Tabs.Tab>
        </Tabs.List>

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
          <select
            className="feature-select"
            value={feature}
            onChange={(e) => setFeature(e.target.value as FeatureChannel)}
            aria-label="Feature"
          >
            {FEATURE_CHANNELS.map((f) => (
              <option key={f} value={f}>
                {FEATURE_LABELS[f]}
              </option>
            ))}
          </select>
          {/* One block per feature, hidden with CSS, so each keeps its own draft. */}
          {FEATURE_CHANNELS.map((f) => (
            <div key={f} className="feature" hidden={f !== feature}>
              {carrying ? (
                <Tracker notes={notes[f]} onChange={(next) => setNotes((all) => ({ ...all, [f]: next }))} />
              ) : (
                <p className="sub">You need an iTrackie in your inventory to track anything.</p>
              )}
              <Thread
                view={view}
                channel={f}
                placeholder={`Message the ${FEATURE_LABELS[f]} thread…`}
                onSend={(text) => onChat(f, text)}
              />
            </div>
          ))}
        </Tabs.Panel>
      </Tabs.Root>

      <Collapsible.Root className="private-channels">
        <Collapsible.Trigger className="private-channels-toggle">Private channels</Collapsible.Trigger>
        <Collapsible.Panel className="private-channels-panel">
          <p className="sub">Coming soon: private chats you can create, invite to, and leave.</p>
        </Collapsible.Panel>
      </Collapsible.Root>
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
  channel: ChatChannel;
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
