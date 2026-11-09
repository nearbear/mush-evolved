// Right panel: the iTrackie. Tabs for the current room's log, global chat, the
// threads under it (Discord-style), and the feature threads (one at a time,
// picked from a drop-down), plus a collapsible for private channels. Chat input stays in the DOM regardless of
// renderer (CLAUDE.md).


import { Fragment, memo, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNames } from "../i18n/names.ts";
import { Tabs } from "@base-ui/react/tabs";
import { FEATURE_CHANNELS, ITRACKIE_ITEM, GRAVEYARD_CHANNEL, MUSH_CHANNEL, jsonEqual, type ChannelId, type LogLine, type FeatureChannel, type PlayerView, type SharedPlanetId, type SharedReportId, type ThreadId } from "@mush2/shared";
import { useReadSnapshot } from "../chatRead.ts";
import { unreadByTab, type TabId } from "./chatTabs.ts";
import { useAnnouncements } from "./useAnnouncements.ts";
import { FeatureSelect } from "./FeatureSelect.tsx";
import { Hint, IconTab } from "./IconButton.tsx";
import { TabOutline } from "./TabOutline.tsx";
import { CycleDivider } from "./CycleDivider.tsx";
import { FeedEntry, InfoMarker, WarningMarker } from "./FeedEntry.tsx";
import { VisibilityBadge } from "./VisibilityBadge.tsx";
import { PrivateChannels, type ChannelHandlers } from "./PrivateChannels.tsx";
import { Thread, type ThreadLinks } from "./Thread.tsx";
import { Threads, threadNameFrom } from "./Threads.tsx";
import { Tracker } from "./Tracker.tsx";
import { SharedPlanets } from "./SharedPlanets.tsx";
import { SharedReports } from "./SharedReports.tsx";
import { ResearchTracker } from "./ResearchTracker.tsx";
import { Scroller } from "./Scroller.tsx";
import { ExpeditionReportDialog } from "./ExpeditionReportDialog.tsx";
import { TAB_ICONS } from "../art/assets.ts";

export type { ChannelHandlers };

type Notes = Record<FeatureChannel, string[]>;
const NO_NOTES = Object.fromEntries(FEATURE_CHANNELS.map((f) => [f, []])) as unknown as Notes;

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
function useUnread(view: Pick<PlayerView, "readChannels" | "chatCounts">): Record<TabId, number> {
  const read = useReadSnapshot();
  return read ? unreadByTab(view, read) : NO_UNREAD;
}

/**
 * A log line's look: a warning (an alarm, or a secret line that leaked) in amber, a covert line that leaked in red
 * (covert actions are usually malicious; owner, 2026-11-05), and a line others didn't see muted. An Outcast's leaked
 * line has no warning level and keeps the plain look (owner, 2026-11-08); its badge still shows.
 */
function logRowClass(e: LogLine): string | undefined {
  if (e.level === "warning") return e.leaked && e.kind === "covert" ? "warning danger" : "warning";
  return e.visibleTo === "all" ? undefined : "private";
}

/**
 * One room log line, memoized by content: the log tab stays mounted, so every new view would otherwise redraw each
 * line and its time popover (web/CLAUDE.md "Render cost"). `onRead` must be stable (a state setter).
 */
const LogRow = memo(
  function LogRow({ entry: e, canRead, onRead }: { entry: LogLine; canRead: boolean; onRead: (report: string) => void }) {
    const { t } = useTranslation();
    const names = useNames();
    return (
      <FeedEntry
        marker={e.level === "warning" ? <WarningMarker /> : <InfoMarker />}
        at={e.at}
        badge={e.kind && <VisibilityBadge kind={e.kind} leaked={e.leaked === true} />}
        className={logRowClass(e)}
      >
        {names.logLine(e)}
        {canRead && (
          <button type="button" className="expedition-read" onClick={() => onRead(String(e.params?.report))}>
            {t("expedition.read")}
          </button>
        )}
      </FeedEntry>
    );
  },
  (a, b) => a.canRead === b.canRead && a.onRead === b.onRead && jsonEqual(a.entry, b.entry),
);

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
  onChat: (channel: ChannelId, text: string) => void;
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
  // The server sends this room's public history plus our private entries from
  // anywhere; the Room tab shows what belongs to the room we're standing in.
  const roomLog = view.log.filter((e) => e.room === undefined || e.room === here);
  const [feature, setFeature] = useState<FeatureChannel>("botany");
  // UI-only for now: lives in this tab and is lost on reload. Will become
  // private server-side state tied to the iTrackie.
  const [notes, setNotes] = useState<Notes>(NO_NOTES);
  // The Mush tab exists only for Mush (the server sends the channel to no one else) and pulses while it has unread.
  const mush = view.readChannels.includes(MUSH_CHANNEL);
  // The Graveyard tab is for the dead alone; the server sends the channel to no one else.
  const graveyard = view.readChannels.includes(GRAVEYARD_CHANNEL);
  // The dead have no room log and no private channels (#45): those tabs go, and they land on global chat.
  const alive = view.you.alive;
  const activeTab: TabId = !alive && (tab === "room" || tab === "private") ? "global" : (tab === "mush" && !mush) || (tab === "graveyard" && !graveyard) ? "room" : tab;
  const unread = useUnread(view);
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
    <div className="kit-panel itrackie">
      <ExpeditionReportDialog report={view.expeditions.find((r) => r.id === report)} onClose={() => setReport(null)} canShare={view.canShareReports} onShare={onShareReport} />
      <Tabs.Root className="itrackie-tabs-root" value={activeTab} onValueChange={(v) => setTab(v as TabId)}>
        <Tabs.List className="itrackie-tabs">
          {alive && <IconTab value="room" src={TAB_ICONS.roomLog} label={t("itrackie.tabs.room")} />}
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
          </div>

          {/* keepMounted: hidden with CSS, so chat drafts survive switching tabs. */}
          <Tabs.Panel className="itrackie-panel" value="room" aria-label={t(TAB_TITLES.room)} keepMounted>
            <Scroller items={roomLog.length}>
              {/* aria-live is off here: new entries are spoken by the announcer (announce.ts), so a hidden tab still announces and bursts are batched. */}
              <div role="log" aria-live="off" aria-label={t(TAB_TITLES.room)}>
              <ol className="feed">
                {roomLog.map((e, i) => (
                  <Fragment key={i}>
                    {roomLog[i - 1]?.cycle !== e.cycle && <CycleDivider cycle={e.cycle} />}
                    <LogRow entry={e} canRead={e.key === "expeditionReturned" && view.expeditions.some((r) => r.id === e.params?.report)} onRead={setReport} />
                  </Fragment>
                ))}
              </ol>
              </div>
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
              // Astrophysics lists the shared planets, each with its own thread, in place of the tracker notes (owner, 2026-10-31).
              if (f === "astrophysics") {
                return (
                  <div key={f} className="feature" hidden={f !== feature}>
                    <SharedPlanets view={view} picked={shownSharedPlanet} onPick={setSharedPlanet} showStale={showStale} onShowStale={setShowStale} onChat={onChat} onToggle={onToggle} />
                  </div>
                );
              }
              // Expeditions lists your reports and the shared ones, each with its own thread (owner, 2026-11-07, #356).
              if (f === "expeditions") {
                return (
                  <div key={f} className="feature" hidden={f !== feature}>
                    <SharedReports view={view} picked={shownSharedReport} onPick={setSharedReport} onRead={setReport} onChat={onChat} onToggle={onToggle} />
                  </div>
                );
              }
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
        <TabOutline />
      </Tabs.Root>
    </div>
  );
}

