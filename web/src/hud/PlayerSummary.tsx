// Who you are and your stats on phones, in the top bar, styled after the desktop ID card (SelfHud): a band in your faction's
// colour across the top, then your portrait (its faction icon pinned on; tap for your goal), your name and the clock, with
// AP/MP/HP/morale and your other resources as chips along the foot. The desktop equivalent is SelfHud, over the room view.

import { characterGivenName, type PlayerView } from "@mush2/shared";
import type { ReactNode } from "react";
import { Popover } from "@base-ui/react/popover";
import { useTranslation } from "react-i18next";
import { AP_PIP, FACTION_ICONS, HP_ICON, MORALE_ICON, MP_PIP, bustIcon } from "../art/assets.ts";
import { CompactResourceChips } from "./ResourceChips.tsx";
import { StatInfo, type Stat } from "./StatInfo.tsx";

/** Your faction, as the key under `faction.*` in the locales. */
export function factionOf(view: PlayerView) {
  const { role, alpha } = view.you;
  return role === "human" ? "human" : alpha ? "alphaMush" : "betaMush";
}

/** Your portrait with your faction's icon pinned to it, as on the desktop ID card; its goal is in a popover (hover, focus, or tap: touch has no hover). */
function FactionCard({ view }: { view: PlayerView }) {
  const { t } = useTranslation();
  const { role } = view.you;
  const faction = factionOf(view);
  const name = t(`faction.${faction}.name`);
  return (
    <Popover.Root>
      <Popover.Trigger
        openOnHover
        delay={200}
        nativeButton={false}
        render={<span role="button" tabIndex={0} />}
        className="faction-card id-portrait"
        aria-label={t("faction.about", { name })}
      >
        <img className="avatar" src={bustIcon(view.you.character)} alt="" />
        <img className="id-faction" src={FACTION_ICONS[faction]} alt="" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6}>
          <Popover.Popup className="tooltip faction-goals">
            <strong>{t(`faction.${faction}.name`)}</strong>
            <p>{t(`faction.${role}.goal`)}</p>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** One stat as a small icon + count chip, for the phone layout where the pip bars take too much room. Tapping it opens how the stat is spent and regained (StatInfo, which also names it for screen readers). */
function StatChip({ stat, view, value, max, icon, big = false }: { stat: Stat; view: PlayerView; value: number; max: number; icon: string; big?: boolean }) {
  return (
    <StatInfo stat={stat} view={view} value={value} max={max}>
      <span className="stat-chip">
        <img className={big ? "big" : undefined} src={icon} alt="" />
        <span>
          {value}/{max}
        </span>
      </span>
    </StatInfo>
  );
}

/**
 * `clock` is the top bar's amber day/cycle/countdown plate, set over the faction band's right end; `tags` (pre-selection,
 * AI paused) go under your name; `menu` is the hamburger, on the card's right.
 */
export function PlayerSummary({ view, clock, tags, menu }: { view: PlayerView; clock: ReactNode; tags: ReactNode; menu: ReactNode }) {
  const { t } = useTranslation();
  const { you } = view;
  return (
    <div className="player-summary">
      <div className={`nameplate ${you.role}`}>
        <span className="id-band">{t(`idCard.band.${you.role}`)}</span>
        <FactionCard view={view} />
        <div className="who">
          <strong className="id-value id-name">{characterGivenName(you.character)}</strong>
          {/* Positioned over the band (top-bar.css); in landscape it follows the name instead. */}
          {clock}
          {tags && <span className="nameplate-tags">{tags}</span>}
        </div>
        {menu}
        <div className="stat-chips">
          <StatChip stat="ap" view={view} value={you.ap} max={view.maxAp} icon={AP_PIP} />
          <StatChip stat="mp" view={view} value={you.mp} max={view.maxMp} icon={MP_PIP} />
          <StatChip stat="hp" view={view} value={you.hp} max={view.maxHp} icon={HP_ICON} big />
          <StatChip stat="morale" view={view} value={you.morale} max={view.maxMorale} icon={MORALE_ICON} big />
          <CompactResourceChips view={view} />
        </div>
      </div>
    </div>
  );
}
