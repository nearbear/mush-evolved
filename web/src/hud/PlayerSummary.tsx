// Who you are and your stats on phones, in the top bar, styled after the desktop ID card (SelfHud): a band in your faction's
// colour across the top, then your portrait (its faction icon pinned on; tap for your goal), your name and the clock, and
// your stats two rows deep: AP over MP, HP over morale (values only; each one's tooltip has its capacity and a pip bar),
// then your other resources, in a column the card's full height, in as many columns as fit. The desktop equivalent is SelfHud, over the room view.

import { characterGivenName, type PlayerView } from "@mush2/shared";
import { useRef, type ReactNode } from "react";
import { Popover } from "@base-ui/react/popover";
import { useTranslation } from "react-i18next";
import { AP_PIP, FACTION_ICONS, HP_ICON, HP_PIP, MORALE_ICON, MORALE_PIP, MP_PIP, bustIcon } from "../art/assets.ts";
import { apColumnHeight } from "./apGauge.ts";
import { PipBar } from "./PipBar.tsx";
import { ResourceGrid } from "./ResourceChips.tsx";
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

/** Each stat's pip art, as the desktop HUD draws it. */
const PIPS: Record<Stat, { pip: string; icon?: string; thin?: boolean }> = {
  ap: { pip: AP_PIP },
  mp: { pip: MP_PIP },
  hp: { pip: HP_PIP, icon: HP_ICON, thin: true },
  morale: { pip: MORALE_PIP, icon: MORALE_ICON, thin: true },
};

/**
 * One stat as a small icon + value chip, for the phone layout where the pip bars take too much room. Its capacity is left
 * to the card tapping it opens (StatInfo, which also names it for screen readers), with the stat's pip bar standing beside it.
 */
function StatChip({ stat, view, value, max, icon, big = false }: { stat: Stat; view: PlayerView; value: number; max: number; icon: string; big?: boolean }) {
  const { t } = useTranslation();
  const { pip, icon: barIcon, thin = false } = PIPS[stat];
  const bar = (
    <PipBar
      label={t(`stat.${stat}`)}
      value={value}
      max={max}
      pip={pip}
      {...(barIcon ? { icon: barIcon, bigIcon: true, plainIcon: true } : {})}
      thin={thin}
      vertical
      height={apColumnHeight(max)}
    />
  );
  return (
    <StatInfo stat={stat} view={view} value={value} max={max} bar={bar}>
      <span className="stat-chip">
        <img className={big ? "big" : undefined} src={icon} alt="" />
        <span>{value}</span>
      </span>
    </StatInfo>
  );
}

/**
 * `clock` is the top bar's amber day/cycle/countdown plate, set over the faction band's right end (left of the resources); `tags` (pre-selection,
 * AI paused) go under your name; `menu` is the hamburger, on the card's right, after your stats.
 */
export function PlayerSummary({ view, clock, tags, menu }: { view: PlayerView; clock: ReactNode; tags: ReactNode; menu: ReactNode }) {
  const { t } = useTranslation();
  const { you } = view;
  const statsRef = useRef<HTMLDivElement>(null);
  return (
    <div className="player-summary">
      <div className={`nameplate ${you.role}`}>
        <span className="id-band">{t(`idCard.band.${you.role}`)}</span>
        {/* Over the band's right end (top-bar.css); in landscape it follows the name instead. */}
        {clock}
        <FactionCard view={view} />
        <div className="who">
          <strong className="id-value id-name">{characterGivenName(you.character)}</strong>
          {tags && <span className="nameplate-tags">{tags}</span>}
        </div>
        {/* Two rows, filled a column at a time: AP over MP, HP over morale, then the resources. */}
        <div className="stat-chips" ref={statsRef}>
          <StatChip stat="ap" view={view} value={you.ap} max={view.maxAp} icon={AP_PIP} />
          <StatChip stat="mp" view={view} value={you.mp} max={view.maxMp} icon={MP_PIP} />
          <StatChip stat="hp" view={view} value={you.hp} max={view.maxHp} icon={HP_ICON} big />
          <StatChip stat="morale" view={view} value={you.morale} max={view.maxMorale} icon={MORALE_ICON} big />
          <ResourceGrid view={view} gridRef={statsRef} />
        </div>
        {menu}
      </div>
    </div>
  );
}
