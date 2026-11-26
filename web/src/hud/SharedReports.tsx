// The Expeditions feature (owner, 2026-11-07, #356): your own reports, to read and share from anywhere; then the
// feature's general thread and one row per shared report, listed like the shared planets (SharedPlanets.tsx). Picking
// one shows its first shared text above its own thread, where later shares are appended. Never marked stale.

import { useTranslation } from "react-i18next";
import type { ChannelId, PlayerView, SharedReport, SharedReportId } from "@mush2/shared";
import { useNames } from "../i18n/names.ts";
import { Thread } from "./Thread.tsx";
import { UnreadChip } from "./UnreadChip.tsx";

export function SharedReports({
  view,
  active = true,
  picked,
  onPick,
  onRead,
  onChat,
  onToggle,
}: {
  view: PlayerView;
  /** This feature is on screen: the thread picked places its "New messages" divider (#400). */
  active?: boolean;
  /** The shared report on screen, or null for the general thread. Kept by the iTrackie, which announces it. */
  picked: SharedReportId | null;
  onPick: (id: SharedReportId | null) => void;
  /** Opens one of your reports (`view.expeditions`), where it can be shared. */
  onRead: (report: string) => void;
  onChat: (channel: ChannelId, text: string, as?: string) => void;
  onToggle: (channel: ChannelId, seq: number, line: number) => void;
}) {
  const { t } = useTranslation();
  const names = useNames();
  const general = t("itrackie.sharedPlanets.general");
  const name = t("itrackie.features.expeditions");
  // Newest first.
  const listed = [...view.sharedReports].reverse();
  const mine = [...view.expeditions].reverse();
  const author = (id: string) => names.character((id === view.you.id ? view.you : view.players.find((p) => p.id === id))?.character ?? id);
  const byLine = (e: SharedReport) => t("itrackie.sharedPlanets.by", { name: author(e.by), day: e.day, cycle: e.cycleOfDay });
  const firstLine = (e: SharedReport) => e.text.split("\n", 1)[0]!;

  return (
    <>
      {mine.length > 0 && (
        <div className="shared-planets">
          <p className="sub">{t("itrackie.sharedReports.mine")}</p>
          <ul className="channel-slots shared-planet-rows" aria-label={t("itrackie.sharedReports.mine")}>
            {mine.map((r) => (
              <li key={r.id} className="channel-slot">
                <button type="button" className="channel-slot-pick shared-planet-pick" onClick={() => onRead(r.id)}>
                  <span className="shared-planet-name">{t("expedition.title", { planet: r.planet })}</span>
                  {r.shared && <span className="shared-planet-stale">{t("itrackie.sharedReports.isShared")}</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {view.sharedReports.length > 0 && (
        <div className="shared-planets">
          <ul className="channel-slots shared-planet-rows" aria-label={t("itrackie.sharedReports.list")}>
            <li className="channel-slot">
              <button type="button" className="channel-slot-pick" aria-pressed={picked === null} onClick={() => onPick(null)}>
                {general}
                <UnreadChip channel="expeditions" total={view.chatCounts.expeditions ?? 0} unheard={view.chatUnheard?.expeditions} />
              </button>
            </li>
            {listed.map((e) => (
              <li key={e.id} className="channel-slot">
                <button type="button" className="channel-slot-pick shared-planet-pick" aria-pressed={e.id === picked} onClick={() => onPick(e.id)}>
                  {/* The first line only, to fit a row; who shared it and when head its thread. */}
                  <span className="shared-planet-name">{firstLine(e)}</span>
                  <UnreadChip channel={e.id} total={view.chatCounts[e.id] ?? 0} unheard={view.chatUnheard?.[e.id]} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {/* One block per thread, hidden with CSS, so each keeps its own draft. */}
      <div className="feature" hidden={picked !== null}>
        <Thread view={view} channel="expeditions" placeholder={t("itrackie.featurePlaceholder", { name })} onSend={(text, as) => onChat("expeditions", text, as)} onToggle={onToggle} active={active && picked === null} />
      </div>
      {view.sharedReports.map((e) => (
        <div key={e.id} className="feature" hidden={e.id !== picked}>
          <Thread
            view={view}
            channel={e.id}
            placeholder={t("itrackie.sharedReports.placeholder")}
            onSend={(text, as) => onChat(e.id, text, as)}
            onToggle={onToggle}
            active={active && e.id === picked}
            headKey={[e, byLine(e)]}
            head={
              // Plain text, never markdown: it is shown as the player wrote it.
              <li className="thread-head shared-planet-text">
                <p className="sub">{byLine(e)}</p>
                <p>{e.text}</p>
              </li>
            }
          />
        </div>
      ))}
    </>
  );
}
