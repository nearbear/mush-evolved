// Everything about you on desktop, as a HUD over the room view. Top-left: your ID card (UI coherence step 7), a button that
// opens you in the inspect panel: a header band in your faction's colour, your portrait and faction icon, your given name and
// the titles you hold; under them, still on the card, HP and morale at half size. Bottom-left: AP and MP standing up with your
// other resources (satiety first, as on phones) under them (SelfPoints), beside the action queue. On phones the summary lives in the top bar instead
// (PlayerSummary). Items are in the room view's InventoryOverlay.

import { characterGivenName, characterName, type PlayerView } from "@mush2/shared";
import { useTranslation } from "react-i18next";
import { AP_PIP, FACTION_ICONS, HP_ICON, HP_PIP, MORALE_ICON, MORALE_PIP, MP_PIP, bustIcon } from "../art/assets.ts";
import { useNames } from "../i18n/names.ts";
import { Hint } from "./IconButton.tsx";
import { PipBar } from "./PipBar.tsx";
import { factionOf } from "./PlayerSummary.tsx";
import { CompactResourceChips } from "./ResourceChips.tsx";
import { StatInfo } from "./StatInfo.tsx";
import { apColumnHeight } from "./apGauge.ts";

export function SelfHud({ view, onInspect }: { view: PlayerView; onInspect: () => void }) {
  const { t, i18n } = useTranslation();
  const names = useNames();
  const { you } = view;
  const name = characterName(you.character);
  // Titles are public (the top bar lists their holders); a seat can hold more than one in a small game.
  const held = view.titles.filter((title) => title.holder === you.character).map((title) => names.title(title.id));
  const titles = held.length === 0 ? t("idCard.noTitle") : new Intl.ListFormat(i18n.language, { type: "conjunction" }).format(held);
  return (
    <div className="self-hud-top">
      {/* The card isn't one button: HP and morale open their own cards, and a button can't hold other controls. */}
      <div className={`id-card hud-card ${you.role}`}>
        {/* Your own faction, on your own screen, as the stripe showed before: the band's colour and its text. */}
        <Hint label={t(`faction.${factionOf(view)}.name`)}>
          <button type="button" className="id-open" aria-label={t("inspect.self", { character: name })} onClick={onInspect}>
            <span className="id-band">{t(`idCard.band.${you.role}`)}</span>
            <span className="id-portrait">
              <img className="avatar" src={bustIcon(you.character)} alt="" />
              <img className="id-faction" src={FACTION_ICONS[factionOf(view)]} alt="" />
            </span>
            <span className="id-fields">
              <span className="id-caption">{t("idCard.name")}</span>
              <strong className="id-value id-name">{characterGivenName(you.character)}</strong>
              <span className="id-caption">{t("idCard.title")}</span>
              <span className="id-value">{titles}</span>
            </span>
          </button>
        </Hint>
        <span className="id-vitals">
          <StatInfo stat="hp" view={view} value={you.hp} max={view.maxHp}>
            <PipBar label={t("stat.hp")} value={you.hp} max={view.maxHp} pip={HP_PIP} icon={HP_ICON} bigIcon thin plainIcon />
          </StatInfo>
          <StatInfo stat="morale" view={view} value={you.morale} max={view.maxMorale}>
            <PipBar label={t("stat.morale")} value={you.morale} max={view.maxMorale} pip={MORALE_PIP} icon={MORALE_ICON} bigIcon thin plainIcon />
          </StatInfo>
        </span>
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
      {/* Home for resources that belong nowhere else (satiety, spores, free IT points, ...): two show, the card opens them all. */}
      <CompactResourceChips view={view} stacked />
    </div>
  );
}
