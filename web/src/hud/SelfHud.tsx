// Everything about you on desktop, as a HUD over the room view. Top-left: one card led by an ID badge with your satiety under it (a button that opens you in
// the inspect panel: your portrait, full name and faction) showing your portrait, given name and faction icon, then HP and morale; the room's name
// is pushed down under it (self-hud.css). Bottom-left: AP and MP standing up with your other resources under them (SelfPoints), beside the action queue.
// On phones the summary lives in the top bar instead (PlayerSummary). Items are in the room view's InventoryOverlay.

import { characterGivenName, characterName, type PlayerView } from "@mush2/shared";
import { useTranslation } from "react-i18next";
import { AP_PIP, FACTION_ICONS, HP_ICON, HP_PIP, MORALE_ICON, MORALE_PIP, MP_PIP, bustIcon } from "../art/assets.ts";
import { Hint } from "./IconButton.tsx";
import { PipBar } from "./PipBar.tsx";
import { factionOf } from "./PlayerSummary.tsx";
import { CompactResourceChips } from "./ResourceChips.tsx";
import { SatietyInfo } from "./SatietyInfo.tsx";
import { StatInfo } from "./StatInfo.tsx";
import { apColumnHeight } from "./apGauge.ts";

export function SelfHud({ view, onInspect }: { view: PlayerView; onInspect: () => void }) {
  const { t } = useTranslation();
  const { you } = view;
  const name = characterName(you.character);
  return (
    <div className={`self-hud-top hud-card ${you.role}`}>
      {/*
        An ID badge, not a button shape: framed portrait, name, faction as an icon (its name is in the badge's tooltip and
        the inspect panel). Satiety sits under the name, outside the button (it opens its own card), laid over it by the grid.
      */}
      <div className="hud-id">
        <Hint label={t(`faction.${factionOf(view)}.name`)}>
          <button type="button" className="hud-plate" aria-label={t("inspect.self", { character: name })} onClick={onInspect}>
            <span className="hud-portrait">
              <img className="avatar" src={bustIcon(you.character)} alt="" />
              <img className="hud-faction" src={FACTION_ICONS[factionOf(view)]} alt="" />
            </span>
            <strong className="hud-name">{characterGivenName(you.character)}</strong>
          </button>
        </Hint>
        <SatietyInfo view={view} />
      </div>
      <div className="hud-bars">
        <StatInfo stat="hp" view={view} value={you.hp} max={view.maxHp}>
          <PipBar label={t("stat.hp")} value={you.hp} max={view.maxHp} pip={HP_PIP} icon={HP_ICON} bigIcon thin plainIcon />
        </StatInfo>
        <StatInfo stat="morale" view={view} value={you.morale} max={view.maxMorale}>
          <PipBar label={t("stat.morale")} value={you.morale} max={view.maxMorale} pip={MORALE_PIP} icon={MORALE_ICON} bigIcon thin plainIcon />
        </StatInfo>
      </div>
    </div>
  );
}

/** AP and MP standing up, with your other resources under them, for the room view's bottom-left corner (GameView puts the action queue beside it). Each opens a card on how it is spent and regained (StatInfo), as HP and morale do. */
export function SelfPoints({ view }: { view: PlayerView }) {
  const { t } = useTranslation();
  const { you } = view;
  return (
    <div className="self-points hud-card">
      <div className="self-points-bars">
        <StatInfo stat="ap" view={view} value={you.ap} max={view.maxAp}>
          <PipBar label={t("stat.ap")} value={you.ap} max={view.maxAp} pip={AP_PIP} vertical height={apColumnHeight(view.maxAp)} />
        </StatInfo>
        <StatInfo stat="mp" view={view} value={you.mp} max={view.maxMp}>
          <PipBar label={t("stat.mp")} value={you.mp} max={view.maxMp} pip={MP_PIP} vertical />
        </StatInfo>
      </div>
      {/* Home for resources that belong nowhere else (spores, free IT points, ...): two show, the card opens them all. */}
      <CompactResourceChips view={view} stacked />
    </div>
  );
}
