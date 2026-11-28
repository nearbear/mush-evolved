// Right panel: the iTrackie. Tabs for the current room's log, global chat, the
// threads under it (Discord-style), and the feature threads (one at a time,
// picked from a drop-down), plus a collapsible for private channels. Chat input stays in the DOM regardless of
// renderer (CLAUDE.md).


import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNames } from "../i18n/names.ts";
import { Tabs } from "@base-ui/react/tabs";
import { blurredVision, FEATURE_CHANNELS, ITRACKIE_ITEM, GRAVEYARD_CHANNEL, MUSH_CHANNEL, type ChannelId, type FeatureChannel, type PlayerView, type SharedPlanetId, type SharedReportId, type ThreadId } from "@mush2/shared";
import { useChatReadStore, useReadSnapshot } from "../chatRead.ts";
import { readAllOn, unreadByFeature, unreadByTab, type TabId } from "./chatTabs.ts";
import { MarkAllContext } from "./unreadDivider.ts";
import { useAnnouncements } from "./useAnnouncements.ts";
import { FeatureSelect } from "./FeatureSelect.tsx";
import { loadFeatureTab, saveFeatureTab } from "../featureTab.ts";
import { Hint, IconTab } from "./IconButton.tsx";
import { TabOutline } from "./TabOutline.tsx";
import { RoomLog } from "./RoomLog.tsx";
import { unreadPositions, useLogRead, useLogReadStore } from "../logRead.ts";
import { PrivateChannels, type ChannelHandlers } from "./PrivateChannels.tsx";
import { Thread, type ThreadLinks } from "./Thread.tsx";
import { Threads, threadNameFrom } from "./Threads.tsx";
import { SharedPlanets } from "./SharedPlanets.tsx";
import { SharedPlantsCard } from "./SharedPlantsCard.tsx";
import { SharedPilgredCard } from "./SharedPilgredCard.tsx";
import { SharedReports } from "./SharedReports.tsx";
import { ResearchTracker } from "./ResearchTracker.tsx";
import { ProjectTracker } from "./ProjectTracker.tsx";
import { ExpeditionReportDialog } from "./ExpeditionReportDialog.tsx";
import { TAB_ICONS } from "../art/assets.ts";

export type { ChannelHandlers };


const NO_UNREAD: Record<TabId, number> = { room: 0, global: 0, threads: 0, features: 0, private: 0, mush: 0, graveyard: 0 };

const TAB_TITLES = {
  room: "itrackie.tabs.room",
  global: "itrackie.tabs.global",
  threads: "itrackie.tabs.threads",
  features: "itrackie.tabs.features",
  private: "channels.tab",
  mush: "itrackie.tabs.mush",
  graveyard: "itrackie.tabs.graveyard",
} as const;

/**
 * Unread messages on each tab (#400): each readable channel's count less the count read, summed by tab. The active tab
 * counts too (owner, 2026-11-08). With no read store (a replay, the design kit), nothing is unread.
 */
function useUnread(view: Pick<PlayerView, "readChannels" | "chatCounts" | "chatUnheard">): { tabs: Record<TabId, number>; features: Partial<Record<FeatureChannel, number>> } {
  const read = useReadSnapshot();
  return read ? { tabs: unreadByTab(view, read), features: unreadByFeature(view, read) } : { tabs: NO_UNREAD, features: {} };
}

/**
 * Your own messages are never unread (#513): each one in the view goes into the read store, wherever it was posted
 * from (another device's posts too), so it neither shows the unread icon nor counts in a badge. Posting reads nothing
 * else.
 */
function useOwnMessagesRead(view: Pick<PlayerView, "chat" | "chatCounts" | "chatUnheard" | "you">) {
  const store = useChatReadStore();
  const me = view.you.id;
  useEffect(() => {
    if (!store) return;
    const own = new Map<ChannelId, number[]>();
    for (const m of view.chat) {
      if (m.system || m.from !== me || m.seq < store.read(m.channel)) continue;
      own.set(m.channel, [...(own.get(m.channel) ?? []), m.seq]);
    }
    for (const [channel, seqs] of own) store.markSeqs(channel, seqs, view.chatCounts[channel] ?? 0, view.chatUnheard?.[channel]);
  }, [store, view.chat, view.chatCounts, view.chatUnheard, me]);
}

