// Who you are and your stats on phones, in the top bar: portrait, name, role, AP/MP/HP/morale as chips, other
// resources. The desktop equivalent is SelfHud, over the room view.

import { characterName, type PlayerView } from "@mush2/shared";
import type { ReactNode } from "react";
import { Popover } from "@base-ui/react/popover";
import { useTranslation } from "react-i18next";
import { AP_PIP, FACTION_ICONS, HP_ICON, MORALE_ICON, MP_PIP, bustIcon } from "../art/assets.ts";
import { PreselectionTag } from "./PreselectionTag.tsx";
import { CompactResourceChips } from "./ResourceChips.tsx";

/** Your faction, as the key under `faction.*` in the locales. */
export function factionOf(view: PlayerView) {
  const { role, alpha } = view.you;
  return role === "human" ? "human" : alpha ? "alphaMush" : "betaMush";
}

/** Which faction you belong to, with its goal in a popover (hover, focus, or tap: touch has no hover). */
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
        className={`faction-card ${role}`}
        aria-label={t("faction.about", { name })}
      >
        <img className="faction-icon" src={FACTION_ICONS[faction]} alt="" />
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

/** One resource as a small icon + count chip, for the phone layout where the pip bars take too much room. */
function StatChip({ stat, value, max, icon, big = false }: { stat: "ap" | "mp" | "hp" | "morale"; value: number; max: number; icon: string; big?: boolean }) {
  const { t } = useTranslation();
  return (
    <span className="stat-chip" role="img" aria-label={t("stat.chip", { label: t(`stat.${stat}`), value, max })}>
      <img className={big ? "big" : undefined} src={icon} alt="" />
      <span>
        {value}/{max}
      </span>
    </span>
  );
}

/** `countdown` goes after the phone's abbreviated cycle (the top bar's own cycle is hidden there). */
export function PlayerSummary({ view, countdown }: { view: PlayerView; countdown?: ReactNode }) {
  const { t } = useTranslation();
  const { you } = view;
  return (
    <div className="player-summary">
      <div className={`nameplate ${you.role}`}>
        <img className="avatar" src={bustIcon(you.character)} alt="" />
        <div className="who">
          <strong>{characterName(you.character)}</strong>
          {/* The phone layout shows the cycle here instead of on its own, abbreviated. */}
          <span className="sub cycle-under-name" role="img" aria-label={t("stat.dayCycle", { day: view.day, cycle: view.cycleOfDay })}>
            D{view.day}C{view.cycleOfDay}
          </span>
          {countdown && <span className="sub cycle-under-name">{countdown}</span>}
          {view.preselection && (
            <span className="cycle-under-name">
              <PreselectionTag />
            </span>
          )}
        </div>
        <FactionCard view={view} />
        <div className="stat-chips">
          <StatChip stat="ap" value={you.ap} max={view.maxAp} icon={AP_PIP} />
          <StatChip stat="mp" value={you.mp} max={view.movement.mpCap} icon={MP_PIP} />
          <StatChip stat="hp" value={you.hp} max={view.maxHp} icon={HP_ICON} big />
          <StatChip stat="morale" value={you.morale} max={view.maxMorale} icon={MORALE_ICON} big />
          <CompactResourceChips view={view} />
        </div>
      </div>
    </div>
  );
}
