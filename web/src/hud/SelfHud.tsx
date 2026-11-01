// Everything about you on desktop, as a HUD over the room view. Top-left: one card with a big button (it opens you in
// the inspect panel: your portrait, full name and faction), then HP, morale and your other resources; the room's name
// is pushed down under it (self-hud.css). Bottom-left: AP and MP standing up (SelfPoints), beside the action queue.
// On phones the summary lives in the top bar instead (PlayerSummary). Items are in the room view's InventoryOverlay.

import { characterName, type PlayerView } from "@mush2/shared";
import { useTranslation } from "react-i18next";
import { AP_PIP, HP_ICON, HP_PIP, MORALE_ICON, MORALE_PIP, MP_PIP, bustIcon } from "../art/assets.ts";
import { PipBar } from "./PipBar.tsx";
import { factionOf } from "./PlayerSummary.tsx";
import { CompactResourceChips } from "./ResourceChips.tsx";
import { StatInfo } from "./StatInfo.tsx";
import { apColumnHeight } from "./apGauge.ts";

export function SelfHud({ view, onInspect }: { view: PlayerView; onInspect: () => void }) {
  const { t } = useTranslation();
  const { you } = view;
  const name = characterName(you.character);
  return (
    <div className={`self-hud-top ${you.role}`}>
      <button type="button" className="big hud-plate" aria-label={t("inspect.self", { character: name })} onClick={onInspect}>
        <img className="avatar" src={bustIcon(you.character)} alt="" />
        <span className="hud-who">
          <strong>{name}</strong>
          <span className="hud-faction">{t(`faction.${factionOf(view)}.name`)}</span>
        </span>
      </button>
      <div className="hud-bars">
        <StatInfo stat="hp" view={view} value={you.hp} max={view.maxHp}>
          <PipBar label={t("stat.hp")} value={you.hp} max={view.maxHp} pip={HP_PIP} icon={HP_ICON} bigIcon thin iconAfter />
        </StatInfo>
        <StatInfo stat="morale" view={view} value={you.morale} max={view.maxMorale}>
          <PipBar label={t("stat.morale")} value={you.morale} max={view.maxMorale} pip={MORALE_PIP} icon={MORALE_ICON} bigIcon thin iconAfter />
        </StatInfo>
      </div>
      {/* Home for resources that belong nowhere else (spores, free IT points, ...): two show, the card opens them all. */}
      <CompactResourceChips view={view} stacked />
    </div>
  );
}

/** AP and MP standing up, for the room view's bottom-left corner (GameScreen puts the action queue beside it). Each opens a card on how it is spent and regained (StatInfo), as HP and morale do. */
export function SelfPoints({ view }: { view: PlayerView }) {
  const { t } = useTranslation();
  const { you } = view;
  return (
    <div className="self-points">
      <StatInfo stat="ap" view={view} value={you.ap} max={view.maxAp}>
        <PipBar label={t("stat.ap")} value={you.ap} max={view.maxAp} pip={AP_PIP} vertical height={apColumnHeight(view.maxAp)} />
      </StatInfo>
      <StatInfo stat="mp" view={view} value={you.mp} max={view.maxMp}>
        <PipBar label={t("stat.mp")} value={you.mp} max={view.maxMp} pip={MP_PIP} vertical />
      </StatInfo>
    </div>
  );
}
