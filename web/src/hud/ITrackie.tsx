// Right panel: the iTrackie. Tabs for the current room's log and global chat.
// Chat input stays in the DOM regardless of renderer (CLAUDE.md).

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ScrollArea } from "@base-ui/react/scroll-area";
import { Tabs } from "@base-ui/react/tabs";
import { MAX_CHAT_LENGTH, type PlayerView } from "@mush2/shared";
import { roomLabel } from "../scene/names.ts";

export function ITrackie({ view, onChat }: { view: PlayerView; onChat: (text: string) => void }) {
  const here = view.you.room;
  // The server sends this room's public history plus our private entries from
  // anywhere; the Room tab shows what belongs to the room we're standing in.
  const roomLog = view.log.filter((e) => e.room === undefined || e.room === here);

  return (
    <Tabs.Root className="panel itrackie" defaultValue="room">
      <Tabs.List className="itrackie-tabs">
        <Tabs.Tab className="itrackie-tab" value="room">
          Room log
        </Tabs.Tab>
        <Tabs.Tab className="itrackie-tab" value="global">
          Global chat
        </Tabs.Tab>
      </Tabs.List>

      <Tabs.Panel className="itrackie-panel" value="room">
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

      <Tabs.Panel className="itrackie-panel" value="global">
        <Scroller items={view.chat.length}>
          <ol className="feed">
            {view.chat.length === 0 && <li className="sub">No messages yet.</li>}
            {view.chat.map((m) => (
              <li key={m.id}>
                <strong className={m.from === view.you.id ? "me" : undefined}>{m.name}</strong>
                {m.isBot && <span className="tag">AI</span>}: {m.text}
              </li>
            ))}
          </ol>
        </Scroller>
        <ChatInput enabled={view.chatChannels.includes("global")} onSend={onChat} />
      </Tabs.Panel>
    </Tabs.Root>
  );
}

/**
 * Scroll area that sticks to the bottom when new items arrive, and again when
 * it becomes visible (a hidden panel on the phone layout can't scroll).
 */
function Scroller({ items, children }: { items: number; children: ReactNode }) {
  const viewport = useRef<HTMLDivElement>(null);
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

function ChatInput({ enabled, onSend }: { enabled: boolean; onSend: (text: string) => void }) {
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
        placeholder={enabled ? "Message everyone…" : "Chat unavailable"}
        disabled={!enabled}
        aria-label="Global chat message"
      />
      <button className="chat-send" type="submit" disabled={!enabled || !text.trim()} aria-label="Send" title="Send" />
    </form>
  );
}
