// Who you are and your stats on phones: the ID card over the room view's top-left corner, as the desktop's (SelfHud) is.
// It is styled after the desktop one: your portrait (tap to inspect yourself), your name, titles and faction (in its colour), and
// your stats two rows deep: AP over MP, HP over morale (values only; each one's tooltip has its capacity and a pip bar),
// then your other resources, in a column the card's full height, in as many columns as fit.

import { characterGivenName, type PlayerView } from "@mush2/shared";
import { useNames } from "../i18n/names.ts";
import { useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AP_PIP, HP_ICON, HP_PIP, MORALE_ICON, MORALE_PIP, MP_PIP, bustIcon } from "../art/assets.ts";
import { apColumnHeight } from "./apGauge.ts";
import { PipBar } from "./PipBar.tsx";
import { ResourceGrid } from "./ResourceChips.tsx";
import { StatInfo, type Stat } from "./StatInfo.tsx";

/** Your faction, as the key under `faction.*` in the locales. */
export function factionOf(view: PlayerView) {
  const { role, alpha } = view.you;
  return role === "human" ? "human" : alpha ? "alphaMush" : "betaMush";
}

/** Your portrait, as on the desktop ID card: tapping it inspects you (the Inspect panel). */
function SelfPortrait({ view, onInspect }: { view: PlayerView; onInspect: () => void }) {
  const { t } = useTranslation();
  return (
    <button type="button" className="id-open" aria-label={t("inspect.self", { character: characterGivenName(view.you.character) })} onClick={onInspect}>
      <span className="id-portrait">
        <img className="avatar" src={bustIcon(view.you.character)} alt="" />
      </span>
    </button>
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

/** `tags` (AI paused) go under your name, titles and faction. `onInspect` opens the Inspect panel on you. */
export function PlayerSummary({ view, tags, onInspect }: { view: PlayerView; tags: ReactNode; onInspect: () => void }) {
  const { t, i18n } = useTranslation();
  const names = useNames();
  const { you } = view;
  // Titles are public (the top bar lists their holders); a seat can hold more than one in a small game (as SelfHud).
  const held = view.titles.filter((title) => title.holder === you.character).map((title) => names.title(title.id));
  const titles = held.length === 0 ? null : new Intl.ListFormat(i18n.language, { type: "conjunction" }).format(held);
  const statsRef = useRef<HTMLDivElement>(null);
  return (
    <div className={`nameplate ${you.role}`}>
      <SelfPortrait view={view} onInspect={onInspect} />
      <div className="who">
        <strong className="id-value id-name">{characterGivenName(you.character)}</strong>
        {titles && <span className="nameplate-titles">{titles}</span>}
        <span className="nameplate-faction">{t(`faction.${factionOf(view)}.name`)}</span>
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
    </div>
  );
}