export function ITrackie({
  view,
  onChat,
  onCreateThread,
  onToggle,
  onShareReport,
  channels,
  roomLogRequest,
  quiet = false,
}: {
  /** Nothing new is read out (a replay: stepping through frames isn't news). */
  quiet?: boolean;
  view: PlayerView;
  /** Bumped each time the player acts; switches to the Room tab to show the result. */
  roomLogRequest: number;
  onChat: (channel: ChannelId, text: string, as?: string) => void;
  /** Start a thread under global chat, from global message `from` or on its own. */
  onCreateThread: (name: string, from?: number) => void;
  /** Tick or untick a checkbox in one of your own messages (`line` is 0-based). */
  onToggle: (channel: ChannelId, seq: number, line: number) => void;
  /** Share one of your expedition reports in the Expeditions feature. Absent in a read-only view (a replay). */
  onShareReport?: ((report: string, text: string) => void) | undefined;
  /** Absent in a read-only view (a replay): no leaving, inviting or creating private channels. */
  channels?: ChannelHandlers | undefined;
}) {
  const { t } = useTranslation();
  const names = useNames();
  const [tab, setTab] = useState<TabId>("room");
  useEffect(() => {
    if (roomLogRequest > 0) setTab("room");
  }, [roomLogRequest]);
  const here = view.you.room;
  const [feature, setFeatureState] = useState<FeatureChannel>(loadFeatureTab);
  const setFeature = (f: FeatureChannel) => {
    setFeatureState(f);
    saveFeatureTab(f);
  };
  // The Mush tab exists only for Mush (the server sends the channel to no one else) and pulses while it has unread.
  const mush = view.readChannels.includes(MUSH_CHANNEL);
  // The Graveyard tab is for the dead alone; the server sends the channel to no one else.
  const graveyard = view.readChannels.includes(GRAVEYARD_CHANNEL);
  // The dead have no room log and no private channels (#45): those tabs go, and they land on global chat.
  const alive = view.you.alive;
  const activeTab: TabId = !alive && (tab === "room" || tab === "private") ? "global" : (tab === "mush" && !mush) || (tab === "graveyard" && !graveyard) ? "room" : tab;
  const { tabs: chatUnread, features: featureUnread } = useUnread(view);
  useOwnMessagesRead(view);
  // The Room tab counts the room log's unread lines (#513), the other tabs their chat.
  const logRead = useLogRead();
  const unread: Record<TabId, number> = { ...chatUnread, room: unreadPositions(view, logRead).length };
  const readStore = useChatReadStore();
  const logStore = useLogReadStore();
  // Mark all read (#400): every channel read on the active tab, so a grouped tab (threads, features with their shared
  // planets and reports, private channels) marks them all; on the Room tab, every room log line (#513). Each bump drops
  // every feed's "New messages" divider (`MarkAllContext`).
  const [markedAll, setMarkedAll] = useState(0);
  const markAllRead = () => {
    if (activeTab === "room") logStore?.markAll();
    else readStore?.markAll(readAllOn(view, activeTab));
    setMarkedAll((n) => n + 1);
  };
  const tabLabel = (tab: TabId, name: string) => (unread[tab] ? t("itrackie.unreadTab", { name, count: unread[tab] }) : name);
  const carrying = view.inventory.some((i) => i.type === ITRACKIE_ITEM);
  // Threads tab: the open thread (null for the list), and the new-thread form's
  // name and starter message. Kept here so a message in global chat can fill them.
  const [openThread, setOpenThread] = useState<ThreadId | null>(null);
  const [threadName, setThreadName] = useState("");
  const [starter, setStarter] = useState<number | null>(null);
  const shownThread = view.threads.find((th) => th.id === openThread);
  // Astrophysics: the shared planet picked (null for the feature's general thread), and whether the list shows the
  // entries no longer applicable (client-only, off by default). A hidden entry falls back to the general thread.
  const [sharedPlanet, setSharedPlanet] = useState<SharedPlanetId | null>(null);
  const [showStale, setShowStale] = useState(false);
  // Expeditions: the shared report picked (null for the feature's general thread).
  const [sharedReport, setSharedReport] = useState<SharedReportId | null>(null);
  const shownSharedReport = view.sharedReports.find((e) => e.id === sharedReport)?.id ?? null;
  // The expedition report open from the room log or the Expeditions feature, by id (`view.expeditions`).
  const [report, setReport] = useState<string | null>(null);
  const shownSharedPlanet = view.sharedPlanets.find((e) => e.id === sharedPlanet && (showStale || !e.stale))?.id ?? null;
  const threadLinks: ThreadLinks = {
    open: (id) => {
      setOpenThread(id);
      setTab("threads");
    },
    start: (m) => {
      setStarter(m.seq);
      setThreadName(threadNameFrom(m.text));
      setOpenThread(null);
      setTab("threads");
    },
  };

  // The channel on screen, whose messages are announced in full.
  const reading: ChannelId | null =
    activeTab === "global" || activeTab === "mush" || activeTab === "graveyard" ? activeTab : activeTab === "features" ? (feature === "astrophysics" && shownSharedPlanet) || (feature === "expeditions" && shownSharedReport) || feature : activeTab === "threads" ? shownThread?.id ?? null : null;
  useAnnouncements(view, reading, quiet);

  return (
    <MarkAllContext.Provider value={markedAll}>
    <div className={blurredVision(view) ? "hud-card itrackie blurred-vision" : "hud-card itrackie"}>
      <ExpeditionReportDialog report={view.expeditions.find((r) => r.id === report)} onClose={() => setReport(null)} canShare={view.canShareReports} onShare={onShareReport} />
      <Tabs.Root className="itrackie-tabs-root" value={activeTab} onValueChange={(v) => setTab(v as TabId)}>
        <Tabs.List className="itrackie-tabs">
          {alive && <IconTab value="room" src={TAB_ICONS.roomLog} label={tabLabel("room", t("itrackie.tabs.room"))} badge={unread.room} />}
          <IconTab value="global" src={TAB_ICONS.global} label={tabLabel("global", t("itrackie.tabs.global"))} badge={unread.global} />
          <IconTab value="threads" src={TAB_ICONS.threads} label={tabLabel("threads", t("itrackie.tabs.threads"))} badge={unread.threads} />
          <IconTab value="features" src={TAB_ICONS.features} label={tabLabel("features", t("itrackie.tabs.features"))} badge={unread.features} />
          {alive && <IconTab value="private" src={TAB_ICONS.private} label={tabLabel("private", t("channels.tab"))} badge={unread.private} />}
          {mush && (
            <IconTab
              value="mush"
              src={TAB_ICONS.mushChat}
              label={tabLabel("mush", t("itrackie.tabs.mush"))}
              badge={unread.mush}
              className={`mush-tab${unread.mush > 0 ? " unread" : ""}`}
            />
          )}
          {graveyard && <IconTab value="graveyard" src={TAB_ICONS.graveyard} label={tabLabel("graveyard", t("itrackie.tabs.graveyard"))} badge={unread.graveyard} />}
        </Tabs.List>
        <div className="cut-card itrackie-card">
          {/* An open thread is titled by its own name (the tab already says Threads), with the way back to the list beside it. */}
          <div className="itrackie-title-row">
            <h2 className="itrackie-title">
              {activeTab === "threads" && shownThread ? shownThread.name : t(TAB_TITLES[activeTab])}
              {activeTab === "room" && ` – ${names.room(here)}`}
            </h2>
            {activeTab === "threads" && shownThread && (
              <Hint label={t("itrackie.threads.back")}>
                <button type="button" className="thread-back" aria-label={t("itrackie.threads.back")} onClick={() => setOpenThread(null)}>
                  ←
                </button>
              </Hint>
            )}
            {(activeTab === "room" ? logStore : readStore) && unread[activeTab] > 0 && (
              <button type="button" className="mark-read" aria-label={t("itrackie.markReadIn", { name: t(TAB_TITLES[activeTab]) })} onClick={markAllRead}>
                {t("itrackie.markRead")}
              </button>
            )}
          </div>

          {/* keepMounted: hidden with CSS, so chat drafts survive switching tabs. */}
          <Tabs.Panel className="itrackie-panel" value="room" aria-label={t(TAB_TITLES.room)} keepMounted>
            <RoomLog view={view} active={activeTab === "room"} onRead={setReport} />
          </Tabs.Panel>

          <Tabs.Panel className="itrackie-panel" value="global" aria-label={t(TAB_TITLES.global)} keepMounted>
            <Thread view={view} channel="global" placeholder={t("itrackie.globalPlaceholder")} onSend={(text, as) => onChat("global", text, as)} onToggle={onToggle} threadLinks={threadLinks} active={activeTab === "global"} />
          </Tabs.Panel>

          <Tabs.Panel className="itrackie-panel" value="threads" aria-label={t(TAB_TITLES.threads)} keepMounted>
            <Threads
              view={view}
              active={activeTab === "threads"}
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
            <FeatureSelect value={feature} onChange={setFeature} unread={featureUnread} />
            {/* One block per feature, hidden with CSS, so each keeps its own draft. */}
            {FEATURE_CHANNELS.map((f) => {
              const name = t(`itrackie.features.${f}`);
              // Astrophysics lists the shared planets, each with its own thread, as its tracker (owner, 2026-10-31).
              if (f === "astrophysics") {
                return (
                  <div key={f} className="feature" hidden={f !== feature}>
                    <SharedPlanets view={view} active={activeTab === "features" && feature === f} picked={shownSharedPlanet} onPick={setSharedPlanet} showStale={showStale} onShowStale={setShowStale} onChat={onChat} onToggle={onToggle} />
                  </div>
                );
              }
              // Expeditions lists your reports and the shared ones, each with its own thread (owner, 2026-11-07, #356).
              if (f === "expeditions") {
                return (
                  <div key={f} className="feature" hidden={f !== feature}>
                    <SharedReports view={view} active={activeTab === "features" && feature === f} picked={shownSharedReport} onPick={setSharedReport} onRead={setReport} onChat={onChat} onToggle={onToggle} />
                  </div>
                );
              }
              return (
              <div key={f} className="feature" hidden={f !== feature}>
                {f === "botany" && view.sharedPlants ? (
                  <SharedPlantsCard shared={view.sharedPlants} view={view} />
                ) : f === "pilgred" && view.sharedPilgred ? (
                  <SharedPilgredCard shared={view.sharedPilgred} view={view} />
                ) : !alive || (f !== "research" && f !== "neron") ? null : !carrying ? (
                  // Every feature will get its own tracker; the ones without one yet show none (owner, 2026-11-22).
                  <p className="sub">{t("itrackie.needITrackieTrack")}</p>
                ) : f === "research" ? (
                  <ResearchTracker view={view} />
                ) : (
                  <ProjectTracker view={view} />
                )}
                <Thread
                  view={view}
                  channel={f}
                  placeholder={t("itrackie.featurePlaceholder", { name })}
                  onSend={(text, as) => onChat(f, text, as)}
                  onToggle={onToggle}
                  active={activeTab === "features" && feature === f}
                />
              </div>
              );
            })}
          </Tabs.Panel>

          {mush && (
            <Tabs.Panel className="itrackie-panel" value="mush" aria-label={t(TAB_TITLES.mush)} keepMounted>
              <Thread view={view} channel={MUSH_CHANNEL} placeholder={t("itrackie.mushPlaceholder")} onSend={(text, as) => onChat(MUSH_CHANNEL, text, as)} onToggle={onToggle} active={activeTab === "mush"} />
            </Tabs.Panel>
          )}

          {graveyard && (
            <Tabs.Panel className="itrackie-panel" value="graveyard" aria-label={t(TAB_TITLES.graveyard)} keepMounted>
              <Thread view={view} channel={GRAVEYARD_CHANNEL} placeholder={t("itrackie.graveyardPlaceholder")} onSend={(text, as) => onChat(GRAVEYARD_CHANNEL, text, as)} onToggle={onToggle} active={activeTab === "graveyard"} />
            </Tabs.Panel>
          )}

          <Tabs.Panel className="itrackie-panel" value="private" aria-label={t(TAB_TITLES.private)} keepMounted>
            <PrivateChannels view={view} active={activeTab === "private"} onChat={onChat} onToggle={onToggle} {...channels} />
          </Tabs.Panel>
        </div>
        <TabOutline />
      </Tabs.Root>
    </div>
    </MarkAllContext.Provider>
  );
}

