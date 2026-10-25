// Right panel: the iTrackie. Tabs for the current room's log, global chat, the
// threads under it (Discord-style), and the feature threads (one at a time,
// picked from a drop-down), plus a collapsible for private channels. Chat input stays in the DOM regardless of
// renderer (CLAUDE.md).


import { Fragment, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNames } from "../i18n/names.ts";
import { Tabs } from "@base-ui/react/tabs";
import { FEATURE_CHANNELS, ITRACKIE_ITEM, GRAVEYARD_CHANNEL, MUSH_CHANNEL, type ChannelId, type FeatureChannel, type PlayerView, type ThreadId } from "@mush2/shared";
import { FeatureSelect } from "./FeatureSelect.tsx";
import { IconTab } from "./IconButton.tsx";
import { CycleDivider } from "./CycleDivider.tsx";
import { FeedEntry, InfoMarker, WarningMarker } from "./FeedEntry.tsx";
import { PrivateChannels, type ChannelHandlers } from "./PrivateChannels.tsx";
import { Thread, type ThreadLinks } from "./Thread.tsx";
import { Threads, threadNameFrom } from "./Threads.tsx";
import { Tracker } from "./Tracker.tsx";
import { ResearchTracker } from "./ResearchTracker.tsx";
import { Scroller } from "./Scroller.tsx";
import { TAB_ICONS } from "../art/assets.ts";

export type { ChannelHandlers };

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
          <Tabs.Panel className="itrackie-panel" value="room" aria-label={t(TAB_TITLES.room)} keepMounted>
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

          <Tabs.Panel className="itrackie-panel" value="global" aria-label={t(TAB_TITLES.global)} keepMounted>
            <Thread view={view} channel="global" placeholder={t("itrackie.globalPlaceholder")} onSend={(text) => onChat("global", text)} onToggle={onToggle} threadLinks={threadLinks} />
          </Tabs.Panel>

          <Tabs.Panel className="itrackie-panel" value="threads" aria-label={t(TAB_TITLES.threads)} keepMounted>
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

          <Tabs.Panel className="itrackie-panel" value="features" aria-label={t(TAB_TITLES.features)} keepMounted>
            <FeatureSelect value={feature} onChange={setFeature} />
            {/* One block per feature, hidden with CSS, so each keeps its own draft. */}
            {FEATURE_CHANNELS.map((f) => {
              const name = t(`itrackie.features.${f}`);
              return (
              <div key={f} className="feature" hidden={f !== feature}>
                {!alive ? null : !carrying ? (
                  <p className="sub">{t("itrackie.needITrackieTrack")}</p>
                ) : f === "research" ? (
                  <ResearchTracker view={view} />
                ) : (
                  <Tracker notes={notes[f]} onChange={(next) => setNotes((all) => ({ ...all, [f]: next }))} />
                )}
                <Thread
                  view={view}
                  channel={f}
                  placeholder={t("itrackie.featurePlaceholder", { name })}
                  onSend={(text) => onChat(f, text)}
                  onToggle={onToggle}
                />
              </div>
              );
            })}
          </Tabs.Panel>

          {mush && (
            <Tabs.Panel className="itrackie-panel" value="mush" aria-label={t(TAB_TITLES.mush)} keepMounted>
              <Thread view={view} channel={MUSH_CHANNEL} placeholder={t("itrackie.mushPlaceholder")} onSend={(text) => onChat(MUSH_CHANNEL, text)} onToggle={onToggle} />
            </Tabs.Panel>
          )}

          {graveyard && (
            <Tabs.Panel className="itrackie-panel" value="graveyard" aria-label={t(TAB_TITLES.graveyard)} keepMounted>
              <Thread view={view} channel={GRAVEYARD_CHANNEL} placeholder={t("itrackie.graveyardPlaceholder")} onSend={(text) => onChat(GRAVEYARD_CHANNEL, text)} onToggle={onToggle} />
            </Tabs.Panel>
          )}

          <Tabs.Panel className="itrackie-panel" value="private" aria-label={t(TAB_TITLES.private)} keepMounted>
            <PrivateChannels view={view} onChat={onChat} onToggle={onToggle} {...channels} />
          </Tabs.Panel>
        </div>
      </Tabs.Root>
    </div>
  );
}

