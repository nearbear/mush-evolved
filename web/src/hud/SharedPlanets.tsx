// The Astrophysics feature (owner, 2026-10-31): the feature's general thread, then one row per shared planet, listed
// like private channels, by the planet's name. Picking a planet shows its sector slots as icons and its shared text
// above its own discussion thread (owner, 2026-11-19, docs/plans/expedition-ui.md). Entries no longer applicable (the
// planet was lost) are hidden unless the player asks to see them.

import { useTranslation } from "react-i18next";
import type { ChannelId, PlayerView, SharedPlanet, SharedPlanetId } from "@mush2/shared";
import { useNames } from "../i18n/names.ts";
import { SharedSectors } from "./SharedSectors.tsx";
import { Thread } from "./Thread.tsx";
import { UnreadChip } from "./UnreadChip.tsx";

export function SharedPlanets({
  view,
  active = true,
  picked,
  onPick,
  showStale,
  onShowStale,
  onChat,
  onToggle,
}: {
  view: PlayerView;
  /** This feature is on screen: the thread picked places its "New messages" divider (#400). */
  active?: boolean;
  /**
   * The shared planet on screen (never a hidden one), or null for the general thread. Kept by the iTrackie, with
   * `showStale`, because it announces the thread on screen.
   */
  picked: SharedPlanetId | null;
  onPick: (id: SharedPlanetId | null) => void;
  /** Whether the list shows the entries no longer applicable (client-only, off by default). */
  showStale: boolean;
  onShowStale: (show: boolean) => void;
  onChat: (channel: ChannelId, text: string) => void;
  onToggle: (channel: ChannelId, seq: number, line: number) => void;
}) {
  const { t } = useTranslation();
  const names = useNames();
  const general = t("itrackie.sharedPlanets.general");
  const name = t("itrackie.features.astrophysics");
  // Newest first.
  const listed = [...view.sharedPlanets].reverse().filter((e) => showStale || !e.stale);
  const current = picked;
  const anyStale = view.sharedPlanets.some((e) => e.stale);
  const author = (id: string) => names.character((id === view.you.id ? view.you : view.players.find((p) => p.id === id))?.character ?? id);
  const byLine = (e: SharedPlanet) => t("itrackie.sharedPlanets.by", { name: author(e.by), day: e.day, cycle: e.cycleOfDay });

  return (
    <>
      {view.sharedPlanets.length > 0 && (
        <div className="shared-planets">
          <ul className="channel-slots shared-planet-rows" aria-label={t("itrackie.sharedPlanets.list")}>
            <li className="channel-slot">
              <button type="button" className="channel-slot-pick" aria-pressed={current === null} onClick={() => onPick(null)}>
                {general}
                <UnreadChip channel="astrophysics" total={view.chatCounts.astrophysics ?? 0} unheard={view.chatUnheard?.astrophysics} />
              </button>
            </li>
            {listed.map((e) => (
              <li key={e.id} className="channel-slot">
                <button type="button" className={`channel-slot-pick shared-planet-pick${e.stale ? " stale" : ""}`} aria-pressed={e.id === current} onClick={() => onPick(e.id)}>
                  {/* The name only, to fit a row; the sectors, who shared it and when head its thread. */}
                  <span className="shared-planet-name">{e.name}</span>
                  {e.stale && <span className="shared-planet-stale">{t("itrackie.sharedPlanets.stale")}</span>}
                  <UnreadChip channel={e.id} total={view.chatCounts[e.id] ?? 0} unheard={view.chatUnheard?.[e.id]} />
                </button>
              </li>
            ))}
          </ul>
          {anyStale && (
            <label className="shared-planets-stale-toggle">
              <input type="checkbox" checked={showStale} onChange={(e) => onShowStale(e.target.checked)} />
              {t("itrackie.sharedPlanets.showStale")}
            </label>
          )}
        </div>
      )}
      {/* One block per thread, hidden with CSS, so each keeps its own draft. */}
      <div className="feature" hidden={current !== null}>
        <Thread view={view} channel="astrophysics" placeholder={t("itrackie.featurePlaceholder", { name })} onSend={(text) => onChat("astrophysics", text)} onToggle={onToggle} active={active && current === null} />
      </div>
      {view.sharedPlanets.map((e) => (
        <div key={e.id} className="feature" hidden={e.id !== current}>
          <Thread
            view={view}
            channel={e.id}
            placeholder={t("itrackie.sharedPlanets.placeholder")}
            onSend={(text) => onChat(e.id, text)}
            onToggle={onToggle}
            active={active && e.id === current}
            headKey={[e, byLine(e)]}
            head={
              // Plain text, never markdown: it is shown as the player wrote it.
              <li className="thread-head shared-planet-text">
                <p className="shared-planet-title">{e.name}</p>
                <p className="sub">
                  {byLine(e)}
                  {e.stale && <span className="shared-planet-stale">{t("itrackie.sharedPlanets.stale")}</span>}
                </p>
                <SharedSectors sectors={e.sectors} />
                <p>{e.text}</p>
              </li>
            }
          />
        </div>
      ))}
    </>
  );
}
