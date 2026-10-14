// Who you are and your stats: portrait, name, role, AP/MP/HP/morale. Shown in the
// self panel under the room on desktop and in the top bar on phones.

import { CHARACTERS, type PlayerView } from "@mush2/shared";
import type { CSSProperties } from "react";
import { Popover } from "@base-ui/react/popover";
import { useTranslation } from "react-i18next";
import { AP_PIP, EMPTY_SLOT_ICON, FACTION_ICONS, HP_PIP, MORALE_PIP, MP_PIP, portrait } from "../art/assets.ts";
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

export function PlayerSummary({ view }: { view: PlayerView }) {
  const { you } = view;
  const character = CHARACTERS.find((c) => c.id === you.character);
  return (
    <div className="player-summary" style={{ "--plate-bg": `url(${EMPTY_SLOT_ICON})` } as CSSProperties}>
      <div className={`nameplate ${you.role}`}>
        <img className="avatar" src={portrait(you.character)} alt="" />
        <div className="who">
          <strong>{you.name}</strong>
          {character && <div className="sub character-name">{character.name}</div>}
          {/* The phone layout shows the cycle here instead of on its own. */}
          <div className="sub cycle-under-name">Cycle {view.cycle}</div>
        </div>
        <FactionCard view={view} />
      </div>
      <div className="stats">
        <div className="stat-stack">
          <PipBar label="AP" value={you.ap} max={view.maxAp} pip={AP_PIP} />
          <PipBar label="MP" value={you.mp} max={view.movement.mpCap} pip={MP_PIP} />
        </div>
        <div className="stat-stack">
          <PipBar label="HP" value={you.hp} max={view.maxHp} pip={HP_PIP} thin />
          <PipBar label="Morale" value={you.morale} max={view.maxMorale} pip={MORALE_PIP} thin />
        </div>
      </div>
    </div>
  );
}
