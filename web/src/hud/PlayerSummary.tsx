// Who you are and your stats: portrait, name, role, AP/MP/HP/morale. Shown in the
// self panel under the room on desktop and in the top bar on phones.

import { CHARACTERS, type PlayerView } from "@mush2/shared";
import { Popover } from "@base-ui/react/popover";
import { useTranslation } from "react-i18next";
import { AP_PIP, FACTION_ICONS, HP_ICON, HP_PIP, MORALE_ICON, MORALE_PIP, MP_PIP, bustIcon } from "../art/assets.ts";
import { PipBar } from "./PipBar.tsx";

/** Which faction you belong to, with its goal in a popover (hover, focus, or tap: touch has no hover). */
function FactionCard({ view }: { view: PlayerView }) {
  const { t } = useTranslation();
  const { role, alpha } = view.you;
  const faction = role === "human" ? "human" : alpha ? "alphaMush" : "betaMush";
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

/** `compact` swaps the pip bars for chips under the portrait (the phone top bar). */
export function PlayerSummary({ view, compact = false }: { view: PlayerView; compact?: boolean }) {
  const { t } = useTranslation();
  const { you } = view;
  const character = CHARACTERS.find((c) => c.id === you.character);
  return (
    <div className="player-summary">
      <div className={`nameplate ${you.role}`}>
        <img className="avatar" src={bustIcon(you.character)} alt="" />
        <div className="who">
          <strong>{character?.name ?? you.name}</strong>
          {/* The phone layout shows the cycle here instead of on its own, abbreviated. */}
          <span className="sub cycle-under-name" aria-label={t("stat.dayCycle", { day: view.day, cycle: view.cycleOfDay })}>
            D{view.day}C{view.cycleOfDay}
          </span>
        </div>
        <FactionCard view={view} />
        {compact && (
          <div className="stat-chips">
            <StatChip stat="ap" value={you.ap} max={view.maxAp} icon={AP_PIP} />
            <StatChip stat="mp" value={you.mp} max={view.movement.mpCap} icon={MP_PIP} />
            <StatChip stat="hp" value={you.hp} max={view.maxHp} icon={HP_ICON} big />
            <StatChip stat="morale" value={you.morale} max={view.maxMorale} icon={MORALE_ICON} big />
          </div>
        )}
      </div>
      {!compact && (
      <div className="stats">
        <div className="stat-stack">
          <PipBar label={t("stat.ap")} value={you.ap} max={view.maxAp} pip={AP_PIP} />
          <PipBar label={t("stat.mp")} value={you.mp} max={view.movement.mpCap} pip={MP_PIP} />
        </div>
        <div className="stat-stack">
          <PipBar label={t("stat.hp")} value={you.hp} max={view.maxHp} pip={HP_PIP} thin />
          <PipBar label={t("stat.morale")} value={you.morale} max={view.maxMorale} pip={MORALE_PIP} thin />
        </div>
      </div>
      )}
    </div>
  );
}
